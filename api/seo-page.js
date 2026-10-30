const BASE_URL = 'https://nonton-gratisan.vercel.app';

function humanizeSlug(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function replaceMeta(html, selector, replacement) {
  return html.replace(selector, replacement);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  const type = String(req.query?.type || '').toLowerCase();
  const id = String(req.query?.id || '').trim();
  const slug = String(req.query?.slug || '').trim();

  if (!['movie', 'tv'].includes(type) || !/^\d+$/.test(id) || !slug || slug.includes('/') || slug.includes('\\')) {
    return res.status(400).send('Invalid media route');
  }

  const title = humanizeSlug(slug);
  const mediaLabel = type === 'tv' ? 'Series' : 'Film';
  const canonical = BASE_URL + '/' + type + '/' + encodeURIComponent(id) + '/' + encodeURIComponent(slug);
  const pageTitle = ('Nonton ' + title + ' Sub Indo | NontonGratisan').slice(0, 60);
  const description = (title + ' — informasi ' + mediaLabel.toLowerCase() + ' subtitle Indonesia di NontonGratisan. Lihat sinopsis, genre, rating, dan detail tontonan.').slice(0, 155);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'nonton-gratisan.vercel.app').split(',')[0].trim();

  try {
    // Fetch the existing static app shell; player, catalog, ads and client logic stay intact.
    const shellResponse = await fetch('https://' + host + '/index.html', {
      headers: { 'Accept': 'text/html' },
      redirect: 'manual'
    });
    if (!shellResponse.ok) {
      return res.status(502).send('Unable to load application shell');
    }

    let html = await shellResponse.text();
    const safeTitle = escapeHtml(pageTitle);
    const safeDescription = escapeHtml(description);
    const safeCanonical = escapeHtml(canonical);
    const ogType = type === 'tv' ? 'video.tv_show' : 'video.movie';

    html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + safeTitle + '</title>');
    html = replaceMeta(html, /<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + safeDescription + '">');
    html = html.replace(/<link\s+rel="canonical"[^>]*>/i, '<link rel="canonical" href="' + safeCanonical + '">');
    html = html.replace(/<link\s+rel="alternate"\s+hreflang="id-ID"[^>]*>/i, '<link rel="alternate" hreflang="id-ID" href="' + safeCanonical + '">');
    html = html.replace(/<meta\s+property="og:title"[^>]*>/i, '<meta property="og:title" content="' + safeTitle + '">');
    html = html.replace(/<meta\s+property="og:description"[^>]*>/i, '<meta property="og:description" content="' + safeDescription + '">');
    html = html.replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="' + safeCanonical + '">');
    html = html.replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="' + ogType + '">');
    html = html.replace(/<meta\s+name="twitter:title"[^>]*>/i, '<meta name="twitter:title" content="' + safeTitle + '">');
    html = html.replace(/<meta\s+name="twitter:description"[^>]*>/i, '<meta name="twitter:description" content="' + safeDescription + '">');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
    res.setHeader('X-Robots-Tag', 'index, follow');
    return res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch (error) {
    console.error('SEO shell rendering failed:', error);
    return res.status(502).send('SEO page temporarily unavailable');
  }
}
