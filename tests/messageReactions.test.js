import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReaction, attachReactions, removeReaction } from '../src/lib/messageReactions.js';

test('reaction sync appends a reaction once when local and realtime events race', () => {
  const message = { id: 'message-1', reactions: [] };
  const reaction = { id: 'reaction-1', message_id: 'message-1', user_id: 'user-1', emoji: '👍' };
  const once = appendReaction(message, reaction);
  const twice = appendReaction(once, reaction);

  assert.equal(once.reactions.length, 1);
  assert.equal(twice.reactions.length, 1);
  assert.equal(message.reactions.length, 0);
});

test('message history attaches each reaction to its message', () => {
  const messages = [{ id: 'message-1' }, { id: 'message-2' }];
  const reactions = [
    { id: 'reaction-1', message_id: 'message-2', emoji: '❤️' },
    { id: 'reaction-2', message_id: 'message-2', emoji: '👍' },
  ];

  assert.deepEqual(attachReactions(messages, reactions).map((message) => message.reactions.length), [0, 2]);
  assert.equal(messages[1].reactions, undefined);
});

test('reaction removal matches the deleted record and preserves other users', () => {
  const reaction = { id: 'reaction-1', message_id: 'message-1', user_id: 'user-1', emoji: '🎉' };
  const other = { id: 'reaction-2', message_id: 'message-1', user_id: 'user-2', emoji: '🎉' };
  const message = { id: 'message-1', reactions: [reaction, other] };

  assert.deepEqual(removeReaction(message, reaction).reactions, [other]);
  assert.equal(message.reactions.length, 2);
});
