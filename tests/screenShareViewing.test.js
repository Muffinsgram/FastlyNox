import test from 'node:test';
import assert from 'node:assert/strict';
import { changeDeafenState, getShareViewers, readViewingMessage, screenShareKey, shouldSubscribeToTrack, VIEWING_TOPIC } from '../src/lib/screenShareViewing.js';

test('unwatched streams receive neither video nor audio while room voice stays subscribed', () => {
  const watched = new Set();
  assert.equal(shouldSubscribeToTrack('screen_share', 'host', 'video', 'video', watched), false);
  assert.equal(shouldSubscribeToTrack('screen_share_audio', 'host', 'audio', 'video', watched), false);
  assert.equal(shouldSubscribeToTrack('microphone', 'host', 'mic', 'video', watched), true);
  watched.add(screenShareKey('host', 'video'));
  assert.equal(shouldSubscribeToTrack('screen_share', 'host', 'video', 'video', watched), true);
  assert.equal(shouldSubscribeToTrack('screen_share_audio', 'host', 'audio', 'video', watched), true);
  assert.equal(shouldSubscribeToTrack('screen_share', 'other', 'other-video', 'other-video', watched), false);
  assert.equal(shouldSubscribeToTrack('screen_share', 'host', 'replacement', 'replacement', watched), false);
  watched.clear();
  assert.equal(shouldSubscribeToTrack('screen_share_audio', 'host', 'audio', 'video', watched), false);
});

test('viewer counts exclude the publisher and departed users and track the local leave action', () => {
  const key = screenShareKey('host', 'video');
  const participants = [{ identity: 'host' }, { identity: 'local', isLocal: true }, { identity: 'remote' }, { identity: 'idle' }];
  const watching = { host: [key], remote: [key], departed: [key] };
  const local = new Set([key]);
  assert.deepEqual(getShareViewers(participants, 'host', key, local, watching).map(p => p.identity), ['local', 'remote']);
  local.clear();
  assert.deepEqual(getShareViewers(participants, 'host', key, local, watching).map(p => p.identity), ['remote']);
});

test('viewing packets accept state sync and reject unrelated or malformed data', () => {
  const encode = message => new TextEncoder().encode(JSON.stringify(message));
  assert.deepEqual(readViewingMessage(encode({ type: VIEWING_TOPIC, action: 'request' })), { action: 'request' });
  assert.deepEqual(readViewingMessage(encode({ type: VIEWING_TOPIC, action: 'state', watched: ['screen:host:video', 'screen:host:video'] })), { action: 'state', watched: ['screen:host:video'] });
  assert.equal(readViewingMessage(encode({ type: VIEWING_TOPIC, action: 'state', watched: [123] })), null);
  assert.equal(readViewingMessage(new TextEncoder().encode('broken')), null);
});

test('undeafening restores the actual microphone state without opening a manually muted or PTT microphone', async () => {
  for (const [initialMicrophone, pushToTalkEnabled, expected] of [[true, false, true], [false, false, false], [true, true, false]]) {
    let deafened = false;
    const participant = { isMicrophoneEnabled: initialMicrophone, async setMicrophoneEnabled(value) { this.isMicrophoneEnabled = value; } };
    const microphoneMemory = { current: false };
    const options = { participant, microphoneMemory, pushToTalkEnabled, onChange: value => { deafened = value; } };
    await changeDeafenState({ ...options, deafened });
    assert.equal(deafened, true);
    assert.equal(participant.isMicrophoneEnabled, false);
    await changeDeafenState({ ...options, deafened });
    assert.equal(deafened, false);
    assert.equal(participant.isMicrophoneEnabled, expected);
  }
});

test('device failures do not report a completed deafen transition', async () => {
  const participant = { isMicrophoneEnabled: true, async setMicrophoneEnabled() { throw new Error('device'); } };
  let changed = false;
  await assert.rejects(changeDeafenState({ participant, deafened: false, microphoneMemory: {}, onChange: () => { changed = true; } }));
  assert.equal(changed, false);
});
