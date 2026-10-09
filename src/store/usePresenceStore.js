import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { aggregatePresenceSessions, mergePresenceSessionEvent, presenceSessionKey, presenceTimestamp, PRESENCE_TTL_MS, prunePresenceSessions } from '../lib/presenceSessions';

const STATUS_VALUES = ['online', 'idle', 'dnd', 'invisible'];
const HEARTBEAT_MS = 25_000;
let activeChannel;
let legacyChannel;
let heartbeatTimer;
let idleTimer;
let pruneTimer;
let activityHandler;
let storageHandler;
let pageHideHandler;
let reconnectHandler;
let activeUserId;
let activeSessionId;
let lastActivityAt = Date.now();
let generation = 0;
let sessionEventVersion = 0;

const localKey = (userId) => `fastcord:presence:${userId}`;
const validStatus = (value) => STATUS_VALUES.includes(value) ? value : 'online';
const dbStatus = (status) => status === 'invisible' ? 'offline' : status;

const readLocalStatus = (userId) => {
  try { return validStatus(localStorage.getItem(localKey(userId))); }
  catch { return 'online'; }
};

const newSessionId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const writePresenceSession = async (userId, sessionId, status) => {
  if (!userId || !sessionId) return { error: new Error('Presence bağlantısı bulunamadı.') };
  return supabase.from('user_presence_sessions').upsert({
    user_id: userId,
    session_id: sessionId,
    status: dbStatus(status),
    heartbeat_at: new Date().toISOString(),
  }, { onConflict: 'user_id,session_id' });
};

