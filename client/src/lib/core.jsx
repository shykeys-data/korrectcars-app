// Shared helpers used by every page: the embedded page data (booted), api() for API calls (adds the CSRF header),
// useApi(), the small router (Link, useRouter), app-wide state (useApp), naira formatting, photo sizes (rs, srcset)
// and WhatsApp links.
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

// ---------- Data embedded in the page by the server ----------
// Each page arrives with the data it needs, so it shows straight away and still works when
// extra background requests are slow or blocked.
let BOOT = {};
try { const el = document.getElementById('__boot'); if (el) BOOT = JSON.parse(el.textContent || '{}'); } catch (_e) { BOOT = {}; }
export const booted = (path) => (path && Object.prototype.hasOwnProperty.call(BOOT, path) ? BOOT[path] : undefined);
export const forgetBoot = (path) => { delete BOOT[path]; };

// ---------- API ----------
export async function api(path, { method = 'GET', body, form } = {}) {
  if (method === 'GET' && booted(path) !== undefined) return booted(path);
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'korrect' } };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opts); } catch (_e) {
    const e = new Error('We could not reach Korrect Cars. Check your connection and refresh the page, or chat with us on WhatsApp.'); e.status = 0; throw e;
  }
  let data = {};
  try { data = await res.json(); } catch (_e) { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; e.data = data; throw e; }
  return data;
}

export function useApi(path, deps = []) {
  const first = booted(path);
  const [state, set] = useState(first !== undefined ? { loading: false, data: first, error: null } : { loading: true, data: null, error: null });
  const load = useCallback((fresh) => {
    if (!path) return;
    if (fresh === true) forgetBoot(path);
    const b = booted(path);
    if (b !== undefined) { set({ loading: false, data: b, error: null }); return; }
    set((s) => ({ ...s, loading: true }));
    api(path).then((data) => set({ loading: false, data, error: null })).catch((error) => {
      // If a background request is blocked, load the page in full once: it arrives with its data built in
      const k = 'kc-reload:' + window.location.pathname + window.location.search;
      if (error.status === 0) { try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); window.location.reload(); return; } } catch (_e) { /* ignore */ } }
      set({ loading: false, data: null, error });
    });
  }, [path]);
  useEffect(load, [load, ...deps]);
  return { ...state, reload: () => load(true) };
}

// ---------- Formatting ----------
export const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
export const short = (n) => { n = Number(n) || 0; return n >= 1e6 ? '₦' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'm' : naira(n); };
export const date = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? '' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const firstPhoto = (c) => (c && c.photos && c.photos[0]) || '/img/hero.jpg';

// ---------- Pay Small Small ----------
export function bnpl(price, depositPct, months, cfg) {
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 };
  const pct = Math.max(b.minDeposit, Math.min(100, depositPct));
  const deposit = Math.ceil(price * pct / 100);
  const balance = Math.max(0, price - deposit);
  const charge = Math.round(balance * b.markup / 100);
  const repay = balance + charge;
  const m = Math.max(b.minMonths, Math.min(b.maxMonths, months));
  return { deposit, balance, charge, repay, months: m, monthly: Math.ceil(repay / m), pct };
}

