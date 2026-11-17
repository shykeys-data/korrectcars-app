/* Korrect Cars service worker (build __BUILD__). Kept small and careful:
   - Code, fonts: from the cache first (their addresses change with every build, so they never go stale).
   - Photos: from the cache first, at most 120 kept.
   - Public pages (home, cars, guides, seller pages...): always from the network first, so prices and status are
     current; the last 30 opened are kept so they still open with no connection. Otherwise an offline page.
   - Never touched: /api, sign-in, account, dealer and staff pages, and anything that is not a GET. */
const V = '__BUILD__';
const STATIC = 'kc-static-' + V;
const IMG = 'kc-img';
const PAGES = 'kc-pages';
const OFFLINE = '/offline.html';
const PUBLIC_PAGE = /^\/($|cars(\/|$)|blog(\/|$)|dealers\/(?!join|invite)[a-z0-9-]+$|pay-small-small$|swap$|vin-check$|car-market-today$|faqs$|contact$|about-us$|how-we-check-sellers$|privacy-policy$|terms-and-conditions$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, '/img/icons/icon-192.png'].map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kc-static-') && k !== STATIC).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page asks for this after a sign-out, so a shared phone never shows the last person's pages offline
self.addEventListener('message', (e) => { if (e.data === 'kc-clear-pages') e.waitUntil(caches.delete(PAGES)); });

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, name, max) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(name).then((c) => c.put(req, copy)).then(() => (max ? trim(name, max) : null)).catch(() => {});
  }
  return res;
}

// A phone on a weak signal often drops one request and gets the next, so try a page twice before going offline
async function fetchTwice(req) {
  try { return await fetch(req); } catch (err) {
    await new Promise((r) => setTimeout(r, 1500));
    return fetch(req);
  }
}

async function page(req, url) {
  try {
    const res = await fetchTwice(req);
    if (res.ok && res.type === 'basic' && PUBLIC_PAGE.test(url.pathname)) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(url.pathname + url.search, copy)).then(() => trim(PAGES, 30)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = (await caches.match(url.pathname + url.search, { cacheName: PAGES })) || (await caches.match(url.pathname, { cacheName: PAGES }));
    return hit || (await caches.match(OFFLINE)) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { e.respondWith(page(req, url)); return; }
  if (/^\/(assets|fonts)\//.test(url.pathname)) { e.respondWith(cacheFirst(req, STATIC)); return; }
  if (/^\/(img|uploads|r)\//.test(url.pathname)) { e.respondWith(cacheFirst(req, IMG, 120)); }
});
