export const PRESENCE_TTL_MS = 90_000;

export const presenceSessionKey = (row) => `${row.user_id}:${row.session_id}`;
export const presenceTimestamp = (value) => Date.parse(value || '') || 0;

export function aggregatePresenceSessions(rows = [], now = Date.now(), ttlMs = PRESENCE_TTL_MS) {
  const sessionsByUser = new Map();
  rows.forEach((row) => {
    if (!row?.user_id || now - presenceTimestamp(row.heartbeat_at) > ttlMs) return;
    const current = sessionsByUser.get(row.user_id) || [];
    current.push(row);
    sessionsByUser.set(row.user_id, current);
  });
  return Object.fromEntries([...sessionsByUser].map(([userId, sessions]) => {
    // A tab closing must not override another tab's live heartbeat.
    const activeSessions = sessions.filter((row) => row.status !== 'offline');
    const candidates = activeSessions.length ? activeSessions : sessions;
    const latest = candidates.reduce((best, row) => presenceTimestamp(row.heartbeat_at) > presenceTimestamp(best.heartbeat_at) ? row : best);
    return [userId, { status: latest.status, updatedAt: latest.heartbeat_at }];
  }));
}

export function mergePresenceSessionEvent(rows = {}, eventType, row) {
  if (!row?.user_id || !row?.session_id) return rows;
  const key = presenceSessionKey(row);
  const current = rows[key];
  if (eventType === 'DELETE') {
    if (current && presenceTimestamp(current.heartbeat_at) > presenceTimestamp(row.heartbeat_at)) return rows;
    const next = { ...rows };
    delete next[key];
    return next;
  }
  if (current && presenceTimestamp(current.heartbeat_at) >= presenceTimestamp(row.heartbeat_at)) return rows;
  return { ...rows, [key]: row };
}

export function prunePresenceSessions(rows = {}, now = Date.now(), ttlMs = PRESENCE_TTL_MS) {
  return Object.fromEntries(Object.entries(rows).filter(([, row]) => now - presenceTimestamp(row.heartbeat_at) <= ttlMs));
}
