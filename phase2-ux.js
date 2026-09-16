/* NontonGratisan Phase 2 UX — Episode Tracker + Watch History. Additive only. */
(() => {
  'use strict';
  const HISTORY_KEY = 'ng_watch_history_v1';
  const EP_KEY = 'ng_episode_tracker_v1';
  const MAX_HISTORY = 30;

  const readJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  };
  const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

  function mediaKey(item) {
    return item?.key || `${item?.type || 'movie'}-${item?.id}`;
  }
  function clean(item) {
    return {
      key: mediaKey(item), id: item?.id, type: item?.type || 'movie', title: item?.title || item?.Judul || 'Film',
      poster_path: item?.poster_path || item?.Poster || '', year: item?.year || item?.Tahun || '',
      rating: item?.rating || item?.Rating || '', genre: item?.genre || item?.Genre || '',
      link: item?.link || item?.Link || '', updatedAt: Date.now()
    };
  }

  function addHistory(item) {
    if (!item?.id && !item?.Judul) return;
    const data = readJSON(HISTORY_KEY, []).filter(x => x.key !== mediaKey(item));
    data.unshift(clean(item));
    writeJSON(HISTORY_KEY, data.slice(0, MAX_HISTORY));
    renderHistory();
  }

  function getEpisodeState(key) {
    return readJSON(EP_KEY, {})[key] || { season: 1, episode: 1, updatedAt: 0 };
  }
  function saveEpisode(item, season, episode) {
    const key = mediaKey(item);
    const all = readJSON(EP_KEY, {});
    all[key] = { season: Math.max(1, Number(season) || 1), episode: Math.max(1, Number(episode) || 1), updatedAt: Date.now() };
    writeJSON(EP_KEY, all);
    addHistory(item);
    renderHistory();
  }

  window.NontonGratisanPhase2 = { addHistory, saveEpisode, getEpisodeState };

  function renderHistory() {
    const grid = document.getElementById('watch-history-carousel');
    const section = document.getElementById('watch-history-section');
    if (!grid || !section) return;
    const data = readJSON(HISTORY_KEY, []).slice(0, MAX_HISTORY);
    section.classList.toggle('hidden', data.length === 0);
    grid.innerHTML = data.map(item => {
      const ep = getEpisodeState(item.key);
      const label = item.type === 'tv' ? `S${ep.season} • E${ep.episode}` : (item.year || 'Film');
      return `<div class="relative shrink-0 w-28 sm:w-40 md:w-44 bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 group">
        <button type="button" class="block w-full text-left" onclick="phase2Play('${esc(item.key)}')">
          <div class="relative aspect-[2/3] overflow-hidden bg-zinc-950">
            <img src="${esc(item.poster_path)}" alt="Poster ${esc(item.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://placehold.co/400x600/18181b/2563eb?text=Poster'">
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-8 px-2 pb-2 text-[9px] text-white">${esc(label)}</div>
          </div>
          <div class="p-2 sm:p-3"><h3 class="text-[10px] sm:text-xs font-bold text-white truncate">${esc(item.title)}</h3><div class="text-[8px] sm:text-[10px] text-zinc-500 mt-1">Riwayat tontonan</div></div>
        </button>
        <button type="button" onclick="event.stopPropagation(); phase2Remove('${esc(item.key)}')" class="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/75 text-zinc-300 hover:text-white hover:bg-red-600" aria-label="Hapus riwayat">×</button>
      </div>`;
    }).join('');
  }

  function phase2Play(key) {
    const item = readJSON(HISTORY_KEY, []).find(x => x.key === key);
    if (!item) return;
    if (typeof mediaCache !== 'undefined') mediaCache.set(key, item);
    if (typeof navigateToDetail === 'function') navigateToDetail(key);
    else if (typeof openDetailPage === 'function') openDetailPage(item);
  }
  function phase2Remove(key) {
    writeJSON(HISTORY_KEY, readJSON(HISTORY_KEY, []).filter(x => x.key !== key));
    renderHistory();
  }
  window.phase2Play = phase2Play;
  window.phase2Remove = phase2Remove;

  function injectHistorySection() {
    if (document.getElementById('watch-history-section')) return;
    const anchor = document.getElementById('recently-added-section') || document.getElementById('movies-section') || document.querySelector('main');
    if (!anchor?.parentNode) return;
    const section = document.createElement('section');
    section.id = 'watch-history-section';
    section.className = 'hidden space-y-3 sm:space-y-4 fade-in';
    section.innerHTML = `<div class="flex items-center justify-between"><h2 class="text-base sm:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2"><span class="text-brand-500">🕘</span> Riwayat Tontonan</h2><button type="button" onclick="localStorage.removeItem('${HISTORY_KEY}'); NontonGratisanPhase2.addHistory && document.getElementById('watch-history-carousel') && document.getElementById('watch-history-carousel').replaceChildren(); location.reload()" class="text-[10px] sm:text-xs text-zinc-500 hover:text-white">Bersihkan</button></div><div id="watch-history-carousel" class="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar py-1 sm:py-2 scroll-smooth snap-x snap-mandatory"></div>`;
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  }

  const originalOpen = window.openDetailPage;
  if (typeof originalOpen === 'function') {
    window.openDetailPage = async function(item) {
      addHistory(item);
      return originalOpen.apply(this, arguments);
    };
  }

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el || !el.matches('select')) return;
    const id = String(el.id || '').toLowerCase();
    if (!id.includes('season') && !id.includes('episode')) return;
    try {
      const current = typeof store !== 'undefined' ? store.getState().currentMedia : null;
      if (!current) return;
      const season = typeof store !== 'undefined' ? store.getState().currentSeason : 1;
      const episode = typeof store !== 'undefined' ? store.getState().currentEpisode : 1;
      saveEpisode(current, season, episode);
    } catch (_) {}
  });

  function boot() {
    injectHistorySection();
    renderHistory();
    const s = document.createElement('script');
    s.src = '/phase3-ux.js?v=1';
    s.defer = true;
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
