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

      const host = grid.parentNode;
      host.classList.add('relative');
      grid.dataset.carouselControls = '1';

      const wrap = document.createElement('div');
      wrap.className = 'absolute inset-y-0 left-0 right-0 z-20 pointer-events-none flex items-center justify-between px-1 sm:px-2';
      wrap.innerHTML = `
        <button type="button" class="new-carousel-prev pointer-events-auto w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/75 border border-zinc-600/90 text-white hover:bg-brand-600 hover:border-brand-500 active:scale-95 transition-all flex items-center justify-center text-2xl sm:text-3xl leading-none shadow-xl backdrop-blur-sm" aria-label="Geser ke kiri">‹</button>
        <button type="button" class="new-carousel-next pointer-events-auto w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/75 border border-zinc-600/90 text-white hover:bg-brand-600 hover:border-brand-500 active:scale-95 transition-all flex items-center justify-center text-2xl sm:text-3xl leading-none shadow-xl backdrop-blur-sm" aria-label="Geser ke kanan">›</button>`;
      host.appendChild(wrap);

      const prev = wrap.querySelector('.new-carousel-prev');
      const next = wrap.querySelector('.new-carousel-next');
      const step = () => Math.max(220, Math.round(grid.clientWidth * 0.72));

      prev.addEventListener('click', () => grid.scrollBy({ left: -step(), behavior: 'smooth' }));
      next.addEventListener('click', () => grid.scrollBy({ left: step(), behavior: 'smooth' }));

      const updateVisibility = () => {
        const max = Math.max(0, grid.scrollWidth - grid.clientWidth - 2);
        const current = grid.scrollLeft;
        prev.style.opacity = current <= 4 ? '0.35' : '1';
        next.style.opacity = current >= max ? '0.35' : '1';
      };

      grid.addEventListener('scroll', updateVisibility, { passive: true });
      window.addEventListener('resize', updateVisibility, { passive: true });
      setTimeout(updateVisibility, 50);
      setTimeout(updateVisibility, 500);
    });
  }

  function boot() {
    addControls();
    [800, 1800, 3500, 6000].forEach(ms => setTimeout(addControls, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
