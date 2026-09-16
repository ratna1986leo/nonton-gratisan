/* NontonGratisan Phase 6 — Trending lokal berbasis item TMDB, additive only. */
(() => {
  'use strict';

  const KEY = 'ng_tmdb_trending_v1';
  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_LOG = 300;
  const MAX_CARDS = 12;
  const EXCLUDED = ['wayang', 'ludruk', 'ketoprak', 'kethoprak'];

  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  };

  const write = items => {
    try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_LOG))); } catch (_) {}
  };

  const clean = items => {
    const cutoff = Date.now() - WINDOW_MS;
    return items.filter(x => x && Number(x.at) >= cutoff);
  };

  const isExcluded = item => {
    const title = String(item?.Judul || item?.title || item?.name || '').toLowerCase();
    const genre = String(item?.Genre || item?.genre || '').toLowerCase();
    return EXCLUDED.some(k => title.includes(k) || genre.includes(k));
  };

  const keyOf = item => `${item?.type || 'movie'}-${item?.id}`;

  function snapshot(item) {
    if (!item || item.id == null || isExcluded(item)) return null;
    return {
      id: item.id,
      type: item.type || 'movie',
      title: item.title || item.name || item.Judul || 'Film',
      poster_path: item.poster_path || item.poster || '',
      backdrop_path: item.backdrop_path || '',
      genre: item.genre || item.Genre || '',
      year: item.year || item.release_date?.slice?.(0, 4) || '',
      rating: item.rating ?? item.vote_average ?? '',
      overview: item.overview || '',
      popularity: Number(item.popularity) || 0,
      link: item.link || '',
      actors: item.actors || '',
      isLibraryItem: Boolean(item.isLibraryItem),
      at: Date.now()
    };
  }

  function record(item) {
    const snap = snapshot(item);
    if (!snap) return;
    const data = clean(read());
    data.push(snap);
    write(data);
    render();
  }

  function rankedClicks() {
    const map = new Map();
    clean(read()).forEach(hit => {
      const key = keyOf(hit);
      const current = map.get(key) || { count: 0, item: hit };
      current.count += 1;
      current.item = hit;
      map.set(key, current);
    });
    return [...map.values()]
      .sort((a, b) => b.count - a.count || (Number(b.item.popularity) - Number(a.item.popularity)))
      .slice(0, MAX_CARDS)
      .map(x => x.item);
  }

  function fallbackTMDB() {
    try {
      const state = typeof store !== 'undefined' ? store.getState() : {};
      const pools = [
        ...(Array.isArray(state.trendingData) ? state.trendingData : []),
        ...(Array.isArray(state.moviesData) ? state.moviesData : []),
        ...(Array.isArray(state.seriesData) ? state.seriesData : [])
      ];
      const seen = new Set();
      return pools
        .filter(item => item && item.id != null && !isExcluded(item))
        .sort((a, b) => Number(b.popularity || b.rating || 0) - Number(a.popularity || a.rating || 0))
        .filter(item => {
          const k = keyOf(item);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, MAX_CARDS);
    } catch (_) { return []; }
  }

  function injectSection() {
    if (document.getElementById('phase6-trending-section')) return;
    const anchor = document.getElementById('trending-section');
    if (!anchor?.parentNode) return;

    const section = document.createElement('section');
    section.id = 'phase6-trending-section';
    section.className = 'space-y-3 sm:space-y-4 fade-in';
    section.innerHTML = `
      <div class="flex items-end justify-between gap-3">
        <div>
          <h2 class="text-base sm:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
            <span class="text-orange-500">🔥</span> Trending Sekarang
          </h2>
          <p class="text-[9px] sm:text-xs text-zinc-500 mt-1">Berdasarkan klik/tontonan 7 hari terakhir</p>
        </div>
        <span class="text-[9px] sm:text-xs text-zinc-600">TMDB</span>
      </div>
      <div id="phase6-trending-carousel" class="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar py-1 sm:py-2 scroll-smooth snap-x snap-mandatory"></div>`;

    anchor.parentNode.insertBefore(section, anchor);
  }

  function render() {
    const grid = document.getElementById('phase6-trending-carousel');
    if (!grid) return;

    const items = rankedClicks();
    const finalItems = items.length ? items : fallbackTMDB();

    grid.innerHTML = finalItems.map(item => {
      const key = keyOf(item);
      if (typeof mediaCache !== 'undefined') mediaCache.set(key, item);
      return typeof createCardHTML === 'function' ? createCardHTML(item) : '';
    }).join('');
  }

  function hookDetail() {
    if (window.__phase6TrendingHooked) return;
    if (typeof window.openDetailPage !== 'function') return;
    window.__phase6TrendingHooked = true;
    const original = window.openDetailPage;
    window.openDetailPage = async function(item) {
      try { record(item); } catch (_) {}
      return original.apply(this, arguments);
    };
  }

  function boot() {
    injectSection();
    render();
    hookDetail();
    if (typeof store !== 'undefined' && store.subscribe) {
      store.subscribe(() => render());
    }
    [800, 1800, 3500, 6000].forEach(ms => setTimeout(() => { injectSection(); render(); hookDetail(); }, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
