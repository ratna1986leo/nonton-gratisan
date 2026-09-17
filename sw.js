const CACHE = 'nontongratisan-pwa-v3';
const STATIC = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/phase1-ux.js',
  '/phase2-ux.js',
  '/phase3-ux.js',
  '/phase4-ux.js',
  '/new-features-carousel.js',
  '/mature-genre.js',
  '/phase4-seo.js',
  '/phase7-surprise.js',
  '/comments-enhancer.js'
];

const FRESH_MODULES = new Set([
  '/phase1-ux.js',
  '/phase2-ux.js',
  '/phase3-ux.js',
  '/phase4-ux.js',
  '/new-features-carousel.js',
  '/mature-genre.js',
  '/phase4-seo.js',
  '/phase7-surprise.js',
  '/comments-enhancer.js'
]);

async function injectCommentsEnhancer(response) {
  try {
    if (!response || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
    const html = await response.text();
    if (html.includes('/comments-enhancer.js')) {
      return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    const injected = html.replace(/<\/body>/i, '<script src="/comments-enhancer.js?v=1" defer></script></body>');
    return new Response(injected, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (_) {
    return response;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          const finalResponse = await injectCommentsEnhancer(response);
          const copy = finalResponse.clone();
          caches.open(CACHE).then(cache => cache.put('/', copy));
          return finalResponse;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (FRESH_MODULES.has(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
