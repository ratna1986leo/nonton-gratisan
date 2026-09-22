/* NontonGratisan Mature 18+ — non-explicit mature movies only. */
(() => {
  'use strict';
  const SECTION_ID = 'mature-18-section';
  const CAROUSEL_ID = 'mature-18-carousel';

  function injectMenu() {
    if (document.querySelector('[data-mature-menu]')) return;
    const desktop = document.querySelector('#desktop-dropdown .dropdown-menu');
    if (desktop) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.matureMenu = '1';
      btn.textContent = '🔞 Film 18+ / Mature';
      btn.onclick = openMature;
      const firstSeries = Array.from(desktop.children).find(el => el.textContent?.trim() === 'Series');
      if (firstSeries) desktop.insertBefore(btn, firstSeries);
      else desktop.appendChild(btn);
    }
    const mobile = document.getElementById('mobile-menu');
    if (mobile && !mobile.querySelector('[data-mature-menu]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.matureMenu = '1';
      btn.className = 'focusable w-full text-left px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200';
      btn.textContent = '🔞 Film 18+ / Mature';
      btn.onclick = () => { openMature(); mobile.classList.add('hidden'); };
      mobile.insertBefore(btn, mobile.firstChild);
    }
  }

  function ensureSection() {
    if (document.getElementById(SECTION_ID)) return document.getElementById(SECTION_ID);
    const main = document.getElementById('main-content');
    if (!main) return null;
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.className = 'space-y-3 sm:space-y-4 fade-in';
    section.innerHTML = `<div class="flex items-center justify-between"><h2 class="text-base sm:text-xl font-bold text-white flex items-center gap-2"><span class="text-brand-500">🔞</span> Film 18+ / Mature</h2><div class="flex items-center gap-1"><button type="button" class="focusable p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" aria-label="Scroll Film 18+ ke kiri" onclick="document.getElementById('${CAROUSEL_ID}')?.scrollBy({left:-320,behavior:'smooth'})">◀</button><button type="button" class="focusable p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" aria-label="Scroll Film 18+ ke kanan" onclick="document.getElementById('${CAROUSEL_ID}')?.scrollBy({left:320,behavior:'smooth'})">▶</button></div></div><p class="text-[10px] sm:text-xs text-zinc-500">Konten dewasa 18+ non-eksplisit berdasarkan klasifikasi usia.</p><div id="${CAROUSEL_ID}" class="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar py-1 sm:py-2 scroll-smooth snap-x snap-mandatory"><div class="p-4 text-xs text-zinc-500">Memuat film...</div></div>`;
    const target = document.getElementById('thriller-section') || document.getElementById('movies-section');
    if (target?.parentNode) target.parentNode.insertBefore(section, target.nextSibling);
    else main.appendChild(section);
    return section;
  }

  async function loadMature() {
    const section = ensureSection();
    const carousel = document.getElementById(CAROUSEL_ID);
    if (!section || !carousel) return;
    section.classList.remove('hidden');
    try {
      const url = '/api/tmdb?path=%2F3%2Fdiscover%2Fmovie&language=id-ID&sort_by=popularity.desc&include_adult=false&certification_country=US&certification.gte=R&certification.lte=NC-17&vote_count.gte=10';
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = (data.results || []).map(item => {
        if (typeof normalizeTMDBItem === 'function') return normalizeTMDBItem({...item, media_type:'movie'});
        return null;
      }).filter(Boolean);
      carousel.innerHTML = items.length ? items.map(item => typeof createCardHTML === 'function' ? createCardHTML(item) : '').join('') : '<div class="p-4 text-xs text-zinc-500">Belum ada film 18+ yang tersedia.</div>';
    } catch (err) {
      console.warn('Mature genre gagal dimuat:', err);
      carousel.innerHTML = '<div class="p-4 text-xs text-zinc-500">Katalog Film 18+ sedang tidak tersedia.</div>';
    }
  }

  function openMature() {
    const section = ensureSection();
    document.querySelectorAll('#main-content > *').forEach(s => s.classList.add('hidden'));
    section?.classList.remove('hidden');
    window.history.pushState({}, '', '/collection/film-dewasa');
    const crumb = document.getElementById('breadcrumb-current');
    if (crumb) crumb.textContent = 'Film 18+ / Mature';
    loadMature();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  window.openMatureMovies = openMature;
  function boot() { injectMenu(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
