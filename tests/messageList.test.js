import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFetchedMessages, mergeMessage, replaceOptimisticMessage } from '../src/lib/messageList.js';

test('realtime delivery is ignored when the message is already present', () => {
  const existing = [{ id: 'm1', content: 'hello' }];
  assert.equal(mergeMessage(existing, { id: 'm1', content: 'hello' }), existing);
});

test('realtime delivery inserts a new message in chronological order without mutating prior state', () => {
  const existing = [{ id: 'm1', created_at: '2026-01-01T00:00:02Z' }];
  const updated = mergeMessage(existing, { id: 'm2', created_at: '2026-01-01T00:00:01Z' });
  assert.deepEqual(updated.map(({ id }) => id), ['m2', 'm1']);
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

test('authoritative fetch removes stale rows while preserving in-flight optimistic sends', () => {
  const current = [
    { id: 'm2', content: 'realtime', created_at: '2026-01-01T00:00:02Z' },
    { id: 'temp-1', content: 'pending', created_at: '2026-01-01T00:00:03Z', isOptimistic: true },
  ];
  const fetched = [
    { id: 'm2', content: 'authoritative', created_at: '2026-01-01T00:00:02Z' },
  ];
  assert.deepEqual(mergeFetchedMessages(current, fetched).map(({ id, content }) => [id, content]), [
    ['m2', 'authoritative'], ['temp-1', 'pending'],
  ]);
});

test('fetch reconciliation removes deleted messages missed while disconnected', () => {
  const merged = mergeFetchedMessages(
    [{ id: 'deleted', content: 'stale' }, { id: 'present', content: 'old' }],
    [{ id: 'present', content: 'current' }],
  );
  assert.deepEqual(merged, [{ id: 'present', content: 'current', isOptimistic: false }]);
});

test('fetch reconciliation does not duplicate a message already delivered by realtime', () => {
  const merged = mergeFetchedMessages(
    [{ id: 'm1', content: 'realtime' }],
    [{ id: 'm1', content: 'database' }, { id: 'm2', content: 'next' }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].content, 'database');
});
