const presenceQueues = new Map();

// Preserve write/leave order across room instances, including A -> B -> A.
export function queueVoicePresence(userId, operation) {
  const previous = presenceQueues.get(userId) || Promise.resolve();
  const request = previous.catch(() => {}).then(operation);
  const tail = request.catch(() => {}).finally(() => {
    if (presenceQueues.get(userId) === tail) presenceQueues.delete(userId);
  });
  presenceQueues.set(userId, tail);
  return request;
}

// A user has one visible voice location, even while old leases expire.
export function latestVoicePresence(rows) {
  const latest = new Map();
  for (const row of rows) {
    const previous = latest.get(row.user_id);
    if (!previous || Date.parse(row.updated_at) >= Date.parse(previous.updated_at)) latest.set(row.user_id, row);
  }
  return [...latest.values()];
}

export function mergeVoicePresenceEvent(roster, eventType, row, profile = {}) {
  if (!row?.user_id || !row?.channel_id) return roster;
  const existing = Object.values(roster).flat().find(member => member.id === row.user_id);
  if (eventType !== 'DELETE' && existing?.updated_at && Date.parse(existing.updated_at) > Date.parse(row.updated_at)) return roster;
  const next = {};
  for (const [channelId, members] of Object.entries(roster)) {
    const remaining = members.filter(member => member.id !== row.user_id || (eventType === 'DELETE' && channelId !== row.channel_id));
    if (remaining.length) next[channelId] = remaining;
  }
  if (eventType !== 'DELETE') {
    const member = {
      ...existing, id: row.user_id, username: profile.username || existing?.username || 'Fastlynox kullanıcısı',
      avatar_url: profile.avatar_url || existing?.avatar_url || null,
      microphoneEnabled: row.microphone_enabled, deafened: row.deafened, speaking: Boolean(row.speaking),
      updated_at: row.updated_at,
    };
    (next[row.channel_id] ||= []).push(member);
  }
  return next;
}

export function visibleVoiceRoster(roster, { userId, channelId, participants = [], authoritative = false, now = Date.now() } = {}) {
  const next = {};
  const locations = new Map();
  for (const [id, members] of Object.entries(roster)) {
    next[id] = members.filter(member => (!member.updated_at || now - Date.parse(member.updated_at) <= 30_000) && (member.id !== userId || id === channelId));
    for (const member of next[id]) locations.set(member.id, id);
  }
  if (channelId) {
    const live = participants.filter(member => member.id === userId || !locations.has(member.id) || locations.get(member.id) === channelId);
    // Once connected, LiveKit is the complete roster for this room. Merging
    // old database leases here kept departed users visible in the sidebar.
    const byId = new Map((authoritative ? [] : next[channelId] || []).map(member => [member.id, member]));
    for (const member of live) byId.set(member.id, member);
    next[channelId] = [...byId.values()];
  }
  return next;
}
