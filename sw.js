const CACHE = 'kls-v27-1';
const APP_SHELL = [
  '/', '/index.html', '/offline.html', '/styles.css', '/app.js', '/manifest.json',
  '/driver.html', '/driver.css', '/driver.js',
  '/icons/favicon-32.png', '/icons/apple-touch-icon.png', '/icons/icon-192.png',
  '/icons/icon-512.png', '/icons/icon-maskable-512.png'
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
    const networkFirst = ['/config.js', '/app.js', '/driver.js', '/styles.css', '/driver.css'].includes(url.pathname);
    if (networkFirst) {
      event.respondWith(
        fetch(request).then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => caches.match(request))
      );
      return;
    }
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});
