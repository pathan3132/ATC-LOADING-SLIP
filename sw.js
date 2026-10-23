// ATC Loading Slip – Service Worker
// Naya version deploy karne par: sirf CACHE_NAME ka number badha do (v10 -> v11 ...).
// Users ko "Update Karein" button dikhega; button dabate hi naya version chalu ho jaata hai.
const CACHE_NAME = 'atc-app-v10';
const OLD_AUTO_VERSIONS = ['atc-app-v7', 'atc-app-v8', 'atc-app-v9']; // button se pehle wale versions
const urlsToCache = [
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './Images/ATC_Logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Koi file missing ho to bhi install fail na ho
    await Promise.all(urlsToCache.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    // Sirf ek baar: purane (button-less) versions wale users ko seedha naya SW de do
    const keys = await caches.keys();
    if (keys.some(k => OLD_AUTO_VERSIONS.includes(k))) self.skipWaiting();
  })());
});

// Page jab "Update Karein" dabaye tab naya SW activate hoga
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: internet ho to hamesha naya, warna saved copy
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
