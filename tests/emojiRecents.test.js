import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecentEmojis, rememberEmoji } from '../src/lib/emojiRecents.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('recent emojis are unique, ordered by use, and scoped to the account', () => {
  const storage = createMemoryStorage();
  const allowed = ['😀', '😂', '❤️'];
  rememberEmoji('user-a', '😀', allowed, storage);
  rememberEmoji('user-a', '😂', allowed, storage);
  rememberEmoji('user-a', '😀', allowed, storage);

  assert.deepEqual(readRecentEmojis('user-a', allowed, storage), ['😀', '😂']);
  assert.deepEqual(readRecentEmojis('user-b', allowed, storage), []);
});
