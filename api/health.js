export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = req.headers['x-nova-key'];
  if (!process.env.NOVA_ADMIN_KEY || key !== process.env.NOVA_ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });

  const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, 20) : [];
  if (!urls.length) return res.status(400).json({ error: 'urls wajib diisi' });

  const isSafe = value => {
    try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  };

  const check = async url => {
    if (!isSafe(url)) return { url, ok: false, error: 'URL tidak valid' };
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      return { url, ok: r.ok, status: r.status, ms: Date.now() - started, finalUrl: r.url };
    } catch (e) {
      clearTimeout(timer);
      return { url, ok: false, ms: Date.now() - started, error: e.name === 'AbortError' ? 'Timeout 8 detik' : e.message };
    }
  };

  const results = await Promise.all(urls.map(check));
  return res.status(200).json({ ok: true, checkedAt: new Date().toISOString(), results });
}