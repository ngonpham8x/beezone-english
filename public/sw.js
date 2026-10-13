// Service Worker for Trung Tâm Ngoại Ngữ BeeZone PWA
const CACHE_NAME = 'beezone-english-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/beezone-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Do not take over an open application immediately. A waiting update is
  // activated on the next launch so active forms/tabs are never interrupted.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith('beezone-english-') && cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Do not intercept Google avatars, Supabase, browser extensions, or other
  // cross-origin requests. Those requests must be handled by the browser so
  // the app CSP and the response type remain valid.
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  // Authenticated responses must never be cached or replaced by the app shell.
  if (requestUrl.pathname.startsWith('/api/')) return;

  // Network first, falling back to this app's cached shell only.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && requestUrl.pathname.startsWith('/assets/')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // Avoid storing OAuth callback query strings in the offline cache.
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      return new Response('Không có kết nối. Vui lòng thử lại khi trực tuyến.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
