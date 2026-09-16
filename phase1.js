// NontonGratisan Fase 1 UX
// Continue Watching + Recently Added + lightweight search enhancement.
// Load this file after the main index.html script definitions.
(() => {
    const CONTINUE_KEY = 'ng_continue_watching_v1';
    const MAX_CONTINUE = 12;

    function readContinue() {
        try {
            const raw = localStorage.getItem(CONTINUE_KEY);
            const data = raw ? JSON.parse(raw) : [];
            return Array.isArray(data) ? data : [];
        } catch (_) { return []; }
    }
    function writeContinue(items) {
        try { localStorage.setItem(CONTINUE_KEY, JSON.stringify(items.slice(0, MAX_CONTINUE))); } catch (_) {}
    }
    function rememberContinue(item) {
        if (!item || !item.id) return;
        const state = store.getState();
        const clean = {
            id: item.id, type: item.type === 'tv' ? 'tv' : 'movie', title: item.title || 'Film',
            year: item.year || '', rating: item.rating || '', genre: item.genre || '', overview: item.overview || '',
            poster_path: item.poster_path || '', backdrop_path: item.backdrop_path || item.poster_path || '',
            link: item.link || '', actors: item.actors || '', isLibraryItem: !!item.isLibraryItem,
            libraryEpisodes: Array.isArray(item.libraryEpisodes) ? item.libraryEpisodes : [],
            lastEpisode: state.currentEpisode || 1, watchedAt: Date.now()
        };
        const list = readContinue().filter(x => !(String(x.id) === String(clean.id) && x.type === clean.type));
        writeContinue([clean, ...list]);
        renderContinueWatching();
    }
    window.clearContinueWatching = function() {
        try { localStorage.removeItem(CONTINUE_KEY); } catch (_) {}
        renderContinueWatching();
        if (typeof showToast === 'function') showToast('Riwayat tontonan dihapus', '🗑️');
    };
    function continueCard(item) {
        const key = getMediaKey(item.type, item.id);
        mediaCache.set(key, item);
        const poster = getOptimizedImage(item.poster_path, 360);
        const clean = String(item.title || 'Film').replace(/^Nonton\s*/i, '').replace(/Sub\s*Indo(?:nesia)?/i, '').trim();
        const episode = item.type === 'tv' ? `<span class="text-brand-400">Ep ${item.lastEpisode || 1}</span>` : '';
        return `<a href="/${item.type}/${encodeURIComponent(String(item.id))}/${slugify(clean) || 'film'}" data-media-key="${escapeHtml(key)}" onclick="event.preventDefault(); navigateToDetail('${escapeHtml(key)}')" class="focusable group min-w-[140px] w-[140px] sm:min-w-[170px] sm:w-[170px] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 snap-start"><div class="relative aspect-[2/3] overflow-hidden"><img src="${escapeHtml(poster)}" alt="Poster ${escapeHtml(clean)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"><div class="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800"><div class="h-full bg-brand-500" style="width:35%"></div></div><div class="absolute top-2 left-2 bg-black/70 text-white text-[9px] px-2 py-1 rounded-md">▶ Lanjut</div></div><div class="p-2.5"><h3 class="text-[10px] sm:text-xs font-bold text-white truncate">${escapeHtml(clean)}</h3><div class="flex justify-between mt-1 text-[9px] text-zinc-500"><span>${escapeHtml(String(item.year || ''))}</span>${episode}</div></div></a>`;
    }
    window.renderContinueWatching = function() {
        const section = document.getElementById('continue-watching-section');
        const carousel = document.getElementById('continue-watching-carousel');
        if (!section || !carousel) return;
        const items = readContinue().filter(x => x && x.id).sort((a,b) => (b.watchedAt || 0) - (a.watchedAt || 0));
        if (!items.length) { section.classList.add('hidden'); carousel.innerHTML = ''; return; }
        section.classList.remove('hidden');
        carousel.innerHTML = items.slice(0, MAX_CONTINUE).map(continueCard).join('');
    };
    window.renderRecentlyAdded = function() {
        const carousel = document.getElementById('recently-added-carousel');
        const count = document.getElementById('recently-added-count');
        if (!carousel || typeof store === 'undefined') return;
        const state = store.getState();
        const data = Array.isArray(state.libraryData) ? [...state.libraryData].reverse() : [];
        const seen = new Set(), items = [];
        data.forEach(raw => {
            const title = raw?.Judul || raw?.judul || raw?.Title;
            if (!title) return;
            const key = String(title).toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,120);
            if (seen.has(key)) return;
            seen.add(key);
            const isSeries = typeof isLibrarySeries === 'function' ? isLibrarySeries(raw) : false;
            const item = { id: Math.abs(hashCode(String(title) + String(raw.Link || ''))),
                title: String(title).replace(/^Nonton\s*/i,'').replace(/\[\s*\d+\s*\]/g,'').replace(/\b(?:Ep(?:isode)?|Bag(?:ian)?)\s*\d+\b/gi,'').trim(),
                type: isSeries ? 'tv' : 'movie', rating: parseFloat(String(raw.Rating || '8').replace(',','.')) || 8,
                year: raw.Tahun || '', genre: raw.Genre || '', overview: raw.Deskripsi || '',
                poster_path: enforceHttps(raw.Poster) || 'https://placehold.co/400x600/18181b/2563eb?text=No+Poster',
                backdrop_path: enforceHttps(raw.Poster) || '', link: raw.Link || '', actors: raw.Aktor || '', isLibraryItem: true, libraryEpisodes: [] };
            mediaCache.set(getMediaKey(item.type,item.id), item); items.push(item);
        });
        const selected = items.slice(0, 16);
        if (count) count.textContent = selected.length ? `${selected.length} terbaru` : '';
        carousel.innerHTML = selected.map(item => {
            const key=getMediaKey(item.type,item.id), clean=escapeHtml(item.title), poster=escapeHtml(getOptimizedImage(item.poster_path,360));
            return `<a href="/${item.type}/${encodeURIComponent(String(item.id))}/${slugify(item.title)||'film'}" data-media-key="${escapeHtml(key)}" onclick="event.preventDefault(); navigateToDetail('${escapeHtml(key)}')" class="focusable group min-w-[140px] w-[140px] sm:min-w-[170px] sm:w-[170px] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 snap-start"><div class="relative aspect-[2/3] overflow-hidden"><img src="${poster}" alt="Poster ${clean}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"><div class="absolute top-2 left-2 bg-brand-500 text-white text-[9px] font-bold px-2 py-1 rounded-md">BARU</div></div><div class="p-2.5"><h3 class="text-[10px] sm:text-xs font-bold text-white truncate">${clean}</h3><div class="flex justify-between mt-1 text-[9px] text-zinc-500"><span>${escapeHtml(String(item.year||''))}</span><span>★ ${Number(item.rating||0).toFixed(1)}</span></div></div></a>`;
        }).join('');
    };
    function installPhase1() {
        renderContinueWatching(); renderRecentlyAdded();
        if (typeof window.openDetailPage === 'function' && !window.__phase1OpenDetailWrapped) {
            const originalOpenDetailPage = window.openDetailPage;
            window.openDetailPage = async function(item) { rememberContinue(item); return originalOpenDetailPage.apply(this, arguments); };
            window.__phase1OpenDetailWrapped = true;
        }
        if (typeof window.renderAllSections === 'function' && !window.__phase1RenderWrapped) {
            const originalRenderAll = window.renderAllSections;
            window.renderAllSections = function() { const result = originalRenderAll.apply(this, arguments); renderContinueWatching(); renderRecentlyAdded(); return result; };
            window.__phase1RenderWrapped = true;
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPhase1); else installPhase1();
    window.addEventListener('load', () => setTimeout(() => { renderContinueWatching(); renderRecentlyAdded(); }, 800));
})();
