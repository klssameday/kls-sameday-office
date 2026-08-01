const CACHE = 'kls-v35-4-7';
const APP_SHELL = [
  '/', '/index.html', '/offline.html', '/styles.css', '/public-quote.css', '/app.js', '/manifest.json',
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

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch (_error) { payload = { body:event.data?.text() || '' }; }
  const jobId = payload.job_id || '';
  event.waitUntil(self.registration.showNotification(payload.title || 'New KLS job assigned', {
    body: payload.body || 'Open the KLS Driver App to view your new job.',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: jobId ? `kls-job-${jobId}` : 'kls-new-job',
    renotify: true,
    data: { url: payload.url || `/driver.html${jobId ? `?job=${encodeURIComponent(jobId)}` : ''}` }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/driver.html', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(clients => {
    const client = clients.find(item => item.url.startsWith(self.location.origin));
    if (client) { client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
