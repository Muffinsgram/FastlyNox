import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTokenRequests } from '../src/lib/voiceTokenRequests.js';

test('hover preparation and concurrent joins share one authorization request', async () => {
  let calls = 0;
  let finish;
  const requests = createVoiceTokenRequests(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  requests.prefetch('user', 'room');
  const first = requests.join('user', 'room');
  const second = requests.join('user', 'room');
  await Promise.resolve();
  assert.equal(calls, 1);
  finish('token');
  assert.deepEqual(await Promise.all([first, second]), ['token', 'token']);
});

test('completed preparation is consumed once; returning to a room rechecks permission', async () => {
  let calls = 0;
  const requests = createVoiceTokenRequests(async () => `token-${++calls}`);
  requests.prefetch('user', 'room');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await requests.join('user', 'room'), 'token-1');
  assert.equal(await requests.join('user', 'room'), 'token-2');
});

test('expired preparation and account changes cannot reuse completed credentials', async () => {
  let time = 0;
  let calls = 0;
  const requests = createVoiceTokenRequests(async () => `token-${++calls}`, () => time);
  requests.prefetch('user', 'room');
  await new Promise(resolve => setImmediate(resolve));
  time = 15_001;
  assert.equal(await requests.join('user', 'room'), 'token-2');
  requests.prefetch('user', 'room');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await requests.join('other-user', 'room'), 'token-4');
  requests.clear();
  assert.equal(await requests.join('user', 'room'), 'token-5');
});

test('failed preparation is discarded and a join can retry', async () => {
  let calls = 0;
  const requests = createVoiceTokenRequests(async () => {
    if (++calls === 1) throw new Error('denied');
    return 'allowed';
  });
  requests.prefetch('user', 'room');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await requests.join('user', 'room'), 'allowed');
});

test('preparation is bounded and DM rooms stay separate from server rooms', async () => {
  let calls = 0;
  const requests = createVoiceTokenRequests(async () => `token-${++calls}`);
  for (let i = 0; i < 20; i++) requests.prefetch('user', `room-${i}`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 4);
  requests.clear();
  requests.prefetch('user', 'same-id');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await requests.join('user', 'same-id', 'same-id'), 'token-6');
});
