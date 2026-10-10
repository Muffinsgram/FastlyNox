import test from 'node:test';
import assert from 'node:assert/strict';
import { closeVoiceRoom } from '../src/lib/voiceRoomLifecycle.js';

test('leaving stops microphone, screen and playback before a pending network disconnect', () => {
  const calls = [];
  const room = {
    localParticipant: { trackPublications: new Map(['mic', 'screen'].map(id => [id, { track: { stop: () => calls.push(id) } }])) },
    remoteParticipants: new Map([['peer', { trackPublications: new Map([['audio', { track: { setVolume: value => calls.push(value), detach: () => calls.push('detach') } }]]) }]]),
    disconnect: () => { calls.push('disconnect'); return new Promise(() => {}); },
  };
  closeVoiceRoom(room);
  assert.deepEqual(calls, ['mic', 'screen', 0, 'detach', 'disconnect']);
});

test('one failed track does not prevent other captures and room from closing', async () => {
  const calls = [];
  const room = {
    localParticipant: { trackPublications: new Map([
      ['bad', { track: { stop: () => { throw new Error('already stopped'); } } }],
      ['good', { track: { stop: () => calls.push('stopped') } }],
    ]) },
    remoteParticipants: new Map(),
    disconnect: () => { calls.push('disconnect'); return Promise.reject(new Error('socket unavailable')); },
  };
  closeVoiceRoom(room);
  await Promise.resolve();
  assert.deepEqual(calls, ['stopped', 'disconnect']);
});
