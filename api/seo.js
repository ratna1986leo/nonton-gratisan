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
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(v => v.trim())) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift().map(v => v.trim().replace(/^\uFEFF/, '').toLowerCase());
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, (values[i] || '').trim()])));
}

function titleOf(item) { return item.judul || item.title || item.name || ''; }

function isSeries(item) {
  const title = String(item.judul || '').toLowerCase();
  const genre = String(item.genre || '').toLowerCase();
  const explicitType = String(item.tipe || item.type || item.jenis || '').toLowerCase();
  const seriesMarkers = ['series','tv series','tv-series','drakor','k-drama','k drama','drama korea','series korea','series asia','series indonesia','series barat','series india','tv korea','tv asia','tv indonesia','tv barat','tv india'];
  const typeMarkers = ['series','tv','serial','drakor'];
  return typeMarkers.some(marker => explicitType.includes(marker)) ||
    seriesMarkers.some(marker => genre.includes(marker)) ||
    /\b(?:season|series|episode|ep)\s*\d*\b/i.test(title) ||
    /\bbag(?:ian)?\s*\d+\b/i.test(title) ||
    /\[\s*\d{1,3}\s*\]/.test(title);
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

function stableMediaId(title, type, link) {
  const source = `${type || 'movie'}|${String(title || '').trim().toLowerCase()}|${String(link || '').trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function esc(value) {
  return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function absUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}/${String(value).replace(/^\/+/, '')}`;
}

module.exports = async function handler(req, res) {
  try {
    const type = req.query.type === 'tv' ? 'tv' : 'movie';
    const id = String(req.query.id || '').trim();
    if (!/^\d+$/.test(id)) return res.status(404).send('Not found');

    const [sheetResponse, htmlResponse] = await Promise.all([
      fetch(SHEET_CSV_URL, { cache: 'no-store' }),
      fetch(`${SITE_URL}/index.html`, { cache: 'no-store' })
    ]);
    if (!sheetResponse.ok) throw new Error(`Google Sheets HTTP ${sheetResponse.status}`);
    if (!htmlResponse.ok) throw new Error(`index.html HTTP ${htmlResponse.status}`);

    const rows = parseCSV(await sheetResponse.text());
    let match = null;
    for (const item of rows) {
      const rawTitle = titleOf(item);
      if (!rawTitle) continue;
      const itemType = isSeries(item) ? 'tv' : 'movie';
      const link = item.link || item.player || item.url || '';
      if (itemType !== type) continue;
      if (String(stableMediaId(rawTitle, itemType, link)) === id) { match = item; break; }
    }
    if (!match) return res.status(404).send('Not found');

    const cleanTitle = displayTitle(titleOf(match));
    const mediaLabel = type === 'tv' ? 'TV Series' : 'Film';
    const description = String(match.overview || `${mediaLabel} ${cleanTitle} subtitle Indonesia di NontonGratisan. Lihat informasi, rating, genre, pemain, dan detail ${mediaLabel.toLowerCase()}.`).trim().slice(0, 300);
    const image = absUrl(match.poster || match.poster_path || match.image || match.gambar || match.thumbnail || '');
    const canonical = `${SITE_URL}/${type}/${encodeURIComponent(id)}/${slugify(cleanTitle) || 'nontongratisan'}`;
    const title = `Nonton ${cleanTitle} Subtitle Indonesia - NontonGratisan`.slice(0, 58);

    let html = await htmlResponse.text();
    const head = `\n    <meta name="description" content="${esc(description)}">\n    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n    <link rel="canonical" href="${esc(canonical)}">\n    <meta property="og:type" content="video.${type === 'tv' ? 'tv_show' : 'movie'}">\n    <meta property="og:title" content="${esc(title)}">\n    <meta property="og:description" content="${esc(description)}">\n    <meta property="og:url" content="${esc(canonical)}">\n    ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}\n    <meta name="twitter:card" content="summary_large_image">\n    <meta name="twitter:title" content="${esc(title)}">\n    <meta name="twitter:description" content="${esc(description)}">\n    ${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}\n    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': type === 'tv' ? 'TVSeries' : 'Movie',
      name: cleanTitle,
      url: canonical,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      description,
      ...(image ? { image: [image] } : {}),
      inLanguage: 'id-ID'
    })}</script>\n`;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
    html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(canonical)}">`);
    html = html.replace(/<meta name="description"[^>]*>/i, head.match(/<meta name="description"[^>]*>/i)[0]);
    html = html.replace('</head>', `${head}</head>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  } catch (error) {
    res.status(500).send('Server error');
  }
};
