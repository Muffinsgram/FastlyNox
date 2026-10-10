export async function readFunctionError(result, fallback = 'İşlem tamamlanamadı.') {
  if (result.data?.error) return result.data.error;
  const response = result.error?.context;
  let body;
  try { body = await response?.clone().json(); } catch { /* Non-JSON gateway response. */ }
  const detail = body?.error || body?.message;
  if (detail) return detail;
  if (response?.status === 401) return 'Oturum doğrulanamadı. Tekrar giriş yapıp yeniden dene.';
  if (response?.status === 403) return 'Bu işlem için yetkin yok.';
  if (response?.status === 404) return 'Ses yönetimi hizmeti bulunamadı. Sunucu fonksiyonunun yayınlanması gerekiyor.';
  if (response?.status >= 500) return 'Ses yönetimi sunucusunda hata oluştu. Yeniden dene.';
  return /non-2xx/i.test(result.error?.message || '') ? fallback : result.error?.message || fallback;
}

export async function invokeAuthenticatedFunction(client, name, body) {
  let { data: { session } } = await client.auth.getSession();
  if (!session?.access_token || session.expires_at * 1000 < Date.now() + 60_000) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) return { data: null, error: new Error('Oturum yenilenemedi. Tekrar giriş yap.') };
    session = refreshed.data.session;
  }
  const invoke = token => client.functions.invoke(name, { body, headers: { Authorization: `Bearer ${token}` } });
  let result = await invoke(session.access_token);
  if (result.error?.context?.status === 401) {
    const refreshed = await client.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) result = await invoke(refreshed.data.session.access_token);
  }
  if (result.error || result.data?.error) {
    return { ...result, error: new Error(await readFunctionError(result)) };
  }
  return result;
}
