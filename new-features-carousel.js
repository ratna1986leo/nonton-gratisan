/* NontonGratisan New Features Carousel Controls — additive only. */
(() => {
  'use strict';
  const CAROUSELS = [
    'continue-watching-carousel',
    'recently-added-carousel',
    'watch-history-carousel',
    'phase3-recommendation-carousel'
  ];

  function addControls() {
    CAROUSELS.forEach(id => {
      const grid = document.getElementById(id);
      if (!grid || grid.dataset.carouselControls === '1' || !grid.parentNode) return;
      grid.dataset.carouselControls = '1';
      grid.classList.add('relative');

      const wrap = document.createElement('div');
      wrap.className = 'flex justify-end gap-2 mb-1';
      wrap.innerHTML = `
        <button type="button" class="new-carousel-prev w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-800/95 border border-zinc-700 text-white hover:bg-brand-600 transition flex items-center justify-center shadow-lg" aria-label="Geser ke kiri">‹</button>
        <button type="button" class="new-carousel-next w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-800/95 border border-zinc-700 text-white hover:bg-brand-600 transition flex items-center justify-center shadow-lg" aria-label="Geser ke kanan">›</button>`;
      grid.parentNode.insertBefore(wrap, grid);

      const prev = wrap.querySelector('.new-carousel-prev');
      const next = wrap.querySelector('.new-carousel-next');
      const step = () => Math.max(220, Math.round(grid.clientWidth * 0.72));
      prev.addEventListener('click', () => grid.scrollBy({ left: -step(), behavior: 'smooth' }));
      next.addEventListener('click', () => grid.scrollBy({ left: step(), behavior: 'smooth' }));
    });
  }

  function boot() {
    addControls();
    [800, 1800, 3500, 6000].forEach(ms => setTimeout(addControls, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
