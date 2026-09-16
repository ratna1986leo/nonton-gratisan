/* NontonGratisan Surprise Me — random title from current TMDB-backed catalog. */
(() => {
  'use strict';
  const SECTION_ID = 'phase7-surprise-section';
  const EXCLUDED = ['wayang', 'ludruk', 'ketoprak', 'kethoprak'];
  const GENRES = {
    all: 'Semua Genre',
    action: 'Action',
    comedy: 'Comedy',
    drama: 'Drama',
    horror: 'Horror',
    romance: 'Romance',
    thriller: 'Thriller',
    scifi: 'Sci-Fi',
    animation: 'Animation',
    asia: 'Asia / Korea'
  };

  const esc = text => typeof escapeHtml === 'function'
    ? escapeHtml(text)
    : String(text ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

  function getPool() {
    const state = typeof store !== 'undefined' && store?.getState ? store.getState() : {};
    const candidates = [
      ...(Array.isArray(state.trendingData) ? state.trendingData : []),
      ...(Array.isArray(state.moviesData) ? state.moviesData : []),
      ...(Array.isArray(state.seriesData) ? state.seriesData : []),
      ...(Array.isArray(state.libraryData) ? state.libraryData : [])
    ];
    const seen = new Set();
    return candidates.filter(item => {
      if (!item || item.id == null) return false;
      const title = String(item.title || item.Judul || '').trim();
      const genre = String(item.genre || item.Genre || '').toLowerCase();
      if (!title || EXCLUDED.some(k => title.toLowerCase().includes(k) || genre.includes(k))) return false;
      const key = `${item.type || 'movie'}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function matchesGenre(item, genre) {
    if (genre === 'all') return true;
    const text = `${item?.title || item?.Judul || ''} ${item?.genre || item?.Genre || ''}`.toLowerCase();
    const aliases = {
      action: ['action', 'aksi'],
      comedy: ['comedy', 'komedi'],
      drama: ['drama'],
      horror: ['horror', 'horor'],
      romance: ['romance', 'romantis'],
      thriller: ['thriller'],
      scifi: ['science fiction', 'sci-fi', 'science-fiction'],
      animation: ['animation', 'animasi'],
      asia: ['asia', 'korea', 'drakor', 'japan', 'jepang', 'china', 'mandarin']
    };
    return (aliases[genre] || []).some(k => text.includes(k));
  }

  function normalize(item) {
    return {
      ...item,
      title: item.title || item.Judul || 'Film Acak',
      type: item.type || (item.Tipe === 'series' ? 'tv' : 'movie')
    };
  }

  function choose(genre = 'all') {
    const pool = getPool().filter(item => matchesGenre(item, genre));
    if (!pool.length) {
      window.showToast?.('Belum ada film untuk genre itu. Coba genre lain.', '🎲');
      return;
    }
    const item = normalize(pool[Math.floor(Math.random() * pool.length)]);
    if (typeof mediaCache !== 'undefined') mediaCache.set(`${item.type}-${item.id}`, item);
    window.showToast?.(`🎲 Pilihan: ${item.title}`, '🍿');
    if (typeof openDetailPage === 'function') openDetailPage(item);
    else if (typeof navigateToDetail === 'function') navigateToDetail(`${item.type}-${item.id}`);
  }

  function inject() {
    if (document.getElementById(SECTION_ID)) return true;
    const anchor = document.getElementById('movies-section') || document.getElementById('trending-section');
    if (!anchor?.parentNode) return false;
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.className = 'space-y-3 sm:space-y-4 fade-in';
    section.innerHTML = `
      <div class="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 p-4 sm:p-5 shadow-xl">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base sm:text-xl font-extrabold text-white flex items-center gap-2">🎲 Lagi bingung mau nonton?</h2>
            <p class="text-[11px] sm:text-sm text-zinc-400 mt-1">Coba film acak dari katalog TMDB yang tersedia.</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select id="phase7-surprise-genre" class="h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs outline-none focus:border-brand-500">
              ${Object.entries(GENRES).map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}
            </select>
            <button id="phase7-surprise-button" type="button" class="h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs sm:text-sm font-extrabold shadow-lg transition active:scale-95">🎲 Film Acak</button>
          </div>
        </div>
      </div>`;
    anchor.parentNode.insertBefore(section, anchor);
    section.querySelector('#phase7-surprise-button')?.addEventListener('click', () => {
      const genre = section.querySelector('#phase7-surprise-genre')?.value || 'all';
      choose(genre);
    });
    return true;
  }

  function boot() {
    const retry = [0, 300, 1000, 2500, 5000, 9000];
    retry.forEach(delay => setTimeout(() => inject(), delay));
    if (typeof store !== 'undefined' && store?.subscribe) store.subscribe(() => inject());
  }

  window.NontonGratisanSurprise = { choose, getPool, inject };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
