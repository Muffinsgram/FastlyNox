export default function handler(req, res) {
  const host = process.env.VITE_PUBLIC_APP_URL
    || `https://${String(req.headers['x-vercel-deployment-url'] || req.headers.host || 'fastlynox.vercel.app').replace(/[^a-z0-9.:-]/giu, '')}`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /?invite=\nSitemap: ${host.replace(/\/+$/u, '')}/sitemap.xml\n`);
}
