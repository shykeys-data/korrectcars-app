import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, naira, bnpl, useApp, waLink, useLocalList, firstPhoto } from '../lib/core.jsx';

// Quick view for car cards.
// PC: hover the photo (or focus the "Quick view" button) and a details panel opens beside the card.
// Phone: tap "Quick view" to open a bottom sheet with swipeable photos.
// Uses the car data the page already has, so it opens instantly with no extra requests.

const canHover = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function useQuickView() {
  const [state, setState] = useState(null); // { car, rect, mode }
  const timers = useRef({});
  const clear = () => { clearTimeout(timers.current.open); clearTimeout(timers.current.close); };
  const open = useCallback((car, el, mode) => { clear(); setState({ car, rect: el ? el.getBoundingClientRect() : null, mode }); }, []);
  const hoverIn = useCallback((car, el) => {
    if (!canHover()) return;
    clear(); timers.current.open = setTimeout(() => open(car, el, 'pop'), 320);
  }, [open]);
  const hoverOut = useCallback(() => { clearTimeout(timers.current.open); timers.current.close = setTimeout(() => setState((s) => (s && s.mode === 'pop' ? null : s)), 220); }, []);
  const keep = useCallback(() => clearTimeout(timers.current.close), []);
  const close = useCallback(() => { clear(); setState(null); }, []);
  useEffect(() => () => clear(), []);
  return { state, open, hoverIn, hoverOut, keep, close };
}

