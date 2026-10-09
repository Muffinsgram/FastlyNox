const draftKey = (userId, conversationId) => `fastcord:draft:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;

export function readDraft(userId, conversationId, storage) {
  if (!userId || !conversationId) return null;
  try {
    return (storage || globalThis.localStorage).getItem(draftKey(userId, conversationId));
  } catch {
    return null;
  }
}

export function writeDraft(userId, conversationId, value, storage) {
  if (!userId || !conversationId) return;
  try {
    const target = storage || globalThis.localStorage;
    if (value) target.setItem(draftKey(userId, conversationId), value);
    else target.removeItem(draftKey(userId, conversationId));
  } catch {
    // Drafts remain in memory if storage is disabled or full.
  }
}
