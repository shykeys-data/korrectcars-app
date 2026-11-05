// Site frame: Header (menu, For dealers, account), Footer, and the floating WhatsApp button (all screen sizes).
import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApp, waLink, api, booted } from '../lib/core.jsx';

// Swap your car is switched on in admin Settings (on by default only on staging)
export const swapOn = (cfg) => !!(cfg && cfg.swap);
// Buyer menu, most used first. The phone number and WhatsApp live in the floating WhatsApp button, Contact and the footer.
const NAV = [['/cars', 'Cars for sale'], ['/pay-small-small', 'Pay Small Small'], ['/swap', 'Swap your car'], ['/vin-check', 'VIN check'], ['/blog', 'Guides'], ['/contact', 'Contact']];
export const dealersOn = (cfg) => !!(cfg && cfg.marketplace);

export function Header() {
  const { path, go } = useRouter();
  const { cfg, user, setUser } = useApp();
  const [open, setOpen] = useState(false);
  const signOut = async (e) => { e.preventDefault(); try { await api('/auth/logout', { method: 'POST' }); } catch (_e) { /* ignore */ } setUser(null); go('/'); };
  useEffect(() => setOpen(false), [path]);
  return (
    <header className="hdr">
      <div className="wrap">
        <Link to="/" className="logo" aria-label="Korrect Cars home"><img src="/img/logo.svg" alt="Korrect Cars" width="200" height="50" /></Link>
        <nav className={'nav' + (open ? ' open' : '')} aria-label="Main">
          {NAV.filter(([to]) => to !== '/swap' || swapOn(cfg)).map(([to, label, cls]) => <Link key={to} to={to} className={[path.startsWith(to) ? 'on' : '', cls || ''].join(' ').trim()}>{label}</Link>)}
          {user && user.dealer ? <Link to="/dealer" className="m-only">My dealer page</Link> : dealersOn(cfg) && <Link to="/dealers/join" className="m-only">For dealers: sell your cars here</Link>}
          {swapOn(cfg) && <Link to="/swap/new" className="m-only">List my car</Link>}
          {user ? <><Link to="/account" className="m-only">My account</Link><a href="/" className="m-only" onClick={signOut}>Sign out</a></> : <Link to="/login" className="m-only">Sign in</Link>}
        </nav>
        <div className="right">
          {user && user.dealer ? <Link to="/dealer" className={'acct dealers-link' + (/^\/dealer/.test(path) ? ' on' : '')}>My dealer page</Link>
            : dealersOn(cfg) && <Link to="/dealers/join" className={'acct dealers-link' + (/^\/dealer/.test(path) ? ' on' : '')}>For dealers</Link>}
          {user ? <Link to="/account" className="acct">My account</Link> : <Link to="/login" className="acct">Sign in</Link>}
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
            <p>Inspected, VIN-verified tokunbo and foreign-used cars in Lagos. Buy outright{swapOn(cfg) ? ', pay small small through our credit partners, or swap your car with a verified owner' : ' or pay small small through our credit partners'}.</p>
          </div>
          <div>
            <h2 className="foot-h">Buy</h2>
            <ul><li><Link to="/cars">Cars for sale</Link></li><li><Link to="/pay-small-small">Pay Small Small</Link></li><li><Link to="/vin-check">Free VIN check</Link></li>{swapOn(cfg) && <><li><Link to="/swap">Swap your car</Link></li><li><Link to="/swap/new">List my car</Link></li></>}{cfg && cfg.marketplace && <li><Link to="/dealers/join">Dealers: sell with us</Link></li>}</ul>
          </div>
          <div>
            <h2 className="foot-h">Company</h2>
            <ul><li><Link to="/about-us">About us</Link></li><li><Link to="/blog">Guides</Link></li><li><Link to="/faqs">FAQs</Link></li><li><Link to="/privacy-policy">Privacy policy</Link></li><li><Link to="/terms-and-conditions">Terms and conditions</Link></li></ul>
          </div>
          <div id="footer-contact">
            <h2 className="foot-h">Korrect Cars developers</h2>
            <ul>
              <li>We build and run this site. For questions about the site, your account or Pay Small Small{swapOn(cfg) ? ', or Korrect Swap' : ''}. For a car, contact the dealer on its page.</li>
              {phones.map((p) => <li key={p}><a href={'tel:' + p.replace(/\s/g, '')}>{p}</a></li>)}
              <li><a href={waLink(cfg, 'Hello Korrect Cars, ')} target="_blank" rel="noopener noreferrer">WhatsApp us</a></li>
              <li><a href={'mailto:' + email}>{email}</a></li>
              <li>{(cfg && cfg.hours) || 'Mon–Sat, 8am – 6pm'}</li>
            </ul>
          </div>
        </div>
        <p className="small" style={{ marginTop: 28, color: '#9AA0AB' }}>Safety: see the car and check its papers before any money changes hands, then pay only into the dealer's business account, never a personal account. Korrect Cars will never ask you to pay into a personal account.</p>
        <div className="legal">
          <span>© {new Date().getFullYear()} Korrect Cars. All rights reserved.</span>
          <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener noreferrer">Instagram @{ig}</a>
        </div>
      </div>
    </footer>
  );
}

