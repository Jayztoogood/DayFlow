const SHELL_CACHE = "dayflow-shell-v1";
const ASSET_CACHE = "dayflow-assets-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon/192", "/icon/512", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("dayflow-") && ![SHELL_CACHE, ASSET_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) void caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match("/offline.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        void caches.open(ASSET_CACHE).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })),
  );
});
