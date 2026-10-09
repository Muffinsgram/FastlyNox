const STORAGE_KEY = 'fastcord:event-reminders:v1';

export function readEventReminders() {
  try {
    const rows = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => row?.eventId && Number.isFinite(Date.parse(row.remindAt))) : [];
  } catch { return []; }
}

export function toggleEventReminder(event) {
  if (!event?.id || !event?.starts_at) return false;
  const reminders = readEventReminders();
  const existing = reminders.some((row) => row.eventId === event.id);
  const next = existing
    ? reminders.filter((row) => row.eventId !== event.id)
    : [...reminders, { eventId: event.id, title: event.title, startsAt: event.starts_at, remindAt: new Date(new Date(event.starts_at).getTime() - 10 * 60_000).toISOString(), fired: false }];
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { return false; }
  globalThis.dispatchEvent?.(new CustomEvent('fastcord:event-reminders-changed'));
  return !existing;
}

export function hasEventReminder(eventId) {
  return readEventReminders().some((row) => row.eventId === eventId);
}

export function fireDueEventReminders() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const now = Date.now();
  let changed = false;
  const reminders = readEventReminders().map((row) => {
    if (!row.fired && Date.parse(row.remindAt) <= now) {
      new Notification('Etkinlik yaklaşıyor', { body: `${row.title} · ${new Date(row.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`, tag: `fastcord-event-${row.eventId}` });
      changed = true;
      return { ...row, fired: true };
    }
    return row;
  }).filter((row) => Date.parse(row.startsAt) > now);
  if (changed) {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(reminders)); } catch { /* The notification already fired; storage can be unavailable in private mode. */ }
  }
}
