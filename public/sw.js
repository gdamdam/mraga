const VERSION = "0.1.2";
const CACHE = `mraga-v${VERSION}`;

self.addEventListener("install", (e) => {
  // Precache the shell — the navigate fallback below can only serve
  // index.html offline if something actually put it in the cache.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["./", "./index.html"]))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network-first; refresh the cached shell on success so the offline
    // fallback tracks the latest deploy within a cache version.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  if (url.pathname.includes("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
      ),
    );
  }
});
