/* NontonGratisan Smart Search v7 — standalone TMDB + local results */
(() => {
  'use strict';

  const API_KEY = 'e9a425d9a95b19ceecf5f763491a16a2';
  const EXCLUDED = ['wayang', 'ludruk', 'ketoprak', 'kethoprak'];
  const TYPOS = {
    avngers: 'avengers', avenger: 'avengers', endgam: 'endgame', endgme: 'endgame',
    spderman: 'spiderman', spidrman: 'spider-man', batmn: 'batman', supsrman: 'superman',
    harrypoter: 'harry potter', hollan: 'holland', holand: 'holland', tomholland: 'tom holland'
  };
  let timer = null;

  const norm = s => String(s || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  const correct = q => norm(q).split(' ').map(w => TYPOS[w] || w).join(' ').trim();

  function dist(a, b) {
    const p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const c = [i];
      for (let j = 1; j <= b.length; j++) {
        c[j] = Math.min(c[j - 1] + 1, p[j] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      for (let j = 0; j < c.length; j++) p[j] = c[j];
    }
    return p[b.length];
  }

  function score(q, t) {
    q = norm(q); t = norm(t);
    if (!q || !t) return 0;
    if (q === t) return 100;
    if (t.includes(q)) return 96;
    const ws = q.split(' ').filter(Boolean), ps = t.split(' ').filter(Boolean);
    let total = 0, hits = 0;
    for (const w of ws) {
      let best = 0;
      for (const x of ps) {
        if (x === w) best = 100;
        else if (x.includes(w) || w.includes(x)) best = Math.max(best, 88);
        else {
          const d = dist(w, x), n = Math.max(w.length, x.length);
          if (n >= 4 && d <= Math.max(1, Math.floor(n * .34))) best = Math.max(best, 82 - d * 10);
        }
      }
      if (best) hits++;
      total += best;
    }
    return Math.round(total / ws.length + (hits === ws.length ? 8 : 0));
  }

  const excluded = x => {
    const title = norm(x?.title || x?.name || x?.Judul);
    const genre = norm(x?.genre || x?.Genre);
    return EXCLUDED.some(k => title.includes(k) || genre.includes(k));
  };

  function getLocalCatalog() {
    try {
      const s = typeof store !== 'undefined' && store.getState ? store.getState() : {};
      const all = [
        ...(s.libraryData || []), ...(s.moviesData || []), ...(s.seriesData || []),
        ...(s.trendingData || []), ...(window.FALLBACK_MOVIES || []), ...(window.FALLBACK_SERIES || [])
      ];
      const seen = new Set();
      return all.filter(x => {
        if (!x || x.id == null || excluded(x)) return false;
        const k = `${x.type || x.media_type || 'movie'}-${x.id}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    } catch (_) { return []; }
  }

  function normalizeItem(x) {
    const type = x.media_type || x.type || (x.title ? 'movie' : 'tv');
    return {
      ...x,
      id: x.id,
      type,
      media_type: type,
      title: x.title || x.name || x.Judul || 'Tanpa Judul',
      overview: x.overview || x.Deskripsi || '',
      poster_path: x.poster_path || x.Poster || '',
      backdrop_path: x.backdrop_path || x.poster_path || x.Poster || '',
      year: x.year || x.Tahun || String(x.release_date || x.first_air_date || '').slice(0, 4),
      rating: x.rating || x.vote_average || 0,
      genre: x.genre || x.Genre || '',
      popularity: Number(x.popularity || 0)
    };
  }

  function imageUrl(path) {
    if (!path) return 'https://placehold.co/500x750/18181b/ffffff?text=No+Poster';
    if (/^https?:\/\//i.test(path)) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  }

  function ensureSection() {
    let section = document.getElementById('smart-search-results');
    if (section) return section;
    const anchor = document.getElementById('movies-section') || document.querySelector('main section');
    if (!anchor?.parentNode) return null;
    section = document.createElement('section');
    section.id = 'smart-search-results';
    section.className = 'hidden space-y-4 sm:space-y-5 fade-in mb-6';
    section.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base sm:text-xl font-bold text-white">🔍 Hasil Pencarian: <span id="smart-search-query" class="text-brand-500"></span></h2>
        <button id="smart-search-clear" type="button" class="shrink-0 px-3 py-2 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white">Tutup</button>
      </div>
      <div id="smart-search-status" class="text-xs text-zinc-500"></div>
      <div id="smart-search-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4"></div>`;
    anchor.parentNode.insertBefore(section, anchor);
    section.querySelector('#smart-search-clear')?.addEventListener('click', clear);
    return section;
  }

  function card(item) {
    const title = String(item.title || 'Tanpa Judul');
    const safe = title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const poster = imageUrl(item.poster_path);
    const year = item.year ? String(item.year) : '';
    const rating = Number(item.rating || 0).toFixed(1);
    const type = item.type === 'tv' ? 'Series' : 'Film';
    return `<article class="poster-card bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 cursor-pointer group" data-smart-id="${item.type}-${item.id}">
      <div class="relative aspect-[2/3] bg-zinc-950 overflow-hidden">
        <img src="${poster}" alt="Poster ${safe}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='https://placehold.co/500x750/18181b/ffffff?text=No+Poster'">
        <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent pt-8">
          <div class="flex items-center gap-1 text-[9px] text-white"><span>⭐ ${rating}</span><span>•</span><span>${type}</span>${year ? `<span>•</span><span>${year}</span>` : ''}</div>
        </div>
        <div class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition"><span class="w-10 h-10 rounded-full bg-brand-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">▶</span></div>
      </div>
      <div class="p-2.5"><h3 class="text-xs font-bold text-white line-clamp-2">${safe}</h3></div>
    </article>`;
  }

  function openItem(item) {
    const key = `${item.type}-${item.id}`;
    try { if (typeof mediaCache !== 'undefined') mediaCache.set(key, item); } catch (_) {}
    if (typeof openDetailPage === 'function') return openDetailPage(item);
    if (typeof navigateToDetail === 'function') return navigateToDetail(key);
  }

  function render(items, query, loading = false) {
    const section = ensureSection();
    if (!section) return;
    section.classList.remove('hidden');
    const q = document.getElementById('smart-search-query');
    const status = document.getElementById('smart-search-status');
    const grid = document.getElementById('smart-search-grid');
    if (q) q.textContent = `"${query}"`;
    if (loading) {
      if (status) status.textContent = 'Mencari di katalog + TMDB...';
      if (grid) grid.innerHTML = '<div class="col-span-full py-8 text-center text-sm text-zinc-500">🔎 Sedang mencari...</div>';
      return;
    }
    if (status) status.textContent = `${items.length} Film/Series ditemukan`;
    if (!grid) return;
    grid.innerHTML = items.length
      ? items.map(card).join('')
      : '<div class="col-span-full py-10 text-center text-sm text-zinc-500">Tidak ditemukan hasil. Coba judul lain atau periksa ejaan.</div>';
    grid.querySelectorAll('[data-smart-id]').forEach((el, i) => el.addEventListener('click', () => openItem(items[i])));
  }

  async function tmdbMulti(query) {
    const queries = [...new Set([query, correct(query)])].filter(Boolean);
    const all = [];
    for (const q of queries) {
      try {
        const url = `https://api.themoviedb.org/3/search/multi?include_adult=false&language=id-ID&page=1&query=${encodeURIComponent(q)}&api_key=${API_KEY}`;
        const r = await fetch(url, { headers: { accept: 'application/json' } });
        if (!r.ok) continue;
        const data = await r.json();
        (data.results || []).forEach(x => {
          if (['movie', 'tv'].includes(x.media_type) && !excluded(x)) all.push(normalizeItem(x));
        });
      } catch (_) {}
    }
    return all;
  }

  async function search(query) {
    query = String(query || '').trim();
    if (!query) return clear();
    render([], query, true);

    const cq = correct(query);
    const local = getLocalCatalog().map(normalizeItem);
    const localRank = local
      .map(x => ({ x, s: Math.max(score(query, x.title), score(cq, x.title), score(query, x.overview)) }))
      .filter(v => v.s >= 45)
      .sort((a, b) => b.s - a.s)
      .map(v => v.x);

    const tmdb = await tmdbMulti(query);
    const merged = [...localRank, ...tmdb]
      .map(normalizeItem)
      .filter(x => x.id != null && !excluded(x))
      .map(x => ({ x, s: Math.max(score(query, x.title), score(cq, x.title)) }))
      .sort((a, b) => b.s - a.s || b.x.popularity - a.x.popularity)
      .map(v => v.x);

    const seen = new Set();
    const unique = merged.filter(x => {
      const k = `${x.type}-${x.id}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    render(unique.slice(0, 60), query);
    try { if (typeof store !== 'undefined' && store.setState) store.setState({ searchAllResults: unique, searchQuery: query, searchCurrentPage: 1 }); } catch (_) {}
  }

  function clear() {
    const section = document.getElementById('smart-search-results');
    if (section) section.classList.add('hidden');
  }

  function bind(input) {
    if (!input || input.dataset.smartSearchV7) return;
    input.dataset.smartSearchV7 = '1';
    input.removeAttribute('oninput');
    input.removeAttribute('onchange');
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) return clear();
      timer = setTimeout(() => search(q), 350);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        search(input.value);
      }
      if (e.key === 'Escape') clear();
    });
  }

  function boot() {
    bind(document.getElementById('search-input'));
    bind(document.getElementById('mobile-search-input'));
  }

  window.NontonGratisanSmartSearch = { smartSearch: search, clear };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [500, 1500, 3000, 6000].forEach(ms => setTimeout(boot, ms));
})();