function Specs({ car }) {
  const rows = [['Year', car.year], ['Mileage', car.mileage], ['Engine', car.engine], ['Gearbox', car.transmission], ['Fuel', car.fuel], ['Colour', car.color], ['Body', car.body], ['Condition', car.car_condition]].filter(([, v]) => v).slice(0, 6);
  return <dl className="qv-specs">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Photos({ car, sheet }) {
  const photos = car.photos && car.photos.length ? car.photos : [firstPhoto(car)];
  const [i, setI] = useState(0);
  const strip = useRef(null);
  const go = useCallback((n) => {
    const k = (n + photos.length) % photos.length; setI(k);
    if (sheet && strip.current) strip.current.scrollTo({ left: k * strip.current.clientWidth, behavior: 'smooth' });
  }, [photos.length, sheet]);
  useEffect(() => { // warm the next photos so sliding is instant
    photos.slice(1, 4).forEach((u) => { const im = new Image(); im.src = u; });
  }, [car.id]); // eslint-disable-line
  useEffect(() => {
    if (sheet) return undefined;
    const on = (e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [i, go, sheet]);
  const sold = car.status === 'sold';
  if (sheet) {
    return (
      <div className="qv-photos">
        <div className="qv-strip" ref={strip} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {photos.map((u, k) => <img key={u} src={u} alt={`${car.title} photo ${k + 1}`} loading={k < 2 ? 'eager' : 'lazy'} />)}
        </div>
        {sold && <div className="sold-ov">SOLD</div>}
        <span className="qv-count">{i + 1} / {photos.length}</span>
      </div>
    );
  }
  return (
    <div className="qv-photos">
      <img src={photos[i]} alt={`${car.title} photo ${i + 1}`} />
      {sold && <div className="sold-ov">SOLD</div>}
      {photos.length > 1 && <>
        <button type="button" className="qv-nav prev" aria-label="Previous photo" onClick={() => go(i - 1)}>‹</button>
        <button type="button" className="qv-nav next" aria-label="Next photo" onClick={() => go(i + 1)}>›</button>
        <div className="qv-dots" aria-hidden="true">{photos.slice(0, 12).map((u, k) => <span key={u} className={k === i ? 'on' : ''} />)}</div>
      </>}
      <span className="qv-count">{i + 1} / {photos.length}</span>
    </div>
  );
}

function Body({ car, onClose }) {
  const { cfg } = useApp();
  const saved = useLocalList('kc-saved');
  const cmp = useLocalList('kc-compare', 3);
  const sold = car.status === 'sold';
  const plan = bnpl(Number(car.price), 40, 24, cfg);
  const url = '/cars/' + car.slug;
  const isCmp = cmp.has(car.id);
  return (
    <div className="qv-body">
      <div className="qv-title">{car.title}</div>
      <div className="qv-price">{naira(car.price)}{car.old_price && !sold ? <s>{naira(car.old_price)}</s> : null}</div>
      {!sold && <div className="qv-monthly">Pay small small from about <b>{naira(plan.monthly)}/mo</b> <span>(estimate)</span></div>}
      <Specs car={car} />
      <div className="qv-where">Parked at a partner car lot in Lagos · inspected and VIN-verified</div>
      <div className="qv-actions">
        <Link to={url} className="btn btn-red btn-sm" onClick={onClose}>View full details</Link>
        {!sold && <a className="btn btn-wa btn-sm" href={waLink(cfg, `Hello Korrect Cars, I am interested in the ${car.title} (${naira(car.price)}). ${window.location.origin}${url}`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button type="button" className={'btn btn-sm ' + (saved.has(car.id) ? 'btn-saved' : 'btn-line')} aria-pressed={saved.has(car.id)} onClick={() => saved.toggle(car.id)}>{saved.has(car.id) ? 'Saved ✓' : 'Save'}</button>
        <button type="button" className={'btn btn-sm ' + (isCmp ? 'btn-dark' : 'btn-line')} aria-pressed={isCmp} disabled={!isCmp && cmp.full} onClick={() => cmp.toggle(car.id)}>{isCmp ? 'Compare ✓' : 'Compare'}</button>
      </div>
    </div>
  );
}

export function QuickViewLayer({ qv }) {
  const { state, keep, hoverOut, close } = qv;
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    if (state.mode === 'pop') { const onScroll = () => close(); window.addEventListener('scroll', onScroll, { passive: true }); return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); }; }
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    setTimeout(() => { const b = ref.current && ref.current.querySelector('.qv-close'); if (b) b.focus(); }, 30);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [state, close]);
  // Place the PC panel beside the card: right if there is room, otherwise left; keep it on screen
  useEffect(() => {
    if (!state || state.mode !== 'pop' || !state.rect) { setPos(null); return; }
    const W = 400; const gap = 12; const r = state.rect; const vw = window.innerWidth; const vh = window.innerHeight;
    let left = r.right + gap; if (left + W > vw - 12) left = r.left - gap - W; if (left < 12) left = Math.max(12, Math.min(vw - W - 12, r.left));
    const h = ref.current ? ref.current.offsetHeight : 520;
    const top = Math.max(84, Math.min(vh - h - 12, r.top - 20));
    setPos({ left, top });
    const raf = requestAnimationFrame(() => { if (ref.current) { const h2 = ref.current.offsetHeight; setPos({ left, top: Math.max(84, Math.min(vh - h2 - 12, r.top - 20)) }); } });
    return () => cancelAnimationFrame(raf);
  }, [state]);
  if (!state) return null;
  const { car, mode } = state;
  if (mode === 'pop') {
    return createPortal(
      <div ref={ref} className="qv-pop" role="dialog" aria-label={`Quick view: ${car.title}`} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
        onMouseEnter={keep} onMouseLeave={hoverOut}>
        <Photos car={car} />
        <Body car={car} onClose={close} />
      </div>, document.body);
  }
  return createPortal(
    <div className="qv-back" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} className="qv-sheet" role="dialog" aria-modal="true" aria-label={`Quick view: ${car.title}`}>
        <div className="qv-grab" aria-hidden="true" />
        <button type="button" className="qv-close" aria-label="Close quick view" onClick={close}>×</button>
        <Photos car={car} sheet />
        <Body car={car} onClose={close} />
      </div>
    </div>, document.body);
}

// Shared across all cards on a page
const QVCtx = React.createContext(null);
export function QuickViewProvider({ children }) {
  const qv = useQuickView();
  return <QVCtx.Provider value={qv}>{children}<QuickViewLayer qv={qv} /></QVCtx.Provider>;
}
export const useQV = () => React.useContext(QVCtx);
