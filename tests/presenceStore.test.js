import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as presenceHelpers from '../src/lib/presenceSessions.js';

const source = (await readFile(new URL('../src/store/usePresenceStore.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export const usePresenceStore', 'const usePresenceStore');
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture() {
  const timestamp = new Date().toISOString();
  const results = {
    user_presence_sessions: { data: [] },
    user_privacy_settings: { data: [{ user_id: 'hidden', show_online: false }] },
    user_presence_status: { data: [{ user_id: 'old-client', status: 'online', updated_at: timestamp }] },
    server_voice_presence: { data: [{ user_id: 'voice-user', channel_id: 'room-a', updated_at: timestamp }] },
  };
  const handlers = {};
  const timers = [];
  const supabase = {
    from: (table) => {
      const query = {
        select: () => query, gt: () => query, eq: () => query, lt: () => query,
        limit: () => Promise.resolve(results[table]),
        upsert: () => Promise.resolve({ error: null }),
        delete: () => ({ eq: () => ({ lt: () => Promise.resolve({ error: null }) }) }),
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_, options, handler) => { handlers[options.table] = handler; return channel; },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: async () => {},
  };
  const context = vm.createContext({
    ...presenceHelpers, supabase, console: { error() {}, warn() {} },
    Date, Math, clearInterval() {},
    localStorage: { getItem: () => 'online', setItem() {} },
    window: { addEventListener() {}, removeEventListener() {}, setTimeout() {}, setInterval: (fn) => { timers.push(fn); return timers.length; } },
    create: (initialize) => {
      let state;
      const set = (value) => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; };
      state = initialize(set, () => state);
      return { getState: () => state };
    },
  });
  vm.runInContext(`${source}\nglobalThis.store = usePresenceStore;`, context);
  const store = context.store;
  await store.getState().initialize('self');
  await settle();
  return { store, handlers, timers, results, timestamp };
}

test('actual presence store keeps legacy friends through session events and preserves local status on refresh', async () => {
  const { store, handlers, timers, timestamp } = await fixture();
  handlers.user_presence_sessions({ eventType: 'UPDATE', new: { user_id: 'new-client', session_id: 'tab', status: 'idle', heartbeat_at: timestamp } });
  assert.equal(store.getState().statuses['old-client'].status, 'online');
  assert.equal(store.getState().statuses['new-client'].status, 'idle');
  await store.getState().setStatus('invisible');
  handlers.user_presence_status({ eventType: 'UPDATE', new: { user_id: 'self', status: 'online', updated_at: timestamp } });
  timers[0]();
  await settle();
  assert.equal(store.getState().status, 'invisible');
});

test('failed presence snapshots keep existing friends, voice evidence and privacy', async () => {
  const { store, timers, results } = await fixture();
  Object.keys(results).forEach((table) => { results[table] = { data: null, error: { message: 'Connection timed out' } }; });
  timers[0]();
  await settle();
  assert.equal(store.getState().statuses['old-client'].status, 'online');
  assert.equal(store.getState().visibility.hidden, false);
  assert.equal(store.getState().voiceStatuses['voice-user'].channelId, 'room-a');
});

test('a delayed voice leave for an old channel cannot erase the new channel', async () => {
  const { store, handlers, timestamp } = await fixture();
  const updated_at = new Date(Date.parse(timestamp) + 1000).toISOString();
  handlers.server_voice_presence({ eventType: 'UPDATE', new: { user_id: 'voice-user', channel_id: 'room-b', updated_at } });
  handlers.server_voice_presence({ eventType: 'DELETE', old: { user_id: 'voice-user', channel_id: 'room-a', updated_at: timestamp } });
  assert.equal(store.getState().voiceStatuses['voice-user'].channelId, 'room-b');
});
