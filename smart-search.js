/* NontonGratisan Smart Search — typo-tolerant titles + actor/person search. */
(() => {
  'use strict';
  const EXCLUDED = ['wayang', 'ludruk', 'ketoprak', 'kethoprak'];
  let lastActorQuery = '';
  let searchTimer = null;

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s) : String(s || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

  function distance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j < cur.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  function tokenScore(query, text) {
    const q = norm(query), t = norm(text);
    if (!q || !t) return 0;
    if (t === q) return 100;
    if (t.includes(q)) return 94;
    const qw = q.split(' '), tw = t.split(' ');
    let total = 0;
    qw.forEach(word => {
      if (!word) return;
      let best = 0;
      tw.forEach(part => {
        if (!part) return;
        if (part === word) best = Math.max(best, 100);
        else if (part.includes(word) || word.includes(part)) best = Math.max(best, 82);
        else {
          const d = distance(word, part);
          const base = Math.max(word.length, part.length);
          if (base >= 4 && d <= Math.max(1, Math.floor(base * 0.34))) best = Math.max(best, 72 - d * 8);
        }
      });
      total += best;
    });
    return Math.round(total / Math.max(1, qw.length));
  }

  function isExcluded(item) {
    const title = norm(item?.title || item?.Judul);
    const genre = norm(item?.genre || item?.Genre);
    return EXCLUDED.some(k => title.includes(k) || genre.includes(k));
  }

  function catalog() {
    try {
      const s = store?.getState?.() || {};
      const all = [
        ...(Array.isArray(s.trendingData) ? s.trendingData : []),
        ...(Array.isArray(s.moviesData) ? s.moviesData : []),
        ...(Array.isArray(s.seriesData) ? s.seriesData : []),
        ...(Array.isArray(s.libraryData) ? s.libraryData : [])
      ];
      const seen = new Set();
      return all.filter(item => {
        if (!item || item.id == null || isExcluded(item)) return false;
        const key = `${item.type || item.media_type || 'movie'}-${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (_) { return []; }
  }

  function scoreTitle(item, query) {
    const title = item?.title || item?.name || item?.Judul || '';
    const score = tokenScore(query, title);
    const genre = tokenScore(query, item?.genre || item?.Genre || '') * 0.18;
    const overview = tokenScore(query, item?.overview || item?.Deskripsi || '') * 0.04;
    return score + genre + overview;
  }

  function renderResults(items, query, mode) {
    try {
      const ranked = items.slice().sort((a,b) => scoreTitle(b, query) - scoreTitle(a, query));
      store.setState({ searchAllResults: ranked, searchQuery: query, searchCurrentPage: 1 });
      if (typeof renderSearchPage === 'function') renderSearchPage();
      if (mode === 'actor' && ranked.length) {
        window.showToast?.(`🎭 Ditemukan ${ranked.length} tontonan terkait ${query}`, '🎬');
      }
    } catch (_) {}
  }

  async function actorSearch(query) {
    const key = typeof DEFAULT_API_KEY !== 'undefined' ? DEFAULT_API_KEY : '';
    if (!key || query.length < 3) return false;
    try {
      const personRes = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${encodeURIComponent(key)}&language=id-ID&query=${encodeURIComponent(query)}&include_adult=false`);
      if (!personRes.ok) return false;
      const people = await personRes.json();
      const person = (people.results || [])[0];
      if (!person) return false;
      const known = String(person.name || '').toLowerCase();
      const wanted = norm(query);
      const similarity = tokenScore(wanted, known);
      if (similarity < 58) return false;
      const creditsRes = await fetch(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?api_key=${encodeURIComponent(key)}&language=id-ID`);
      if (!creditsRes.ok) return false;
      const credits = await creditsRes.json();
      const catalogItems = catalog();
      const creditIds = new Set((credits.cast || []).map(x => `${x.media_type}-${x.id}`));
      const local = catalogItems.filter(x => creditIds.has(`${x.type || x.media_type || 'movie'}-${x.id}`));
      const external = (credits.cast || []).filter(x => ['movie','tv'].includes(x.media_type) && !isExcluded(x)).map(x => {
        const title = x.title || x.name || '';
        return {
          id: x.id,
          type: x.media_type,
          media_type: x.media_type,
          title,
          year: String(x.release_date || x.first_air_date || '').slice(0,4),
          rating: x.vote_average || 0,
          genre: '',
          overview: x.overview || '',
          poster_path: x.poster_path ? `https://image.tmdb.org/t/p/w500${x.poster_path}` : '',
          backdrop_path: x.backdrop_path ? `https://image.tmdb.org/t/p/w1280${x.backdrop_path}` : '',
          popularity: x.popularity || 0,
          actorSearch: person.name
        };
      });
      const seen = new Set();
      const combined = [...local, ...external].filter(x => {
        const k = `${x.type || x.media_type}-${x.id}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      if (!combined.length) return false;
      lastActorQuery = wanted;
      renderResults(combined.sort((a,b)=>(b.popularity||0)-(a.popularity||0)), query, 'actor');
      return true;
    } catch (_) { return false; }
  }

  async function smartSearch(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const local = catalog();
    const titleRanked = local.map(item => ({ item, score: scoreTitle(item, q) })).filter(x => x.score >= 52).sort((a,b) => b.score - a.score).map(x => x.item);
    const strongTitle = titleRanked[0] && scoreTitle(titleRanked[0], q) >= 72;
    if (strongTitle) {
      renderResults(titleRanked, q, 'title');
      return;
    }
    const actorDone = await actorSearch(q);
    if (actorDone) return;
    if (titleRanked.length) renderResults(titleRanked, q, 'title');
  }

  function boot() {
    const input = document.querySelector('#search-input, #searchInput, input[type="search"], input[placeholder*="Cari"], input[placeholder*="cari"]');
    if (!input || input.dataset.smartSearchBound === '1') return;
    input.dataset.smartSearchBound = '1';
    const run = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => smartSearch(input.value), 350);
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); smartSearch(input.value); } });
  }

  window.NontonGratisanSmartSearch = { smartSearch, actorSearch };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
  setTimeout(boot, 1500);
  setTimeout(boot, 4000);
})();
