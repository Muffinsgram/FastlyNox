const escapeHtml = (value = '') => String(value).replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const safeImageUrl = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

const requestOrigin = (req) => {
  const configured = process.env.VITE_PUBLIC_APP_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') return parsed.origin;
    } catch { /* use the verified Vercel request host below */ }
  }
  const host = req.headers['x-vercel-deployment-url'] || req.headers.host;
  return `https://${String(host || 'fastlynox.vercel.app').replace(/[^a-z0-9.:-]/giu, '')}`;
};

async function getInvitePreview(code) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Invite preview is not configured.');

  const response = await fetch(`${supabaseUrl.replace(/\/+$/u, '')}/rest/v1/rpc/get_server_invite_preview`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: code }),
  });
  if (!response.ok) throw new Error('Invite preview lookup failed.');
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed');
  }
  const code = String(req.query.code || '').trim();
  const origin = requestOrigin(req);
  if (!/^[a-z0-9_-]{5,32}$/iu.test(code)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(404).send('Davet bağlantısı bulunamadı.');
  }

  let preview;
  try {
    preview = await getInvitePreview(code);
  } catch {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(503).send('Davet önizlemesi şu anda yüklenemiyor.');
  }
  if (!preview) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(404).send('Bu davet geçersiz, iptal edilmiş veya süresi dolmuş.');
  }

  const serverName = escapeHtml(preview.server_name || 'Fastlynox topluluğu');
  const memberCount = Math.max(0, Number(preview.member_count) || 0);
  const isVanity = preview.is_vanity === true;
  const canonical = `${origin}/invite/${encodeURIComponent(code)}`;
  const joinUrl = `${origin}/?invite=${encodeURIComponent(code)}`;
  const image = safeImageUrl(preview.server_icon_url);
  const description = `${serverName} sunucusuna katıl. Fastlynox'ta topluluğa katıl, sohbet et ve arkadaşlarınla bağlantıda kal.`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', isVanity ? 'index, follow' : 'noindex, follow');
  return res.status(200).send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0e14"><meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Fastlynox"><meta property="og:title" content="${serverName} sunucusuna katıl | Fastlynox"><meta property="og:description" content="${escapeHtml(description)}">${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary' : 'summary'}"><link rel="canonical" href="${escapeHtml(canonical)}"><title>${serverName} sunucusuna katıl | Fastlynox</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0,#25294b 0,transparent 48%),#0b0e14;color:#f7f8fc;font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}.card{width:min(100%,480px);padding:34px;border:1px solid #ffffff16;border-radius:26px;background:linear-gradient(145deg,#171b27f2,#11141cf5);box-shadow:0 28px 100px #0008;text-align:center}.brand{color:#9ba8ff;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.icon{width:92px;height:92px;margin:28px auto 18px;border-radius:25px;background:#24283a;object-fit:cover;display:grid;place-items:center;font-size:34px;color:#adb5ff;border:1px solid #ffffff1b}.fallback{display:grid}.title{margin:0;font-size:24px;letter-spacing:-.04em}.meta{margin:10px 0 28px;color:#a7b0c4;font-size:14px}.join{display:block;padding:14px 20px;border-radius:14px;background:linear-gradient(100deg,#657dff,#795cff);color:white;text-decoration:none;font-weight:800;box-shadow:0 12px 35px #655cff4a;transition:transform .18s,filter .18s}.join:hover{transform:translateY(-2px);filter:brightness(1.08)}.note{margin:18px 0 0;color:#727e94;font-size:12px}.wordmark{margin-top:24px;color:#58647a;font-size:11px;font-weight:700;letter-spacing:.12em}</style></head>
<body><main class="card"><div class="brand">Fastlynox daveti</div>${image ? `<img class="icon" src="${escapeHtml(image)}" alt="${serverName} sunucu simgesi">` : '<div class="icon fallback" aria-hidden="true">✦</div>'}<h1 class="title">${serverName}</h1><p class="meta">${memberCount} üye · Seni bekliyorlar</p><a class="join" href="${escapeHtml(joinUrl)}">Sunucuya katıl</a><p class="note">Katılmak için Fastlynox hesabınla giriş yap. Hesabın yoksa ücretsiz oluşturabilirsin.</p><div class="wordmark">SOHBET · TOPLULUK · FASTLYNOX</div></main></body></html>`);
}
