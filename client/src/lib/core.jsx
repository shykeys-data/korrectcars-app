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
export { hasPrice, priceText, priced } from '../../../server/lib/price.js'; // "Call for price" cars have price 0
export const short = (n) => { n = Number(n) || 0; return n >= 1e6 ? '₦' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'm' : naira(n); };
export const date = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? '' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const firstPhoto = (c) => (c && c.photos && c.photos[0]) || '/img/hero.jpg';

// ---------- Pay Small Small ----------
// Longest plan for a car: brand-new cars up to bnpl.maxMonths (4 years), used cars (tokunbo, Nigerian used, or no
// condition given) up to bnpl.usedMaxMonths (2 years), as our credit partners allow. Same rule as the server's bnplPlan.
export const isNewCar = (condition) => /^\s*(brand[\s-]*)?new\s*$/i.test(String(condition || ''));
export function bnplMax(cfg, condition) {
  const b = (cfg && cfg.bnpl) || { maxMonths: 48, usedMaxMonths: 24 };
  return isNewCar(condition) ? b.maxMonths : Math.min(b.maxMonths, b.usedMaxMonths || b.maxMonths);
}
export function bnpl(price, depositPct, months, cfg, condition) {
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48, usedMaxMonths: 24 };
  const pct = Math.max(b.minDeposit, Math.min(100, depositPct));
  const deposit = Math.ceil(price * pct / 100);
  const balance = Math.max(0, price - deposit);
  const charge = Math.round(balance * b.markup / 100);
  const repay = balance + charge;
  const m = Math.max(b.minMonths, Math.min(bnplMax(cfg, condition), months));
  const total = deposit + repay; // everything the buyer pays: deposit plus all the monthly payments
  return { deposit, balance, charge, repay, months: m, monthly: Math.ceil(repay / m), pct, total, extra: Math.max(0, total - price) };
}
// The headline estimate shown on car cards, car pages and in search results: minimum deposit over 24 months
// (the server's render.js and llms.txt use the same rule through bnplPlan, so every page shows the same figure)
export const bnplFrom = (price, cfg) => bnpl(price, 0, 24, cfg);

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
    api('/config').then(setCfg).catch(() => setCfg({ whatsapp: '2348063135732', phones: ['+234 806 313 5732'], email: 'info@korrectcars.com', bnpl: { usedMaxMonths: 24, minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 }, swapFeePct: 2, hours: 'Mon–Sat, 8am – 6pm', instagram: 'korrectcarsofficial' }));
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

// Marketplace (Nov 2026): buyers contact the dealer selling the car. Korrect Cars' own numbers are only in the
// footer (id="footer-contact"); ContactUs buttons scroll there.
// WhatsApp needs the international form: 08161562017 -> 2348161562017 (a number saved before Nov 2026 may be local)
const digits = (n) => { const d = String(n || '').replace(/[^0-9]/g, ''); return /^0[789]\d{9}$/.test(d) ? '234' + d.slice(1) : d; };
export const sellerWa = (car, cfg, text) => (car && digits(car.seller_whatsapp || car.seller_phone)
  ? `https://wa.me/${digits(car.seller_whatsapp || car.seller_phone)}?text=${encodeURIComponent(text || '')}`
  // A partner's car in a list: the number is looked up when tapped (lists carry only Korrect Cars' number)
  : car && car.seller_contact && car.slug ? `/api/wa/${encodeURIComponent(car.slug)}?text=${encodeURIComponent(text || '')}` : waLink(cfg, text));
export const sellerPhone = (car, cfg) => (car && (car.seller_phone || car.seller_whatsapp)) || ((cfg && cfg.phones) || [])[0] || '';
export const sellerName = (car) => (car && car.seller) || 'the seller';
export function ContactUs({ className = 'btn btn-line', style, children = 'Contact Korrect Cars' }) {
  const go = (e) => {
    e.preventDefault();
    const el = document.getElementById('footer-contact') || document.getElementById('footer');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800);
  };
  return <a href="#footer-contact" className={className} style={style} onClick={go}>{children}</a>;
}
export const waLink = (cfg, text) => `https://wa.me/${(cfg && cfg.whatsapp) || '2348063135732'}?text=${encodeURIComponent(text || 'Hello Korrect Cars')}`;

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Saved cars and the compare list live in this browser; saved cars also sync to the account
const readLocal = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_e) { return []; } };
function writeLocal(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch (_e) { /* private mode */ } window.dispatchEvent(new Event('kc-local')); }
// Recently viewed cars (Nov 2026): newest first, kept in this browser only (no account, nothing sent to the server)
export function rememberViewed(id) {
  const n = Number(id); if (!n) return;
  writeLocal('kc-viewed', [n, ...readLocal('kc-viewed').filter((x) => Number(x) !== n)].slice(0, 12));
}
// Google Analytics event, only when the visitor accepted analytics (gtag is loaded after consent)
// Fire-and-forget count to our own server (buyer insights): never delays a tap or breaks the page.
// keepalive lets it finish even when the tap opens WhatsApp or leaves the page.
export const beacon = (path, body) => { try { fetch('/api' + path, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'X-Requested-With': 'korrect', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {}); } catch (_e) { /* ignore */ } };
// A WhatsApp tap on a car: counted on our server (per car, per place) and sent to Google Analytics
export const waTap = (car, place) => { if (!car || !car.id) return; beacon(`/cars/${car.id}/wa`, { place }); track('whatsapp_click', { place, car: car.slug }); };
export const track = (name, params) => { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (_e) { /* never break the page */ } };
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
const RS = /^\/(?:uploads\/(cars|blog|swap|site|logos)|(img))\/([A-Za-z0-9._-]+)\.(?:jpe?g|png|webp)$/i;
export function rs(url, w) {
  const m = String(url || '').match(RS);
  return m ? `/r/${w}/${m[1] || m[2]}/${m[3]}.webp` : url;
}
export const srcset = (url, widths = [400, 600, 800]) => (RS.test(String(url || '')) ? widths.map((w) => `${rs(url, w)} ${w}w`).join(', ') : undefined);
