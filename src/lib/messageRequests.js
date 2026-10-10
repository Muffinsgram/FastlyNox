// Navigation, hover preparation and realtime recovery share an in-flight
// history request. A completed request is never reused instead of a refresh.
export function createMessageRequests() {
  const pending = new Map();
  let prefetchCount = 0;
  return {
    run(key, load) {
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(load);
      pending.set(key, promise);
      const cleanup = () => { if (pending.get(key) === promise) pending.delete(key); };
      promise.then(cleanup, cleanup);
      return promise;
    },
    prefetch(key, load) {
      if (pending.has(key) || prefetchCount >= 2) return;
      prefetchCount++;
      void this.run(key, load).catch(() => {}).finally(() => { prefetchCount--; });
    },
  };
}
