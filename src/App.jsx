import React, { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { Zap, Hash, Volume2, Headphones, HeadphoneOff, ShieldAlert, ChevronDown, Plus, GripVertical, Mic, MicOff, Minus, Square, X, CalendarDays, ArrowLeft, LockKeyhole, Flame, FolderPlus, MoreHorizontal, Pencil, Trash2, Copy, WifiOff } from 'lucide-react';
import { useAuthStore } from './store/useAuthStore';
import { AuthScreen } from './features/auth/components/AuthScreen';
import { NotificationManager } from './components/layout/NotificationManager';
import { NotificationCenter } from './components/layout/NotificationCenter';
import { DesktopUpdateControl } from './components/layout/DesktopUpdateControl';
import { ServerSidebar } from './components/layout/ServerSidebar';
import { UserSettingsModal } from './features/auth/components/UserSettingsModal';
import { ChatArea } from './features/chat/components/ChatArea';
import { ServerMemberList } from './features/servers/components/ServerMemberList';
import { ServerWelcomeBanner } from './features/servers/components/ServerWelcomeBanner';
import { ServerEventsPanel } from './features/home/components/ServerEventsPanel';
import { HomeLayout } from './features/home/components/HomeLayout';
import { useServerStore } from './store/useServerStore';
import { useChatStore } from './store/useChatStore';
import { useDMChatStore } from './store/useDMChatStore';
import { useFriendStore } from './store/useFriendStore';
import { useNotificationStore } from './store/useNotificationStore';
import { fetchProfiles, getAvatarUrl } from './lib/profileMedia';
import { performWindowControl } from './lib/windowControls';
import { applyAppPreferences, getAppPreferences } from './lib/appPreferences';
import { playUiSound } from './lib/uiSounds';
import { supabase } from './lib/supabase';
import { fireDueEventReminders } from './lib/eventReminders';
import { usePresenceStore } from './store/usePresenceStore';
import { ActionContextMenu } from './components/layout/ActionContextMenu';
import { SharedProfilePage } from './components/layout/SharedProfilePage';
import { ServerViewBoundary } from './components/layout/ServerViewBoundary';
import { NsfwConsentModal } from './components/layout/NsfwConsentModal';
import { MarketingLanding } from './components/layout/MarketingLanding';
import { ServerInviteModal } from './components/layout/ServerInviteModal';

const CreateServerModal = lazy(() => import('./features/servers/components/CreateServerModal').then((module) => ({ default: module.CreateServerModal })));
const ServerSettingsModal = lazy(() => import('./features/servers/components/ServerSettingsModal').then((module) => ({ default: module.ServerSettingsModal })));
const CreateChannelModal = lazy(() => import('./features/servers/components/CreateChannelModal').then((module) => ({ default: module.CreateChannelModal })));
const CategoryModal = lazy(() => import('./features/servers/components/CategoryModal').then((module) => ({ default: module.CategoryModal })));
const EditChannelModal = lazy(() => import('./features/servers/components/EditChannelModal').then((module) => ({ default: module.EditChannelModal })));
const VoiceRoom = lazy(() => import('./features/chat/components/VoiceRoom').then((module) => ({ default: module.VoiceRoom })));
const GlobalSearchModal = lazy(() => import('./components/layout/GlobalSearchModal').then((module) => ({ default: module.GlobalSearchModal })));

export default function App() {
  const { session, user, isInitialized, initialize } = useAuthStore();
  const { servers, activeServerId, activeChannelId, isLoading: serversLoading, fetchServers, joinServer, setActiveChannel, openServer, reorderChannels, reorderCategories, moveChannelToCategory, deleteCategory, deleteChannel, subscribeToServer, subscribeToMembership, reset: resetServers } = useServerStore();
  const resetChannelMessages = useChatStore((state) => state.reset);
  const resetDMMessages = useDMChatStore((state) => state.reset);
  const resetFriendData = useFriendStore((state) => state.reset);
  const resetNotifications = useNotificationStore((state) => state.reset);
  const markChannelNotificationsRead = useNotificationStore((state) => state.markChannelNotificationsRead);
  const markNotificationRead = useNotificationStore((state) => state.markAsRead);
  const initializePresence = usePresenceStore((state) => state.initialize);
  const channelUnreadCounts = useNotificationStore((state) => state.channelUnreadCounts);
  const loadedSessionUserId = useRef(null);
  const sharedProfileId = window.location.pathname.match(/^\/user\/(\d+)\/?$/u)?.[1] || null;
  const sharedInviteCode = window.location.pathname.match(/^\/invite\/([a-z0-9_-]{3,32})\/?$/iu)?.[1]
    || new URLSearchParams(window.location.search).get('invite')?.match(/^[a-z0-9_-]{3,32}$/iu)?.[0]
    || null;
  const processedInviteRef = useRef('');

  useEffect(() => {
    applyAppPreferences(getAppPreferences(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!window.fastlynoxDesktop) return undefined;
    document.documentElement.classList.add('electron-desktop');
    const updateWindowState = (state) => setIsWindowMaximized(Boolean(state?.maximized));
    const unsubscribe = window.fastcordWindow?.onWindowState?.(updateWindowState);
    void window.fastcordWindow?.isMaximized?.().then((maximized) => updateWindowState({ maximized })).catch(() => {});
    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove('electron-desktop');
    };
  }, []);

  useEffect(() => {
    if (!window.fastlynoxDesktop?.onDeepLink) return undefined;
    return window.fastlynoxDesktop.onDeepLink(({ inviteCode }) => {
      if (inviteCode) setInviteDialogCode(inviteCode);
    });
  }, []);

  // App State
  const [layout, setLayout] = useState('home'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverEventsFor, setServerEventsFor] = useState(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [creatingChannelCategory, setCreatingChannelCategory] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const [managementContext, setManagementContext] = useState(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [pendingDMId, setPendingDMId] = useState(null);
  const [draggedChannelId, setDraggedChannelId] = useState(null);
  const [dropTargetChannelId, setDropTargetChannelId] = useState(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState(null);
  const [channelOrderError, setChannelOrderError] = useState('');
  const [serverCapabilities, setServerCapabilities] = useState({ serverId: null, manageChannels: false });
  const [voiceSession, setVoiceSession] = useState(null);
  const [incomingCallInvite, setIncomingCallInvite] = useState(null);
  const voiceSessionRef = useRef(null);
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const [voicePresenceByChannel, setVoicePresenceByChannel] = useState({});
  const voiceProfileCacheRef = useRef(new Map());
  const [voiceMemberMenuRequest, setVoiceMemberMenuRequest] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [windowNotice, setWindowNotice] = useState('');
  const [nsfwPromptChannel, setNsfwPromptChannel] = useState(null);
  const [inviteDialogCode, setInviteDialogCode] = useState(null);
  const [isWindowMaximized, setIsWindowMaximized] = useState(Boolean(document.fullscreenElement));
  const [networkOnline, setNetworkOnline] = useState(() => globalThis.navigator?.onLine ?? true);

  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeVoiceChannelIds = (servers.find((item) => item.id === activeServerId)?.categories || [])
    .flatMap((category) => category.channels || []).filter((channel) => channel.type === 'voice').map((channel) => channel.id);
  const activeVoiceChannelKey = activeVoiceChannelIds.join(',');

  useEffect(() => {
    if (!activeServerId || !user?.id || !activeVoiceChannelIds.length) {
      setVoicePresenceByChannel({});
      return undefined;
    }
    let alive = true;
    let timer;
    let refreshing = false;
    let refreshQueued = false;
    const channelIds = activeVoiceChannelKey.split(',');
    const refresh = async () => {
      if (refreshing) { refreshQueued = true; return; }
      refreshing = true;
      try {
        // Presence heartbeat runs every 12s. A 36s lease tolerates a missed
        // packet while clearing disconnected users promptly.
        const cutoff = new Date(Date.now() - 36_000).toISOString();
        const { data: rows, error: presenceError } = await supabase.from('server_voice_presence')
          .select('channel_id,user_id,microphone_enabled,deafened,updated_at')
          .eq('server_id', activeServerId).in('channel_id', channelIds).gt('updated_at', cutoff);
        if (!alive) return;
        if (presenceError) {
          console.warn('Ses kanalı katılımcıları alınamadı:', presenceError.message);
          return; // Never replace a good roster with an empty one on query failure.
        }
        const currentRows = rows || [];
        const userIds = [...new Set(currentRows.map((row) => row.user_id))];
        const missingProfileIds = userIds.filter((id) => !voiceProfileCacheRef.current.has(id));
        const [newProfiles, moderationResult] = await Promise.all([
          missingProfileIds.length ? fetchProfiles(missingProfileIds).catch((error) => {
            console.warn('Ses katılımcılarının profilleri alınamadı:', error);
            return [];
          }) : Promise.resolve([]),
          userIds.length ? supabase.from('server_voice_moderation').select('channel_id,user_id,server_muted,server_deafened')
            .in('channel_id', channelIds).in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (!alive) return;
        (newProfiles || []).forEach((profile) => voiceProfileCacheRef.current.set(profile.id, profile));
        const moderation = new Map((moderationResult.data || []).map((row) => [`${row.channel_id}:${row.user_id}`, row]));
        const next = {};
        currentRows.forEach((row) => {
          const profile = voiceProfileCacheRef.current.get(row.user_id) || {};
          const mod = moderation.get(`${row.channel_id}:${row.user_id}`) || {};
          (next[row.channel_id] ||= []).push({ id: row.user_id, username: profile.username || 'Fastlynox kullanıcısı', avatar_url: profile.avatar_url || null, microphoneEnabled: row.microphone_enabled, deafened: row.deafened, serverMuted: Boolean(mod.server_muted), serverDeafened: Boolean(mod.server_deafened), speaking: false });
        });
        setVoicePresenceByChannel(next);
      } catch (error) {
        console.warn('Ses kanalı roster yenilenemedi:', error);
      } finally {
        refreshing = false;
        if (refreshQueued && alive) { refreshQueued = false; queueRefresh(); }
      }
    };
    const queueRefresh = () => { clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 180); };
    void refresh();
    const subscription = supabase.channel(`voice-presence:${activeServerId}`)
      // Delete payloads normally contain only primary-key columns, so filtering
      // by server_id can silently drop a member's leave event. Match channel_id
      // from the payload instead and refresh only for this server's channels.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_presence' }, (payload) => {
        const changedChannel = payload.new?.channel_id || payload.old?.channel_id;
        if (channelIds.includes(changedChannel)) queueRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_moderation' }, (payload) => {
        const changedChannel = payload.new?.channel_id || payload.old?.channel_id;
        if (channelIds.includes(changedChannel)) queueRefresh();
      })
      .subscribe();
    const fallbackRefresh = window.setInterval(() => void refresh(), 30_000);
    return () => { alive = false; clearTimeout(timer); clearInterval(fallbackRefresh); void supabase.removeChannel(subscription); };
  }, [activeServerId, user?.id, activeVoiceChannelKey]);

  useEffect(() => {
    fireDueEventReminders();
    const timer = window.setInterval(fireDueEventReminders, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const handleVoiceParticipantsChange = useCallback((nextParticipants) => {
    setVoiceParticipants((current) => {
      const unchanged = current.length === nextParticipants.length && current.every((participant, index) => {
        const next = nextParticipants[index];
        return participant.id === next.id && participant.username === next.username && participant.avatar_url === next.avatar_url && participant.microphoneEnabled === next.microphoneEnabled && participant.speaking === next.speaking && participant.serverMuted === next.serverMuted && participant.serverDeafened === next.serverDeafened && participant.deafened === next.deafened;
      });
      return unchanged ? current : nextParticipants;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const currentUserId = useAuthStore.getState().user?.id;
      const shortcut = getAppPreferences(currentUserId).searchShortcut || 'ctrl+k';
      const key = e.key.toLowerCase();
      const shouldSearch = shortcut === 'ctrl+k'
        ? (e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'k'
        : shortcut === 'ctrl+shift+k'
          ? (e.ctrlKey || e.metaKey) && e.shiftKey && key === 'k'
          : e.altKey && !e.ctrlKey && !e.metaKey && key === 'k';
      if (shouldSearch) {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const updateMaximizeState = () => setIsWindowMaximized(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateMaximizeState);
    return () => document.removeEventListener('fullscreenchange', updateMaximizeState);
  }, []);

  const handleWindowControl = async (action) => {
    setWindowNotice('');
    try {
      const completed = await performWindowControl(action);
      if (!completed) setWindowNotice('Küçültme ve kapatma düğmeleri masaüstü pencere köprüsü gerektiriyor.');
    } catch (error) {
      setWindowNotice(error instanceof Error ? error.message : 'Pencere işlemi gerçekleştirilemedi.');
    }
  };

  const handleStartDMCall = useCallback(({ channelId, channelName, peerId, inviteId, isCaller }) => {
    if (voiceSession) {
      setVoiceNotice('Başka bir ses bağlantısındasın. Önce mevcut odadan veya aramadan ayrıl.');
      return false;
    }
    setVoiceNotice('');
    setVoiceSession({ kind: 'dm', channelId, dmChannelId: channelId, channelName, peerId, inviteId, isCaller, serverId: null });
    return true;
  }, [voiceSession]);

  const handleCallInviteAccepted = useCallback((inviteId) => {
    setIncomingCallInvite((current) => current?.id === inviteId ? null : current);
  }, []);

  const handleCallInviteDeclined = useCallback((inviteId) => {
    setIncomingCallInvite((current) => current?.id === inviteId ? null : current);
  }, []);

  const currentUserId = user?.id;
  const handleLeaveVoice = useCallback(async () => {
    const current = voiceSession;
    if (current?.kind === 'dm' && current.inviteId && currentUserId) {
      await supabase.from('dm_call_invites').update({ status: 'ended' }).eq('id', current.inviteId);
    }
    if (current?.kind !== 'dm' && current?.channelId && currentUserId) {
      // Optimistically remove self, then clear shared presence before LiveKit teardown.
      setVoicePresenceByChannel((previous) => {
        const members = previous[current.channelId] || [];
        const remaining = members.filter((member) => member.id !== currentUserId);
        if (remaining.length === members.length) return previous;
        const next = { ...previous };
        if (remaining.length) next[current.channelId] = remaining;
        else delete next[current.channelId];
        return next;
      });
      try {
        const { error } = await supabase.rpc('clear_server_voice_presence', { channel_uuid: current.channelId });
        if (error) console.warn('Ses kanalı durumu temizlenemedi:', error.message);
      } catch (error) {
        console.warn('Ses kanalı durumu temizlenemedi:', error);
      }
    }
    playUiSound(current?.kind === 'dm' ? 'callEnded' : 'leave', currentUserId);
    setVoiceSession(null);
    setVoiceMemberMenuRequest(null);
    setVoiceParticipants([]);
    setVoiceNotice('');
  }, [voiceSession, currentUserId]);

  useEffect(() => { voiceSessionRef.current = voiceSession; }, [voiceSession]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;
    let active = true;
    const handleCallStatus = (invite) => {
      const current = voiceSessionRef.current;
      if (current?.kind === 'dm' && current.inviteId === invite.id && invite.status === 'accepted' && current.isCaller) playUiSound('callAccepted', userId);
      if (current?.kind === 'dm' && current.inviteId === invite.id && ['declined', 'ended'].includes(invite.status)) {
        playUiSound(invite.status === 'declined' ? 'callDeclined' : 'callEnded', userId);
        setVoiceSession(null);
        setVoiceParticipants([]);
        setVoiceNotice(invite.status === 'declined' ? 'Arama reddedildi.' : 'Arama sona erdi.');
      }
      if (incomingCallInvite?.id === invite.id && invite.status !== 'ringing') setIncomingCallInvite(null);
    };
    const channel = supabase.channel(`dm-call-invites:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_call_invites', filter: `callee_id=eq.${userId}` }, ({ new: invite }) => {
        if (invite.status !== 'ringing') return;
        playUiSound('incomingCall', userId);
        setIncomingCallInvite(invite);
        setPendingDMId(invite.dm_channel_id);
        setLayout('home');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_call_invites', filter: `caller_id=eq.${userId}` }, ({ new: invite }) => handleCallStatus(invite))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_call_invites', filter: `callee_id=eq.${userId}` }, ({ new: invite }) => handleCallStatus(invite))
      .subscribe();
    const recentSince = new Date(Date.now() - 45_000).toISOString();
    void supabase.from('dm_call_invites').select('*').eq('callee_id', userId).eq('status', 'ringing').gte('created_at', recentSince).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!active || !data || incomingCallInvite?.id) return;
        playUiSound('incomingCall', userId);
        setIncomingCallInvite(data);
        setPendingDMId(data.dm_channel_id);
        setLayout('home');
      });
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [session?.user?.id, incomingCallInvite?.id]);

  // Initialize Auth
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    void initializePresence(session?.user?.id || null);
  }, [session?.user?.id, initializePresence]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;
    let active = true;
    const deliverScheduledMessages = async () => {
      const { data: dueMessages, error } = await supabase.from('scheduled_messages').select('id,channel_id,user_id,content').eq('user_id', userId).is('sent_at', null).lte('send_at', new Date().toISOString()).order('send_at').limit(20);
      if (!active || error || !dueMessages?.length) return;
      for (const scheduled of dueMessages) {
        if (!active) return;
        const sentAt = new Date().toISOString();
        const { data: claimed, error: claimError } = await supabase.from('scheduled_messages').update({ sent_at: sentAt }).eq('id', scheduled.id).eq('user_id', userId).is('sent_at', null).select('id').maybeSingle();
        if (claimError || !claimed) continue;
        const { error: sendError } = await supabase.from('messages').insert({ channel_id: scheduled.channel_id, user_id: userId, content: scheduled.content });
        if (sendError) await supabase.from('scheduled_messages').update({ sent_at: null }).eq('id', scheduled.id).eq('user_id', userId);
      }
    };
    void deliverScheduledMessages();
    const timer = window.setInterval(() => { void deliverScheduledMessages(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeServerId || !user?.id) { setServerCapabilities({ serverId: null, manageChannels: false }); return undefined; }
    const server = servers.find((item) => item.id === activeServerId);
    if (server?.owner_id === user.id || server?.member_role === 'admin') { setServerCapabilities({ serverId: activeServerId, manageChannels: true }); return undefined; }
    let active = true;
    void supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: 'manage_channels' })
      .then(({ data, error }) => { if (active) setServerCapabilities({ serverId: activeServerId, manageChannels: !error && data === true }); });
    return () => { active = false; };
  }, [activeServerId, servers, user?.id]);

  useEffect(() => {
    if (!activeServerId || layout !== 'server') return undefined;
    return subscribeToServer(activeServerId);
  }, [activeServerId, layout, subscribeToServer]);

  useEffect(() => {
    if (activeChannelId && layout === 'server') void markChannelNotificationsRead(activeChannelId);
  }, [activeChannelId, layout, markChannelNotificationsRead]);

  // Clear cached private data when the account changes, then load only that account's servers.
  useEffect(() => {
    const userId = session?.user?.id;
    document.documentElement.classList.toggle('reduce-motion', Boolean(userId && getAppPreferences(userId).reduceMotion));
    if (!userId) {
      // A sign-out must tear down the LiveKit room before another user can sign in.
      // eslint-disable-next-line react/set-state-in-effect
      setVoiceSession(null);
      setVoiceParticipants([]);
      if (loadedSessionUserId.current) {
        resetServers();
        resetChannelMessages();
        resetDMMessages();
        resetFriendData();
        resetNotifications();
        loadedSessionUserId.current = null;
      }
      return;
    }
    if (loadedSessionUserId.current === userId) return;
    loadedSessionUserId.current = userId;
    resetServers();
    resetChannelMessages();
    resetDMMessages();
    resetFriendData();
    resetNotifications();
    fetchServers();
  }, [session?.user?.id, fetchServers, resetServers, resetChannelMessages, resetDMMessages, resetFriendData, resetNotifications]);

  // Keep the server rail in sync when this account is added to or removed from
  // a server elsewhere. The subscription also resynchronizes after reconnect.
  useEffect(() => {
    if (!session?.user?.id) return undefined;
    return subscribeToMembership(session.user.id);
  }, [session?.user?.id, subscribeToMembership]);

  useEffect(() => {
    if (!isInitialized || !sharedInviteCode) return;
    const inviteKey = `${user?.id || 'guest'}:${sharedInviteCode}`;
    if (processedInviteRef.current === inviteKey) return;
    processedInviteRef.current = inviteKey;
    setInviteDialogCode(sharedInviteCode);
  }, [isInitialized, user?.id, sharedInviteCode]);

  if (!window.fastlynoxDesktop && window.location.pathname === '/' && !sharedInviteCode && !sharedProfileId) return <MarketingLanding />;
  if (!isInitialized) return <div className="flex h-screen items-center justify-center bg-fastcord-bg text-white">Yükleniyor...</div>;

  if (sharedProfileId) return <SharedProfilePage publicId={sharedProfileId} />;

  if (!session) {
    if (!window.fastlynoxDesktop && window.location.pathname !== '/app' && (inviteDialogCode || sharedInviteCode)) return <div className="relative min-h-screen bg-[#080b11]"><MarketingLanding /><ServerInviteModal inviteCode={inviteDialogCode || sharedInviteCode} authenticated={false} onClose={() => { setInviteDialogCode(null); window.location.assign('/'); }} /></div>;
    if (!window.fastlynoxDesktop && window.location.pathname !== '/app') return <MarketingLanding />;
    return <AuthScreen />;
  }

  const handleJoinInvite = async (inviteCode) => {
    const result = await joinServer(inviteCode);
    if (result.success) {
      window.history.replaceState(null, '', '/');
      setLayout('server');
      setVoiceNotice('Sunucuya katıldın.');
    }
    return result;
  };

  // APP RENDER (Logged In)
  const currentServerData = servers.find(s => s.id === activeServerId);
  const activeChannel = currentServerData?.categories?.flatMap(c => c.channels)?.find(ch => ch.id === activeChannelId);
  const currentChannelName = activeChannel?.name || 'sohbet';
  const activeChannelType = activeChannel?.type || 'text';
  const voiceChannelNameById = new Map((currentServerData?.categories || []).flatMap((category) => category.channels || []).filter((channel) => channel.type === 'voice').map((channel) => [channel.id, channel.name]));
  const voiceMemberChannels = Object.fromEntries(Object.entries(voicePresenceByChannel).flatMap(([channelId, participants]) => participants.map((participant) => [participant.id, voiceChannelNameById.get(channelId) || 'Ses kanalında'])));
  const canManageChannels = currentServerData?.owner_id === user?.id || currentServerData?.member_role === 'admin' || (serverCapabilities.serverId === activeServerId && serverCapabilities.manageChannels);
  const canReorderChannels = canManageChannels;

  const handleChannelSelect = (channel) => {
    setServerEventsFor(null);
    if (channel.nsfw && !sessionStorage.getItem('fastcord:nsfw-consent')) {
      setNsfwPromptChannel(channel);
      return;
    }
    if (channel.type === 'voice') {
      if (voiceSession && voiceSession.channelId !== channel.id) {
        setVoiceNotice(`Şu anda “${voiceSession.channelName}” ses odasındasın. Başka bir ses odasına geçmek için önce mevcut odadan ayrıl.`);
        return;
      }
      setVoiceNotice('');
      if (voiceSession?.channelId !== channel.id) playUiSound(voiceSession ? 'move' : 'join', user?.id);
      setVoiceSession({ channelId: channel.id, channelName: channel.name, serverId: activeServerId });
    } else {
      setVoiceNotice('');
    }
    setActiveChannel(channel.id);
  };

  const handleChannelMention = (channel) => {
    const targetServer = servers.find((server) => server.id === channel.server_id || server.categories?.some((category) => category.channels?.some((item) => item.id === channel.id)));
    if (!targetServer) {
      setVoiceNotice(`“${channel.name}” kanalını açmak için o sunucuya üye olmalısın.`);
      return;
    }
    const targetChannel = targetServer.categories?.flatMap((category) => category.channels || []).find((item) => item.id === channel.id);
    if (!targetChannel) return;
    if (targetChannel.type === 'voice') {
      if (voiceSession && voiceSession.channelId !== targetChannel.id) {
        setVoiceNotice(`Şu anda “${voiceSession.channelName}” ses odasındasın. Önce mevcut odadan ayrıl.`);
        return;
      }
      if (!voiceSession) playUiSound('join', user?.id);
      setVoiceSession({ channelId: targetChannel.id, channelName: targetChannel.name, serverId: targetServer.id });
    }
    setVoiceNotice('');
    setServerEventsFor(null);
    openServer(targetServer.id);
    setActiveChannel(targetChannel.id);
    setLayout('server');
  };

  const handleChannelDrop = async (categoryId, targetChannelId) => {
    if (!canReorderChannels || !draggedChannelId || draggedChannelId === targetChannelId) return;
    const sourceCategory = currentServerData.categories?.find((item) => item.channels?.some((channel) => channel.id === draggedChannelId));
    if (sourceCategory && sourceCategory.id !== categoryId) {
      const moved = await moveChannelToCategory(activeServerId, draggedChannelId, categoryId);
      setChannelOrderError(moved.success ? '' : moved.error);
      setDraggedChannelId(null);
      setDropTargetChannelId(null);
      return;
    }
    const category = currentServerData.categories?.find((item) => item.id === categoryId);
    const channelIds = (category?.channels || []).map((channel) => channel.id);
    const from = channelIds.indexOf(draggedChannelId);
    const to = channelIds.indexOf(targetChannelId);
    if (from < 0 || to < 0) return;
    channelIds.splice(from, 1);
    channelIds.splice(to, 0, draggedChannelId);
    const result = await reorderChannels(activeServerId, categoryId, channelIds);
    setChannelOrderError(result.success ? '' : result.error);
    setDraggedChannelId(null);
    setDropTargetChannelId(null);
  };

  const handleCategoryDrop = async (targetCategoryId) => {
    if (!canManageChannels) return;
    if (draggedCategoryId && draggedCategoryId !== targetCategoryId) {
      const categoryIds = (currentServerData.categories || []).map((category) => category.id);
      const from = categoryIds.indexOf(draggedCategoryId);
      const to = categoryIds.indexOf(targetCategoryId);
      if (from >= 0 && to >= 0) {
        categoryIds.splice(from, 1);
        categoryIds.splice(to, 0, draggedCategoryId);
        const result = await reorderCategories(activeServerId, categoryIds);
        setChannelOrderError(result.success ? '' : result.error);
      }
    } else if (draggedChannelId) {
      const result = await moveChannelToCategory(activeServerId, draggedChannelId, targetCategoryId);
      setChannelOrderError(result.success ? '' : result.error);
    }
    setDraggedCategoryId(null);
    setDropTargetCategoryId(null);
    setDraggedChannelId(null);
    setDropTargetChannelId(null);
  };

  const deleteChannelFromMenu = async (channel) => {
    if (!canManageChannels || !window.confirm(`#${channel.name} kanalını ve içindeki mesajları kalıcı olarak silmek istiyor musun?`)) return;
    if (voiceSession?.channelId === channel.id) await handleLeaveVoice();
    const result = await deleteChannel(activeServerId, channel.id);
    setChannelOrderError(result.success ? '' : result.error);
  };

  const deleteCategoryFromMenu = async (category) => {
    if (!canManageChannels) return;
    const count = category.channels?.length || 0;
    const detail = count ? ` Bu işlem içindeki ${count} kanalı ve mesajlarını da siler.` : '';
    if (!window.confirm(`“${category.name}” kategorisini silmek istiyor musun?${detail}`)) return;
    if (voiceSession && category.channels?.some((channel) => channel.id === voiceSession.channelId)) await handleLeaveVoice();
    const result = await deleteCategory(activeServerId, category.id);
    setChannelOrderError(result.success ? '' : result.error);
  };

  const copyPublicId = async (entity, label) => {
    if (!entity?.public_id) { setChannelOrderError('Sayısal kimlik için migration_public_numeric_ids.sql dosyasını Supabase’te çalıştır.'); return; }
    try { await navigator.clipboard.writeText(String(entity.public_id)); setChannelOrderError(`${label} sayısal kimliği kopyalandı.`); }
    catch { setChannelOrderError(`${label} kimliği panoya kopyalanamadı.`); }
  };

  const managementMenuItems = managementContext?.kind === 'category' ? [
    { id: 'add-channel', label: 'Bu kategoriye kanal ekle', icon: Plus, onSelect: () => setCreatingChannelCategory(managementContext.category) },
    { id: 'rename-category', label: 'Kategoriyi yeniden adlandır', icon: Pencil, onSelect: () => setEditingCategory(managementContext.category) },
    { id: 'copy-category-id', label: 'Kategori kimliğini kopyala', icon: Copy, onSelect: () => void copyPublicId(managementContext.category, 'Kategori') },
    { separator: true },
    { id: 'delete-category', label: 'Kategoriyi ve kanallarını sil', icon: Trash2, danger: true, onSelect: () => void deleteCategoryFromMenu(managementContext.category) },
  ] : managementContext?.kind === 'channel' ? [
    { id: 'copy-channel-id', label: 'Sayısal kanal kimliğini kopyala', icon: Copy, onSelect: () => void copyPublicId(managementContext.channel, 'Kanal') },
    { id: 'copy-channel-mention', label: 'Kanal etiketini kopyala', icon: Hash, onSelect: () => managementContext.channel.public_id ? navigator.clipboard.writeText(`<#${managementContext.channel.public_id}>`).then(() => setChannelOrderError('Kanal etiketi kopyalandı.')).catch(() => setChannelOrderError('Kanal etiketi kopyalanamadı.')) : setChannelOrderError('Önce sayısal ID migration’ını çalıştır.') },
    ...(canManageChannels ? [
      { separator: true },
      { id: 'edit-channel', label: 'Kanalı düzenle', icon: Pencil, onSelect: () => setEditingChannel(managementContext.channel) },
      { id: 'delete-channel', label: 'Kanalı ve mesajlarını sil', icon: Trash2, danger: true, onSelect: () => void deleteChannelFromMenu(managementContext.channel) },
    ] : []),
  ] : [];

  return (
    <div className={`macos-shell m-2 flex min-h-0 min-w-0 flex-1 flex-col relative overflow-hidden bg-fastcord-bg ${voiceSession ? 'voice-dock-space' : ''}`}>
      {/* Titlebar */}
      <div className="macos-titlebar h-10 w-full bg-fastcord-titlebar flex items-center shrink-0 border-b border-white/5 relative z-[100]" style={{WebkitAppRegion: 'drag'}}>
        <div className="px-4 flex items-center gap-2.5">
          <Zap className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-xs font-semibold text-slate-300">Fastlynox</span>
        </div>
        <span aria-live="polite" className={`pointer-events-none absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 text-[11px] font-medium tracking-wide transition-colors ${networkOnline ? 'text-slate-500' : 'text-amber-200'}`}>{networkOnline ? 'Sohbet alanı' : <><WifiOff className="h-3.5 w-3.5" /> Çevrim dışı · Taslakların korunuyor</>}</span>
        <div className="ml-auto flex h-full items-center" style={{WebkitAppRegion: 'no-drag'}}>
          <DesktopUpdateControl />
          {user?.id && <NotificationCenter className="mr-1" onOpenNotification={(notification) => {
            if (notification.server_id && notification.channel_id) {
              openServer(notification.server_id);
              setActiveChannel(notification.channel_id);
              setLayout('server');
            } else if (notification.dm_channel_id) {
              setLayout('home');
              setPendingDMId(notification.dm_channel_id);
            }
          }} />}
          <button type="button" aria-label="Küçült" title="Küçült" onClick={() => void handleWindowControl('minimize')} className="windows-caption-button grid h-full w-11 place-items-center text-slate-400 transition hover:bg-white/10 hover:text-white"><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label={isWindowMaximized ? 'Pencereyi geri al' : 'Büyüt'} title={isWindowMaximized ? 'Geri al' : 'Büyüt'} onClick={() => void handleWindowControl('maximize')} className="windows-caption-button grid h-full w-11 place-items-center text-slate-400 transition hover:bg-white/10 hover:text-white"><Square className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Kapat" title="Kapat" onClick={() => void handleWindowControl('close')} className="windows-caption-button windows-close grid h-full w-12 place-items-center text-slate-400 transition hover:bg-rose-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="macos-app-content flex-1 min-h-0 flex w-full relative overflow-hidden bg-fastcord-bg">
        <ServerSidebar 
          layout={layout} setLayout={setLayout}
          setShowCreateServer={setShowCreateServer}
          setShowSettings={setShowSettings}
        />

        {/* LAYOUT: HOME */}
        {layout === 'home' && (
          <div className="flex-1 min-h-0 flex relative animate-in fade-in duration-200">
             <HomeLayout onOpenSearch={() => setShowGlobalSearch(true)} pendingDMId={pendingDMId} onPendingDMHandled={() => setPendingDMId(null)} onStartCall={handleStartDMCall} incomingCallInvite={incomingCallInvite} onAcceptCall={handleCallInviteAccepted} onDeclineCall={handleCallInviteDeclined} onInviteClick={setInviteDialogCode} />
          </div>
        )}

        {/* LAYOUT: SERVER */}
        {layout === 'server' && currentServerData && (
           <ServerViewBoundary onBack={() => setLayout('home')}>
           <div className="flex-1 min-h-0 flex relative animate-in fade-in duration-200">
              <div className="macos-panel w-64 bg-fastcord-panel flex flex-col shrink-0 border-r border-white/[0.06] z-10">
                  <div onClick={() => setShowServerSettings(true)} className="h-12 flex items-center px-4 shadow-sm shrink-0 border-b border-white/5 justify-between hover:bg-white/5 cursor-pointer transition-colors">
                      <span className="font-bold text-white text-sm">{currentServerData.name}</span>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                      {channelOrderError && <p role="alert" className="m-2 rounded-lg border border-rose-300/15 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">{channelOrderError}</p>}
                      <div className="mb-2 flex items-center gap-1"><button type="button" onClick={() => setServerEventsFor(activeServerId)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${serverEventsFor === activeServerId ? 'border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-cyan-100'}`}><CalendarDays className="h-4 w-4 shrink-0" /> Etkinlikler</button>{canManageChannels && <button type="button" onClick={() => setCreatingCategory(true)} title="Kategori oluştur" aria-label="Kategori oluştur" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-cyan-100"><FolderPlus className="h-4 w-4" /></button>}</div>
                      {(currentServerData.categories || []).map((cat) => (
                        <div key={cat.id}>
                          <div draggable={canManageChannels} onDragStart={(event) => { if (!canManageChannels) return; event.dataTransfer.setData('application/x-fastcord-category', cat.id); event.dataTransfer.effectAllowed = 'move'; setDraggedCategoryId(cat.id); }} onDragOver={(event) => { if (canManageChannels && (draggedCategoryId || draggedChannelId)) { event.preventDefault(); setDropTargetCategoryId(cat.id); } }} onDrop={(event) => { event.preventDefault(); void handleCategoryDrop(cat.id); }} onDragEnd={() => { setDraggedCategoryId(null); setDropTargetCategoryId(null); }} onContextMenu={(event) => { if (!canManageChannels) return; event.preventDefault(); setManagementContext({ kind: 'category', category: cat, x: event.clientX, y: event.clientY }); }} className={`group flex items-center justify-between gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-300 mt-4 mb-1 px-2 transition-colors ${dropTargetCategoryId === cat.id ? 'rounded-md border-t-2 border-violet-300' : 'border-t-2 border-transparent'} ${draggedCategoryId === cat.id ? 'opacity-45' : ''}`}>
                            <span className="flex min-w-0 items-center gap-1"><GripVertical className={`h-3 w-3 shrink-0 ${canManageChannels ? 'cursor-grab text-slate-600' : 'hidden'}`} /><ChevronDown className="w-3 h-3 shrink-0" /> <span className="truncate">{cat.name}</span></span>
                            {canManageChannels && <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"><button type="button" aria-label={`${cat.name} içinde kanal oluştur`} title="Kanal oluştur" onClick={() => setCreatingChannelCategory(cat)} className="rounded p-1 hover:bg-white/10 hover:text-white"><Plus className="h-3.5 w-3.5" /></button><button type="button" aria-label={`${cat.name} kategori seçenekleri`} title="Kategori seçenekleri" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setManagementContext({ kind: 'category', category: cat, x: bounds.right, y: bounds.bottom }); }} className="rounded p-1 hover:bg-white/10 hover:text-white"><MoreHorizontal className="h-3.5 w-3.5" /></button></div>}
                          </div>
                          {(cat.channels || []).map(ch => (
                            <div
                              key={ch.id}
                              onContextMenu={(event) => { event.preventDefault(); setManagementContext({ kind: 'channel', channel: ch, x: event.clientX, y: event.clientY }); }}
                              draggable={canReorderChannels}
                              onDragStart={(event) => { if (canReorderChannels) { setDraggedChannelId(ch.id); event.dataTransfer.setData('text/plain', ch.id); event.dataTransfer.effectAllowed = 'move'; } }}
                              onDragOver={(event) => { if (canReorderChannels && draggedChannelId && draggedChannelId !== ch.id) { event.preventDefault(); setDropTargetChannelId(ch.id); } }}
                              onDrop={(event) => { event.preventDefault(); void handleChannelDrop(cat.id, ch.id); }}
                              onDragEnd={() => { setDraggedChannelId(null); setDropTargetChannelId(null); setDropTargetCategoryId(null); }}
                              className={`group/channel relative ${dropTargetChannelId === ch.id ? 'rounded-md border-t-2 border-violet-300' : 'border-t-2 border-transparent'} ${draggedChannelId === ch.id ? 'opacity-45' : ''}`}
                            >
                              <button 
                                onClick={() => handleChannelSelect(ch)} 
                                className={`w-full flex justify-between items-center px-2 py-1.5 pr-8 rounded-md transition-colors group ${activeChannelId === ch.id ? 'bg-white/10 text-white' : voiceSession?.channelId === ch.id ? 'bg-emerald-400/[0.06] text-emerald-100' : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {canReorderChannels && <GripVertical className="h-3.5 w-3.5 text-slate-600 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />}
                                  {ch.type === 'voice' ? <Volume2 className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                                  <span className={`truncate text-sm font-medium ${channelUnreadCounts[ch.id] ? 'font-bold text-white' : ''}`}>{ch.name}</span>
                                </div>
                                <span className="flex shrink-0 items-center gap-2">{ch.is_private && <LockKeyhole className="h-3 w-3 text-violet-200/70" aria-label="Gizli kanal" />}{ch.nsfw && <Flame className="h-3 w-3 text-rose-300/80" aria-label="18+ kanal" />}{channelUnreadCounts[ch.id] > 0 && <span aria-label={`${channelUnreadCounts[ch.id]} okunmamış bildirim`} className="grid h-4 min-w-4 place-items-center rounded-full bg-violet-400 px-1 text-[9px] font-black text-white">{channelUnreadCounts[ch.id] > 9 ? '9+' : channelUnreadCounts[ch.id]}</span>}{voiceSession?.channelId === ch.id && <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Bağlı</span>}</span>
                              </button>
                              {canManageChannels && <button type="button" aria-label={`${ch.name} kanal seçenekleri`} title="Kanal seçenekleri" onClick={(event) => { event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setManagementContext({ kind: 'channel', channel: ch, x: bounds.right, y: bounds.bottom }); }} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/channel:opacity-100 focus:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>}
                              {ch.type === 'voice' && (voicePresenceByChannel[ch.id]?.length > 0 || (voiceSession?.channelId === ch.id && voiceParticipants.length > 0)) && (
                                <div aria-label={`${ch.name} ses kanalındaki kişiler`} className="ml-7 mt-1 space-y-1 pb-1">
                                  {(voicePresenceByChannel[ch.id] || (voiceSession?.channelId === ch.id ? voiceParticipants : [])).map((presence) => {
                                    const participant = voiceSession?.channelId === ch.id ? voiceParticipants.find((item) => item.id === presence.id) || presence : presence;
                                    return <div key={participant.id} title="Sağ tık: ses ve üye işlemleri" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (voiceSession?.channelId === ch.id) setVoiceMemberMenuRequest({ participantId: participant.id, x: event.clientX, y: event.clientY, requestId: Date.now() }); }} className="flex min-w-0 cursor-context-menu items-center gap-2 rounded-lg px-1.5 py-1 text-[11px] text-slate-400 transition hover:bg-white/[0.045] hover:text-slate-200">
                                      <img src={getAvatarUrl(participant.avatar_url, participant.username)} alt="" className={`h-5 w-5 shrink-0 rounded-full object-cover ${participant.speaking ? 'ring-2 ring-emerald-400/90' : ''}`} />
                                      <span className="min-w-0 flex-1 truncate">{participant.username}</span>
                                      {participant.speaking && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" aria-label="Konuşuyor" />}
                                      {participant.microphoneEnabled && !participant.serverMuted ? <Mic className="h-3 w-3 shrink-0 text-slate-500" title="Mikrofon açık" /> : <MicOff className="h-3 w-3 shrink-0 text-rose-300/80" title="Mikrofon kapalı" />}
                                      {participant.serverMuted && <ShieldAlert className="h-3 w-3 shrink-0 text-rose-300" title="Sunucuda susturuldu" />}
                                      {participant.serverDeafened ? <HeadphoneOff className="h-3 w-3 shrink-0 text-amber-300" title="Sunucuda sağırlaştırıldı" /> : participant.deafened ? <HeadphoneOff className="h-3 w-3 shrink-0 text-violet-300" title="Kulaklığı kapalı" /> : <Headphones className="h-3 w-3 shrink-0 text-slate-600" title="Kulaklığı açık" />}
                                    </div>;
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1">
                  {serverEventsFor === activeServerId ? <div className="flex min-h-0 min-w-0 flex-1 flex-col"><header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4"><button type="button" onClick={() => setServerEventsFor(null)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Sohbete dön</button><span className="text-sm font-bold text-slate-200">{currentServerData.name} · Etkinlikler</span></header><div className="min-h-0 flex-1 overflow-y-auto p-5"><ServerEventsPanel key={activeServerId} user={user} serverFilterId={activeServerId} onOpenChannel={(serverId, channelId) => { openServer(serverId); setActiveChannel(channelId); setServerEventsFor(null); }} /></div></div> : activeChannelType === 'voice' ? <div className="flex-1 min-w-0" /> : <div className="flex min-h-0 min-w-0 flex-1 flex-col"><ServerWelcomeBanner server={currentServerData} user={user} onNavigate={setActiveChannel} /><ChatArea activeChannelId={activeChannelId} channelName={currentChannelName} onOpenChannelMention={handleChannelMention} onInviteClick={setInviteDialogCode} /></div>}
                  <ServerMemberList activeServerId={activeServerId} voiceMemberChannels={voiceMemberChannels} />
               </div>
           </div>
           </ServerViewBoundary>
        )}

        {layout === 'server' && !currentServerData && (
          <main role="status" className="flex min-w-0 flex-1 items-center justify-center bg-[#0b0e14] p-6">
            <section className="w-full max-w-md rounded-[28px] border border-white/[0.08] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,.12),transparent_62%),rgba(18,23,33,.92)] p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,.4)]">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-violet-200/10 bg-violet-300/[0.08]">
                {serversLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-200" /> : <X className="h-5 w-5 text-slate-400" />}
              </div>
              <h1 className="text-base font-bold text-white">{serversLoading ? 'Sunucu yükleniyor…' : 'Sunucu açılamadı'}</h1>
              <p className="mt-2 text-xs leading-5 text-slate-400">{serversLoading ? 'Kanallar ve sunucu bilgileri hazırlanıyor.' : 'Sunucu bilgisi bulunamadı. Bağlantını kontrol edip yeniden deneyebilirsin.'}</p>
              <div className="mt-5 flex justify-center gap-2">{!serversLoading && <button type="button" onClick={() => void fetchServers()} className="rounded-xl bg-violet-400 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-300">Yeniden dene</button>}<button type="button" onClick={() => setLayout('home')} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]">Mesajlara dön</button></div>
            </section>
          </main>
        )}

        {layout === 'call' && (
          <div className="flex-1 bg-black relative flex items-center justify-center text-white flex-col">
             <Volume2 className="w-20 h-20 text-emerald-400 mb-4 animate-bounce" />
             <h1 className="text-2xl font-bold">Ses Odası Bağlantısı Kuruluyor...</h1>
             <button onClick={() => setLayout('server')} className="mt-8 bg-red-600 hover:bg-red-500 px-6 py-2 rounded-xl font-bold transition-colors">Aramayı Sonlandır</button>
          </div>
        )}
      </div>

      {voiceSession && (
        <Suspense fallback={<div className="absolute bottom-4 left-[84px] z-40 rounded-xl border border-white/10 bg-[#111722] px-4 py-3 text-xs text-slate-300 shadow-xl">Ses odası hazırlanıyor…</div>}>
          <VoiceRoom
            channelId={voiceSession.channelId}
            serverId={voiceSession.kind === 'dm' ? null : voiceSession.serverId}
            dmChannelId={voiceSession.kind === 'dm' ? voiceSession.dmChannelId : null}
            channelName={voiceSession.channelName}
            contextMenuRequest={voiceMemberMenuRequest}
            onContextMenuRequestHandled={() => setVoiceMemberMenuRequest(null)}
            isStageVisible={voiceSession.kind === 'dm' ? layout === 'home' : layout === 'server' && activeServerId === voiceSession.serverId && activeChannelId === voiceSession.channelId}
            onReturn={() => { playUiSound('move', user?.id); if (voiceSession.kind === 'dm') setLayout('home'); else { openServer(voiceSession.serverId); setActiveChannel(voiceSession.channelId); setLayout('server'); } }}
            onParticipantsChange={handleVoiceParticipantsChange}
            onPresenceError={(message) => setVoiceNotice((current) => current || message)}
            onLeave={() => { void handleLeaveVoice(); }}
          />
        </Suspense>
      )}
      {voiceNotice && (
        <div role="status" className="absolute left-1/2 top-3 z-[90] flex max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200/15 bg-[#17140f]/95 px-4 py-3 text-sm text-amber-100 shadow-2xl backdrop-blur-xl">
          <span>{voiceNotice}</span>
          <button type="button" aria-label="Bildirimi kapat" onClick={() => setVoiceNotice('')} className="rounded-md px-2 py-1 text-amber-200/70 hover:bg-white/10 hover:text-white">×</button>
        </div>
      )}
      {windowNotice && <div role="status" className="absolute right-3 top-12 z-[90] flex max-w-sm items-center gap-3 rounded-xl border border-white/10 bg-[#171b24]/95 px-4 py-3 text-xs text-slate-200 shadow-2xl backdrop-blur-xl"><span>{windowNotice}</span><button type="button" aria-label="Bildirimi kapat" onClick={() => setWindowNotice('')} className="text-slate-400 hover:text-white">×</button></div>}

      <NotificationManager onOpenNotification={(notification) => {
        void markNotificationRead(notification.id);
        if (notification.server_id && notification.channel_id) {
          openServer(notification.server_id);
          setActiveChannel(notification.channel_id);
          setLayout('server');
        } else if (notification.dm_channel_id) {
          setLayout('home');
          setPendingDMId(notification.dm_channel_id);
        }
      }} />
      <Suspense fallback={null}>
        {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
        {showServerSettings && <ServerSettingsModal onClose={() => setShowServerSettings(false)} />}
        {showGlobalSearch && <GlobalSearchModal onClose={() => setShowGlobalSearch(false)} onOpenDM={(dmId) => { setShowGlobalSearch(false); setLayout('home'); setPendingDMId(dmId); }} onOpenServer={(serverId, channelId) => { setShowGlobalSearch(false); openServer(serverId); if (channelId) setActiveChannel(channelId); setLayout('server'); }} />}
        {creatingChannelCategory && canManageChannels && <CreateChannelModal serverId={activeServerId} categoryId={creatingChannelCategory.id} categoryName={creatingChannelCategory.name} onClose={() => setCreatingChannelCategory(null)} />}
        {creatingCategory && canManageChannels && <CategoryModal serverId={activeServerId} onClose={() => setCreatingCategory(false)} />}
        {editingCategory && canManageChannels && <CategoryModal serverId={activeServerId} category={editingCategory} onClose={() => setEditingCategory(null)} />}
        {editingChannel && canManageChannels && <EditChannelModal serverId={activeServerId} channel={editingChannel} onClose={() => setEditingChannel(null)} />}
        {showCreateServer && <CreateServerModal onClose={() => setShowCreateServer(false)} />}
      </Suspense>
      {nsfwPromptChannel && <NsfwConsentModal channelName={nsfwPromptChannel.name} onCancel={() => setNsfwPromptChannel(null)} onContinue={() => { const channel = nsfwPromptChannel; sessionStorage.setItem('fastcord:nsfw-consent', '1'); setNsfwPromptChannel(null); handleChannelSelect(channel); }} />}
      {inviteDialogCode && <ServerInviteModal inviteCode={inviteDialogCode} authenticated onClose={() => { setInviteDialogCode(null); if (window.location.pathname.startsWith('/invite/')) window.history.replaceState(null, '', '/'); }} onJoin={handleJoinInvite} />}
      <ActionContextMenu position={managementContext} items={managementMenuItems} onClose={() => setManagementContext(null)} label={managementContext?.kind === 'category' ? 'Kategori işlemleri' : 'Kanal işlemleri'} />
    </div>
  );
}
