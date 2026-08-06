// Offline shell. The app already makes no network requests at runtime — all
// state is local — so caching the source files is enough to make it work fully
// offline and installable to a home screen.
//
// Bump CACHE when shipping: the old cache is dropped on activate.

const CACHE = 'practice-coach-v2';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/store.js',
  './src/engine/dates.js',
  './src/engine/genres.js',
  './src/engine/curve.js',
  './src/engine/model.js',
  './src/engine/methods.js',
  './src/engine/scheduler.js',
  './src/engine/diagnostic.js',
  './src/engine/card.js',
  './src/ui/dom.js',
  './src/ui/hues.js',
  './src/ui/app.js',
  './src/ui/views/today.js',
  './src/ui/views/log.js',
  './src/ui/views/upcoming.js',
  './src/ui/views/skills.js',
  './src/ui/views/onboarding.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // A single missing entry would reject addAll and leave the app
      // uninstallable, so failures are tolerated per file.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations go to the network first so a deployed update is picked up
  // promptly, falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Everything else: serve cached immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
