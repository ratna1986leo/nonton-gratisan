const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1yRbeSYw0PdbM_tZmjjgKd3v41B7yMMQNa-GTesgp3Lk/gviz/tq?tqx=out:csv&gid=0';
const SITE_URL = 'https://nonton-gratisan.vercel.app';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(v => v.trim())) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows.shift().map(v => v.trim().replace(/^\uFEFF/, '').toLowerCase());
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, (values[i] || '').trim()])));
}

function titleOf(item) {
  return item.judul || item.title || item.name || 'Tanpa Judul';
}

function isSeries(item) {
  const title = String(item.judul || '').toLowerCase();
  const genre = String(item.genre || '').toLowerCase();
  const explicitType = String(item.tipe || item.type || item.jenis || '').toLowerCase();

  const seriesMarkers = [
    'series', 'tv series', 'tv-series', 'drakor', 'k-drama',
    'k drama', 'drama korea', 'series korea', 'series asia',
    'series indonesia', 'series barat', 'series india',
    'tv korea', 'tv asia', 'tv indonesia', 'tv barat', 'tv india'
  ];
  const typeMarkers = ['series', 'tv', 'serial', 'drakor'];

  return typeMarkers.some(marker => explicitType.includes(marker)) ||
    seriesMarkers.some(marker => genre.includes(marker)) ||
    /\b(?:season|series|episode|ep)\s*\d*\b/i.test(title) ||
    /\bbag(?:ian)?\s*\d+\b/i.test(title) ||
    /\[\s*\d{1,3}\s*\]/.test(title);
}

function episodeNumber(title) {
  const text = String(title || '');
  const match = text.match(/\[\s*(\d{1,3})\s*\]/) ||
    text.match(/Ep(?:isode)?\s*(\d+)/i) ||
    text.match(/\bBag(?:ian)?\s*(\d+)\b/i);
  return match ? parseInt(match[1], 10) : 1;
}

function displayTitle(rawTitle) {
  let title = String(rawTitle || 'Tanpa Judul');
  title = title
    .replace(/^Nonton\s*/i, '')
    .replace(/[\(\[]\s*[\d]{4}\s*[\)\]]/g, '')
    .replace(/Series\s*Sub\s*Indo/i, '')
    .replace(/Sub\s*Indo/i, '')
    .replace(/Sub\s*Indonesia/i, '')
    .replace(/\[\d+\]/g, '')
    .replace(/Ep(?:isode)?\s*\d+/gi, '')
    .replace(/\bBag\s*\d+\b/gi, '')
    .trim();
  return title || String(rawTitle || 'Tanpa Judul');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stableMediaId(title, type, link) {
  const source = `${type || 'movie'}|${String(title || '').trim().toLowerCase()}|${String(link || '').trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}`);

    const csv = await response.text();
    if (!csv.trim() || /^\s*</.test(csv)) throw new Error('Respons Google Sheets bukan CSV');

    const rows = parseCSV(csv);
    const urls = new Map();

    urls.set(`${SITE_URL}/`, { priority: '1.0', changefreq: 'daily' });
    urls.set(`${SITE_URL}/movies`, { priority: '0.8', changefreq: 'daily' });
    urls.set(`${SITE_URL}/kategori.html`, { priority: '0.7', changefreq: 'weekly' });
    urls.set(`${SITE_URL}/contact.html`, { priority: '0.3', changefreq: 'monthly' });
    urls.set(`${SITE_URL}/copyright.html`, { priority: '0.2', changefreq: 'yearly' });
    urls.set(`${SITE_URL}/dukung.html`, { priority: '0.3', changefreq: 'monthly' });

    for (const item of rows) {
      const rawTitle = titleOf(item);
      if (!rawTitle || rawTitle === 'Tanpa Judul') continue;

      const series = isSeries(item);
      if (series && episodeNumber(rawTitle) !== 1) continue;

      const type = series ? 'tv' : 'movie';
      const link = item.link || item.player || item.url || '';
      const id = stableMediaId(rawTitle, type, link);
      const cleanTitle = displayTitle(rawTitle);
      const slug = slugify(cleanTitle) || 'nontongratisan';
      const path = `/${type}/${encodeURIComponent(String(id))}/${slug}`;

      urls.set(`${SITE_URL}${path}`, {
        priority: '0.7',
        changefreq: 'weekly'
      });
    }

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...Array.from(urls.entries()).map(([loc, meta]) => [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        `    <changefreq>${meta.changefreq}</changefreq>`,
        `    <priority>${meta.priority}</priority>`,
        '  </url>'
      ].join('\n')),
      '</urlset>'
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(body);
  } catch (error) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(error.message)}</error>`);
  }
};
