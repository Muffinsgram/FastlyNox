import test from 'node:test';
import assert from 'node:assert/strict';
import { serverNavigationState } from '../src/lib/serverNavigation.js';

const servers = [
  { id: 'first', categories: [{ channels: [{ id: 'a' }, { id: 'c' }] }] },
  { id: 'second', categories: [{ channels: [{ id: 'b' }, { id: 'd' }] }] },
];
const initial = { servers, activeServerId: 'first', activeChannelId: 'c', lastChannelByServer: {} };

test('returning from DMs restores the previous server channel', () => {
  const home = { ...initial, ...serverNavigationState(initial, null) };
  assert.equal(home.activeChannelId, null);
  assert.equal(serverNavigationState(home, 'first').activeChannelId, 'c');
});

test('each server remembers its own selected channel', () => {
  const second = { ...initial, ...serverNavigationState(initial, 'second'), activeChannelId: 'd' };
  const first = { ...second, ...serverNavigationState(second, 'first') };
  assert.equal(first.activeChannelId, 'c');
  assert.equal(serverNavigationState(first, 'second').activeChannelId, 'd');
});

test('a deleted remembered channel falls back to an existing channel', () => {
  const state = { ...initial, servers: [{ id: 'first', categories: [{ channels: [{ id: 'a' }] }] }], lastChannelByServer: { first: 'c' } };
  const selected = serverNavigationState(state, 'first');
  assert.equal(selected.activeChannelId, 'a');
  assert.equal(selected.lastChannelByServer.first, 'a');
});

test('empty servers and cleared account state do not restore a stale channel', () => {
  assert.equal(serverNavigationState({ ...initial, servers: [] }, 'first').activeChannelId, null);
  assert.equal(serverNavigationState({ servers, activeServerId: null, activeChannelId: null, lastChannelByServer: {} }, 'first').activeChannelId, 'a');
});
