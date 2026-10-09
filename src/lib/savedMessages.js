const keyFor = (userId) => `fastcord:saved-messages:${encodeURIComponent(userId || '')}`;

export function readSavedMessages(userId, storage = globalThis.localStorage) {
  if (!userId) return [];
  try {
    const value = JSON.parse(storage.getItem(keyFor(userId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function toggleSavedMessage(userId, message, storage = globalThis.localStorage) {
  if (!userId || !message?.id) return false;
  const saved = readSavedMessages(userId, storage);
  const exists = saved.some((item) => item.id === message.id);
  const next = exists ? saved.filter((item) => item.id !== message.id) : [{ ...message, saved_at: new Date().toISOString() }, ...saved].slice(0, 500);
  try {
    storage.setItem(keyFor(userId), JSON.stringify(next));
    globalThis.dispatchEvent?.(new CustomEvent('fastcord:saved-messages-changed', { detail: { userId } }));
    return !exists;
  } catch {
    return false;
  }
}

export function removeSavedMessage(userId, messageId, storage = globalThis.localStorage) {
  if (!userId || !messageId) return;
  const next = readSavedMessages(userId, storage).filter((item) => item.id !== messageId);
  try {
    storage.setItem(keyFor(userId), JSON.stringify(next));
    globalThis.dispatchEvent?.(new CustomEvent('fastcord:saved-messages-changed', { detail: { userId } }));
  } catch { /* Keep the UI usable if local storage is unavailable. */ }
}
