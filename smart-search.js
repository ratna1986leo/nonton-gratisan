/* NontonGratisan Smart Search v4 — typo-tolerant titles + actor/person search. */
(() => {
  'use strict';
  const EXCLUDED = ['wayang', 'ludruk', 'ketoprak', 'kethoprak'];
  const COMMON_TYPOS = {
    avngers: 'avengers', avenger: 'avengers',
    endgam: 'endgame', endgme: 'endgame',
    spderman: 'spiderman', spidrman: 'spider-man',
    batmn: 'batman', supsrman: 'superman',
    harrypoter: 'harry potter', potter: 'harry potter',
    hollan: 'holland', holand: 'holland', tomholland: 'tom holland'
  };
  let searchTimer = null;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const correctedQuery = query => norm(query).split(' ').map(w => COMMON_TYPOS[w] || w).join(' ').trim();

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
    if (t.includes(q)) return 96;
    const qw = q.split(' '), tw = t.split(' ');
    let total = 0, matched = 0;
    qw.forEach(word => {
      if (!word) return;
      let best = 0;
      tw.forEach(part => {
        if (!part) return;
        if (part === word) best = Math.max(best, 100);
        else if (part.includes(word) || word.includes(part)) best = Math.max(best, 88);
        else {
          const d = distance(word, part);
          const base = Math.max(word.length, part.length);
          if (base >= 4 && d <= Math.max(1, Math.floor(base * 0.34))) best = Math.max(best, 82 - d * 10);
        }
      });
      if (best > 0) matched++;
      total += best;
    });
    return Math.round((total / Math.max(1, qw.length)) + (matched === qw.length ? 8 : 0));
  }

  function isExcluded(item) {
    const title = norm(item?.title || item?.name || item?.Judul);
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
        ...(Array.isArray(s.libraryData) ? s.libraryData : []),
        ...(Array.isArray(window.FALLBACK_MOVIES) ? window.FALLBACK_MOVIES : []),
        ...(Array.isArray(window.FALLBACK_SERIES) ? window.FALLBACK_SERIES : [])
      ];
      const seen = new Set();
      return all.filter(item => {
        if (!item || item.id == null || isExcluded(item)) return false;
        const key = `${item.type || item.media_type || 'movie'}-${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    } catch (_) { return []; }
  }

  function scoreTitle(item, query) {
    const title = item?.title || item?.name || item?.Judul || '';
    const actors = item?.actors || item?.Aktor || item?.cast || '';
    return tokenScore(query, title) + tokenScore(query, Array.isArray(actors) ? actors.join(' ') : actors) * 0.35 + tokenScore(query, item?.genre || item?.Genre || '') * 0.12;
  }

  function prepareResult(item) {
    if (!item) return null;
    const type = item.type || item.media_type || 'movie';
    return { ...item, type, media_type: type, title: item.title || item.name || item.Judul || 'Tanpa Judul', overview: item.overview || item.Deskripsi || '', year: item.year || item.Tahun || String(item.release_date || item.first_air_date || '').slice(0,4), poster_path: item.poster_path || item.Poster || '', backdrop_path: item.backdrop_path || '' };
  }

  function setSearchVisible(query, count) {
    document.getElementById('search-section')?.classList.remove('hidden');
    const q = document.getElementById('search-query-text'); if (q) q.textContent = `"${query}"`;
    const c = document.getElementById('search-count'); if (c) c.textContent = `${count} Film Ditemukan`;
    document.getElementById('search-clear-btn')?.classList.remove('hidden');
  }

  function renderResults(items, query, mode) {
    try {
      const ranked = items.map(prepareResult).filter(Boolean).sort((a,b) => scoreTitle(b, query) - scoreTitle(a, query) || (b.popularity||0) - (a.popularity||0));
      store.setState({ searchAllResults: ranked, searchQuery: query, searchCurrentPage: 1 });
      setSearchVisible(query, ranked.length);
      if (typeof renderSearchPage === 'function') renderSearchPage();
      if (mode === 'actor' && ranked.length) window.showToast?.(`🎭 Ditemukan ${ranked.length} tontonan terkait ${query}`, '🎬');
    } catch (_) {}
  }

  async function tmdbSearch(query) {
    const key = typeof DEFAULT_API_KEY !== 'undefined' ? DEFAULT_API_KEY : '';
    if (!key || query.length < 2) return [];
    const queries = [query];
    const corrected = correctedQuery(query);
    if (corrected && corrected !== query) queries.push(corrected);
    const words = corrected.split(' ').filter(w => w.length >= 4);
    queries.push(...words);
    const uniqueQueries = [...new Set(queries)].slice(0, 4);
    try {
      const requests = [];
      for (const q of uniqueQueries) {
        requests.push(fetch(`https://api.themoviedb.org/3/search/movie?language=id-ID&query=${encodeURIComponent(q)}&page=1&include_adult=false&api_key=${encodeURIComponent(key)}`));
        requests.push(fetch(`https://api.themoviedb.org/3/search/tv?language=id-ID&query=${encodeURIComponent(q)}&page=1&include_adult=false&api_key=${encodeURIComponent(key)}`));
      }
      const results = await Promise.allSettled(requests);
      const out = [];
      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value.ok) continue;
        const data = await r.value.json();
        for (const x of (data.results || []).slice(0, 20)) {
          if (isExcluded(x)) continue;
          const mediaType = x.title ? 'movie' : 'tv';
          out.push({ id:x.id, type:mediaType, media_type:mediaType, title:x.title||x.name||'', overview:x.overview||'', year:String(x.release_date||x.first_air_date||'').slice(0,4), rating:x.vote_average||0, popularity:x.popularity||0, poster_path:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'', backdrop_path:x.backdrop_path?`https://image.tmdb.org/t/p/w1280${x.backdrop_path}`:'' });
        }
      }
      const seen = new Set();
      return out.filter(x => { const k=`${x.type}-${x.id}`; if(seen.has(k)) return false; seen.add(k); return true; });
    } catch (_) { return []; }
  }

  async function actorSearch(query) {
    const key = typeof DEFAULT_API_KEY !== 'undefined' ? DEFAULT_API_KEY : '';
    if (!key || query.length < 3) return false;
    try {
      const corrected = correctedQuery(query);
      const baseQueries = [query, corrected, ...corrected.split(' ').filter(w => w.length >= 3)];
      const personQueries = [...new Set(baseQueries)].slice(0, 5);
      const peopleMap = new Map();
      for (const q of personQueries) {
        const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${encodeURIComponent(key)}&language=id-ID&query=${encodeURIComponent(q)}&page=1&include_adult=false`);
        if (!res.ok) continue;
        const data = await res.json();
        for (const person of (data.results || []).slice(0, 20)) peopleMap.set(person.id, person);
      }
      const people = [...peopleMap.values()];
      const person = people.sort((a,b) => {
        const sb = tokenScore(query, b.name) + tokenScore(corrected, b.name) * 0.35 + (b.popularity || 0) * 0.02;
        const sa = tokenScore(query, a.name) + tokenScore(corrected, a.name) * 0.35 + (a.popularity || 0) * 0.02;
        return sb - sa;
      })[0];
      if (!person) return false;
      const confidence = Math.max(tokenScore(query, person.name), tokenScore(corrected, person.name));
      if (confidence < 58) return false;

      const creditsRes = await fetch(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?api_key=${encodeURIComponent(key)}&language=id-ID`);
      if (!creditsRes.ok) return false;
      const credits = await creditsRes.json();
      const creditIds = new Set((credits.cast||[]).map(c=>`${c.media_type}-${c.id}`));
      const local = catalog().filter(x => creditIds.has(`${x.type||x.media_type||'movie'}-${x.id}`));
      const external = (credits.cast||[]).filter(x=>['movie','tv'].includes(x.media_type)&&!isExcluded(x)).map(x=>({id:x.id,type:x.media_type,media_type:x.media_type,title:x.title||x.name||'',year:String(x.release_date||x.first_air_date||'').slice(0,4),rating:x.vote_average||0,genre:'',overview:x.overview||'',poster_path:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',backdrop_path:x.backdrop_path?`https://image.tmdb.org/t/p/w1280${x.backdrop_path}`:'',popularity:x.popularity||0,actorSearch:person.name}));
      const seen = new Set();
      const combined = [...local,...external].filter(x=>{const k=`${x.type||x.media_type}-${x.id}`;if(seen.has(k))return false;seen.add(k);return true;});
      if (!combined.length) return false;
      renderResults(combined, query, 'actor');
      return true;
    } catch (_) { return false; }
  }

  async function smartSearch(query) {
    const q = String(query||'').trim(); if (!q) return;
    const corrected = correctedQuery(q);
    const actorDone = await actorSearch(q);
    if (actorDone) return;

    const local = catalog();
    const titleRanked = local.map(item=>({item,score:Math.max(scoreTitle(item,q), scoreTitle(item,corrected))})).filter(x=>x.score>=50).sort((a,b)=>b.score-a.score).map(x=>x.item);
    const strongTitle = titleRanked[0] && Math.max(scoreTitle(titleRanked[0],q), scoreTitle(titleRanked[0],corrected)) >= 72;
    if (strongTitle) { renderResults(titleRanked,q,'title'); return; }

    const tmdbMatches = await tmdbSearch(corrected);
    if (tmdbMatches.length) { renderResults([...titleRanked,...tmdbMatches], q, 'title'); return; }
    if (titleRanked.length) renderResults(titleRanked,q,'title');
    else { store.setState({searchAllResults:[],searchQuery:q,searchCurrentPage:1}); setSearchVisible(q,0); renderSearchPage?.(); window.showToast?.('Tidak ada hasil ditemukan','🔍'); }
  }

  function bindInput(input) {
    if (!input || input.dataset.smartSearchBound==='1') return;
    input.dataset.smartSearchBound='1'; input.removeAttribute('oninput'); input.removeAttribute('onchange');
    const run=()=>{ clearTimeout(searchTimer); const value=input.value.trim(); if(!value)return; searchTimer=setTimeout(()=>smartSearch(value),450); };
    input.addEventListener('input',run);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);smartSearch(input.value.trim());}});
  }
  function boot(){bindInput(document.getElementById('search-input'));bindInput(document.getElementById('mobile-search-input'));}
  window.NontonGratisanSmartSearch={smartSearch,actorSearch};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,1200); setTimeout(boot,3000);
})();
