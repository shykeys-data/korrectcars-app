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

// Saved cars and compare list live in this browser until accounts take them over
export function useLocalList(key, max = 50) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_e) { return []; } };
  const [list, setList] = useState(read);
  useEffect(() => {
    const on = (e) => { if (!e.key || e.key === key) setList(read()); };
    window.addEventListener('storage', on); window.addEventListener('kc-local', on);
    return () => { window.removeEventListener('storage', on); window.removeEventListener('kc-local', on); };
  }, [key]); // eslint-disable-line
  const save = (next) => { setList(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch (_e) { /* private mode */ } window.dispatchEvent(new Event('kc-local')); };
  const toggle = (id) => save(list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]);
  return { list, has: (id) => list.includes(id), toggle, clear: () => save([]), full: list.length >= max };
}
