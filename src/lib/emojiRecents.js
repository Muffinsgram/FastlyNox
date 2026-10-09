const recentKey = (userId) => `fastcord:recent-emojis:${encodeURIComponent(userId)}`;

export function readRecentEmojis(userId, allowedEmojis, storage) {
  if (!userId) return [];
  try {
    const saved = JSON.parse((storage || globalThis.localStorage).getItem(recentKey(userId)) || '[]');
    return Array.isArray(saved) ? saved.filter((emoji) => allowedEmojis.includes(emoji)).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(userId, emoji, allowedEmojis, storage) {
  if (!userId || !allowedEmojis.includes(emoji)) return [];
  const recent = [emoji, ...readRecentEmojis(userId, allowedEmojis, storage).filter((item) => item !== emoji)].slice(0, 12);
  try {
    (storage || globalThis.localStorage).setItem(recentKey(userId), JSON.stringify(recent));
  } catch {
    // Emoji recents are a convenience; picker use must work if storage is unavailable.
  }
  return recent;
}
