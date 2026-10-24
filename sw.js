/* Kanthasth service worker.
   Bump VERSION whenever you ship new files, so old caches are dropped. */
const VERSION = 'v2';
const CACHE = 'kanthasth-' + VERSION;

const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'data/polity.json',
  'manifest.json',
  'images/fundamental-rights.svg',
  'images/union-executive.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kanthasth-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pages and question data: network first, so content updates show up at once; cache when offline.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }
}

// CSS, JS, icons: serve from cache instantly, refresh in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
