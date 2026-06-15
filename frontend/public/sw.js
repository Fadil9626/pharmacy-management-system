// Remedy service worker — runtime caching so the app shell and assets load with
// no network (offline POS). API calls are never cached (always live or fail to
// the app's own offline queue). No build manifest needed: we cache same-origin
// GETs as they're fetched, and fall back to cache when the network is down.
const CACHE = "remedy-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     // leave cross-origin alone
  if (url.pathname.startsWith("/api/")) return;        // never cache the API

  // SPA navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put("/index.html", res.clone())); return res; })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets (hashed JS/CSS/img): cache-first, then network (and cache it).
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      }).catch(() => cached)
    )
  );
});
