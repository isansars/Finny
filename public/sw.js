// Finny's service worker (FINNY-150). Hand-written, no library. It keeps:
//  - built files (/_next/static, icons): cache first; they're named by content, so a new version never reuses an old one;
//  - pages and GET /api answers: network first; the last good answer is kept and served when there's no connection,
//    an API answer with the header x-finny-offline: <when it was fetched>.
// Nothing else is ever kept (no POST, PATCH, DELETE, sign-in, export). "clear" (sent on sign out) empties every cache.
const VERSION = "finny-sw-3"; // 3: pages kept per address with their filters (FINNY-205)
const STATIC = `${VERSION}-static`, PAGES = `${VERSION}-pages`, DATA = `${VERSION}-data`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k); // an old version's caches
    await self.clients.claim();
  })());
});
self.addEventListener("message", (e) => {
  if (e.data === "clear") e.waitUntil((async () => { for (const k of await caches.keys()) await caches.delete(k); e.source?.postMessage("cleared"); })());
});

const OFFLINE_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finny · offline</title>
<body style="font-family:system-ui,sans-serif;background:#fdf8fb;color:#2b1a38;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
<div><div style="font-size:40px">📶</div><h1 style="font-size:20px">This page needs a connection</h1><p style="color:#6f5f82">Finny hasn't kept a copy of it yet. Home and Quick add work offline.</p>
<p><a href="/" style="color:#be185d;font-weight:700">Go to Home</a></p></div></body></html>`;

const isStatic = (u) => u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/icons/") || u.pathname === "/manifest.webmanifest" || u.pathname === "/apple-icon.png" || u.pathname === "/icon.svg";
const skip = (u) => u.pathname.startsWith("/api/auth") || u.pathname === "/api/export" || u.pathname === "/api/transactions/csv" || u.pathname.startsWith("/api/qa") || u.pathname === "/sw.js";

self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== self.location.origin || skip(u)) return;
  if (isStatic(u)) return e.respondWith(cacheFirst(req));
  if (req.mode === "navigate") return e.respondWith(page(req));
  if (u.pathname.startsWith("/api/")) return e.respondWith(data(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

// FINNY-205: a page is kept under its whole address, filters included, so a filtered view is only ever served for that same
// filter (a copy made for another filter made React re-draw with error #418). A filter never opened online gets a plain page
// saying the view needs a connection, with a link to the same page without its filters when that one is kept.
const MAX_PAGES = 60;
const filterPage = (bare) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finny · offline</title>
<body style="font-family:system-ui,sans-serif;background:#fdf8fb;color:#2b1a38;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
<div><div style="font-size:40px">📶</div><h1 style="font-size:20px">This view needs a connection</h1><p style="color:#6f5f82">Finny hasn't kept this filter yet; it opens once you're back online.</p>
<p><a href="${bare}" style="color:#be185d;font-weight:700">Show the kept list without the filter</a></p></div></body></html>`;

async function page(req) {
  const u = new URL(req.url), bare = new URL(req.url); bare.search = "";
  try {
    const res = await fetch(req);
    // Only a real page: not a redirect to sign in, not an error.
    if (res.ok && !res.redirected) {
      const c = await caches.open(PAGES);
      await c.delete(u.href); await c.put(u.href, res.clone()); // re-added, so the newest is last
      const keys = await c.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await c.delete(k);
    }
    return res;
  } catch {
    const c = await caches.open(PAGES);
    const kept = await c.match(u.href);
    if (kept) return kept;
    const html = { status: 503, headers: { "content-type": "text/html; charset=utf-8" } };
    if (u.search && await c.match(bare.href)) return new Response(filterPage(bare.pathname), html);
    return new Response(OFFLINE_PAGE, html);
  }
}

async function data(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const body = await res.clone().arrayBuffer(), h = new Headers(res.headers);
      h.set("x-finny-saved-at", new Date().toISOString());
      (await caches.open(DATA)).put(req.url, new Response(body, { status: res.status, headers: h }));
    }
    return res;
  } catch {
    const kept = await (await caches.open(DATA)).match(req.url);
    if (!kept) return new Response(JSON.stringify({ error: "You're offline, and Finny hasn't kept this yet." }), { status: 503, headers: { "content-type": "application/json", "x-finny-offline": "none" } });
    const h = new Headers(kept.headers); h.set("x-finny-offline", kept.headers.get("x-finny-saved-at") ?? "");
    return new Response(await kept.arrayBuffer(), { status: 200, headers: h });
  }
}
