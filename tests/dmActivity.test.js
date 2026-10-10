import test from 'node:test';
import assert from 'node:assert/strict';
import { createDMActivityReceiver, mergeDMPreview } from '../src/lib/dmActivity.js';

const message = { id: 'message', dm_channel_id: 'dm', user_id: 'sender', content: 'Merhaba', created_at: '2026-10-10T10:00:00Z' };
function inbox(channels = [{ id: 'dm', user1_id: 'me', user2_id: 'sender', user2: { username: 'Friend' }, created_at: '2026-10-01T00:00:00Z' }]) {
  const state = { channels, messages: [], notifications: [], refreshes: 0, current: true };
  const receive = createDMActivityReceiver({
    userId: 'me', isCurrent: () => state.current, getChannels: () => state.channels,
    updateChannels: update => { state.channels = update(state.channels); },
    receiveMessage: (_id, row) => state.messages.push(row), removeMessage: () => {},
    notify: row => state.notifications.push(row), refresh: () => { state.refreshes++; },
  });
  return { state, receive };
}

test('a closed DM receives its message, updates the preview and notifies without an active-chat dependency', () => {
  const { state, receive } = inbox();
  receive('INSERT', message);
  assert.deepEqual(state.messages, [message]);
  assert.equal(state.channels[0].last_message.content, 'Merhaba');
  assert.deepEqual(state.notifications, [message]);
});

test('the first message in an unknown DM refreshes the list and is delivered immediately', () => {
  const { state, receive } = inbox([]);
  receive('INSERT', message);
  assert.equal(state.refreshes, 1);
  assert.equal(state.messages.length, 1);
  assert.equal(state.notifications.length, 1);
});

test('realtime, broadcast and recovery deliveries of the same row notify only once', () => {
  const { state, receive } = inbox();
  receive('INSERT', message);
  receive('INSERT', { ...message });
  receive('INSERT', { ...message });
  assert.equal(state.messages.length, 1);
  assert.equal(state.notifications.length, 1);
  receive('UPDATE', { ...message, content: 'Edited', is_edited: true });
  assert.equal(state.channels[0].last_message.content, 'Edited');
  assert.equal(state.notifications.length, 1);
});

test('own messages and an obsolete account subscription never generate an incoming notification', () => {
  const { state, receive } = inbox();
  receive('INSERT', { ...message, user_id: 'me' });
  assert.equal(state.notifications.length, 0);
  state.current = false;
  receive('INSERT', { ...message, id: 'later' });
  assert.equal(state.messages.length, 1);
});

test('late older messages cannot replace a newer preview or reorder the inbox incorrectly', () => {
  const newer = { ...message, id: 'new', created_at: '2026-10-10T11:00:00Z' };
  const channels = [{ id: 'dm', last_message: newer }];
  assert.equal(mergeDMPreview(channels, message), channels);
});
