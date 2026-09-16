/* NontonGratisan Phase 4 SEO cleanup — runtime metadata only. */
(() => {
  'use strict';

  function setMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.name = name;
      document.head.appendChild(el);
    }
    el.content = content;
  }

  function clean() {
    setMeta(
      'keywords',
      'nonton film gratis, streaming film sub indo, film terbaru, film bioskop, drakor sub indo, series sub indo, anime sub indo, film 18 plus mature'
    );

    document.querySelectorAll('meta[name="keywords"]').forEach((el, index) => {
      if (index > 0) el.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clean, { once: true });
  } else {
    clean();
  }
})();
