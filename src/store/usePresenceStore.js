import { create } from 'zustand';
import { supabase } from '../lib/supabase';

const STATUS_VALUES = ['online', 'idle', 'dnd', 'invisible'];
let activeChannel;
let heartbeatTimer;
let idleTimer;
let activityHandler;
let activeUserId;
let lastActivityAt = Date.now();
let generation = 0;

const localKey = (userId) => `fastcord:presence:${userId}`;
const readLocalStatus = (userId) => {
  try {
    const value = localStorage.getItem(localKey(userId));
    return STATUS_VALUES.includes(value) ? value : 'online';
  } catch { return 'online'; }
};

const writePresence = async (userId, status) => {
  if (!userId) return { error: new Error('Oturum bulunamadı.') };
  return supabase.from('user_presence_status').upsert({ user_id: userId, status, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
};

export const usePresenceStore = create((set, get) => ({
  userId: null,
  status: 'online',
  statuses: {},
  visibility: {},
  error: '',
  initialized: false,

  initialize: async (userId) => {
    if (activeUserId === userId && (activeChannel || !userId)) return;
    const oldUserId = activeUserId;
    activeUserId = userId || null;
    const currentGeneration = ++generation;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (idleTimer) clearInterval(idleTimer);
    if (activityHandler) {
      window.removeEventListener('pointerdown', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      window.removeEventListener('focus', activityHandler);
    }
    if (activeChannel) { void supabase.removeChannel(activeChannel); activeChannel = null; }
    if (oldUserId && oldUserId !== userId) void writePresence(oldUserId, 'offline');
    if (!userId) { set({ userId: null, status: 'online', statuses: {}, visibility: {}, error: '', initialized: true }); return; }

    const localStatus = readLocalStatus(userId);
    set({ userId, status: localStatus, statuses: {}, error: '', initialized: false });
    const [{ data, error }, { data: privacyRows }] = await Promise.all([
      supabase.from('user_presence_status').select('user_id,status,updated_at').order('updated_at', { ascending: false }).limit(500),
      supabase.from('user_privacy_settings').select('user_id,show_online').limit(1000),
    ]);
    if (currentGeneration !== generation) return;
    if (error) {
      set({ initialized: true, visibility: Object.fromEntries((privacyRows || []).map((row) => [row.user_id, row.show_online !== false])), error: 'Durum senkronu için migration_user_presence.sql dosyasını Supabase SQL Editor’da çalıştır.' });
    } else {
      const statuses = Object.fromEntries((data || []).map((row) => [row.user_id, { status: row.status, updatedAt: row.updated_at }]));
      const own = statuses[userId];
      const status = own && STATUS_VALUES.includes(own.status) ? own.status : localStatus;
      set({ statuses, status, visibility: Object.fromEntries((privacyRows || []).map((row) => [row.user_id, row.show_online !== false])), initialized: true });
      try { localStorage.setItem(localKey(userId), status); } catch { /* Local cache is optional. */ }
      if (!own || !['dnd', 'invisible'].includes(status)) void writePresence(userId, status);
    }

    const channel = supabase.channel('global:user-presence-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence_status' }, ({ eventType, new: row, old }) => {
        const targetId = row?.user_id || old?.user_id;
        if (!targetId) return;
        set((state) => {
          const statuses = { ...state.statuses };
          if (eventType === 'DELETE') delete statuses[targetId];
          else if (row?.status) statuses[targetId] = { status: row.status, updatedAt: row.updated_at };
          return { statuses };
        });
        if (targetId === userId && row?.status && STATUS_VALUES.includes(row.status)) set({ status: row.status });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_privacy_settings' }, ({ eventType, new: row, old }) => {
        const targetId = row?.user_id || old?.user_id;
        if (!targetId) return;
        set((state) => {
          const visibility = { ...state.visibility };
          if (eventType === 'DELETE') delete visibility[targetId];
          else if (row) visibility[targetId] = row.show_online !== false;
          return { visibility };
        });
      })
      .subscribe();
    activeChannel = channel;

    const heartbeat = () => { if (activeUserId === userId) void writePresence(userId, get().status); };
    heartbeatTimer = window.setInterval(heartbeat, 30_000);
    lastActivityAt = Date.now();
    activityHandler = () => {
      lastActivityAt = Date.now();
      if (get().status === 'idle') void get().setStatus('online');
    };
    window.addEventListener('pointerdown', activityHandler, { passive: true });
    window.addEventListener('keydown', activityHandler);
    window.addEventListener('focus', activityHandler);
    idleTimer = window.setInterval(() => {
      if (get().status === 'online' && Date.now() - lastActivityAt >= 5 * 60_000) void get().setStatus('idle');
    }, 30_000);
  },

  setStatus: async (status) => {
    if (!STATUS_VALUES.includes(status)) return { success: false, error: 'Durum seçimi geçersiz.' };
    const userId = get().userId;
    if (!userId) return { success: false, error: 'Oturum bulunamadı.' };
    set({ status, error: '' });
    try { localStorage.setItem(localKey(userId), status); } catch { /* Local cache is optional. */ }
    const { error } = await writePresence(userId, status);
    if (error) {
      set({ error: 'Durum diğer cihazlara aktarılamadı. Supabase migration’ını kontrol et.' });
      return { success: false, error: error.message };
    }
    return { success: true };
  },
}));
