// Installable site: registers the service worker (client/sw.js) and offers to add Korrect Cars to the home
// screen. Android and desktop Chrome get a one-tap Install button; iPhone gets the Share steps; other browsers
// get the menu steps. It opens two ways:
//  - on its own once a visitor is clearly interested: 3 minutes on the site, 3 pages this visit, or a return visit
//    on another day (after 20 seconds). At most once a visit, never over the cookie bar or the save-search card,
//    never on sign-in or account pages, quiet for 30 days after "Not now";
//  - any time from the "Get the app" links in the menu and footer (openInstall()).
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useRouter, track } from '../lib/core.jsx';

let deferred = null; // Chrome's install prompt, kept for when the visitor taps Install

// Once we know this phone has the app, we never offer it again: no card, no "Get the app" links
function markInstalled() {
  try { localStorage.setItem('kc-installed', '1'); } catch (_e) {}
  window.dispatchEvent(new Event('kc-install-state'));
}
const hasApp = () => { try { return localStorage.getItem('kc-installed') === '1'; } catch (_e) { return false; } };
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; track('app_installed'); markInstalled(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
}

const local = {
  get(k) { try { return localStorage.getItem(k); } catch (_e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_e) {} }
};
const DAY = 86400000;
const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);
const isIosSafari = () => isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios|gsa\//i.test(navigator.userAgent);

// Days on which this browser opened the site (the last 10), so we only ask people who came back
function countVisit() {
  const today = new Date().toISOString().slice(0, 10);
  let days = [];
  try { days = JSON.parse(local.get('kc-visit-days') || '[]'); } catch (_e) {}
  if (!Array.isArray(days)) days = [];
  if (!days.includes(today)) { days = [...days, today].slice(-10); local.set('kc-visit-days', JSON.stringify(days)); }
  return days.length;
}
// This visit's pages opened and seconds spent with the site on screen (kept for the tab's life)
const sess = {
  num(k) { try { return Number(sessionStorage.getItem(k) || 0); } catch (_e) { return 0; } },
  add(k, n) { try { sessionStorage.setItem(k, String(this.num(k) + n)); } catch (_e) {} }
};
const ENGAGED_SECS = 180;
const ENGAGED_PAGES = 3;
export const canInstallHere = () => typeof window !== 'undefined' && !standalone() && !hasApp();
// For the "Get the app" links: hides them as soon as we learn the app is on this phone
export function useCanInstall() {
  const [can, setCan] = useState(canInstallHere);
  useEffect(() => {
    const on = () => setCan(canInstallHere());
    window.addEventListener('kc-install-state', on);
    return () => window.removeEventListener('kc-install-state', on);
  }, []);
  return can;
}
export const openInstall = () => window.dispatchEvent(new Event('kc-install'));
const NO_ASK = /^\/(login|register|verify-email|forgot-password|reset-password|account|dealer($|\/)|dealers\/(join|invite))/;

export function InstallApp() {
  const { user } = useApp();
  const { path } = useRouter();
  const [mode, setMode] = useState(null); // 'button' | 'ios' | null
  const prevUser = useRef(user);
  const visits = useRef(0);

  useEffect(() => { sess.add('kc-pages', 1); }, [path]);

  // The "Get the app" links: always open, whatever the timing rules say
  useEffect(() => {
    const onAsk = () => {
      if (!canInstallHere()) return;
      const kind = deferred ? 'button' : isIos() ? 'ios' : 'manual';
      try { sessionStorage.setItem('kc-install-asked', '1'); } catch (_e) {}
      setMode(kind); track('install_link_click', { kind });
    };
    window.addEventListener('kc-install', onAsk);
    return () => window.removeEventListener('kc-install', onAsk);
  }, []);

  // After a sign-out, clear the pages kept for offline use (a shared phone should not show them)
  useEffect(() => {
    if (prevUser.current && user === null && navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('kc-clear-pages');
    prevUser.current = user;
  }, [user]);

  useEffect(() => {
    visits.current = countVisit();
    // Opened from the home-screen icon: this phone has the app (Android shares this storage with Chrome)
    if (standalone()) { markInstalled(); return; }
    // Chrome on Android and computers can tell us if the app is already installed
    if (navigator.getInstalledRelatedApps) navigator.getInstalledRelatedApps().then((apps) => { if (apps && apps.length) markInstalled(); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode || !canInstallHere() || NO_ASK.test(path)) return undefined;
    try { if (sessionStorage.getItem('kc-install-asked')) return undefined; } catch (_e) {}
    const off = Number(local.get('kc-install-off') || 0);
    if (off && Date.now() - off < 30 * DAY) return undefined;
    const TICK = 5;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // only time actually spent looking at the site counts
      sess.add('kc-secs', TICK);
      const secs = sess.num('kc-secs');
      const reason = secs >= ENGAGED_SECS ? 'time' : sess.num('kc-pages') >= ENGAGED_PAGES ? 'pages' : visits.current >= 2 && secs >= 20 ? 'return' : null;
      const kind = deferred ? 'button' : isIosSafari() ? 'ios' : null;
      if (!reason || !kind) return;
      if (document.querySelector('.cookie-bar, .ss-prompt')) return; // never on top of these; the next tick tries again
      clearInterval(t);
      try { sessionStorage.setItem('kc-install-asked', '1'); } catch (_e) {}
      setMode(kind); track('install_prompt_shown', { kind, reason });
    }, TICK * 1000);
    return () => clearInterval(t);
  }, [path, mode]);

  if (!mode) return null;
  // iPhone and other browsers can't tell us when the app is added, so the visitor tells us once and we stop asking
  const added = () => { markInstalled(); setMode(null); track('install_self_reported'); };
  const notNow = () => { local.set('kc-install-off', String(Date.now())); setMode(null); track('install_prompt_dismissed'); };
  const install = async () => {
    track('install_click');
    const p = deferred; deferred = null;
    if (!p) { setMode(null); return; }
    p.prompt();
    try { const r = await p.userChoice; track('install_choice', { outcome: r && r.outcome }); if (r && r.outcome === 'dismissed') local.set('kc-install-off', String(Date.now())); } catch (_e) {}
    setMode(null);
  };
  return (
    <div className="ss-prompt install-card" role="dialog" aria-modal="false" aria-labelledby="install-h">
      <button type="button" className="ss-x" onClick={notNow} aria-label="Close">✕</button>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <img src="/img/icons/icon-192.png" alt="" width="48" height="48" style={{ borderRadius: 11, flex: '0 0 48px' }} />
        <div>
          <p id="install-h" style={{ margin: '0 24px 4px 0', fontWeight: 700 }}>Add Korrect Cars to your home screen</p>
          {mode === 'button'
            ? <p className="small muted" style={{ margin: 0 }}>Open new arrivals and your saved cars in one tap. It uses almost no storage.</p>
            : mode === 'ios'
              ? <p className="small muted" style={{ margin: 0 }}>Tap the Share button <span aria-hidden="true">(the square with an arrow)</span>, then <b>Add to Home Screen</b>.</p>
              : <p className="small muted" style={{ margin: 0 }}>Open your browser menu{isAndroid() ? <span aria-hidden="true"> (⋮ at the top right)</span> : ''}, then tap <b>Install app</b> or <b>Add to Home screen</b>.</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {mode === 'button' && <button type="button" className="btn btn-red btn-sm" onClick={install}>Install</button>}
        {mode !== 'button' && <button type="button" className="btn btn-red btn-sm" onClick={added}>I've added it</button>}
        <button type="button" className="btn btn-line btn-sm" onClick={notNow}>Not now</button>
      </div>
    </div>
  );
}
