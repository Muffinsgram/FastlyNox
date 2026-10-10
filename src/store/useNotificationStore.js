import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { getAppPreferences, getServerNotificationMode, isNotificationLocationMuted, shouldSuppressNotification } from '../lib/appPreferences';
import { usePresenceStore } from './usePresenceStore';
import { useDMChatStore } from './useDMChatStore';
import { useFriendStore } from './useFriendStore';
import { useServerStore } from './useServerStore';

const toastTimers = new Map();
const recentMessageToastKeys = new Map();
const senderNameCache = new Map();
const processedServerMessages = new Map();
let notificationAudioContext;

function showDesktopNotification(title, body) {
  const nativeNotification = window.fastlynoxDesktop?.showNativeNotification;
  if (typeof nativeNotification === 'function') {
    void nativeNotification({ title, body }).catch(() => {});
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body }); }
    catch { /* Keep the in-app toast available if the OS blocks the popup. */ }
  }
}

function notificationMessagePreview(message, isDM = false) {
  return (message?.content || '').trim().slice(0, 180) || (message?.image_url ? (isDM ? '🖼️ Fotoğraf' : '📎 Bir ek gönderdi.') : 'Yeni mesaj');
}

function hasRecentMessageToast(notification) {
  const now = Date.now();
  for (const [key, record] of recentMessageToastKeys) {
    const timestamp = typeof record === 'number' ? record : record.createdAt;
    if (now - timestamp > 15_000) recentMessageToastKeys.delete(key);
  }
  if (notification.type === 'dm_message' && notification.dm_channel_id && notification.sender_id) {
    const createdAt = Date.parse(notification.created_at || '') || now;
    const body = (notification.body || '').trim();
    for (const [key, record] of recentMessageToastKeys) {
      if (key.startsWith('dm:') && record.dmChannelId === notification.dm_channel_id && record.senderId === notification.sender_id
        && Math.abs(record.createdAt - createdAt) < 8_000
        && (record.body === body || record.body.startsWith(body) || body.startsWith(record.body))) return true;
    }
    const key = `dm:${notification.dm_channel_id}:${notification.sender_id}:${createdAt}:${body}`;
    recentMessageToastKeys.set(key, { dmChannelId: notification.dm_channel_id, senderId: notification.sender_id, createdAt, body });
    if (notification.message_id) recentMessageToastKeys.set(`dm-id:${notification.message_id}`, now);
    return false;
  }
  if (!notification.message_id) return false;
  const key = `server:${notification.message_id}`;
  if (recentMessageToastKeys.has(key)) return true;
  recentMessageToastKeys.set(key, now);
  return false;
}

async function getSenderName(userId, fallback = 'Yeni mesaj') {
  if (!userId) return fallback;
  if (senderNameCache.has(userId)) return senderNameCache.get(userId);
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  const name = data?.username || fallback;
  senderNameCache.set(userId, name);
  return name;
}

