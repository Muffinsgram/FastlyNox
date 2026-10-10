export function voicePresenceFailure(error) {
  const raw = String(error?.message || '');
  const status = Number(error?.status || error?.statusCode || error?.context?.status || raw.match(/(?:error code\s*|\|\s*)(5\d\d)\b/i)?.[1]);
  const html = /<!doctype|<html|<body|<head/i.test(raw);
  const transient = status >= 500 || [408, 429].includes(status) || (!status && html)
    || /failed to fetch|networkerror|network request failed|fetch failed|timed? ?out|timeout|load failed/i.test(raw);
  if (transient) return { transient: true, message: 'Ses durumu geçici olarak güncellenemiyor. Otomatik yeniden deneniyor; ses bağlantın devam ediyor.' };
  if (['PGRST202', '42883'].includes(error?.code)) return { transient: false, message: 'Ses durumu hizmeti sunucuda güncellenmeli.' };
  if ([401, 403].includes(status) || error?.code === '42501') return { transient: false, message: 'Ses durumu güncelleme izni doğrulanamadı. Oturumunu yenileyip dene.' };
  return { transient: false, message: `Ses durumu güncellenemedi: ${html ? 'Sunucudan beklenmeyen yanıt geldi.' : raw.replace(/\s+/g, ' ').slice(0, 160) || 'Yeniden dene.'}` };
}

export function createVoicePresenceRecovery(now = Date.now) {
  let failures = 0;
  let retryAt = 0;
  return {
    canAttempt: () => now() >= retryAt,
    failed(error) {
      const failure = voicePresenceFailure(error);
      failures++;
      const delay = failure.transient ? Math.min(20_000, 2_000 * 2 ** Math.min(failures - 1, 4)) : 20_000;
      retryAt = now() + delay;
      return { ...failure, delay, notify: !failure.transient || failures >= 3 };
    },
    succeeded() { failures = 0; retryAt = 0; },
  };
}
