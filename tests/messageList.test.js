import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessage, replaceOptimisticMessage } from '../src/lib/messageList.js';

test('realtime delivery is ignored when the message is already present', () => {
  const existing = [{ id: 'm1', content: 'hello' }];
  assert.equal(mergeMessage(existing, { id: 'm1', content: 'hello' }), existing);
});

test('realtime delivery appends a new message without mutating prior state', () => {
  const existing = [{ id: 'm1' }];
  const updated = mergeMessage(existing, { id: 'm2' });
  assert.deepEqual(updated.map(({ id }) => id), ['m1', 'm2']);
  assert.equal(existing.length, 1);
});

test('server acknowledgement replaces the optimistic message and removes duplicate delivery', () => {
  const updated = replaceOptimisticMessage(
    [{ id: 'temp-1' }, { id: 'server-1', content: 'from realtime' }],
    'temp-1',
    { id: 'server-1', content: 'acknowledged' },
  );
  assert.deepEqual(updated, [{ id: 'server-1', content: 'acknowledged' }]);
});