async function showIncomingMessageToast(message, isDM, userId) {
  if (!message?.id || !message.user_id || message.user_id === userId || useAuthStore.getState().user?.id !== userId) return;
  const preferences = getAppPreferences(userId);
  const currentState = useNotificationStore.getState();
  const focused = document.visibilityState === 'visible' && document.hasFocus();
  if (isDM && focused && currentState.activeDMChannelId === message.dm_channel_id) return;
  const fallbackName = isDM ? 'Yeni özel mesaj' : 'Yeni mesaj';
  const dm = isDM ? useFriendStore.getState().dmChannels.find((item) => item.id === message.dm_channel_id) : null;
  const sender = dm?.user1_id === message.user_id ? dm?.user1 : dm?.user2;
  const senderName = message.profiles?.username || sender?.username || senderNameCache.get(message.user_id) || fallbackName;
  const toast = {
    id: `incoming-message:${isDM ? 'dm' : 'server'}:${message.id}`,
    message_id: message.id,
    type: isDM ? 'dm_message' : 'server_message',
    title: senderName,
    body: notificationMessagePreview(message, isDM),
    sender_id: message.user_id,
    created_at: message.created_at || new Date().toISOString(),
    is_ephemeral: true,
  };
  if (isDM) {
    toast.dm_channel_id = message.dm_channel_id;
    toast.title = senderName;
  } else {
    toast.channel_id = message.channel_id;
    const servers = useServerStore.getState().servers;
    let server = null;
    let channel = null;
    for (const item of servers) {
      const found = (item.categories || []).flatMap((category) => category.channels || []).find((candidate) => candidate.id === message.channel_id);
      if (found) { server = item; channel = found; break; }
    }
    if (channel?.server_id) toast.server_id = channel.server_id;
    else if (server?.id) toast.server_id = server.id;
    toast.title = `${senderName} · #${channel?.name || 'sunucu'}`;
    const mode = getServerNotificationMode(toast.server_id, preferences);
    if (mode !== 'all') return; // Mention-only alerts come from the exact database recipient list.
    if (focused && currentState.activeServerChannelId === message.channel_id) return;
  }
  if (shouldSuppressNotification(toast, preferences, { presenceIsDnd: usePresenceStore.getState().status === 'dnd' })) return;
  const showedToast = useNotificationStore.getState().queueToast(toast);
  if (!showedToast) return;
  if (preferences.notificationSound) playNotificationSound(preferences.notificationSoundVolume);
  if (preferences.desktopNotifications) showDesktopNotification(toast.title, toast.body);

  // Never hold the visible toast behind profile/channel lookups. Those requests
  // can take seconds on a weak connection, while the incoming message itself
  // has already arrived over Realtime.
  void (async () => {
    const [resolvedSender, channelResult] = await Promise.all([
      senderName === fallbackName ? getSenderName(message.user_id, fallbackName) : Promise.resolve(senderName),
      !isDM && !channel && message.channel_id
        ? supabase.from('channels').select('id,name,server_id').eq('id', message.channel_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (useAuthStore.getState().user?.id !== userId) return;
    const resolvedChannel = channel || channelResult.data;
    const resolvedServer = server || servers.find((item) => item.id === resolvedChannel?.server_id);
    const title = isDM
      ? resolvedSender
      : `${resolvedSender} · #${resolvedChannel?.name || 'sunucu'}`;
    useNotificationStore.setState((state) => ({
      activeToasts: state.activeToasts.map((item) => item.id === toast.id ? {
        ...item,
        title,
        ...(resolvedChannel?.server_id || resolvedServer?.id ? { server_id: resolvedChannel?.server_id || resolvedServer.id } : {}),
      } : item),
    }));
  })().catch(() => {});
}

function playNotificationSound(volume = 65) {
  if (typeof window === 'undefined' || Number(volume) <= 0) return;
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
      gain.gain.exponentialRampToValueAtTime(0.045 * Math.min(100, Math.max(0, Number(volume) || 0)) / 65, start + 0.012);
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
  dmUnreadCounts: {},
  activeDMChannelId: null,
  serverUnreadCounts: {},
  channelUnreadCounts: {},
  activeSubscription: null,
  activeSubscriptionCleanup: null,
  activeToasts: [], // For in-app UI toasts
  requestGeneration: 0,
  fetchRequestId: 0,
  notificationEventVersion: 0,

  reset: () => {
    get().unsubscribe();
    set((state) => ({ notifications: [], unreadCount: 0, dmUnreadCounts: {}, activeDMChannelId: null, serverUnreadCounts: {}, channelUnreadCounts: {}, activeToasts: [], requestGeneration: state.requestGeneration + 1 }));
  },

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const generation = get().requestGeneration;
    const fetchRequestId = get().fetchRequestId + 1;
    const eventVersion = get().notificationEventVersion;
    const startedAt = Date.now();
    set({ fetchRequestId });

    const [{ data, error }, { data: unreadRows, error: unreadError }, serverUnreadResult] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('notifications').select('server_id, channel_id, dm_channel_id').eq('user_id', user.id).eq('is_read', false),
      supabase.rpc('get_my_server_unread_counts'),
    ]);

    if (generation !== get().requestGeneration || fetchRequestId !== get().fetchRequestId) return;
    if (eventVersion !== get().notificationEventVersion) {
      window.setTimeout(() => void get().fetchNotifications(), 120);
      return;
    }
    if (error) console.error('Bildirimler yüklenemedi:', error.message);
    if (unreadError) console.warn('Okunmamış bildirim sayaçları tam eşitlenemedi; migration_realtime_sync_reliability.sql uygulanmış mı kontrol et:', unreadError.message);
    if (!error && data) {
      const preferences = getAppPreferences(user.id);
      const liveNotifications = get().notifications.filter((notification) => Date.parse(notification.created_at) >= startedAt && !notification.is_read);
      const unreadById = new Map((unreadError ? data.filter((notification) => !notification.is_read) : (unreadRows || [])).map((notification) => [notification.id, notification]));
      liveNotifications.forEach((notification) => unreadById.set(notification.id, notification));
      const allUnreadRows = [...unreadById.values()];
      const notificationsById = new Map(data.map((notification) => [notification.id, notification]));
      get().notifications.filter((notification) => Date.parse(notification.created_at) >= startedAt).forEach((notification) => notificationsById.set(notification.id, notification));
      const visibleServerRows = allUnreadRows.filter((row) => row.server_id && getServerNotificationMode(row.server_id, preferences) === 'mentions' && !isNotificationLocationMuted(row, preferences));
      const serverUnreadCounts = {};
      const channelUnreadCounts = {};
      (serverUnreadResult.data || []).forEach((row) => {
        if (!row.server_id || getServerNotificationMode(row.server_id, preferences) !== 'all' || isNotificationLocationMuted(row, preferences)) return;
        const count = Math.max(0, Number(row.unread_count) || 0);
        if (count) {
          serverUnreadCounts[row.server_id] = (serverUnreadCounts[row.server_id] || 0) + count;
          channelUnreadCounts[row.channel_id] = (channelUnreadCounts[row.channel_id] || 0) + count;
        }
      });
      visibleServerRows.forEach((row) => {
        serverUnreadCounts[row.server_id] = (serverUnreadCounts[row.server_id] || 0) + 1;
        if (row.channel_id) channelUnreadCounts[row.channel_id] = (channelUnreadCounts[row.channel_id] || 0) + 1;
      });
      const visibleUnreadRows = allUnreadRows.filter((row) => !row.server_id || !isNotificationLocationMuted(row, preferences));
      set({ 
        notifications: [...notificationsById.values()].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, 30),
        unreadCount: visibleUnreadRows.length,
        dmUnreadCounts: allUnreadRows.reduce((counts, row) => { if (row.dm_channel_id) counts[row.dm_channel_id] = (counts[row.dm_channel_id] || 0) + 1; return counts; }, {}),
        serverUnreadCounts,
        channelUnreadCounts,
      });
    }
    if (serverUnreadResult.error) console.warn('Sunucu okunmamış sayaçları eşitlenemedi; migration_message_notification_read_states.sql uygulanmış mı kontrol et:', serverUnreadResult.error.message);
  },

  markAsRead: async (notificationId) => {
    const userId = useAuthStore.getState().user?.id;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (!error) {
      const notification = get().notifications.find((item) => item.id === notificationId);
      const wasUnread = Boolean(notification && !notification.is_read);
      const preferences = getAppPreferences(useAuthStore.getState().user?.id);
      const countsOnServer = Boolean(wasUnread && getServerNotificationMode(notification?.server_id, preferences) === 'mentions' && !isNotificationLocationMuted(notification, preferences));
      set(state => ({
        notifications: state.notifications.map(n => n.id === notificationId ? { ...n, is_read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - (wasUnread ? 1 : 0)),
        dmUnreadCounts: wasUnread && notification?.dm_channel_id ? { ...state.dmUnreadCounts, [notification.dm_channel_id]: Math.max(0, (state.dmUnreadCounts[notification.dm_channel_id] || 0) - 1) } : state.dmUnreadCounts,
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
    } else console.error('Bildirim okundu olarak işaretlenemedi:', error.message);
  },

  markAllAsRead: async () => {
    const user = useAuthStore.getState().user;
    if (!user?.id) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    if (error) { console.error('Bildirimler okundu olarak işaretlenemedi:', error.message); return; }
    const { error: cursorError } = await supabase.rpc('mark_all_server_channels_read');
    if (cursorError) console.warn('Sunucu kanallarının okundu durumu kaydedilemedi:', cursorError.message);
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, is_read: true })),
      unreadCount: 0,
      dmUnreadCounts: {},
      serverUnreadCounts: {},
      channelUnreadCounts: {},
    }));
  },

  markServerNotificationsRead: async (serverId) => {
    const user = useAuthStore.getState().user;
    if (!user?.id || !serverId) return;
    const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('server_id', serverId).eq('is_read', false).select('id, channel_id');
    if (error) { console.error('Sunucu bildirimleri okundu olarak işaretlenemedi:', error.message); return; }
    set((state) => {
      const readIds = new Set((data || []).map((notification) => notification.id));
      const channelReadCounts = (data || []).reduce((counts, notification) => { if (notification.channel_id) counts[notification.channel_id] = (counts[notification.channel_id] || 0) + 1; return counts; }, {});
      const newlyRead = (data || []).length;
      return {
        notifications: state.notifications.map((notification) => readIds.has(notification.id) ? { ...notification, is_read: true } : notification),
        unreadCount: Math.max(0, state.unreadCount - newlyRead),
        serverUnreadCounts: { ...state.serverUnreadCounts, [serverId]: 0 },
        channelUnreadCounts: Object.fromEntries(Object.entries(state.channelUnreadCounts).map(([channelId, count]) => [channelId, Math.max(0, count - (channelReadCounts[channelId] || 0))])),
      };
    });
  },

  markChannelNotificationsRead: async (channelId) => {
    const user = useAuthStore.getState().user;
    if (!user?.id || !channelId) return;
    set({ activeServerChannelId: channelId });
    const [{ data, error }, cursorResult] = await Promise.all([
      supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('channel_id', channelId).eq('is_read', false).select('id, server_id'),
      supabase.rpc('mark_server_channel_read', { channel_uuid: channelId }),
    ]);
    if (error) { console.error('Kanal bildirimleri okundu olarak işaretlenemedi:', error.message); return; }
    if (cursorResult.error) console.warn('Kanal okuma işareti kaydedilemedi:', cursorResult.error.message);
    set((state) => {
      const preferences = getAppPreferences(user.id);
      const readIds = new Set((data || []).map((notification) => notification.id));
      const newlyRead = (data || []).length;
      const countableRead = (data || []).filter((notification) => !isNotificationLocationMuted(notification, preferences)).length;
      const serverId = data?.find((notification) => notification.server_id)?.server_id
        || useServerStore.getState().servers.find((server) => (server.categories || []).some((category) => category.channels?.some((channel) => channel.id === channelId)))?.id;
      const previousChannelCount = state.channelUnreadCounts[channelId] || 0;
      const remainingServerCount = serverId ? Math.max(0, (state.serverUnreadCounts[serverId] || 0) - Math.max(countableRead, previousChannelCount)) : 0;
      return {
        notifications: state.notifications.map((notification) => readIds.has(notification.id) ? { ...notification, is_read: true } : notification),
        unreadCount: Math.max(0, state.unreadCount - newlyRead),
        channelUnreadCounts: { ...state.channelUnreadCounts, [channelId]: 0 },
        serverUnreadCounts: serverId ? { ...state.serverUnreadCounts, [serverId]: remainingServerCount } : state.serverUnreadCounts,
      };
    });
  },

  markDMNotificationsRead: async (dmChannelId) => {
    const user = useAuthStore.getState().user;
    if (!user?.id || !dmChannelId) return;
    const { data, error } = await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('dm_channel_id', dmChannelId).eq('is_read', false).select('id');
    if (error) { console.error('DM okunma durumu kaydedilemedi:', error.message); return; }
    const readIds = new Set((data || []).map((row) => row.id));
    set((state) => ({
      notifications: state.notifications.map((notification) => readIds.has(notification.id) ? { ...notification, is_read: true } : notification),
      unreadCount: Math.max(0, state.unreadCount - (data || []).length),
      dmUnreadCounts: { ...state.dmUnreadCounts, [dmChannelId]: 0 },
    }));
  },

  setActiveDMChannel: (dmChannelId) => set({ activeDMChannelId: dmChannelId || null }),
  setActiveServerChannel: (channelId) => set({ activeServerChannelId: channelId || null }),

  receiveServerMessageNotification: (message, userId = useAuthStore.getState().user?.id) => {
    if (!message?.id || !message.channel_id || !message.user_id || message.user_id === userId || useAuthStore.getState().user?.id !== userId) return;
    const now = Date.now();
    for (const [id, at] of processedServerMessages) if (now - at > 60_000) processedServerMessages.delete(id);
    if (processedServerMessages.has(message.id)) return;
    processedServerMessages.set(message.id, now);
    set((state) => ({ notificationEventVersion: state.notificationEventVersion + 1 }));
    const preferences = getAppPreferences(userId);
    const servers = useServerStore.getState().servers;
    const channel = servers.flatMap((server) => (server.categories || []).flatMap((category) => category.channels || [])).find((item) => item.id === message.channel_id);
    const serverId = channel?.server_id || servers.find((server) => server.channels?.some((item) => item.id === message.channel_id))?.id;
    if (!serverId || getServerNotificationMode(serverId, preferences) !== 'all') return;
    const active = get().activeServerChannelId === message.channel_id && document.visibilityState === 'visible' && document.hasFocus();
    if (active) { void supabase.rpc('mark_server_channel_read', { channel_uuid: message.channel_id }); return; }
    if (isNotificationLocationMuted({ server_id: serverId, channel_id: message.channel_id }, preferences)) return;
    set((state) => ({
      serverUnreadCounts: { ...state.serverUnreadCounts, [serverId]: (state.serverUnreadCounts[serverId] || 0) + 1 },
      channelUnreadCounts: { ...state.channelUnreadCounts, [message.channel_id]: (state.channelUnreadCounts[message.channel_id] || 0) + 1 },
    }));
  },

  queueToast: (notification) => {
    if (!notification?.id || get().activeToasts.some((toast) => toast.id === notification.id)) return false;
    if ((notification.type === 'dm_message' || notification.message_id) && hasRecentMessageToast(notification)) return false;
    set((state) => ({ activeToasts: [...state.activeToasts, notification].slice(-3) }));
    clearTimeout(toastTimers.get(notification.id));
    toastTimers.set(notification.id, setTimeout(() => {
      toastTimers.delete(notification.id);
      set((state) => ({ activeToasts: state.activeToasts.filter((toast) => toast.id !== notification.id) }));
    }, 5_000));
    return true;
  },

  notifyIncomingMessage: (message, isDM, userId = useAuthStore.getState().user?.id) =>
    showIncomingMessageToast(message, Boolean(isDM), userId),

  subscribeToNotifications: () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { activeSubscription, activeSubscriptionCleanup } = get();
    activeSubscriptionCleanup?.();
    if (activeSubscription) void supabase.removeChannel(activeSubscription);

    let subscribedOnce = false;
    let readRefreshTimer;
    const subscription = supabase
      .channel(`public:notifications:user_id=eq.${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        get().receiveServerMessageNotification(payload.new, user.id);
        void showIncomingMessageToast(payload.new, false, user.id);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      }, (payload) => { void showIncomingMessageToast(payload.new, true, user.id); })
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const newNotif = payload.new;
        if (get().notifications.some((notification) => notification.id === newNotif.id)) return;
        set((state) => ({ notificationEventVersion: state.notificationEventVersion + 1 }));

        if (newNotif.server_id && newNotif.message_id) {
          // The message event owns the all-messages counter; mention rows are
          // retained in the notification center but must not count twice.
          if (getServerNotificationMode(newNotif.server_id, getAppPreferences(user.id)) === 'all') {
            const isOpen = get().activeServerChannelId === newNotif.channel_id && document.visibilityState === 'visible' && document.hasFocus();
            const countable = !isNotificationLocationMuted(newNotif, getAppPreferences(user.id));
            if (isOpen) {
              void supabase.from('notifications').update({ is_read: true }).eq('id', newNotif.id).eq('user_id', user.id);
              void supabase.rpc('mark_server_channel_read', { channel_uuid: newNotif.channel_id });
            }
            set((state) => ({ notifications: [{ ...newNotif, is_read: isOpen }, ...state.notifications].slice(0, 30), unreadCount: state.unreadCount + (isOpen || !countable ? 0 : 1) }));
            return;
          }
        }

        // The DM notification is inserted in the same database transaction as
        // its message. It provides a second realtime signal if the chat stream
        // misses the message while this conversation is open.
        if (newNotif.dm_channel_id) {
          window.setTimeout(() => {
            if (get().activeDMChannelId !== newNotif.dm_channel_id) return;
            const dmStore = useDMChatStore.getState();
            const notificationTime = Date.parse(newNotif.created_at || '') || Date.now();
            const alreadyVisible = (dmStore.messages[newNotif.dm_channel_id] || []).some((message) =>
              message.user_id === newNotif.sender_id
              && Math.abs(notificationTime - (Date.parse(message.created_at || '') || 0)) < 1_500
              && (newNotif.body === '🖼️ Fotoğraf' ? Boolean(message.image_url) : (message.content || '').startsWith(newNotif.body || ''))
            );
            if (!alreadyVisible) void dmStore.fetchMessages(newNotif.dm_channel_id);
          }, 100);
        }
        
        const preferences = getAppPreferences(user.id);
        const isOpenDM = Boolean(newNotif.dm_channel_id && get().activeDMChannelId === newNotif.dm_channel_id && document.visibilityState === 'visible' && document.hasFocus());
        const isOpenServerChannel = Boolean(newNotif.channel_id && get().activeServerChannelId === newNotif.channel_id && document.visibilityState === 'visible' && document.hasFocus());
        const doNotDisturb = shouldSuppressNotification(newNotif, preferences, { presenceIsDnd: usePresenceStore.getState().status === 'dnd' });
        const countServerActivity = !isNotificationLocationMuted(newNotif, preferences);
        if (isOpenDM || isOpenServerChannel) void supabase.from('notifications').update({ is_read: true }).eq('id', newNotif.id).eq('user_id', user.id);
        if (isOpenServerChannel) void supabase.rpc('mark_server_channel_read', { channel_uuid: newNotif.channel_id });
        const notification = isOpenDM || isOpenServerChannel ? { ...newNotif, is_read: true } : newNotif;
        const showedToast = !doNotDisturb && !isOpenServerChannel && get().queueToast(notification);
        if (showedToast && !isOpenDM && preferences.notificationSound) playNotificationSound(preferences.notificationSoundVolume);
        if (showedToast && preferences.desktopNotifications) showDesktopNotification(newNotif.title, newNotif.body);

        set(state => ({
          notifications: [notification, ...state.notifications].slice(0, 30),
          unreadCount: state.unreadCount + (isOpenDM || isOpenServerChannel || (newNotif.server_id && !countServerActivity) ? 0 : 1),
          dmUnreadCounts: notification.dm_channel_id && !isOpenDM ? { ...state.dmUnreadCounts, [notification.dm_channel_id]: (state.dmUnreadCounts[notification.dm_channel_id] || 0) + 1 } : state.dmUnreadCounts,
          serverUnreadCounts: countServerActivity && getServerNotificationMode(newNotif.server_id, preferences) === 'mentions' && newNotif.server_id && !isOpenServerChannel ? { ...state.serverUnreadCounts, [newNotif.server_id]: (state.serverUnreadCounts[newNotif.server_id] || 0) + 1 } : state.serverUnreadCounts,
          channelUnreadCounts: countServerActivity && getServerNotificationMode(newNotif.server_id, preferences) === 'mentions' && newNotif.channel_id && !isOpenServerChannel ? { ...state.channelUnreadCounts, [newNotif.channel_id]: (state.channelUnreadCounts[newNotif.channel_id] || 0) + 1 } : state.channelUnreadCounts,
        }));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        // Read state can change in another window. Re-fetch the authoritative
        // unread set so badges remain correct even for old notifications that
        // are not in the latest 30 rows held in memory.
        clearTimeout(readRefreshTimer);
        readRefreshTimer = setTimeout(() => void get().fetchNotifications(), 120);
      })
      .subscribe((status, error) => {
        if (status !== 'SUBSCRIBED') {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') console.warn('Bildirim Realtime bağlantı sorunu:', status, error?.message || error || 'Sunucu ayrıntı göndermedi');
          return;
        }
        // Recover any notifications created while the realtime connection was
        // unavailable without doing a periodic full-table poll.
        if (subscribedOnce) void get().fetchNotifications();
        subscribedOnce = true;
      });

    const refreshWhenConnected = () => { if (document.visibilityState === 'visible') void get().fetchNotifications(); };
    window.addEventListener('online', refreshWhenConnected);
    document.addEventListener('visibilitychange', refreshWhenConnected);
    set({ activeSubscription: subscription, activeSubscriptionCleanup: () => {
      clearTimeout(readRefreshTimer);
      window.removeEventListener('online', refreshWhenConnected);
      document.removeEventListener('visibilitychange', refreshWhenConnected);
    } });
  },

  removeToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set(state => ({
      activeToasts: state.activeToasts.filter(t => t.id !== id)
    }));
  },

  unsubscribe: () => {
    const { activeSubscription, activeSubscriptionCleanup } = get();
    activeSubscriptionCleanup?.();
    if (activeSubscription) void supabase.removeChannel(activeSubscription);
    set({ activeSubscription: null, activeSubscriptionCleanup: null });
    toastTimers.forEach(clearTimeout);
    toastTimers.clear();
    recentMessageToastKeys.clear();
    processedServerMessages.clear();
    senderNameCache.clear();
    set({ activeToasts: [] });
  }
}));
