import React, { useState } from 'react';
import { Link, naira, bnpl, useApp, api, firstPhoto, waLink, useLocalList, rs, srcset } from '../lib/core.jsx';
import { useQV } from './QuickView.jsx';

export function CarCard({ car }) {
  const { cfg } = useApp();
  const saved = useLocalList('kc-saved');
  const cmp = useLocalList('kc-compare', 3);
  const sold = car.status === 'sold';
  const plan = bnpl(Number(car.price), 40, 24, cfg);
  const url = '/cars/' + car.slug;
  const isSaved = saved.has(car.id); const isCmp = cmp.has(car.id);
  const qv = useQV();
  const cardRef = React.useRef(null);
  return (
    <article className="card" ref={cardRef}>
      <Link to={url} className="card-link">
        <div className="ph" onMouseEnter={qv ? () => qv.hoverIn(car, cardRef.current) : undefined} onMouseLeave={qv ? qv.hoverOut : undefined}>
          <img src={rs(firstPhoto(car), 800)} srcSet={srcset(firstPhoto(car))} sizes="(max-width: 640px) 92vw, 400px" alt={car.title} loading="lazy" decoding="async" width="400" height="300" />
          {car.old_price && !sold ? <span className="badge">Price drop</span> : null}
          {sold && <div className="sold-ov">SOLD</div>}
        </div>
        <div className="bd">
          <div className="ttl">{car.title}</div>
          <div className="meta">{[car.body, car.mileage, car.transmission && car.transmission.replace(/-Speed/i, '-spd'), car.location].filter(Boolean).slice(0, 3).map((m) => <span key={m}>{m}</span>)}</div>
          <div className="price">{naira(car.price)}{car.old_price && !sold ? <span className="old">{naira(car.old_price)}</span> : null}</div>
          {!sold && <div className="monthly">Pay small small from about <b>{naira(plan.monthly)}/mo</b></div>}
        </div>
      </Link>
      {qv && <button type="button" className="qv-btn" aria-label={`Quick view ${car.title}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); qv.open(car, cardRef.current, window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'pop' : 'sheet'); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
        <span>Quick view</span>
      </button>}
      <div className="card-actions">
        {!sold && <a className="btn btn-wa btn-sm" href={waLink(cfg, `Hello Korrect Cars, I am interested in the ${car.title} (${naira(car.price)}). ${window.location.origin}${url}`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button type="button" className={'btn btn-sm ' + (isSaved ? 'btn-saved' : 'btn-line')} aria-pressed={isSaved} onClick={() => saved.toggle(car.id)}>{isSaved ? 'Saved ✓' : 'Save'}</button>
        <button type="button" className={'btn btn-sm ' + (isCmp ? 'btn-dark' : 'btn-line')} aria-pressed={isCmp} disabled={!isCmp && cmp.full} title={!isCmp && cmp.full ? 'You can compare up to 3 cars' : undefined} onClick={() => cmp.toggle(car.id)}>{isCmp ? 'Compare ✓' : 'Compare'}</button>
      </div>
    </article>
  );
}

export function BnplCalc({ price, onPrice, carTitle, carSlug, compact = false }) {
  const { cfg } = useApp();
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 };
  const [pct, setPct] = useState(b.minDeposit);
  const [months, setMonths] = useState(12);
  const p = bnpl(price || 0, pct, months, cfg);
  const yrs = (m) => (m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : m > 12 ? `${Math.floor(m / 12)} yr ${m % 12} mo` : `${m} months`);

  return (
    <div className="bnpl" style={compact ? { gridTemplateColumns: '1fr' } : undefined}>
      <div>
        {onPrice && (
          <div className="field">
            <label className="f" htmlFor="bnpl-price">Car price</label>
            <input id="bnpl-price" className="input" inputMode="numeric" value={price ? Number(price).toLocaleString('en-NG') : ''} placeholder="e.g. 10,000,000"
              onChange={(e) => onPrice(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} />
          </div>
        )}
        <div className="range-row">
          <div className="top"><label className="f" htmlFor="bnpl-dep" style={{ margin: 0 }}>Deposit ({pct}%)</label><span className="val">{naira(p.deposit)}</span></div>
          <input id="bnpl-dep" type="range" min={b.minDeposit} max={90} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-valuetext={`${pct} percent, ${naira(p.deposit)}`} />
          <div className="ends"><span>{b.minDeposit}% minimum</span><span>90%</span></div>
        </div>
        <div className="range-row">
          <div className="top"><label className="f" htmlFor="bnpl-m" style={{ margin: 0 }}>Pay over</label><span className="val">{p.months} months</span></div>
          <input id="bnpl-m" type="range" min={b.minMonths} max={b.maxMonths} step={1} value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-valuetext={`${p.months} months`} />
          <div className="ends"><span>{b.minMonths} months</span><span>{yrs(b.maxMonths)}</span></div>
        </div>
        <p className="small muted">Estimate only, based on a {b.minDeposit}% deposit and a {b.markup}% charge on the balance. Our credit bank partner checks if you qualify and sets the final deposit, charge and months.</p>
      </div>
      <div className="summary" aria-live="polite">
        <div className="small" style={{ color: '#a1a1aa' }}>Estimated monthly payment</div>
        <div className="big">{naira(p.monthly)}</div>
        <div className="small" style={{ color: '#a1a1aa', marginBottom: 6 }}>for {yrs(p.months)}</div>
        <div className="ln"><span>Deposit today</span><span>{naira(p.deposit)}</span></div>
        <div className="ln"><span>Balance</span><span>{naira(p.balance)}</span></div>
        <div className="ln"><span>Estimated {b.markup}% charge</span><span>{naira(p.charge)}</span></div>
        <div className="ln"><span>Total to repay</span><span>{naira(p.repay)}</span></div>
        <div className="ln" style={{ borderBottom: 0 }}><span>Total cost of car</span><span>{naira(p.deposit + p.repay)}</span></div>
        <Link className="btn btn-red" to={'/pay-small-small?' + new URLSearchParams(Object.entries({ car: carSlug || '', price: carSlug ? '' : String(price || ''), deposit: String(pct), months: String(p.months) }).filter(([, v]) => v))} style={{ marginTop: 8 }}>Apply through our bank partners</Link>
      </div>
    </div>
  );
}

export function EnquiryForm({ type, car, title, cta, extra, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '', offerAmount: '', preferredDate: '', consent: false, website: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const body = { type, name: f.name, phone: f.phone, email: f.email, message: f.message, consent: f.consent, website: f.website };
      if (car) body.car = String(car.id);
      if (type === 'offer') body.offerAmount = Number(String(f.offerAmount).replace(/[^0-9]/g, '')) || undefined;
      if (type === 'viewing') body.preferredDate = f.preferredDate;
      await api('/enquiries', { method: 'POST', body });
      setDone(true); if (onDone) onDone();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  if (done) return <div className="okmsg">Thank you. We have your request and will contact you shortly{type === 'viewing' ? ' to confirm the time and send the address of the car lot on WhatsApp' : ''}.</div>;
  const id = (k) => `${type}-${k}`;
  return (
    <form onSubmit={submit} noValidate={false}>
      {title && <h3>{title}</h3>}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="field"><label className="f" htmlFor={id('name')}>Full name</label><input id={id('name')} className="input" value={f.name} onChange={set('name')} required minLength={2} maxLength={80} autoComplete="name" /></div>
      <div className="grid2">
        <div className="field"><label className="f" htmlFor={id('phone')}>Phone</label><input id={id('phone')} className="input" type="tel" value={f.phone} onChange={set('phone')} required autoComplete="tel" placeholder="0803 000 0000" /></div>
        <div className="field"><label className="f" htmlFor={id('email')}>Email (optional)</label><input id={id('email')} className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
      </div>
      {type === 'offer' && <div className="field"><label className="f" htmlFor={id('amt')}>Your offer (₦)</label><input id={id('amt')} className="input" inputMode="numeric" value={f.offerAmount} onChange={set('offerAmount')} required placeholder={car ? Number(car.price).toLocaleString('en-NG') : ''} /></div>}
      {type === 'viewing' && <div className="field"><label className="f" htmlFor={id('date')}>Preferred day</label><input id={id('date')} className="input" type="date" value={f.preferredDate} onChange={set('preferredDate')} required min={new Date().toISOString().slice(0, 10)} /></div>}
      {extra}
      <div className="field"><label className="f" htmlFor={id('msg')}>Message (optional)</label><textarea id={id('msg')} className="input" rows={3} value={f.message} onChange={set('message')} maxLength={1500} /></div>
      <div style={{ position: 'absolute', left: -9999 }} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
      <label className="check field"><input type="checkbox" checked={f.consent} onChange={set('consent')} required /> I agree that Korrect Cars may contact me about this request and store my details as described in the privacy policy.</label>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : cta || 'Send'}</button>
    </form>
  );
}

export function Loading() { return <div className="loading">Loading…</div>; }
export function ErrorBox({ error }) { return <div className="wrap sec-sm"><div className="err">{(error && error.message) || 'Something went wrong.'}</div></div>; }

export function Modal({ children, onClose, label }) {
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="x" aria-label="Close" onClick={onClose} style={{ color: '#18181b' }}>×</button></div>
        {children}
      </div>
    </div>
  );
}
