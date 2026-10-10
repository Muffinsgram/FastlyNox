export function memberRefreshFailure(error, subject = 'Rol bilgileri') {
  const raw = String(error?.message || '');
  const status = Number(error?.status || error?.statusCode || raw.match(/(?:error code\s*|\|\s*)(5\d\d)\b/i)?.[1]);
  const html = /<!doctype|<html|<head|<body|&lt;(?:!doctype|html)/i.test(raw);
  const transient = status >= 500 || [408, 429].includes(status) || (!status && html)
    || /failed to fetch|networkerror|network request failed|fetch failed|timed? ?out|timeout|load failed/i.test(raw);
  if (transient) return { transient, message: `${subject} geçici bağlantı sorunu nedeniyle yenilenemiyor. Otomatik yeniden deneniyor.` };
  if ([401, 403].includes(status) || error?.code === '42501') return { transient: false, message: `${subject} için erişim izni doğrulanamadı. Oturumunu yenileyip dene.` };
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code)) return { transient: false, message: `${subject} için sunucu veritabanının güncellenmesi gerekiyor.` };
  const detail = html ? 'Sunucudan beklenmeyen yanıt geldi.' : raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return { transient: false, message: `${subject} yenilenemedi: ${detail || 'Yeniden dene.'}` };
}

export function roleRefreshPatch(roleResult, assignmentResult) {
  if (roleResult.error || assignmentResult.error) return null;
  const assignments = {};
  (assignmentResult.data || []).forEach(({ user_id, role_id }) => {
    (assignments[user_id] ||= []).push(role_id);
  });
  return { roles: roleResult.data || [], assignments };
}

export const memberRetryDelay = (failures) => Math.min(30_000, 2000 * 2 ** Math.min(Math.max(failures - 1, 0), 4));
