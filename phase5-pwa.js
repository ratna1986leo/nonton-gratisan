/* NontonGratisan Phase 5 — PWA/app-like mobile UX, additive only. */
(() => {
  'use strict';

  function addManifest() {
    if (!document.querySelector('link[data-phase5-manifest]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      link.dataset.phase5Manifest = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      const meta = document.createElement('meta');
      meta.name = 'mobile-web-app-capable';
      meta.content = 'yes';
      document.head.appendChild(meta);
    }
  }

  function addSplash() {
    if (document.getElementById('phase5-splash')) return;
    const splash = document.createElement('div');
    splash.id = 'phase5-splash';
    splash.innerHTML = `
      <div style="text-align:center">
        <img src="/favicon.svg" alt="NontonGratisan" style="width:72px;height:72px;margin:0 auto 14px">
        <div style="font-weight:800;font-size:18px;color:#fff">NontonGratisan</div>
        <div style="margin-top:8px;width:42px;height:4px;border-radius:999px;background:#27272a;overflow:hidden;margin-left:auto;margin-right:auto">
          <div style="width:55%;height:100%;background:#2563eb;border-radius:999px;animation:phase5load 1s ease-in-out infinite"></div>
        </div>
      </div>`;
    splash.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#09090b;transition:opacity .25s ease';
    const style = document.createElement('style');
    style.textContent = '@keyframes phase5load{0%{transform:translateX(-120%)}100%{transform:translateX(240%)}}';
    document.head.appendChild(style);
    document.body.appendChild(splash);
    window.setTimeout(() => {
      splash.style.opacity = '0';
      window.setTimeout(() => splash.remove(), 280);
    }, 700);
  }

  function addInstallPrompt() {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferred = event;
      if (document.getElementById('phase5-install')) return;
      const btn = document.createElement('button');
      btn.id = 'phase5-install';
      btn.type = 'button';
      btn.textContent = '➕ Pasang Aplikasi';
      btn.className = 'fixed left-4 bottom-24 z-40 px-4 py-2 rounded-full bg-brand-600 text-white text-xs font-bold shadow-xl border border-brand-400/40';
      btn.addEventListener('click', async () => {
        if (!deferred) return;
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) {}
        deferred = null;
        btn.remove();
      });
      document.body.appendChild(btn);
    });
    window.addEventListener('appinstalled', () => document.getElementById('phase5-install')?.remove());
  }

  function addSkeleton() {
    if (document.getElementById('phase5-skeleton')) return;
    const host = document.querySelector('main') || document.body;
    const sk = document.createElement('div');
    sk.id = 'phase5-skeleton';
    sk.setAttribute('aria-hidden', 'true');
    sk.innerHTML = `<div class="phase5-sk-row"><i></i><i></i><i></i><i></i><i></i></div>`;
    const style = document.createElement('style');
    style.textContent = `.phase5-sk-row{display:flex;gap:12px;padding:12px 0;overflow:hidden}.phase5-sk-row i{flex:0 0 112px;height:168px;border-radius:12px;background:linear-gradient(90deg,#18181b 25%,#27272a 37%,#18181b 63%);background-size:400% 100%;animation:phase5shimmer 1.25s ease-in-out infinite}@keyframes phase5shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`;
    document.head.appendChild(style);
    host.prepend(sk);
    window.setTimeout(() => sk.remove(), 1800);
  }

  function addBottomNav() {
    if (document.getElementById('phase5-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'phase5-bottom-nav';
    nav.setAttribute('aria-label', 'Navigasi utama mobile');
    nav.className = 'fixed bottom-0 inset-x-0 z-50 md:hidden bg-zinc-950/95 border-t border-zinc-800/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]';
    nav.innerHTML = `
      <div class="grid grid-cols-4 h-16">
        <button type="button" data-p5="home" class="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white text-[10px]">⌂<span>Home</span></button>
        <button type="button" data-p5="search" class="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white text-[10px]">⌕<span>Cari</span></button>
        <button type="button" data-p5="watchlist" class="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white text-[10px]">♡<span>Watchlist</span></button>
        <button type="button" data-p5="history" class="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white text-[10px]">◷<span>Riwayat</span></button>
      </div>`;
    document.body.appendChild(nav);
    nav.querySelectorAll('[data-p5]').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.p5;
      try {
        if (target === 'home' && typeof navigateTo === 'function') navigateTo('home');
        else if (target === 'search') document.querySelector('#search-input, input[type="search"]')?.focus();
        else if (target === 'watchlist' && typeof navigateTo === 'function') navigateTo('watchlist');
        else if (target === 'history') document.getElementById('watch-history-section')?.scrollIntoView({ behavior: 'smooth' });
      } catch (_) {}
    }));
    document.body.style.paddingBottom = 'calc(4.5rem + env(safe-area-inset-bottom))';
  }

  // Step 8 diagnostic: disable PWA Service Worker completely.
  // Existing registrations/caches are removed so an older worker cannot keep
  // intercepting navigation while we isolate the redirect source.
  async function disableSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (_) {}
  }

  function boot() {
    addManifest();
    addSplash();
    addInstallPrompt();
    addSkeleton();
    addBottomNav();
    disableSW();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();