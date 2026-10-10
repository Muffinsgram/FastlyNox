import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMicrophone } from '../src/lib/preparedMicrophone.js';

test('microphone capture starts before the connected room takes it', async () => {
  let captures = 0;
  let stopped = 0;
  const track = { stop: () => stopped++ };
  const prepared = prepareMicrophone(async () => { captures++; return track; });
  await Promise.resolve();
  assert.equal(captures, 1);
  assert.equal(await prepared.take(), track);
  assert.equal(await prepared.take(), null);
  prepared.dispose();
  assert.equal(stopped, 0);
});

test('leaving or token failure stops a capture even if permission resolves later', async () => {
  let resolve;
  let stopped = 0;
  const prepared = prepareMicrophone(() => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  prepared.dispose();
  resolve({ stop: () => stopped++ });
  await new Promise(done => setImmediate(done));
  assert.equal(stopped, 1);
  assert.equal(await prepared.take(), null);
});

test('abandoned ready tracks stop once; cancelled take does not transfer a live track', async () => {
  let stopped = 0;
  const prepared = prepareMicrophone(async () => ({ stop: () => stopped++ }));
  await new Promise(done => setImmediate(done));
  prepared.dispose();
  prepared.dispose();
  assert.equal(stopped, 1);
  let resolve;
  const pending = prepareMicrophone(() => new Promise(done => { resolve = done; }));
  const taken = pending.take();
  await Promise.resolve();
  pending.dispose();
  resolve({ stop: () => stopped++ });
  assert.equal(await taken, null);
  assert.equal(stopped, 2);
});

test('permission failure is delivered to the room without leaving a live capture', async () => {
  const prepared = prepareMicrophone(async () => { throw new Error('permission denied'); });
  await assert.rejects(prepared.take(), /permission denied/);
  prepared.dispose();
});

test('a cancelled mount never requests a microphone', async () => {
  let captures = 0;
  const prepared = prepareMicrophone(() => { captures++; return { stop() {} }; });
  prepared.dispose();
  await new Promise(done => setImmediate(done));
  assert.equal(captures, 0);
});
