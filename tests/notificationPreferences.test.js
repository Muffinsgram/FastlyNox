import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerNotificationMode, isMentionNotification, isNotificationLocationMuted, shouldSuppressNotification } from '../src/lib/appPreferences.js';

test('server notification mode defaults to all and validates persisted options', () => {
  assert.equal(getServerNotificationMode('server-a', {}), 'all');
  assert.equal(getServerNotificationMode('server-a', { serverNotificationModes: { 'server-a': 'mentions' } }), 'mentions');
  assert.equal(getServerNotificationMode('server-a', { serverNotificationModes: { 'server-a': 'invalid' } }), 'all');
});

test('mentions-only mode accepts mention records but suppresses ordinary messages', () => {
  const preferences = { serverNotificationModes: { 'server-a': 'mentions' } };
  assert.equal(isMentionNotification({ type: 'mention', body: 'ordinary content containing @someone' }), true);
  assert.equal(isNotificationLocationMuted({ server_id: 'server-a', type: 'mention' }, preferences), false);
  assert.equal(isNotificationLocationMuted({ server_id: 'server-a', type: 'server_message', body: '@everyone' }, preferences), true);
});

test('none, mute, DND and quiet hours suppress notifications', () => {
  assert.equal(isNotificationLocationMuted({ server_id: 'server-a' }, { serverNotificationModes: { 'server-a': 'none' } }), true);
  assert.equal(shouldSuppressNotification({ server_id: 'server-a' }, { doNotDisturb: true }), true);
  assert.equal(shouldSuppressNotification({ sender_id: 'muted' }, { mutedUserIds: ['muted'] }), true);
});

test('server @here records are recognized as mention notifications', () => {
  assert.equal(isMentionNotification({ title: '@here etiketi' }), true);
  assert.equal(isMentionNotification({ title: 'Yeni mesaj', body: 'plain @here text' }), false);
});
