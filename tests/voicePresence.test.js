import test from 'node:test';
import assert from 'node:assert/strict';
import { latestVoicePresence, mergeVoicePresenceEvent, queueVoicePresence, visibleVoiceRoster } from '../src/lib/voicePresence.js';

const row = (channel_id, seconds) => ({ channel_id, user_id: 'member', updated_at: new Date(seconds * 1000).toISOString(), microphone_enabled: true });

test('a delayed heartbeat and leave finish before rejoining the same channel', async () => {
  const events = [];
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  const oldHeartbeat = queueVoicePresence('member', async () => { await delay; events.push('old heartbeat'); });
  const leave = queueVoicePresence('member', () => { events.push('clear source'); });
  const join = queueVoicePresence('member', () => { events.push('new heartbeat'); });
  release();
  await Promise.all([oldHeartbeat, leave, join]);
  assert.deepEqual(events, ['old heartbeat', 'clear source', 'new heartbeat']);
});

test('a failed presence request does not block later writes or other accounts', async () => {
  await assert.rejects(queueVoicePresence('member', () => { throw new Error('offline'); }));
  assert.equal(await queueVoicePresence('member', () => 'recovered'), 'recovered');
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  const blocked = queueVoicePresence('member', () => delay);
  assert.equal(await queueVoicePresence('other', () => 'independent'), 'independent');
  release();
  await blocked;
});

test('an old voice lease cannot display a moved member in two channels', () => {
  assert.deepEqual(latestVoicePresence([row('a', 1), row('b', 3), row('c', 2)]), [row('b', 3)]);
});

test('moving repeatedly leaves only one location and a delayed source delete preserves the destination', () => {
  let roster = mergeVoicePresenceEvent({}, 'INSERT', row('a', 1));
  roster = mergeVoicePresenceEvent(roster, 'INSERT', row('b', 2));
  roster = mergeVoicePresenceEvent(roster, 'UPDATE', row('c', 3));
  roster = mergeVoicePresenceEvent(roster, 'DELETE', row('a', 1));
  roster = mergeVoicePresenceEvent(roster, 'DELETE', row('b', 2));
  assert.deepEqual(Object.keys(roster), ['c']);
  assert.equal(roster.c.length, 1);
  assert.equal(mergeVoicePresenceEvent(roster, 'UPDATE', row('a', 1)), roster);
});

test('a stale LiveKit source roster cannot re-add a remotely moved member', () => {
  const roster = { a: [{ id: 'self' }], b: [{ id: 'member' }] };
  const visible = visibleVoiceRoster(roster, { userId: 'self', channelId: 'a', participants: [{ id: 'self' }, { id: 'member' }] });
  assert.deepEqual(visible.a.map(member => member.id), ['self']);
  assert.deepEqual(visible.b.map(member => member.id), ['member']);
});

test('self is only shown in the active channel and live participants remain visible while a snapshot loads', () => {
  const visible = visibleVoiceRoster({ a: [{ id: 'self' }] }, { userId: 'self', channelId: 'b', participants: [{ id: 'self' }, { id: 'new' }] });
  assert.deepEqual(visible.a, []);
  assert.deepEqual(visible.b.map(member => member.id), ['self', 'new']);
});
