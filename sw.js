/* Dhandha — offline service worker
   App shell cache karta hai. Content 100% on-device generate hota hai,
   isliye internet ke bina bhi poora app chalta hai. */

const CACHE = 'dhandha-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/engine.js',
  './js/visual.js',
  './js/store.js',
  './js/audio.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request)
        .then(res => {
          // same-origin GET responses ko cache kar lo
          if (res && res.status === 200 && new URL(e.request.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
