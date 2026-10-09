export function getPublicAppUrl() {
  if (typeof window !== 'undefined' && /^https?:$/u.test(window.location.protocol)) return window.location.origin;
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/u, '');
  return 'https://fastlynox.vercel.app';
}

export function getInviteUrl(code) {
  return `${getPublicAppUrl()}/invite/${encodeURIComponent(code)}`;
}
