/* Lintel OS service worker — same-origin.
   - APP SHELL ("/" and "/index.html"): stale-while-revalidate. The cached shell opens
     instantly (no 600 KB download before first paint); a fresh copy is fetched in the
     background ({cache:'reload'}) and stored for the next open. Deploys still land fast:
     every deploy bumps CACHE, the page re-checks sw.js on load, the new worker
     skipWaiting()s, purges old caches and claims the page, and the page reloads once
     (controllerchange) straight onto the new build.
   - Everything else same-origin (quote.html, journey.html, icons…): network-first with
     an offline fallback, document requests bypass the HTTP cache.
   - Cross-origin requests (Supabase API, CDNs) are never intercepted or cached.
   - Only successful (res.ok) responses are cached. */
const CACHE = "lintel-os-shell-v71";

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
  const isShell = isDoc && (url.pathname === "/" || url.pathname === "/index.html");

  if (isShell) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match("/index.html");
      const refresh = fetch(new Request("/index.html", { cache: "reload" }))
        .then(res => { if (res && res.ok) cache.put("/index.html", res.clone()); return res; });
      if (cached) { e.waitUntil(refresh.catch(() => {})); return cached; }
      try { return await refresh; } catch (_) { return Response.error(); }
    })());
    return;
  }

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
