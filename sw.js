/* Lintel OS service worker — same-origin, network-first app shell.
   Replaces the old blob-URL SW that never registered and served stale code.
   - Network-first so an online user ALWAYS gets the freshly deployed app.
   - Document requests bypass the HTTP cache ({cache:'reload'}) — kills post-deploy staleness.
   - Cross-origin requests (Supabase API, CDNs) are never intercepted or cached — no data in Cache Storage.
   - Only successful (res.ok) responses are cached; cache is an offline fallback only.
   - Old caches are purged on activate. skipWaiting + clients.claim so a new version
     takes over immediately (the page reloads once via controllerchange). */
const CACHE = "lintel-os-shell-v7";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // never touch Supabase / cross-origin — no API data cached
  const isDoc = req.mode === "navigate" || req.destination === "document";
  e.respondWith((async () => {
    try {
      const res = await fetch(isDoc ? new Request(req, { cache: "reload" }) : req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