// Keep the legacy row fresh for older app builds. New clients aggregate the
// connection-scoped rows and never treat this shared row as authoritative.
const writeLegacyPresence = async (userId, status) => {
  if (!userId) return;
  return supabase.from('user_presence_status').upsert({ user_id: userId, status: dbStatus(status), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
};

function applySessionEvent(state, eventType, row) {
  if (!row?.user_id || !row?.session_id) return state;
  const sessions = mergePresenceSessionEvent(state.presenceSessions, eventType, row);
  if (sessions === state.presenceSessions) return state;
  return { presenceSessions: sessions, statuses: aggregatePresenceSessions(Object.values(sessions)) };
}

function prunePresenceState(state, now = Date.now()) {
  const sessions = prunePresenceSessions(state.presenceSessions, now);
  const legacyStatuses = Object.fromEntries(Object.entries(state.statuses).filter(([, presence]) => now - presenceTimestamp(presence.updatedAt) <= PRESENCE_TTL_MS));
  const statuses = { ...legacyStatuses, ...aggregatePresenceSessions(Object.values(sessions), now) };
  const sessionsChanged = Object.keys(sessions).length !== Object.keys(state.presenceSessions).length;
  const statusesChanged = Object.keys(statuses).length !== Object.keys(state.statuses).length;
  if (!sessionsChanged && !statusesChanged) return state;
  return { presenceSessions: sessions, statuses };
}

export const usePresenceStore = create((set, get) => ({
  userId: null,
  sessionId: null,
  status: 'online',
  statuses: {},
  presenceSessions: {},
  visibility: {},
  error: '',
  initialized: false,

  initialize: async (userId) => {
    if (activeUserId === userId && (activeChannel || !userId)) return;
    const oldUserId = activeUserId;
    const oldSessionId = activeSessionId;
    activeUserId = userId || null;
    const currentGeneration = ++generation;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (idleTimer) clearInterval(idleTimer);
    if (pruneTimer) clearInterval(pruneTimer);
    if (activityHandler) {
      window.removeEventListener('pointerdown', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      window.removeEventListener('focus', activityHandler);
    }
    if (storageHandler) window.removeEventListener('storage', storageHandler);
    if (pageHideHandler) window.removeEventListener('pagehide', pageHideHandler);
    if (reconnectHandler) window.removeEventListener('online', reconnectHandler);
    if (activeChannel) { void supabase.removeChannel(activeChannel); activeChannel = null; }
    if (legacyChannel) { void supabase.removeChannel(legacyChannel); legacyChannel = null; }
    if (oldUserId && oldSessionId && oldUserId !== userId) {
      void writePresenceSession(oldUserId, oldSessionId, 'offline');
      void writeLegacyPresence(oldUserId, 'offline');
    }
    if (!userId) {
      activeSessionId = null;
      set({ userId: null, sessionId: null, status: 'online', statuses: {}, presenceSessions: {}, visibility: {}, error: '', initialized: true });
      return;
    }

    const localStatus = readLocalStatus(userId);
    const sessionId = newSessionId();
    activeSessionId = sessionId;
    set({ userId, sessionId, status: localStatus, statuses: {}, presenceSessions: {}, error: '', initialized: false });

    const refreshSnapshot = async () => {
      const eventVersionAtStart = sessionEventVersion;
      const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
      const [{ data: sessions, error: sessionsError }, { data: privacyRows }, { data: legacyRows }] = await Promise.all([
        supabase.from('user_presence_sessions').select('user_id,session_id,status,heartbeat_at').gt('heartbeat_at', cutoff).limit(2000),
        supabase.from('user_privacy_settings').select('user_id,show_online').limit(1000),
        supabase.from('user_presence_status').select('user_id,status,updated_at').gt('updated_at', cutoff).limit(1000),
      ]);
      if (currentGeneration !== generation) return;
      if (sessionsError) {
        console.error('Bağlantı durumları eşitlenemedi:', sessionsError.message);
        const fallback = Object.fromEntries((legacyRows || []).map((row) => [row.user_id, { status: row.status, updatedAt: row.updated_at }]));
        set({ statuses: fallback, visibility: Object.fromEntries((privacyRows || []).map((row) => [row.user_id, row.show_online !== false])), initialized: true, error: 'Çoklu pencere durum eşitlemesi için migration_realtime_sync_reliability.sql dosyasını Supabase’te çalıştır. Eski durum tablosu geçici olarak kullanılıyor.' });
        return;
      }
      // A realtime event that arrived while the snapshot was in flight is
      // newer than this query's view. Keep the live state and retry once the
      // current burst of events settles instead of replacing it with stale rows.
      if (eventVersionAtStart !== sessionEventVersion) {
        window.setTimeout(() => {
          if (currentGeneration === generation) void refreshSnapshot();
        }, 250);
        return;
      }
      const freshSessions = sessions || [];
      const sessionUserIds = new Set(freshSessions.map((row) => row.user_id));
      const fallbackRows = (legacyRows || []).filter((row) => !sessionUserIds.has(row.user_id)).map((row) => ({ ...row, updatedAt: row.updated_at }));
      const statuses = { ...aggregatePresenceSessions(freshSessions), ...Object.fromEntries(fallbackRows.map((row) => [row.user_id, { status: row.status, updatedAt: row.updated_at }])) };
      const ownStatus = localStatus;
      set({
        presenceSessions: Object.fromEntries(freshSessions.map((row) => [presenceSessionKey(row), row])),
        statuses,
        status: ownStatus,
        visibility: Object.fromEntries((privacyRows || []).map((row) => [row.user_id, row.show_online !== false])),
        initialized: true,
        error: '',
      });
      try { localStorage.setItem(localKey(userId), ownStatus); } catch { /* local status cache is optional */ }
    };

    const handleSessionChange = ({ eventType, new: row, old }) => {
      const sessionRow = eventType === 'DELETE' ? old : row;
      if (!sessionRow?.user_id) return;
      sessionEventVersion += 1;
      set((state) => applySessionEvent(state, eventType, sessionRow));
    };
    const handleLegacyChange = ({ eventType, new: row, old }) => {
      const target = row?.user_id || old?.user_id;
      if (!target) return;
      set((state) => {
        if (Object.values(state.presenceSessions).some((item) => item.user_id === target && Date.now() - presenceTimestamp(item.heartbeat_at) <= PRESENCE_TTL_MS)) return state;
        const previous = state.statuses[target];
        const incomingTimestamp = row?.updated_at || old?.updated_at;
        if (previous && presenceTimestamp(previous.updatedAt) > presenceTimestamp(incomingTimestamp)) return state;
        const statuses = { ...state.statuses };
        if (eventType === 'DELETE') delete statuses[target];
        else if (row?.status) statuses[target] = { status: row.status, updatedAt: row.updated_at };
        return { statuses };
      });
      if (target === userId && row?.status && STATUS_VALUES.includes(row.status)) set({ status: row.status });
    };
    const handlePrivacyChange = ({ eventType, new: row, old }) => {
      const target = row?.user_id || old?.user_id;
      if (!target) return;
      set((state) => {
        const visibility = { ...state.visibility };
        if (eventType === 'DELETE') delete visibility[target];
        else if (row) visibility[target] = row.show_online !== false;
        return { visibility };
      });
    };

    let sessionSubscribedOnce = false;
    const channel = supabase.channel('global:user-presence-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence_sessions' }, handleSessionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_privacy_settings' }, handlePrivacyChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (sessionSubscribedOnce) void refreshSnapshot();
          sessionSubscribedOnce = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Presence kanalı yeniden bağlanmayı deniyor:', status);
      });
    activeChannel = channel;
    let legacySubscribedOnce = false;
    const legacy = supabase.channel('global:user-presence-legacy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence_status' }, handleLegacyChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (legacySubscribedOnce) void refreshSnapshot();
          legacySubscribedOnce = true;
        }
      });
    legacyChannel = legacy;

    const syncOwnSession = async (status = get().status) => {
      if (activeUserId !== userId || activeSessionId !== sessionId) return;
      const [{ error: sessionError }, { error: legacyError }] = await Promise.all([
        writePresenceSession(userId, sessionId, status),
        writeLegacyPresence(userId, status),
      ]);
      if (sessionError) {
        console.error('Presence bağlantısı kaydedilemedi:', sessionError.message);
        set({ error: 'Çevrim içi durumun diğer cihazlara aktarılamadı. migration_realtime_sync_reliability.sql dosyasını kontrol et.' });
      } else if (legacyError) console.warn('Eski uygulama sürümleri için durum yazılamadı:', legacyError.message);
    };
    void syncOwnSession(localStatus);
    void refreshSnapshot();
    const cleanupExpiredSessions = () => {
      const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
      void supabase.from('user_presence_sessions').delete().eq('user_id', userId).lt('heartbeat_at', cutoff)
        .then(({ error }) => { if (error) console.warn('Eski presence kaydı temizlenemedi:', error.message); });
    };
    void cleanupExpiredSessions();

    heartbeatTimer = window.setInterval(() => {
      void syncOwnSession(get().status);
      set((state) => prunePresenceState(state));
    }, HEARTBEAT_MS);
    pruneTimer = window.setInterval(() => set((state) => prunePresenceState(state)), 15_000);
    lastActivityAt = Date.now();
    activityHandler = () => {
      lastActivityAt = Date.now();
      if (get().status === 'idle') void get().setStatus('online');
    };
    storageHandler = (event) => {
      if (event.key !== localKey(userId) || !STATUS_VALUES.includes(event.newValue) || get().status === event.newValue) return;
      set({ status: event.newValue });
      void syncOwnSession(event.newValue);
    };
    pageHideHandler = () => { void writePresenceSession(userId, sessionId, 'offline'); };
    window.addEventListener('pointerdown', activityHandler, { passive: true });
    window.addEventListener('keydown', activityHandler);
    window.addEventListener('focus', activityHandler);
    window.addEventListener('storage', storageHandler);
    window.addEventListener('pagehide', pageHideHandler);
    reconnectHandler = () => {
      void syncOwnSession(get().status);
      void refreshSnapshot();
    };
    window.addEventListener('online', reconnectHandler);
    idleTimer = window.setInterval(() => {
      if (get().status === 'online' && Date.now() - lastActivityAt >= 5 * 60_000) void get().setStatus('idle');
    }, 30_000);
  },

  setStatus: async (status) => {
    if (!STATUS_VALUES.includes(status)) return { success: false, error: 'Durum seçimi geçersiz.' };
    const userId = get().userId;
    const sessionId = get().sessionId;
    if (!userId || !sessionId) return { success: false, error: 'Oturum bulunamadı.' };
    set({ status, error: '' });
    try { localStorage.setItem(localKey(userId), status); } catch { /* local cache is optional */ }
    const [{ error: sessionError }, { error: legacyError }] = await Promise.all([
      writePresenceSession(userId, sessionId, status),
      writeLegacyPresence(userId, status),
    ]);
    if (sessionError) {
      console.error('Presence durumu kaydedilemedi:', sessionError.message);
      set({ error: 'Durum diğer cihazlara aktarılamadı. migration_realtime_sync_reliability.sql dosyasını çalıştır.' });
      return { success: false, error: sessionError.message };
    }
    if (legacyError) console.warn('Eski uygulama sürümleri için durum yazılamadı:', legacyError.message);
    return { success: true };
  },
}));
