// Service worker body. The build prepends CACHE_NAME and PRECACHE_URLS (see service-worker.ts),
// so every deploy gets its own cache holding exactly the files that deploy shipped.
//
// The whole app is served cache-first, which makes it open instantly and work with no signal.
// A new deploy is picked up in the background and shown the next time the app is opened.

const CACHE_PREFIX = 'belt-tracker-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // `reload` skips the browser's HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Every page load gets the app shell; everything else is looked up by its own URL.
  const key = request.mode === 'navigate' ? '/' : request;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      // The precache is keyed by URL alone; a `Vary` header from the host must not cause misses.
      .then((cache) => cache.match(key, { ignoreVary: true }))
      .then((cached) => cached ?? fetch(request)),
  );
});
