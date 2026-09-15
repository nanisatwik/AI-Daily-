/**
 * Offline support for The AI Daily.
 *
 * The point is the commute: an edition read on the train with no signal. The
 * paper changes once a day, so caching is simple — serve what was fetched
 * last, refresh it in the background when there is a connection.
 *
 * Deliberately small and hand-written. A generated service worker would be
 * larger than everything it caches.
 */

const VERSION = "ai-daily-v1";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;

/** Enough to open the paper cold with no network. */
const PRECACHE = ["/", "/search", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, so one 404 cannot fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Network first, falling back to cache — today's paper if reachable, last otherwise. */
async function freshest(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // A navigation with nothing cached still has to render something.
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw new Error("offline and uncached");
  }
}

/** Cache first — build assets are content-hashed, so they never go stale. */
async function immutable(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch other origins: fonts, and anything a reader clicks through to.
  if (url.origin !== self.location.origin) return;

  // Hashed build output and generated icons.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/")) {
    event.respondWith(immutable(request, SHELL));
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(freshest(request, PAGES));
  }
});
