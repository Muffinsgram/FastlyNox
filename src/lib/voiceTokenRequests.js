// Keep only short-lived join intent. A normal join never reuses a token from
// an earlier call, so permission checks run again when returning to a room.
export function createVoiceTokenRequests(request, now = Date.now) {
  const pending = new Map();
  const prefetched = new Map();
  const keyFor = (userId, channelId, dmChannelId) => JSON.stringify([userId, channelId, dmChannelId]);
  const run = (key, channelId, dmChannelId) => {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(() => request(channelId, { dmChannelId }));
    pending.set(key, promise);
    const cleanup = () => { if (pending.get(key) === promise) pending.delete(key); };
    promise.then(cleanup, cleanup);
    return promise;
  };
  return {
    prefetch(userId, channelId, dmChannelId = null) {
      const key = keyFor(userId, channelId, dmChannelId);
      for (const [id, entry] of prefetched) if (entry.expires <= now()) prefetched.delete(id);
      if (prefetched.has(key)) return prefetched.get(key).promise;
      // Keep the newest user intent warm. A fixed-cap refusal meant that
      // channels beyond the first four could never benefit from prefetching.
      if (prefetched.size >= 4) prefetched.delete(prefetched.keys().next().value);
      const entry = { expires: now() + 60_000, promise: run(key, channelId, dmChannelId) };
      prefetched.set(key, entry);
      entry.promise.catch(() => { if (prefetched.get(key) === entry) prefetched.delete(key); });
      return entry.promise;
    },
    join(userId, channelId, dmChannelId = null) {
      const key = keyFor(userId, channelId, dmChannelId);
      const entry = prefetched.get(key);
      prefetched.delete(key);
      return entry && entry.expires > now() ? entry.promise : run(key, channelId, dmChannelId);
    },
    clear() { prefetched.clear(); pending.clear(); },
  };
}
