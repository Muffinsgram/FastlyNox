export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export function appendReaction(message, reaction) {
  const reactions = message.reactions || [];
  if (reactions.some((item) => item.id === reaction.id || (
    item.message_id === reaction.message_id && item.user_id === reaction.user_id && item.emoji === reaction.emoji
  ))) return message;
  return { ...message, reactions: [...reactions, reaction] };
}

export function removeReaction(message, reaction) {
  const reactions = message.reactions || [];
  return { ...message, reactions: reactions.filter((item) => item.id !== reaction.id && !(
    item.message_id === reaction.message_id && item.user_id === reaction.user_id && item.emoji === reaction.emoji
  )) };
}

export function attachReactions(messages, reactions) {
  const byMessage = new Map();
  for (const reaction of reactions || []) {
    const list = byMessage.get(reaction.message_id) || [];
    list.push(reaction);
    byMessage.set(reaction.message_id, list);
  }
  return messages.map((message) => ({ ...message, reactions: byMessage.get(message.id) || [] }));
}
