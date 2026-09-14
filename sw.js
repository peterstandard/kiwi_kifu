const CACHE_NAME = 'kiwikifu-v1.4.7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './qrcode.min.js',
  './manifest.json',
  './js/main.js',
  './js/engine/constants.js',
  './js/engine/sgf.js',
  './js/engine/game.js',
  './js/audio/sound.js',
  './js/board/renderer.js',
  './js/board/gestures.js',
  './js/services/storage.js',
  './js/services/wakelock.js',
  './js/services/share.js',
  './js/services/dimmer.js',
  './js/services/goscorer.js',
  './kiwi_kifu_square.png',
  './kiwi_kifu_stones.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-first for HTML pages so changes to layout appear immediately
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => cached || fetch(e.request))
  );
});
