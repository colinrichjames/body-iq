/* Body IQ service worker: makes the app open without signal.
   - /_next/static files: cached after first use (they never change under the same name).
   - Pages: network first (4 s), then the last copy saved on this phone, then /offline.html.
   - Data requests, sign-in, exports and anything that is not a GET are never touched. */
const VERSION = "v1";
const STATIC = `bodyiq-static-${VERSION}`;
const PAGES = `bodyiq-pages-${VERSION}`;
const SHELL = ["/offline.html", "/icon.svg"];
const NEVER = ["/login", "/auth", "/export", "/undo", "/api"];
const WAIT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bodyiq-") && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const skip = (url) => NEVER.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

async function savePage(request, response) {
  if (!response.ok || response.redirected || response.type !== "basic") return;
  const cache = await caches.open(PAGES);
  await cache.put(request, response.clone());
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate" && !skip(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: PAGES });
        const network = fetch(request).then(async (res) => {
          await savePage(request, res);
          return res;
        });
        try {
          if (!cached) return await network;
          // Slow or no signal: show the saved copy rather than a blank wait.
          return await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), WAIT_MS))]);
        } catch {
          return cached || (await caches.match("/offline.html")) || Response.error();
        }
      })(),
    );
  }
});

/* Messages from the app:
   {type:"prepare", url}  save this page and its scripts now, so it reloads offline (used by the workout screen)
   {type:"clear"}         forget saved pages (on sign-out, so a shared phone keeps nothing) */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  } else if (msg.type === "prepare" && typeof msg.url === "string") {
    event.waitUntil(
      (async () => {
        const url = new URL(msg.url, self.location.origin);
        if (url.origin !== self.location.origin || skip(url)) return;
        const res = await fetch(url.href, { credentials: "same-origin", headers: { accept: "text/html" } });
        if (!res.ok || res.redirected) return;
        await (await caches.open(PAGES)).put(new Request(url.href), res.clone());
        const html = await res.text();
        const files = [...new Set(html.match(/\/_next\/static\/[^"'\\) ]+/g) ?? [])];
        const cache = await caches.open(STATIC);
        await Promise.all(files.map((f) => cache.match(f).then((hit) => hit || fetch(f).then((r) => (r.ok ? cache.put(f, r) : undefined)).catch(() => undefined))));
      })().catch(() => undefined),
    );
  }
});
