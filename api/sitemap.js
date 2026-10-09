const xmlEscape = (value) => String(value).replace(/[<>&"']/gu, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const configuredOrigin = process.env.VITE_PUBLIC_APP_URL;
  const origin = configuredOrigin || `https://${String(req.headers['x-vercel-deployment-url'] || req.headers.host || 'fastlynox.vercel.app').replace(/[^a-z0-9.:-]/giu, '')}`;
  if (!supabaseUrl || !anonKey) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/u, '')}/rest/v1/rpc/list_public_server_invites`, {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new Error('Could not load the public invite list.');
    const invites = await response.json();
    const urls = (Array.isArray(invites) ? invites : []).map(({ invite_slug }) => `  <url><loc>${xmlEscape(origin)}/invite/${encodeURIComponent(invite_slug)}</loc></url>`).join('\n');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${xmlEscape(origin)}/</loc></url>${urls ? `\n${urls}\n` : '\n'}</urlset>`);
  } catch {
    return res.status(502).send('Sitemap temporarily unavailable.');
  }
}
