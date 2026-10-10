import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppPreferences } from '../src/lib/appPreferences.js';

test('preference cache reuses unchanged settings and notices external storage changes', () => {
  let raw = '{"uiSoundVolume":30}';
  const storage = { getItem: () => raw };
  const first = getAppPreferences('user', storage);
  assert.equal(getAppPreferences('user', storage), first);
  raw = '{"uiSoundVolume":80}';
  assert.equal(getAppPreferences('user', storage).uiSoundVolume, 80);
  assert.notEqual(getAppPreferences('user', storage), first);
  assert.equal(getAppPreferences('user', { getItem: () => null }).uiSoundVolume, 65);
});
