export function mergeMessage(messages, message) {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message];
}

export function replaceOptimisticMessage(messages, optimisticId, message) {
  return [
    ...messages.filter((item) => item.id !== optimisticId && item.id !== message.id),
    message,
  ];
}
