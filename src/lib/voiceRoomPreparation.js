// Warm the SAME SDK room that will be used to join. An anonymous warmup room
// cannot transfer LiveKit's selected cloud region to the actual connection.
export function createVoiceRoomPreparations(createRoom, prepareRoom, now = Date.now) {
  const entries = new Map();
  const keyFor = (userId, channelId, dmChannelId) => JSON.stringify([userId, channelId, dmChannelId]);
  const discard = (entry) => {
    entry.cancelled = true;
    if (entry.room) {
      try { void Promise.resolve(entry.room.disconnect()).catch(() => {}); } catch { /* Best-effort unused room cleanup. */ }
    }
  };
  const prune = () => {
    for (const [key, entry] of entries) if (entry.expires <= now()) { entries.delete(key); discard(entry); }
  };
  return {
    prefetch(userId, channelId, dmChannelId, tokenPromise) {
      prune();
      const key = keyFor(userId, channelId, dmChannelId);
      if (entries.has(key) || entries.size >= 4) return;
      const entry = { expires: now() + 15_000, cancelled: false, room: null };
      entries.set(key, entry);
      const roomPromise = Promise.resolve().then(() => createRoom(userId)).then(room => {
        entry.room = room;
        if (entry.cancelled) { discard(entry); return null; }
        return room;
      });
      void Promise.all([roomPromise, tokenPromise]).then(([room, token]) => {
        if (room && !entry.cancelled) return prepareRoom(room, token);
      }).catch(() => {
        // A warmup failure never prevents a normal join.
        if (entries.get(key) === entry) { entries.delete(key); discard(entry); }
      });
    },
    take(userId, channelId, dmChannelId = null) {
      prune();
      const key = keyFor(userId, channelId, dmChannelId);
      const entry = entries.get(key);
      entries.delete(key);
      if (!entry) return null;
      if (!entry.room) { discard(entry); return null; }
      return entry.room;
    },
    clear() { for (const entry of entries.values()) discard(entry); entries.clear(); },
  };
}
