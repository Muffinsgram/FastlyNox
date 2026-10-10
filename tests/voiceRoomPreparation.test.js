import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceRoomPreparations } from '../src/lib/voiceRoomPreparation.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const makeRoom = () => ({ closes: 0, disconnect() { this.closes++; } });

test('a join takes the actual warmed room once, without opening media or connecting during hover', async () => {
  const room = makeRoom();
  const prepared = [];
  let creations = 0;
  const rooms = createVoiceRoomPreparations(() => { creations++; return room; }, (instance, token) => prepared.push([instance, token]));
  rooms.prefetch('user', 'channel', null, Promise.resolve('authorized-token'));
  rooms.prefetch('user', 'channel', null, Promise.resolve('other'));
  await flush();
  assert.equal(creations, 1);
  assert.deepEqual(prepared, [[room, 'authorized-token']]);
  assert.equal(rooms.take('user', 'channel'), room);
  assert.equal(rooms.take('user', 'channel'), null);
  rooms.clear();
  assert.equal(room.closes, 0);
});

test('expired warmups and account changes release unused rooms; DM rooms stay separate', async () => {
  let time = 0;
  const created = [];
  const rooms = createVoiceRoomPreparations(() => { const room = makeRoom(); created.push(room); return room; }, () => {}, () => time);
  rooms.prefetch('alice', 'same', null, Promise.resolve('token'));
  await flush();
  assert.equal(rooms.take('bob', 'same'), null);
  assert.equal(rooms.take('alice', 'same', 'same'), null);
  time = 15_001;
  assert.equal(rooms.take('alice', 'same'), null);
  assert.equal(created[0].closes, 1);
  rooms.prefetch('alice', 'same', 'same', Promise.resolve('dm-token'));
  await flush();
  rooms.clear();
  assert.equal(created[1].closes, 1);
});

test('joining before SDK creation finishes never waits and disposes the late unused room', async () => {
  const room = makeRoom();
  let finish;
  const rooms = createVoiceRoomPreparations(() => new Promise(resolve => { finish = resolve; }), () => assert.fail('cancelled warmup'));
  rooms.prefetch('user', 'channel', null, Promise.resolve('token'));
  await Promise.resolve();
  assert.equal(rooms.take('user', 'channel'), null);
  finish(room);
  await flush();
  assert.equal(room.closes, 1);
});

test('preparations remain bounded and failures after transfer cannot disconnect the joined room', async () => {
  let creations = 0;
  const created = [];
  let rejectWarmup;
  const rooms = createVoiceRoomPreparations(() => { creations++; const room = makeRoom(); created.push(room); return room; }, () => new Promise((_, reject) => { rejectWarmup = reject; }));
  for (let i = 0; i < 20; i++) rooms.prefetch('user', `channel-${i}`, null, Promise.resolve('token'));
  await flush();
  assert.equal(creations, 4);
  assert.equal(rooms.take('user', 'channel-3'), created[3]);
  rejectWarmup(new Error('warmup failed'));
  await flush();
  assert.equal(created[3].closes, 0);
  rooms.clear();
  assert.equal(created[0].closes, 1);
});
