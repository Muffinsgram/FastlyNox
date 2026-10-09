import { supabase } from './supabase';

/** Request a short-lived LiveKit token from the trusted server endpoint.
 * LiveKit API secrets must never be included in browser code.
 */
export async function generateLiveKitToken(channelId, { dmChannelId = null } = {}) {
  const readSession = async (refresh = false) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (refresh || !session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) throw new Error('Oturumun yenilenemedi. Çıkış yapıp tekrar giriş yap.');
      return data.session;
    }
    return session;
  };
  let session = await readSession();
  if (!session?.access_token) throw new Error('Ses odasına katılmak için tekrar giriş yap.');

  if (!import.meta.env.DEV) {
    let result = await supabase.functions.invoke('livekit-token', {
      body: dmChannelId ? { dmChannelId } : { channelId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (result.error && (result.error.context?.status === 401 || /authentication expired/i.test(result.data?.error || ''))) {
      session = await readSession(true);
      result = await supabase.functions.invoke('livekit-token', {
        body: dmChannelId ? { dmChannelId } : { channelId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
    const { data, error } = result;
    if (error) throw new Error(data?.error || 'Ses odasına erişim doğrulanamadı. Oturumunu yenileyip tekrar dene.');
    if (!data?.token) throw new Error('The voice token service returned no token.');
    return data.token;
  }

  const requestToken = async (accessToken) => fetch('/api/livekit-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dmChannelId ? { dmChannelId } : { channelId }),
    });
  let response = await requestToken(session.access_token);
  if (response.status === 401) {
    session = await readSession(true);
    response = await requestToken(session.access_token);
  }

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error || 'Could not authorize access to this voice channel.');
  }

  const { token } = await response.json();
  if (!token) throw new Error('The voice token service returned no token.');
  return token;
}
