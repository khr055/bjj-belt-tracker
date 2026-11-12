// Service worker body. The build prepends CACHE_NAME and PRECACHE_URLS (see service-worker.ts),
// so every deploy gets its own cache holding exactly the files that deploy shipped.
//
// The whole app is served cache-first, which makes it open instantly and work with no signal.
// A new deploy is picked up in the background and shown the next time the app is opened.

const CACHE_PREFIX = 'belt-tracker-';
const RANK_FILES = '/ranks/';

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
  // The icons and manifest for the current rank are not precached (there is a set per rank), so
  // a copy is kept the first time each is fetched. They then work offline like everything else.
  const keep = request.mode !== 'navigate' && new URL(request.url).pathname.startsWith(RANK_FILES);
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      // The precache is keyed by URL alone; a `Vary` header from the host must not cause misses.
      cache.match(key, { ignoreVary: true }).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (keep && response.ok) event.waitUntil(cache.put(request, response.clone()));
            return response;
          }),
      ),
    ),
  );
});
