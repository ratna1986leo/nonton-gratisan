/* NontonGratisan Phase 3 UX — Recommendations + Resume panel. Additive only. */
(() => {
  'use strict';
  const HISTORY_KEY = 'ng_watch_history_v1';
  const EP_KEY = 'ng_episode_tracker_v1';
  const MAX = 12;

  const readJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  };
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const keyOf = x => x?.key || `${x?.type || 'movie'}-${x?.id}`;

  function history() { return readJSON(HISTORY_KEY, []).filter(x => x && (x.id || x.Judul)); }

  function play(item) {
    if (!item) return;
    if (typeof mediaCache !== 'undefined') mediaCache.set(keyOf(item), item);
    if (typeof openDetailPage === 'function') openDetailPage(item);
  }
  window.phase3Play = play;

  function recommendationPool() {
    const state = typeof store !== 'undefined' ? store.getState() : {};
    const library = Array.isArray(state.libraryData) ? state.libraryData : [];
    const tmdb = [...(state.moviesData || []), ...(state.seriesData || []), ...(state.trendingData || [])];
    const seen = new Set(history().map(keyOf));
    const genres = history().flatMap(x => String(x.genre || x.Genre || '').toLowerCase().split(/[,|]/).map(s => s.trim()).filter(Boolean));
    const score = item => {
      if (seen.has(keyOf(item))) return -999;
      const g = String(item.genre || item.Genre || '').toLowerCase();
      let s = 0;
      genres.forEach(v => { if (v && g.includes(v)) s += 4; });
      if (item.rating || item.Rating) s += Math.min(2, Number(item.rating || item.Rating) / 5);
      return s;
    };
    const all = [...library, ...tmdb].map(x => {
      const type = x.type || x.media_type || (x.Tipe || '').toLowerCase() || 'movie';
      return { ...x, type, title: x.title || x.name || x.Judul, poster_path: x.poster_path || x.poster || x.Poster, genre: x.genre || x.Genre, year: x.year || x.Tahun, rating: x.rating || x.vote_average || x.Rating, id: x.id || x.ID };
    }).filter(x => x.id && x.title);
    const unique = new Map();
    all.forEach(x => { if (!unique.has(keyOf(x))) unique.set(keyOf(x), x); });
    return [...unique.values()].sort((a,b) => score(b) - score(a)).slice(0, MAX);
  }

  function card(item) {
    const title = esc(item.title);
    const poster = esc(item.poster_path || 'https://placehold.co/400x600/18181b/2563eb?text=Poster');
    const meta = [item.year, item.rating ? `⭐ ${Number(item.rating).toFixed(1)}` : ''].filter(Boolean).join(' • ');
    return `<div class="relative shrink-0 w-28 sm:w-40 md:w-44 bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 group snap-start"><button type="button" class="block w-full text-left" onclick='phase3Play(${JSON.stringify(item).replace(/</g,'\\u003c')})'><div class="relative aspect-[2/3] overflow-hidden bg-zinc-950"><img src="${poster}" alt="Poster ${title}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://placehold.co/400x600/18181b/2563eb?text=Poster'"><div class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition"><span class="opacity-0 group-hover:opacity-100 bg-brand-600 rounded-full px-3 py-2 text-xs font-bold">▶</span></div></div><div class="p-2 sm:p-3"><h3 class="text-[10px] sm:text-xs font-bold text-white truncate">${title}</h3><div class="text-[8px] sm:text-[10px] text-zinc-500 mt-1 truncate">${esc(meta || 'Rekomendasi')}</div></div></button></div>`;
  }

  function render() {
    const section = document.getElementById('phase3-recommendations');
    const grid = document.getElementById('phase3-recommendation-carousel');
    if (!section || !grid) return;
    const items = recommendationPool();
    section.classList.toggle('hidden', items.length === 0);
    grid.innerHTML = items.map(card).join('');
  }

  function inject() {
    if (document.getElementById('phase3-recommendations')) return;
    const anchor = document.getElementById('watch-history-section') || document.getElementById('recently-added-section') || document.getElementById('movies-section');
    if (!anchor?.parentNode) return;
    const section = document.createElement('section');
    section.id = 'phase3-recommendations';
    section.className = 'hidden space-y-3 sm:space-y-4 fade-in';
    section.innerHTML = `<div class="flex items-center justify-between"><h2 class="text-base sm:text-xl font-bold text-white flex items-center gap-2"><span class="text-brand-500">🎯</span> Rekomendasi Untuk Kamu</h2><span class="text-[9px] sm:text-xs text-zinc-500">Berdasarkan tontonanmu</span></div><div id="phase3-recommendation-carousel" class="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar py-1 sm:py-2 scroll-smooth snap-x snap-mandatory"></div>`;
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  }

  function boot() { inject(); render(); setTimeout(render, 1500); setTimeout(render, 5000); }
  window.NontonGratisanPhase3 = { render, recommendationPool };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
