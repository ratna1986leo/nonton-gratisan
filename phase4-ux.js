/* NontonGratisan Phase 4 UX — lightweight polish, additive only. */
(() => {
  'use strict';

  function addBackToTop() {
    if (document.getElementById('phase4-top-button')) return;
    const btn = document.createElement('button');
    btn.id = 'phase4-top-button';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Kembali ke atas');
    btn.textContent = '↑';
    btn.className = 'fixed bottom-20 right-4 z-40 w-11 h-11 rounded-full bg-brand-600/95 hover:bg-brand-500 text-white shadow-xl border border-brand-400/40 flex items-center justify-center text-lg font-bold opacity-0 pointer-events-none transition-all duration-200 backdrop-blur-sm';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);

    const update = () => {
      const visible = window.scrollY > Math.max(320, window.innerHeight * 0.7);
      btn.style.opacity = visible ? '1' : '0';
      btn.style.pointerEvents = visible ? 'auto' : 'none';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  function optimizeImages(root = document) {
    root.querySelectorAll('img').forEach(img => {
      if (!img.hasAttribute('decoding')) img.decoding = 'async';
      if (!img.hasAttribute('loading') && !img.closest('#hero-section, #detail-section')) img.loading = 'lazy';
    });
  }

  function loadSeoCleanup() {
    if (document.querySelector('script[data-phase4-seo]')) return;
    const s = document.createElement('script');
    s.src = '/phase4-seo.js?v=1';
    s.defer = true;
    s.dataset.phase4Seo = '1';
    document.head.appendChild(s);
  }

  function boot() {
    addBackToTop();
    optimizeImages();
    loadSeoCleanup();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) optimizeImages(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
