import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApp, waLink, api } from '../lib/core.jsx';

const NAV = [['/cars', 'Cars for sale'], ['/pay-small-small', 'Pay Small Small'], ['/swap', 'Swap your car'], ['/blog', 'Guides'], ['/contact', 'Contact']];

export function Header() {
  const { path, go } = useRouter();
  const { cfg, user, setUser } = useApp();
  const [open, setOpen] = useState(false);
  const signOut = async (e) => { e.preventDefault(); try { await api('/auth/logout', { method: 'POST' }); } catch (_e) { /* ignore */ } setUser(null); go('/'); };
  useEffect(() => setOpen(false), [path]);
  const phone = ((cfg && cfg.phones) || ['+234 809 139 7912'])[0];
  return (
    <header className="hdr">
      <div className="wrap">
        <Link to="/" className="logo" aria-label="Korrect Cars home"><img src="/img/logo.svg" alt="Korrect Cars" width="200" height="50" /></Link>
        <nav className={'nav' + (open ? ' open' : '')} aria-label="Main">
          {NAV.map(([to, label]) => <Link key={to} to={to} className={path.startsWith(to) ? 'on' : ''}>{label}</Link>)}
          <Link to="/swap/new" className="m-only">List my car</Link>
          {user ? <><Link to="/account" className="m-only">My account</Link><a href="/" className="m-only" onClick={signOut}>Sign out</a></> : <Link to="/login" className="m-only">Sign in</Link>}
          <a className="m-only" href={'tel:' + phone.replace(/\s/g, '')}>Call {phone}</a>
        </nav>
        <div className="right">
          <a className="tel" href={'tel:' + phone.replace(/\s/g, '')}>{phone}</a>
          {user ? <Link to="/account" className="acct">My account</Link> : <Link to="/login" className="acct">Sign in</Link>}
          <a className="btn btn-wa btn-sm" href={waLink(cfg, 'Hello Korrect Cars, I am looking for a car.')} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
          <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><span /><span /><span /></button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { cfg } = useApp();
  const phones = (cfg && cfg.phones) || [];
  const email = (cfg && cfg.email) || 'info@korrectcars.com';
  const ig = (cfg && cfg.instagram) || 'korrectcarsofficial';
  return (
    <footer className="foot" id="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <img src="/img/logo-white.svg" alt="Korrect Cars" width="200" height="50" style={{ height: 46, width: 'auto', marginBottom: 14 }} loading="lazy" />
            <p>Inspected, VIN-verified tokunbo and foreign-used cars in Lagos. Buy outright, pay small small through our bank partners, or swap your car with a verified owner.</p>
          </div>
          <div>
            <h4>Buy</h4>
            <ul><li><Link to="/cars">Cars for sale</Link></li><li><Link to="/pay-small-small">Pay Small Small</Link></li><li><Link to="/swap">Swap your car</Link></li><li><Link to="/swap/new">List my car</Link></li></ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul><li><Link to="/about-us">About us</Link></li><li><Link to="/blog">Guides</Link></li><li><Link to="/faqs">FAQs</Link></li><li><Link to="/privacy-policy">Privacy policy</Link></li><li><Link to="/terms-and-conditions">Terms and conditions</Link></li></ul>
          </div>
          <div>
            <h4>Visit or call</h4>
            <ul>
              <li>Online car dealer · Lagos</li>
              <li>{(cfg && cfg.hours) || 'Mon–Sat, 8am – 6pm'}</li>
              {phones.map((p) => <li key={p}><a href={'tel:' + p.replace(/\s/g, '')}>{p}</a></li>)}
              <li><a href={'mailto:' + email}>{email}</a></li>
            </ul>
          </div>
        </div>
        <p className="small" style={{ marginTop: 28, color: '#9AA0AB' }}>Safety: Korrect Cars will never ask you to pay into a personal account. Inspect the car and its papers before any money changes hands.</p>
        <div className="legal">
          <span>© {new Date().getFullYear()} Korrect Cars. All rights reserved.</span>
          <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener noreferrer">Instagram @{ig}</a>
        </div>
      </div>
    </footer>
  );
}

const TOPICS = [
  ['Buy a car', 'Hello Korrect Cars, I want to buy a car. My budget is: '],
  ['Pay Small Small', 'Hello Korrect Cars, I want to pay small small for a car. My budget is: '],
  ['Swap my car', 'Hello Korrect Cars, I want to swap my car. My car is a: '],
  ['Book a viewing', 'Hello Korrect Cars, I want to book a viewing at the car lot.'],
  ['Something else', 'Hello Korrect Cars, ']
];

export function WhatsApp() {
  const { cfg } = useApp();
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(0);
  const [msg, setMsg] = useState(TOPICS[0][1]);
  if (path.startsWith('/myadm')) return null;
  const pick = (i) => { setTopic(i); setMsg(TOPICS[i][1] + (path.startsWith('/cars/') ? `\n(Page: ${window.location.href})` : '')); };
  return (
    <>
      {open && (
        <div className="wa-pop" role="dialog" aria-label="Chat with Korrect Cars on WhatsApp">
          <div className="hd">
            <div><div className="disp" style={{ fontSize: 22 }}>Chat with us</div><div className="small" style={{ color: '#bbf7d0' }}>We usually reply within minutes, Mon–Sat 8am–6pm</div></div>
            <button className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="bd">
            <div className="small muted">What do you need help with?</div>
            <div className="wa-topics">{TOPICS.map((t, i) => <button key={t[0]} className={i === topic ? 'on' : ''} onClick={() => pick(i)}>{t[0]}</button>)}</div>
            <label className="sr" htmlFor="wa-msg">Your message</label>
            <textarea id="wa-msg" className="input" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={800} />
            <a className="btn btn-wa btn-block" href={waLink(cfg, msg)} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
            <div className="small muted">Never send money to anyone who contacts you claiming to be Korrect Cars. Our only numbers are on this page.</div>
          </div>
        </div>
      )}
      <button className="wa-fab" aria-label={open ? 'Close WhatsApp chat' : 'Chat on WhatsApp'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path fill="#fff" d="M16 3.2A12.7 12.7 0 0 0 5.1 22.4L3.3 28.8l6.6-1.7A12.7 12.7 0 1 0 16 3.2Zm0 23.2c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.5 10.5 0 1 1 16 26.4Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.6 8.6 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8 1 3.9.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3Z" /></svg>
      </button>
    </>
  );
}
