const CACHE = 'kls-platform-26-2';
const APP_SHELL = [
  '/', '/index.html', '/offline.html', '/styles.css?v=26.2', '/app.js?v=26.2', '/manifest.json',
  '/driver.html', '/driver.css?v=26.2', '/driver.js?v=26.2',
  '/icons/favicon-32.png?v=26.2', '/icons/apple-touch-icon.png?v=26.2', '/icons/icon-192.png?v=26.2',
  '/icons/icon-512.png?v=26.2', '/icons/icon-maskable-512.png?v=26.2'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/offline.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Network first prevents old JavaScript/CSS from hiding newly deployed modules.
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
