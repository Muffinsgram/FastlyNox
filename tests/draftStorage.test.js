import test from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, writeDraft } from '../src/lib/draftStorage.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('drafts persist per user and conversation and can be cleared', () => {
  const storage = createMemoryStorage();
  writeDraft('user-a', 'dm:chat-1', 'Hello', storage);

  assert.equal(readDraft('user-a', 'dm:chat-1', storage), 'Hello');
  assert.equal(readDraft('user-b', 'dm:chat-1', storage), null);
  assert.equal(readDraft('user-a', 'server:chat-1', storage), null);

  writeDraft('user-a', 'dm:chat-1', '', storage);
  assert.equal(readDraft('user-a', 'dm:chat-1', storage), null);
});

test('draft storage failures do not break the composer', () => {
  const brokenStorage = { getItem() { throw new Error('storage disabled'); }, setItem() { throw new Error('storage disabled'); }, removeItem() { throw new Error('storage disabled'); } };
  assert.doesNotThrow(() => writeDraft('user-a', 'dm:chat-1', 'Draft', brokenStorage));
  assert.equal(readDraft('user-a', 'dm:chat-1', brokenStorage), null);
});
