import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePresenceSessions, combinePresenceStatuses, mergePresenceSessionEvent, presenceSessionKey, prunePresenceSessions, resolvePresenceStatus } from '../src/lib/presenceSessions.js';

const now = Date.parse('2026-10-09T12:00:00.000Z');
const session = (sessionId, status, secondsAgo) => ({
  user_id: 'user-a',
  session_id: sessionId,
  status,
  heartbeat_at: new Date(now - secondsAgo * 1000).toISOString(),
});

test('closing one connection does not make a user offline while another session is active', () => {
  const status = aggregatePresenceSessions([session('tab-a', 'offline', 0), session('tab-b', 'online', 8)], now);
  assert.equal(status['user-a'].status, 'online');
});

test('the latest active session determines current presence, not an offline close event', () => {
  const status = aggregatePresenceSessions([session('tab-a', 'dnd', 2), session('tab-b', 'online', 1), session('tab-c', 'offline', 0)], now);
  assert.equal(status['user-a'].status, 'online');
});

test('expired sessions are ignored and pruned after the heartbeat timeout', () => {
  const stale = session('tab-a', 'online', 120);
  assert.deepEqual(aggregatePresenceSessions([stale], now), {});
  assert.deepEqual(prunePresenceSessions({ [presenceSessionKey(stale)]: stale }, now), {});
});

test('an older update or delete cannot replace or erase a newer session event', () => {
  const newer = session('tab-a', 'dnd', 2);
  const older = session('tab-a', 'online', 12);
  const rows = { [presenceSessionKey(newer)]: newer };
  assert.equal(mergePresenceSessionEvent(rows, 'UPDATE', older), rows);
  assert.equal(mergePresenceSessionEvent(rows, 'DELETE', older), rows);
});

test('a session heartbeat preserves other users from older clients', () => {
  const legacy = { 'user-b': { status: 'online', updatedAt: new Date(now - 10_000).toISOString() } };
  const rows = mergePresenceSessionEvent({}, 'UPDATE', session('tab-a', 'dnd', 0));
  const statuses = combinePresenceStatuses(rows, legacy, now);
  assert.equal(statuses['user-a'].status, 'dnd');
  assert.equal(statuses['user-b'].status, 'online');
  const deleted = mergePresenceSessionEvent(rows, 'DELETE', session('tab-a', 'dnd', 0));
  assert.deepEqual(combinePresenceStatuses(deleted, legacy, now), legacy);
});

test('sessions take priority while fresh; expired fallback rows are not resurrected', () => {
  const row = session('tab-a', 'idle', 0);
  const legacy = {
    'user-a': { status: 'offline', updatedAt: new Date(now).toISOString() },
    'user-b': { status: 'online', updatedAt: new Date(now - 120_000).toISOString() },
  };
  const statuses = combinePresenceStatuses({ [presenceSessionKey(row)]: row }, legacy, now);
  assert.equal(statuses['user-a'].status, 'idle');
  assert.equal(statuses['user-b'], undefined);
});

test('shared voice evidence supplies online status and expires when heartbeats stop', () => {
  const voice = { 'user-a': { updatedAt: new Date(now - 5_000).toISOString() } };
  assert.equal(resolvePresenceStatus('user-a', {}, {}, voice, now), 'online');
  assert.equal(resolvePresenceStatus('user-a', {}, {}, voice, now + 30_000), 'offline');
  const statuses = { 'user-a': { status: 'dnd', updatedAt: new Date(now).toISOString() } };
  assert.equal(resolvePresenceStatus('user-a', statuses, {}, voice, now), 'dnd');
});

test('voice fallback respects privacy, invisible and the local chosen status', () => {
  const voice = { 'user-a': { updatedAt: new Date(now).toISOString() } };
  assert.equal(resolvePresenceStatus('user-a', {}, { 'user-a': false }, voice, now), 'offline');
  for (const status of ['offline', 'invisible']) {
    assert.equal(resolvePresenceStatus('user-a', { 'user-a': { status, updatedAt: new Date(now).toISOString() } }, {}, voice, now), 'offline');
  }
  assert.equal(resolvePresenceStatus('user-a', {}, {}, voice, now, 'user-a', 'invisible'), 'offline');
});
