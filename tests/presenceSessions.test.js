import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePresenceSessions, mergePresenceSessionEvent, presenceSessionKey, prunePresenceSessions } from '../src/lib/presenceSessions.js';

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
