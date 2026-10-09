import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { getAppPreferences, isNotificationLocationMuted, shouldSuppressNotification } from '../lib/appPreferences';
import { usePresenceStore } from './usePresenceStore';

const toastTimers = new Map();
let notificationAudioContext;

function playNotificationSound() {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    notificationAudioContext ||= new AudioContextClass();
    const context = notificationAudioContext;
    if (context.state === 'suspended') void context.resume();
    const startAt = context.currentTime;
    [740, 980].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = startAt + index * 0.105;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.125);
    });
  } catch { /* Audio can be blocked until the user interacts with the page. */ }
}

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  serverUnreadCounts: {},
  channelUnreadCounts: {},
  activeSubscription: null,
  activeToasts: [], // For in-app UI toasts
  requestGeneration: 0,

  reset: () => {
    get().unsubscribe();
    set((state) => ({ notifications: [], unreadCount: 0, serverUnreadCounts: {}, channelUnreadCounts: {}, activeToasts: [], requestGeneration: state.requestGeneration + 1 }));
  },

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const generation = get().requestGeneration;

    const [{ data, error }, { data: serverRows }] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('notifications').select('server_id, channel_id').eq('user_id', user.id).eq('is_read', false).not('server_id', 'is', null),
    ]);

    if (generation !== get().requestGeneration) return;
    if (!error && data) {
      const preferences = getAppPreferences(user.id);
      const visibleServerRows = (serverRows || []).filter((row) => !isNotificationLocationMuted(row, preferences));
      set({ 
        notifications: data,
        unreadCount: data.filter(n => !n.is_read).length,
        serverUnreadCounts: visibleServerRows.reduce((counts, row) => {
          if (row.server_id) counts[row.server_id] = (counts[row.server_id] || 0) + 1;
          return counts;
        }, {}),
        channelUnreadCounts: visibleServerRows.reduce((counts, row) => {
          if (row.channel_id) counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
          return counts;
        }, {}),
      });
    }
  },

  markAsRead: async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (!error) {
      const notification = get().notifications.find((item) => item.id === notificationId);
      const wasUnread = Boolean(notification && !notification.is_read);
      const countsOnServer = Boolean(wasUnread && !isNotificationLocationMuted(notification, getAppPreferences(useAuthStore.getState().user?.id)));
      set(state => ({
        notifications: state.notifications.map(n => n.id === notificationId ? { ...n, is_read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - (wasUnread ? 1 : 0)),
        serverUnreadCounts: {
          ...state.serverUnreadCounts,
          ...(countsOnServer && notification?.server_id ? {
            [notification.server_id]: Math.max(0, (state.serverUnreadCounts[notification.server_id] || 0) - 1),
          } : {}),
        },
        channelUnreadCounts: {
          ...state.channelUnreadCounts,
          ...(countsOnServer && notification?.channel_id ? {
            [notification.channel_id]: Math.max(0, (state.channelUnreadCounts[notification.channel_id] || 0) - 1),
          } : {}),
        },
      }));
    }
  },

  markAllAsRead: async () => {
    const user = useAuthStore.getState().user;
    if (!user?.id) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    if (error) return;
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, is_read: true })),
      unreadCount: 0,
      serverUnreadCounts: {},
      channelUnreadCounts: {},
    }));
  },

  markServerNotificationsRead: async (serverId) => {
    const user = useAuthStore.getState().user;
    if (!user?.id || !serverId) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('server_id', serverId).eq('is_read', false);
    if (error) return;
    set((state) => {
      const serverNotifications = state.notifications.filter((notification) => notification.server_id === serverId && !notification.is_read);
      const newlyRead = serverNotifications.length;
      return {
        notifications: state.notifications.map((notification) => notification.server_id === serverId ? { ...notification, is_read: true } : notification),
        unreadCount: Math.max(0, state.unreadCount - newlyRead),
        serverUnreadCounts: { ...state.serverUnreadCounts, [serverId]: 0 },
        channelUnreadCounts: Object.fromEntries(Object.entries(state.channelUnreadCounts).filter(([channelId]) => !state.notifications.some((notification) => notification.channel_id === channelId && notification.server_id === serverId))),
      };
    });
  },

  markChannelNotificationsRead: async (channelId) => {
    const user = useAuthStore.getState().user;
    if (!user?.id || !channelId) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('channel_id', channelId).eq('is_read', false);
    if (error) return;
    set((state) => {
      const preferences = getAppPreferences(user.id);
      const channelNotifications = state.notifications.filter((notification) => notification.channel_id === channelId && !notification.is_read);
      const newlyRead = channelNotifications.length;
      const countableRead = channelNotifications.filter((notification) => !isNotificationLocationMuted(notification, preferences)).length;
      const serverId = state.notifications.find((notification) => notification.channel_id === channelId)?.server_id;
      const remainingServerCount = serverId ? Math.max(0, (state.serverUnreadCounts[serverId] || 0) - countableRead) : 0;
      return {
        notifications: state.notifications.map((notification) => notification.channel_id === channelId ? { ...notification, is_read: true } : notification),
        unreadCount: Math.max(0, state.unreadCount - newlyRead),
        channelUnreadCounts: { ...state.channelUnreadCounts, [channelId]: 0 },
        serverUnreadCounts: serverId ? { ...state.serverUnreadCounts, [serverId]: remainingServerCount } : state.serverUnreadCounts,
      };
    });
  },

  subscribeToNotifications: () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { activeSubscription } = get();
    if (activeSubscription) supabase.removeChannel(activeSubscription);

    let subscribedOnce = false;
    const subscription = supabase
      .channel(`public:notifications:user_id=eq.${user.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const newNotif = payload.new;
        if (get().notifications.some((notification) => notification.id === newNotif.id)) return;
        
        // Show desktop notification if granted
        const preferences = getAppPreferences(user.id);
        const doNotDisturb = shouldSuppressNotification(newNotif, preferences, { presenceIsDnd: usePresenceStore.getState().status === 'dnd' });
        const countServerActivity = !isNotificationLocationMuted(newNotif, preferences);
        const isAppFocused = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
        if (!doNotDisturb && preferences.desktopNotifications && !isAppFocused && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification(newNotif.title, { body: newNotif.body }); }
          catch { /* Keep in-app notification delivery working if the OS blocks a desktop popup. */ }
        }

        if (!doNotDisturb && preferences.notificationSound) playNotificationSound();

        // Play a soft notification sound (if you had a sound file, you'd do new Audio('/ping.mp3').play())

        // Add to state and queue an in-app toast
        set(state => ({
          notifications: [newNotif, ...state.notifications].slice(0, 30),
          unreadCount: state.unreadCount + 1,
          serverUnreadCounts: countServerActivity && newNotif.server_id ? { ...state.serverUnreadCounts, [newNotif.server_id]: (state.serverUnreadCounts[newNotif.server_id] || 0) + 1 } : state.serverUnreadCounts,
          channelUnreadCounts: countServerActivity && newNotif.channel_id ? { ...state.channelUnreadCounts, [newNotif.channel_id]: (state.channelUnreadCounts[newNotif.channel_id] || 0) + 1 } : state.channelUnreadCounts,
          activeToasts: doNotDisturb ? state.activeToasts : [...state.activeToasts, newNotif].slice(-3),
        }));

        // Remove toast after 4 seconds
        clearTimeout(toastTimers.get(newNotif.id));
        if (!doNotDisturb) toastTimers.set(newNotif.id, setTimeout(() => {
          toastTimers.delete(newNotif.id);
          set(state => ({
            activeToasts: state.activeToasts.filter(t => t.id !== newNotif.id)
          }));
        }, 4000));
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // Recover any notifications created while the realtime connection was
        // unavailable without doing a periodic full-table poll.
        if (subscribedOnce) void get().fetchNotifications();
        subscribedOnce = true;
      });

    set({ activeSubscription: subscription });
  },

  removeToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set(state => ({
      activeToasts: state.activeToasts.filter(t => t.id !== id)
    }));
  },

  unsubscribe: () => {
    const { activeSubscription } = get();
    if (activeSubscription) {
      supabase.removeChannel(activeSubscription);
      set({ activeSubscription: null });
    }
    toastTimers.forEach(clearTimeout);
    toastTimers.clear();
    set({ activeToasts: [] });
  }
}));