// ---------- Router (history API) ----------
const RouterCtx = createContext({ path: '/', query: new URLSearchParams(), go: () => {} });
export function Router({ children }) {
  const [loc, setLoc] = useState({ path: window.location.pathname, search: window.location.search, hash: window.location.hash });
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search, hash: window.location.hash });
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  // New pages always open at the top: jump instantly (no smooth animation) right after the new page is drawn
  const toTop = useRef(false);
  const go = useCallback((to, { replace = false, keepScroll = false } = {}) => {
    const u = new URL(to, window.location.origin);
    if (u.origin !== window.location.origin) { window.location.href = to; return; }
    window.history[replace ? 'replaceState' : 'pushState']({}, '', u.pathname + u.search + u.hash);
    toTop.current = !u.hash && !keepScroll;
    setLoc({ path: u.pathname, search: u.search, hash: u.hash });
    setTimeout(() => { if (window.gtag) window.gtag('event', 'page_view', { page_location: window.location.href, page_title: document.title }); }, 300);
    if (u.hash) setTimeout(() => { const el = document.getElementById(u.hash.slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
  }, []);
  useLayoutEffect(() => {
    if (!toTop.current) return;
    toTop.current = false;
    const root = document.documentElement; const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prev;
  }, [loc]);
  const value = { path: loc.path.replace(/\/+$/, '') || '/', query: new URLSearchParams(loc.search), hash: loc.hash, go };
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}
export const useRouter = () => useContext(RouterCtx);

export function Link({ to, children, onClick, ...rest }) {
  const { go } = useRouter();
  return (
    <a href={to} {...rest} onClick={(e) => {
      if (onClick) onClick(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target) return;
      if (/^(https?:|mailto:|tel:)/.test(to)) return;
      e.preventDefault(); go(to);
    }}>{children}</a>
  );
}

export function match(pattern, path) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  const m = path.match(re); if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}

// ---------- App-wide state: settings, signed-in user, catalog ----------
const AppCtx = createContext(null);
export function AppProvider({ children }) {
  const [cfg, setCfg] = useState(booted('/config') || null);
  const [user, setUser] = useState(booted('/auth/me') ? booted('/auth/me').user : undefined);
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    api('/config').then(setCfg).catch(() => setCfg({ whatsapp: '2348138588818', phones: ['+234 809 139 7912', '+234 813 858 8818'], email: 'info@korrectcars.com', bnpl: { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 }, swapFeePct: 2, hours: 'Mon–Sat, 8am – 6pm', instagram: 'korrectcarsofficial' }));
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);
  const loadCatalog = useCallback(() => { if (!catalog) api('/catalog').then(setCatalog).catch(() => {}); }, [catalog]);
  // Saved cars follow the account: on sign-in, cars saved on this device are added to the
  // account and the account's list comes back to this device. On sign-out the device list is cleared.
  const wasIn = useRef(false);
  useEffect(() => {
    if (user) {
      wasIn.current = true;
      api('/me/saved', { method: 'PUT', body: { ids: readLocal('kc-saved') } }).then((d) => writeLocal('kc-saved', d.ids)).catch(() => {});
    } else if (user === null && wasIn.current) { wasIn.current = false; writeLocal('kc-saved', []); }
  }, [user && user.id]); // eslint-disable-line
  return <AppCtx.Provider value={{ cfg, user, setUser, catalog, loadCatalog }}>{children}</AppCtx.Provider>;
}
export const useApp = () => useContext(AppCtx);

export function useTitle(title, desc) {
  useEffect(() => {
    if (title) document.title = title;
    if (desc) { const m = document.querySelector('meta[name=description]'); if (m) m.setAttribute('content', desc); }
  }, [title, desc]);
}

export const waLink = (cfg, text) => `https://wa.me/${(cfg && cfg.whatsapp) || '2348138588818'}?text=${encodeURIComponent(text || 'Hello Korrect Cars')}`;

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Saved cars and the compare list live in this browser; saved cars also sync to the account
const readLocal = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_e) { return []; } };
function writeLocal(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch (_e) { /* private mode */ } window.dispatchEvent(new Event('kc-local')); }
export function useLocalList(key, max = 50) {
  const app = useContext(AppCtx);
  const synced = key === 'kc-saved' && app && app.user;
  const read = () => readLocal(key);
  const [list, setList] = useState(read);
  useEffect(() => {
    const on = (e) => { if (!e.key || e.key === key) setList(read()); };
    window.addEventListener('storage', on); window.addEventListener('kc-local', on);
    return () => { window.removeEventListener('storage', on); window.removeEventListener('kc-local', on); };
  }, [key]); // eslint-disable-line
  const save = (next) => { setList(next); writeLocal(key, next); };
  const toggle = (id) => {
    const on = list.includes(id);
    if (!on && list.length >= max) return;
    save(on ? list.filter((x) => x !== id) : [...list, id]);
    if (synced) api('/me/saved/' + id, { method: on ? 'DELETE' : 'POST' }).catch(() => {});
  };
  return { list, has: (id) => list.includes(id), toggle, clear: () => save([]), full: list.length >= max };
}

// Shrink a phone photo in the browser before upload (long side 2000px, JPEG). Faster on mobile data,
// and keeps every photo well under the server's size limit. Falls back to the original file.
export async function shrinkPhoto(file, max = 2000) {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (_e) { return file; }
}

// Light photos: a resized WebP copy of an uploaded photo, e.g. rs('/uploads/cars/x.jpg', 800) -> /r/800/cars/x.webp
const RS = /^\/(?:uploads\/(cars|blog|swap|site)|(img))\/([A-Za-z0-9._-]+)\.(?:jpe?g|png|webp)$/i;
export function rs(url, w) {
  const m = String(url || '').match(RS);
  return m ? `/r/${w}/${m[1] || m[2]}/${m[3]}.webp` : url;
}
export const srcset = (url, widths = [400, 800]) => (RS.test(String(url || '')) ? widths.map((w) => `${rs(url, w)} ${w}w`).join(', ') : undefined);
