// Installable site: registers the service worker (client/sw.js) and, for returning visitors, offers to add
// Korrect Cars to the home screen. Android and desktop Chrome get a one-tap Install button; iPhone Safari
// gets the two steps to do it by hand. Shown at most once a visit, never over the cookie bar or the
// save-search card, and not again for 30 days after "Not now".
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useRouter, track } from '../lib/core.jsx';

let deferred = null; // Chrome's install prompt, kept for when the visitor taps Install
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; track('app_installed'); try { localStorage.setItem('kc-installed', '1'); } catch (_e) {} });
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
function viewedCount() { try { return (JSON.parse(local.get('kc-viewed') || '[]') || []).length; } catch (_e) { return 0; } }
const NO_ASK = /^\/(login|register|verify-email|forgot-password|reset-password|account|dealer($|\/)|dealers\/(join|invite))/;

export function InstallApp() {
  const { user } = useApp();
  const { path } = useRouter();
  const [mode, setMode] = useState(null); // 'button' | 'ios' | null
  const prevUser = useRef(user);
  const visits = useRef(0);

  // After a sign-out, clear the pages kept for offline use (a shared phone should not show them)
  useEffect(() => {
    if (prevUser.current && user === null && navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('kc-clear-pages');
    prevUser.current = user;
  }, [user]);

  useEffect(() => { visits.current = countVisit(); }, []);

  useEffect(() => {
    if (mode || standalone() || local.get('kc-installed') || NO_ASK.test(path)) return undefined;
    try { if (sessionStorage.getItem('kc-install-asked')) return undefined; } catch (_e) {}
    const off = Number(local.get('kc-install-off') || 0);
    if (off && Date.now() - off < 30 * DAY) return undefined;
    let t = null;
    const check = () => {
      const engaged = visits.current >= 2 || viewedCount() >= 3;
      const kind = deferred ? 'button' : isIosSafari() ? 'ios' : null;
      if (!engaged || !kind) return;
      // Never on top of the cookie bar or the save-search card; try again a little later
      if (document.querySelector('.cookie-bar, .ss-prompt')) { t = setTimeout(check, 8000); return; }
      try { sessionStorage.setItem('kc-install-asked', '1'); } catch (_e) {}
      setMode(kind); track('install_prompt_shown', { kind });
    };
    t = setTimeout(check, 15000);
    return () => clearTimeout(t);
  }, [path, mode]);

  if (!mode) return null;
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
            : <p className="small muted" style={{ margin: 0 }}>Tap the Share button <span aria-hidden="true">(the square with an arrow)</span>, then <b>Add to Home Screen</b>.</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {mode === 'button' && <button type="button" className="btn btn-red btn-sm" onClick={install}>Install</button>}
        <button type="button" className="btn btn-line btn-sm" onClick={notNow}>{mode === 'button' ? 'Not now' : 'Got it'}</button>
      </div>
    </div>
  );
}
