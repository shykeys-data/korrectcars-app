import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, waLink } from '../lib/core.jsx';
import Cascade from '../components/Cascade.jsx';
import { CarCard, BnplCalc, EnquiryForm, Loading, ErrorBox, Modal } from '../components/Bits.jsx';

const PRICES = [['', '', 'Any price'], ['', '20000000', 'Under ₦20m'], ['20000000', '30000000', '₦20m–₦30m'], ['30000000', '50000000', '₦30m–₦50m'], ['50000000', '', 'Over ₦50m']];

export function Inventory() {
  useTitle('Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars');
  const { query, go } = useRouter();
  const facets = useApi('/cars/facets');
  const [f, setF] = useState({ make: query.get('make') || '', model: query.get('model') || '', body: query.get('body') || '' });
  const [price, setPrice] = useState([query.get('minPrice') || '', query.get('maxPrice') || '']);
  const [condition, setCondition] = useState(query.get('condition') || '');
  const [sort, setSort] = useState(query.get('sort') || 'price-desc');
  const qs = new URLSearchParams(Object.entries({ ...f, minPrice: price[0], maxPrice: price[1], condition, sort }).filter(([, v]) => v)).toString();
  useEffect(() => { go('/cars' + (qs ? '?' + qs : ''), { replace: true, keepScroll: true }); }, [qs]); // eslint-disable-line
  const list = useApi('/cars?' + qs);
  const cars = (list.data && list.data.cars) || [];
  const reset = () => { setF({ make: '', model: '', body: '' }); setPrice(['', '']); setCondition(''); };
  return (
    <div className="wrap sec-sm">
      <div className="eyebrow">Inventory</div>
      <h1>Cars for sale</h1>
      <div className="inv" style={{ marginTop: 20 }}>
        <aside className="filters box" aria-label="Filters">
          <Cascade tree={facets.data && facets.data.makes} value={f} onChange={setF} idPrefix="inv" />
          <div className="field"><div className="f">Price</div><div className="pills">{PRICES.map(([a, b, l]) => <button key={l} type="button" className={'pill' + (price[0] === a && price[1] === b ? ' on' : '')} onClick={() => setPrice([a, b])}>{l}</button>)}</div></div>
          <div className="field">
            <label className="f" htmlFor="inv-cond">Condition</label>
            <select id="inv-cond" className="input" value={condition} onChange={(e) => setCondition(e.target.value)}><option value="">Any condition</option><option>Foreign Used</option><option>Nigerian Used</option><option>Brand New</option></select>
          </div>
          <button className="btn btn-line btn-block" onClick={reset}>Reset filters</button>
        </aside>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="muted" aria-live="polite">{list.loading ? 'Loading…' : `${cars.length} car${cars.length === 1 ? '' : 's'}`}</div>
            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Sort
              <select className="input" style={{ width: 'auto', minHeight: 42 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price-desc">Price: high to low</option><option value="price-asc">Price: low to high</option><option value="year-desc">Newest year</option><option value="newest">Recently added</option>
              </select>
            </label>
          </div>
          {list.error ? <div className="err">{list.error.message}</div> : !list.loading && !cars.length
            ? <div className="empty"><h3>No cars match yet</h3><p className="muted">Tell us what you want and we will find it for you.</p><button className="btn btn-line" onClick={reset}>Reset filters</button></div>
            : <div className="cards">{cars.map((c) => <CarCard key={c.id} car={c} />)}</div>}
        </div>
      </div>
    </div>
  );
}

export function CarDetail({ slug }) {
  const { cfg } = useApp();
  const { data, loading, error } = useApi('/cars/' + slug);
  const [i, setI] = useState(0);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  useEffect(() => { setI(0); setTab('overview'); }, [slug]);
  const car = data && data.car;
  useTitle(car ? `${car.title} for Sale in Lagos — ${naira(car.price)} | Korrect Cars` : null);
  if (loading && !car) return <Loading />;
  if (error) return error.status === 404 ? <NotFoundCar /> : <ErrorBox error={error} />;
  const photos = car.photos && car.photos.length ? car.photos : ['/img/hero.jpg'];
  const sold = car.status === 'sold';
  const spec = [['Year', car.year], ['Make', car.make], ['Model', car.model], ['Trim', car.trim_level], ['Body type', car.body], ['Condition', car.car_condition], ['Mileage', car.mileage], ['Engine', car.engine], ['Transmission', car.transmission], ['Drivetrain', car.drivetrain], ['Fuel', car.fuel], ['Exterior colour', car.color], ['Interior', car.interior], ['Location', car.location], ['Stock number', car.stock]].filter(([, v]) => v);
  const tech = (car.specs || []).filter((r) => r && r[0]);
  const wa = `Hello Korrect Cars, I am interested in the ${car.title} (${naira(car.price)}). ${window.location.href}`;
  return (
    <div className="wrap sec-sm">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 14 }}><Link to="/cars">Cars for sale</Link> / {car.make} / {car.model}</nav>
      <div className="detail">
        <div>
          <div className="gallery">
            <div className="main">
              <img src={photos[i]} alt={`${car.title} photo ${i + 1}`} />
              {sold && <div className="sold-ov">SOLD</div>}
              {photos.length > 1 && <>
                <button className="nav-btn prev" aria-label="Previous photo" onClick={() => setI((i - 1 + photos.length) % photos.length)}>‹</button>
                <button className="nav-btn next" aria-label="Next photo" onClick={() => setI((i + 1) % photos.length)}>›</button>
              </>}
              <span className="count">{i + 1} / {photos.length}</span>
            </div>
            <div className="thumbs">{photos.map((p, k) => <button key={p} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}><img src={p} alt="" loading="lazy" /></button>)}</div>
          </div>
          <h1 style={{ fontSize: 'clamp(32px,4.4vw,52px)', marginTop: 10 }}>{car.title}</h1>
          <div className="tabs" role="tablist">
            {[['overview', 'Overview'], ['specs', 'Specifications'], ['features', 'Features'], ['bnpl', 'Pay Small Small']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === 'overview' && <div className="prose">{String(car.description || '').split(/\n\n+/).filter(Boolean).map((p, k) => <p key={k}>{p}</p>)}
            {car.info && car.info.length > 0 && <ul>{car.info.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}
          {tab === 'specs' && <table className="specs"><tbody>{spec.concat(tech.filter((r) => !spec.some((s) => s[0].toLowerCase() === String(r[0]).toLowerCase()))).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>}
          {tab === 'features' && (car.features && car.features.length ? <ul className="feat">{car.features.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Ask us on WhatsApp for the full feature list.</p>)}
          {tab === 'bnpl' && (sold ? <p className="muted">This car is sold. Pick another car to see Pay Small Small options.</p> : <BnplCalc price={Number(car.price)} carTitle={car.title} />)}
        </div>
        <aside className="side">
          <div className="box">
            <div className="disp" style={{ fontSize: 46 }}>{naira(car.price)}</div>
            {car.old_price && !sold ? <div className="muted">Was <s>{naira(car.old_price)}</s></div> : null}
            {sold ? <div className="tag tag-grey" style={{ marginTop: 8 }}>Sold</div> : <div className="small" style={{ color: 'var(--ok)', fontWeight: 600, marginTop: 6 }}>Pay Small Small: 40% down, from {naira(Math.ceil(Number(car.price) * 0.6 * 1.2 / 48))}/month</div>}
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <a className="btn btn-wa" href={waLink(cfg, wa)} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              {!sold && <>
                <button className="btn btn-red" onClick={() => setModal('viewing')}>Book a viewing</button>
                <button className="btn btn-line" onClick={() => setModal('offer')}>Make an offer</button>
                <button className="btn btn-line" onClick={() => setTab('bnpl')}>Pay Small Small</button>
              </>}
              {cfg && cfg.phones && <a className="btn btn-dark" href={'tel:' + cfg.phones[0].replace(/\s/g, '')}>Call {cfg.phones[0]}</a>}
            </div>
          </div>
          <div className="box">
            <h3 style={{ fontSize: 22 }}>Have a car to swap?</h3>
            <p className="small muted">Use your current car as part payment. List it on Korrect Swap and we will value it.</p>
            <Link to="/swap/new" className="btn btn-line btn-sm">List my car</Link>
          </div>
          <div className="notice"><b>Stay safe:</b> only pay into the Korrect Cars company account, and only after you have seen the car and its papers.</div>
        </aside>
      </div>
      {data.similar && data.similar.length > 0 && (
        <section className="sec-sm"><h2>Similar cars</h2><div className="cards">{data.similar.map((c) => <CarCard key={c.id} car={c} />)}</div></section>
      )}
      {modal && <Modal onClose={() => setModal(null)} label={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'}>
        <EnquiryForm type={modal} car={car} title={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'} cta={modal === 'viewing' ? 'Request viewing' : 'Send offer'} />
      </Modal>}
    </div>
  );
}

function NotFoundCar() {
  return <div className="wrap sec"><h1>This car is no longer listed</h1><p className="muted">It may have been sold. See what is in stock now.</p><Link to="/cars" className="btn btn-red">Browse cars</Link></div>;
}

export function PaySmallSmall() {
  useTitle('Pay Small Small — Car Payment Plans in Lagos | Korrect Cars');
  const list = useApi('/cars?limit=100');
  const cars = ((list.data && list.data.cars) || []).filter((c) => c.status === 'available');
  const [idx, setIdx] = useState(-2);
  const [custom, setCustom] = useState(10000000);
  const sel = idx >= 0 ? cars[idx] : null;
  const { cfg } = useApp();
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 };
  return (
    <>
      <section className="sec-dark sec-sm"><div className="wrap">
        <div className="eyebrow">Pay Small Small</div>
        <h1>Drive now. Pay small small.</h1>
        <p style={{ color: '#d4d4d8', maxWidth: 640, fontSize: 19 }}>Pay {b.minDeposit}% or more upfront, take the car home, and spread the rest over {b.minMonths} to {b.maxMonths} months. One flat {b.markup}% charge on the balance, no surprises.</p>
      </div></section>
      <section className="sec-sm"><div className="wrap">
        <div className="field" style={{ maxWidth: 560 }}>
          <label className="f" htmlFor="pss-car">Choose a car</label>
          <select id="pss-car" className="input" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            <option value={-2}>Enter my own price</option>
            {cars.map((c, k) => <option key={c.id} value={k}>{c.title} — {naira(c.price)}</option>)}
          </select>
        </div>
        <BnplCalc price={sel ? Number(sel.price) : custom} onPrice={sel ? null : setCustom} carTitle={sel ? sel.title : ''} />
        <div className="box" style={{ marginTop: 28 }}>
          <h3>Worked example</h3>
          <p>A car costs ₦10,000,000. You pay the minimum {b.minDeposit}% deposit of ₦4,000,000. The balance of ₦6,000,000 plus the {b.markup}% charge is ₦7,200,000.</p>
          <ul><li>Over 6 months: <b>₦1,200,000</b> per month</li><li>Over 12 months: <b>₦600,000</b> per month</li><li>Over 24 months: <b>₦300,000</b> per month</li></ul>
        </div>
        <div className="ways" style={{ marginTop: 28 }}>
          <div className="box"><h3>What you need</h3><ul className="small"><li>Valid ID (NIN, passport or driver's licence)</li><li>Proof of address</li><li>3–6 months bank statement</li><li>Two passport photos</li></ul></div>
          <div className="box"><h3>How it works</h3><ol className="small"><li>Pick a car and your plan</li><li>Send documents on WhatsApp</li><li>Pay deposit into the company account</li><li>Sign the plan and drive away</li></ol></div>
          <div className="box"><h3>Ask us</h3><p className="small muted">Questions about Pay Small Small? We answer on WhatsApp within minutes.</p><a className="btn btn-wa" href={waLink(cfg, 'Hello Korrect Cars, I have a question about Pay Small Small.')} target="_blank" rel="noopener noreferrer">WhatsApp us</a></div>
        </div>
      </div></section>
    </>
  );
}
