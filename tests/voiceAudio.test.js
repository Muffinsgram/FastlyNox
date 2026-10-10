import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOICE_AUDIO_SETTINGS, getAudioCaptureOptions, getAudioPublishOptions } from '../src/lib/voiceAudio.js';
import { getAppPreferences } from '../src/lib/appPreferences.js';

test('high quality uses 96 kbps mono with packet loss protection and continuous speech', () => {
  const capture = getAudioCaptureOptions();
  const publish = getAudioPublishOptions();
  assert.equal(capture.channelCount, 1);
  assert.equal(capture.sampleRate, 48000);
  assert.equal(publish.audioPreset.maxBitrate, 96000);
  assert.equal(publish.red, true);
  assert.equal(publish.dtx, false);
  assert.equal(publish.stopMicTrackOnMute, false);
  assert.equal(getAudioPublishOptions({ ...DEFAULT_VOICE_AUDIO_SETTINGS, audioQuality: 'speech' }).audioPreset.maxBitrate, 24000);
});

test('old default quality upgrades once and an explicit new low-bandwidth setting survives', () => {
  let saved = { voiceAudioSettings: { audioQuality: 'speech' } };
  const storage = { getItem: () => JSON.stringify(saved) };
  assert.equal(getAppPreferences('user', storage).voiceAudioSettings.audioQuality, 'high');
  saved.voiceAudioSettings.audioQualityVersion = 2;
  assert.equal(getAppPreferences('user', storage).voiceAudioSettings.audioQuality, 'speech');
  saved = {};
  assert.equal(getAppPreferences('user', storage).voiceAudioSettings.audioQuality, 'high');
});
