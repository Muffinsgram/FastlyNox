import test from 'node:test';
import assert from 'node:assert/strict';
import { getVoicePlayback, normalizeVoiceVolume } from '../src/lib/voicePlayback.js';
import { getAppPreferences, saveAppPreferences } from '../src/lib/appPreferences.js';

test('participant gain reaches 200% and invalid saved values remain safe', () => {
  assert.equal(normalizeVoiceVolume(2), 2);
  assert.equal(normalizeVoiceVolume(8), 2);
  assert.equal(normalizeVoiceVolume(-1), 0);
  for (const value of [undefined, null, '', NaN, Infinity, 'invalid']) assert.equal(normalizeVoiceVolume(value), 1);
});

test('muting a stream leaves the microphone and other streams audible', () => {
  const options = { participantId: 'a', volumes: { a: 2 }, mutedShares: { a: true } };
  assert.deepEqual(getVoicePlayback({ ...options, source: 'screen_share_audio' }), { volume: 0, muted: true });
  assert.deepEqual(getVoicePlayback({ ...options, source: 'microphone' }), { volume: 2, muted: false });
  assert.deepEqual(getVoicePlayback({ ...options, source: 'screen_share_audio', participantId: 'b' }), { volume: 1, muted: false });
});

test('microphone mute does not silence screen audio and unmuting restores screen volume', () => {
  assert.deepEqual(getVoicePlayback({ source: 'screen_share_audio', participantId: 'a', volumes: { a: 0 } }), { volume: 1, muted: false });
  assert.deepEqual(getVoicePlayback({ source: 'microphone', participantId: 'a', volumes: { a: 0 } }), { volume: 0, muted: true });
});

test('deafen silences every remote source and restores saved gain afterwards', () => {
  for (const source of ['microphone', 'screen_share_audio', 'unknown']) {
    assert.deepEqual(getVoicePlayback({ source, participantId: 'a', volumes: { a: 2 }, deafened: true }), { volume: 0, muted: true });
  }
  assert.deepEqual(getVoicePlayback({ source: 'microphone', participantId: 'a', volumes: { a: 1.75 } }), { volume: 1.75, muted: false });
});

test('stream volume is independent of microphone volume and restores after mute or deafen', () => {
  const options = { participantId: 'a', source: 'screen_share_audio', volumes: { a: 0.2 }, shareVolumes: { a: 1.8 } };
  assert.deepEqual(getVoicePlayback(options), { volume: 1.8, muted: false });
  assert.deepEqual(getVoicePlayback({ ...options, source: 'microphone' }), { volume: 0.2, muted: false });
  assert.deepEqual(getVoicePlayback({ ...options, mutedShares: { a: true } }), { volume: 0, muted: true });
  assert.deepEqual(getVoicePlayback({ ...options, deafened: true }), { volume: 0, muted: true });
  assert.deepEqual(getVoicePlayback({ ...options, mutedShares: { a: false }, deafened: false }), { volume: 1.8, muted: false });
  assert.deepEqual(getVoicePlayback({ ...options, shareVolumes: { a: 0 } }), { volume: 0, muted: true });
});

test('local stream mute and boosted volume survive reload and stay scoped to the listener account', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  saveAppPreferences('listener', { voiceParticipantVolumes: { speaker: 2 }, voiceScreenShareMuted: { speaker: true }, voiceScreenShareVolumes: { speaker: 0.45 } }, storage);
  assert.deepEqual(getAppPreferences('listener', storage).voiceParticipantVolumes, { speaker: 2 });
  assert.deepEqual(getAppPreferences('listener', storage).voiceScreenShareMuted, { speaker: true });
  assert.deepEqual(getAppPreferences('listener', storage).voiceScreenShareVolumes, { speaker: 0.45 });
  assert.deepEqual(getAppPreferences('another-listener', storage).voiceScreenShareMuted, {});
  assert.deepEqual(getAppPreferences('another-listener', storage).voiceScreenShareVolumes, {});
});
