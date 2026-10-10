import { supabase } from './supabase';

export const SPOTIFY_CLIENT_ID = 'e04dea5dd7e54a13ba61979ae5f86978';
const pendingKey = 'fastlynox:spotify:oauth-pending';
const tokenKey = (userId) => `fastlynox:spotify:tokens:${encodeURIComponent(userId || '')}`;

function base64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

async function createPkcePair() {
  const random = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function readPending() {
  try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; }
}

function readTokens(userId) {
  try { return JSON.parse(localStorage.getItem(tokenKey(userId)) || 'null'); } catch { return null; }
}

export function hasSpotifyConnection(userId) {
  return Boolean(userId && readTokens(userId)?.refresh_token);
}

export async function beginSpotifyAuthorization(userId) {
  if (!userId) throw new Error('Önce Fastlynox hesabına giriş yap.');
  const { verifier, challenge } = await createPkcePair();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const pending = { verifier, state, userId, clientId: SPOTIFY_CLIENT_ID, returnTo: `${location.pathname}${location.search}${location.hash}` };

  if (window.fastlynoxDesktop?.beginSpotifyOAuth) {
    localStorage.setItem(pendingKey, JSON.stringify(pending));
    const result = await window.fastlynoxDesktop.beginSpotifyOAuth({ clientId: SPOTIFY_CLIENT_ID, state, codeChallenge: challenge });
    if (!result?.redirectUri) {
      localStorage.removeItem(pendingKey);
      throw new Error('Spotify giriş penceresi başlatılamadı.');
    }
    pending.redirectUri = result.redirectUri;
    localStorage.setItem(pendingKey, JSON.stringify(pending));
    return;
  }

  const redirectUri = `${location.origin}/spotify-callback`;
  pending.redirectUri = redirectUri;
  localStorage.setItem(pendingKey, JSON.stringify(pending));
  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.search = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: 'user-read-currently-playing',
  }).toString();
  location.assign(authorizeUrl.toString());
}

export async function completeSpotifyAuthorization(code, returnedState) {
  const pending = readPending();
  if (!pending || !code || returnedState !== pending.state || !pending.redirectUri) {
    localStorage.removeItem(pendingKey);
    throw new Error('Spotify doğrulama bilgisi eşleşmedi. Yeniden bağlan.');
  }
  const body = new URLSearchParams({
    client_id: pending.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tokenResponse = await response.json().catch(() => ({}));
  if (!response.ok || !tokenResponse.access_token) throw new Error(tokenResponse.error_description || 'Spotify hesabı bağlanamadı.');
  localStorage.setItem(tokenKey(pending.userId), JSON.stringify({
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + Number(tokenResponse.expires_in || 3600) * 1000,
  }));
  localStorage.removeItem(pendingKey);
  if (!window.fastlynoxDesktop && location.pathname === '/spotify-callback') {
    history.replaceState({}, '', pending.returnTo || '/');
  }
  window.dispatchEvent(new CustomEvent('fastlynox:spotify-updated', { detail: { userId: pending.userId } }));
  return pending.userId;
}

export function failSpotifyAuthorization(returnedState, message = 'Spotify erişim izni verilmedi.') {
  const pending = readPending();
  if (pending && returnedState === pending.state) localStorage.removeItem(pendingKey);
  window.dispatchEvent(new CustomEvent('fastlynox:spotify-error', { detail: { message } }));
}

async function getFreshAccessToken(userId) {
  let tokens = readTokens(userId);
  if (!tokens?.access_token) return null;
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  const refreshed = await response.json().catch(() => ({}));
  if (!response.ok || !refreshed.access_token) {
    if (response.status === 400 || response.status === 401) {
      localStorage.removeItem(tokenKey(userId));
      window.dispatchEvent(new CustomEvent('fastlynox:spotify-updated', { detail: { userId } }));
    }
    return null;
  }
  tokens = { ...tokens, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token || tokens.refresh_token, expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
  localStorage.setItem(tokenKey(userId), JSON.stringify(tokens));
  return tokens.access_token;
}

export async function fetchSpotifyActivity(userId) {
  const accessToken = await getFreshAccessToken(userId);
  if (!accessToken) return null;
  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 204 || response.status === 404) return null;
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Spotify isteği başarısız (${response.status}).`);
  const payload = await response.json();
  const track = payload?.item;
  if (!payload?.is_playing || !track?.name) return null;
  return {
    title: track.name.slice(0, 120),
    details: (track.artists || []).map((artist) => artist.name).join(', ').slice(0, 180),
    external_url: track.external_urls?.spotify || null,
    album_art_url: track.album?.images?.[0]?.url || null,
    spotify_uri: track.uri || null,
    track_key: track.id || track.uri || track.name,
  };
}

export async function fetchListenBrainzActivity(profileUrl) {
  let username = '';
  try {
    const url = new URL(profileUrl);
    if (url.protocol !== 'https:' || !['listenbrainz.org', 'www.listenbrainz.org'].includes(url.hostname)) return null;
    username = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] || '').trim();
  } catch { return null; }
  if (!username || username.length > 80) return null;
  const response = await fetch(`https://api.listenbrainz.org/1/user/${encodeURIComponent(username)}/listens?count=1`, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ListenBrainz isteği başarısız (${response.status}).`);
  const payload = await response.json();
  const listen = payload?.payload?.listens?.[0];
  if (!listen || listen.playing_now !== true) return null;
  const metadata = listen.track_metadata || {};
  const title = metadata.track_name || '';
  const artist = metadata.artist_name || metadata.release_name || '';
  if (!title) return null;
  const recordingMbid = metadata.additional_info?.recording_mbid;
  return {
    title: String(title).slice(0, 120),
    details: String(artist).slice(0, 180),
    external_url: recordingMbid && /^[a-f0-9-]{36}$/iu.test(recordingMbid) ? `https://musicbrainz.org/recording/${recordingMbid}` : `https://listenbrainz.org/user/${encodeURIComponent(username)}/listens`,
    track_key: `${title}|${artist}`,
  };
}

export async function disconnectSpotify(userId) {
  if (userId) {
    localStorage.removeItem(tokenKey(userId));
    await supabase.from('user_profile_activities').delete().eq('user_id', userId).eq('activity_type', 'spotify');
  }
  window.dispatchEvent(new CustomEvent('fastlynox:spotify-updated', { detail: { userId } }));
}
