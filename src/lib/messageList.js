export function mergeMessage(messages, message) {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message].sort(compareMessages);
}

export function replaceOptimisticMessage(messages, optimisticId, message) {
  return sortMessages([
    ...messages.filter((item) => item.id !== optimisticId && item.id !== message.id),
    message,
  ]);
}

export function mergeFetchedMessages(currentMessages = [], fetchedMessages = []) {
  // A successful snapshot is authoritative for persisted messages, which
  // removes rows deleted while a client was offline. Only retain in-flight
  // optimistic sends that have not reached the database yet.
  const byId = new Map(fetchedMessages.map((message) => [message.id, { ...message, isOptimistic: false }]));
  currentMessages.filter((message) => message.isOptimistic && !byId.has(message.id))
    .forEach((message) => byId.set(message.id, message));
  return sortMessages([...byId.values()]);
}

export function sortMessages(messages = []) {
  return [...messages].sort(compareMessages);
}

function compareMessages(left, right) {
  const leftTime = Date.parse(left?.created_at || '') || 0;
  const rightTime = Date.parse(right?.created_at || '') || 0;
  return leftTime - rightTime;
}
