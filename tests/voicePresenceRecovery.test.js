import test from 'node:test';
import assert from 'node:assert/strict';
import { voicePresenceFailure, createVoicePresenceRecovery } from '../src/lib/voicePresenceRecovery.js';

test('Cloudflare 522 HTML becomes a concise transient warning without exposing markup', () => {
  const failure = voicePresenceFailure({ message: '<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head><body>secret diagnostic data</body></html>' });
  assert.equal(failure.transient, true);
  assert.doesNotMatch(failure.message, /<|diagnostic|supabase/);
  assert.ok(failure.message.length < 180);
});

test('recovery backs off speaking updates, waits before warning and resets after success', () => {
  let time = 0;
  const recovery = createVoicePresenceRecovery(() => time);
  const error = { status: 522, message: 'timeout' };
  assert.equal(recovery.failed(error).notify, false);
  assert.equal(recovery.canAttempt(), false);
  time = 2000;
  assert.equal(recovery.canAttempt(), true);
  assert.equal(recovery.failed(error).delay, 4000);
  time += 4000;
  assert.equal(recovery.failed(error).notify, true);
  recovery.succeeded();
  assert.equal(recovery.canAttempt(), true);
  assert.equal(recovery.failed(error).delay, 2000);
});

test('schema and permission failures stay distinct from network timeouts', () => {
  assert.equal(voicePresenceFailure({ code: 'PGRST202', message: 'missing function' }).transient, false);
  assert.match(voicePresenceFailure({ status: 403 }).message, /izni/);
  assert.equal(voicePresenceFailure(new TypeError('Failed to fetch')).transient, true);
  assert.equal(voicePresenceFailure({ status: 429 }).transient, true);
});
