import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, waLink, slugify, useLocalList, bnpl, firstPhoto, api, rs, srcset } from '../lib/core.jsx';
import { CarCard, BnplCalc, EnquiryForm, Loading, ErrorBox, Modal } from '../components/Bits.jsx';

const BUDGETS = [['', 'Any budget'], ['20000000', 'Under ₦20m'], ['30000000', 'Under ₦30m'], ['50000000', 'Under ₦50m'], ['100000000', 'Under ₦100m']];
const SORTS = [['price-desc', 'Price: high to low'], ['price-asc', 'Price: low to high'], ['year-desc', 'Newest year first'], ['newest', 'Recently added']];
const YEAR_QUICK = [['2018', '', '2018 and newer'], ['2015', '2017', '2015–2017'], ['', '2014', '2014 and older']];

// Filtering happens in the browser over the whole stock (it arrives with the page)
function applyFilters(all, f) {
  let cars = all.filter((c) => (!f.make || c.make === f.make) && (!f.model || c.model === f.model) && (!f.body || c.body === f.body)
    && (!f.condition || c.car_condition === f.condition) && (!f.maxPrice || Number(c.price) <= Number(f.maxPrice))
    && (!f.yearMin || Number(c.year) >= Number(f.yearMin)) && (!f.yearMax || Number(c.year) <= Number(f.yearMax)));
  const by = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, 'year-desc': (a, b) => (b.year - a.year) || (b.price - a.price), newest: (a, b) => b.id - a.id };
  cars = cars.slice().sort((a, b) => ((a.status === 'sold') - (b.status === 'sold')) || (by[f.sort] || by['price-desc'])(a, b));
  return cars;
}

export function Inventory({ makeSlug, modelSlug }) {
  const { query, go } = useRouter();
  const { cfg } = useApp();
  const list = useApi('/cars?limit=100');
  const all = (list.data && list.data.cars) || [];
  const cmp = useLocalList('kc-compare', 3);
  const [open, setOpen] = useState(false);
  // make and model come from the page address (/cars/toyota/camry), the rest from ?query
  const makeFromSlug = makeSlug ? (all.find((c) => slugify(c.make) === makeSlug) || {}).make || '' : '';
  const modelFromSlug = modelSlug ? (all.find((c) => c.make === makeFromSlug && slugify(c.model) === modelSlug) || {}).model || '' : '';
  const f = {
    make: makeFromSlug || query.get('make') || '', model: modelFromSlug || query.get('model') || '',
    body: query.get('body') || '', condition: query.get('condition') || '', maxPrice: query.get('maxPrice') || '',
    yearMin: query.get('yearMin') || '', yearMax: query.get('yearMax') || '', sort: query.get('sort') || 'price-desc'
  };
  const setF = (patch) => {
    const n = { ...f, ...patch };
    if ('make' in patch && patch.make !== f.make) n.model = patch.model || '';
    // Body type follows make/model: drop a body type the chosen make/model doesn't come in
    if (('make' in patch || 'model' in patch) && n.body && !all.some((c) => c.body === n.body && (!n.make || c.make === n.make) && (!n.model || c.model === n.model))) n.body = '';
    const rest = Object.entries({ body: n.body, condition: n.condition, maxPrice: n.maxPrice, yearMin: n.yearMin, yearMax: n.yearMax, sort: n.sort === 'price-desc' ? '' : n.sort }).filter(([, v]) => v);
    const base = n.make ? `/cars/${slugify(n.make)}${n.model ? '/' + slugify(n.model) : ''}` : '/cars';
    go(base + (rest.length ? '?' + new URLSearchParams(rest) : ''), { replace: true, keepScroll: true });
  };
  const cars = applyFilters(all, f);
  const subject = f.model ? `${f.make} ${f.model}` : f.make;
  useTitle(subject ? `${subject} for Sale in Lagos — Prices & Pay Small Small | Korrect Cars` : 'Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars');

  // Option lists with counts, from the cars in stock
  const count = (pred) => all.filter(pred).length;
  const makes = [...new Set(all.map((c) => c.make))].sort();
  const models = [...new Set(all.filter((c) => !f.make || c.make === f.make).map((c) => c.model))].sort();
  // Body types the chosen make/model actually come in; one body type for a model = selected automatically
  const bodies = [...new Set(all.filter((c) => (!f.make || c.make === f.make) && (!f.model || c.model === f.model)).map((c) => c.body).filter(Boolean))].sort();
  const autoBody = f.model && bodies.length === 1 ? bodies[0] : '';
  const conds = [...new Set(all.map((c) => c.car_condition).filter(Boolean))].sort();
  const years = [...new Set(all.map((c) => Number(c.year)).filter(Boolean))].sort((a, b) => a - b);
  const yMin = years[0] || 2000; const yMax = years[years.length - 1] || new Date().getFullYear();
  const yearOpts = []; for (let y = yMax; y >= yMin; y--) yearOpts.push(y);

  const chips = [];
  if (f.make) chips.push([f.make, { make: '', model: '' }]);
  if (f.model) chips.push([f.model, { model: '' }]);
  if (f.yearMin || f.yearMax) chips.push([f.yearMin && f.yearMax ? (f.yearMin === f.yearMax ? f.yearMin : `${f.yearMin}–${f.yearMax}`) : f.yearMin ? `${f.yearMin} and newer` : `${f.yearMax} and older`, { yearMin: '', yearMax: '' }]);
  if (f.body) chips.push([f.body, { body: '' }]);
  if (f.maxPrice) chips.push([BUDGETS.find(([v]) => v === f.maxPrice)?.[1] || 'Budget', { maxPrice: '' }]);
  if (f.condition) chips.push([f.condition, { condition: '' }]);
  const reset = () => go('/cars', { replace: true, keepScroll: true });

  const avail = cars.filter((c) => c.status === 'available');
  const lo = avail.length ? Math.min(...avail.map((c) => Number(c.price))) : 0;
  const hi = avail.length ? Math.max(...avail.map((c) => Number(c.price))) : 0;
  const cmpCars = all.filter((c) => cmp.has(c.id));
  const alertMsg = `Hello Korrect Cars, please alert me when you have: ${chips.map((c) => c[0]).join(', ') || 'any car'}.`;

  return (
    <>
      <div className="wrap sec-sm">
        <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}><Link to="/">Home</Link> / <Link to="/cars">Cars for sale</Link>{f.make && <> / <Link to={'/cars/' + slugify(f.make)}>{f.make}</Link></>}{f.model && <> / {f.model}</>}</nav>
        <h1>{subject ? `${subject} for sale in Lagos` : 'Cars for sale in Lagos'}</h1>
        <p className="muted" style={{ marginTop: -4 }}>Every car inspected and VIN-verified · parked at partner car lots in Lagos</p>
        <div className="inv" style={{ marginTop: 20 }}>
          <aside className={'filters box' + (open ? '' : ' closed')} aria-label="Filters">
            <div className="grp" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ fontSize: 26, margin: 0 }}>Filters</h2><button className="btn btn-sm" style={{ background: 'none', color: 'var(--red)', padding: 0 }} onClick={reset}>Reset</button></div>
            <div className="grp"><h3>Make</h3><div className="pills">
              <button className={'pill' + (!f.make ? ' on' : '')} onClick={() => setF({ make: '' })}>All</button>
              {makes.map((m) => <button key={m} className={'pill' + (f.make === m ? ' on' : '')} aria-pressed={f.make === m} onClick={() => setF({ make: m })}>{m}<span className="n">{count((c) => c.make === m)}</span></button>)}
            </div></div>
            <div className="grp"><h3>Model {!f.make && <span className="small muted" style={{ fontWeight: 400 }}>· all makes</span>}</h3><div className="pills">
              <button className={'pill' + (!f.model ? ' on' : '')} onClick={() => setF({ model: '' })}>All</button>
              {models.map((m) => <button key={m} className={'pill' + (f.model === m ? ' on' : '')} aria-pressed={f.model === m} onClick={() => setF({ make: (all.find((c) => c.model === m && (!f.make || c.make === f.make)) || {}).make, model: m })}>{m}<span className="n">{count((c) => c.model === m && (!f.make || c.make === f.make))}</span></button>)}
            </div></div>
            <div className="grp"><h3>Year</h3>
              <div className="yr">
                <label className="small">From<select className="input" value={f.yearMin} onChange={(e) => setF({ yearMin: e.target.value, yearMax: f.yearMax && e.target.value && Number(f.yearMax) < Number(e.target.value) ? '' : f.yearMax })} aria-label="Year from"><option value="">Any</option>{yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
                <label className="small">To<select className="input" value={f.yearMax} onChange={(e) => setF({ yearMax: e.target.value, yearMin: f.yearMin && e.target.value && Number(f.yearMin) > Number(e.target.value) ? '' : f.yearMin })} aria-label="Year to"><option value="">Any</option>{yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
              </div>
              <div className="pills" style={{ marginTop: 8 }}>{YEAR_QUICK.map(([a, b, l]) => <button key={l} className={'pill' + (f.yearMin === a && f.yearMax === b ? ' on' : '')} onClick={() => setF({ yearMin: a, yearMax: b })}>{l}</button>)}</div>
            </div>
            <div className="grp"><h3>Body type {autoBody && <span className="small muted" style={{ fontWeight: 400 }}>· set by model</span>}</h3><div className="pills">
              {autoBody ? <button className="pill on" disabled aria-disabled="true" title={`The ${f.model} comes as a ${autoBody}`}>{autoBody} ✓</button> : <>
                <button className={'pill' + (!f.body ? ' on' : '')} onClick={() => setF({ body: '' })}>All</button>
                {bodies.map((m) => <button key={m} className={'pill' + (f.body === m ? ' on' : '')} onClick={() => setF({ body: m })}>{m}</button>)}
              </>}
            </div></div>
            <div className="grp"><h3>Budget</h3><div className="pills">{BUDGETS.map(([v, l]) => <button key={l} className={'pill' + (f.maxPrice === v ? ' on' : '')} onClick={() => setF({ maxPrice: v })}>{l}</button>)}</div></div>
            {conds.length > 1 && <div className="grp"><h3>Condition</h3><div className="pills">
              <button className={'pill' + (!f.condition ? ' on' : '')} onClick={() => setF({ condition: '' })}>Any</button>
              {conds.map((m) => <button key={m} className={'pill' + (f.condition === m ? ' on' : '')} onClick={() => setF({ condition: m })}>{m}</button>)}
            </div></div>}
            <SaveSearch filters={f} />
            <a className="btn btn-line btn-block" style={{ marginTop: 8 }} href={waLink(cfg, alertMsg)} target="_blank" rel="noopener noreferrer">Alert me on WhatsApp</a>
            <button className="btn btn-red btn-block filt-toggle" style={{ marginTop: 10 }} onClick={() => setOpen(false)}>Show {cars.length} car{cars.length === 1 ? '' : 's'}</button>
          </aside>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-dark btn-sm filt-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide filters' : `Filters${chips.length ? ' (' + chips.length + ')' : ''}`}</button>
                <div className="muted" aria-live="polite" style={{ fontWeight: 600 }}>{list.loading ? 'Loading…' : `${cars.length} car${cars.length === 1 ? '' : 's'} match`}</div>
              </div>
              <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Sort
                <select className="input" style={{ width: 'auto', minHeight: 42 }} value={f.sort} onChange={(e) => setF({ sort: e.target.value })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
            </div>
            {chips.length > 0 && <div className="chips">{chips.map(([l, patch]) => <button key={l} className="chip" onClick={() => setF(patch)} aria-label={`Remove filter ${l}`}>{l} ✕</button>)}<button className="chip" style={{ background: 'none', color: 'var(--muted)' }} onClick={reset}>Clear all</button></div>}
            {list.error ? <div className="err">{list.error.message}</div> : !list.loading && !cars.length
              ? <div className="empty box center"><h3>No cars match right now</h3><p className="muted">Save this search and we will email you as soon as one arrives, or ask us on WhatsApp.</p><div style={{ maxWidth: 340, margin: '0 auto 10px' }}><SaveSearch filters={f} /></div><div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}><a className="btn btn-wa" href={waLink(cfg, alertMsg)} target="_blank" rel="noopener noreferrer">Alert me on WhatsApp</a><button className="btn btn-line" onClick={reset}>Clear filters</button></div></div>
              : <div className="cards">{cars.map((c) => <CarCard key={c.id} car={c} />)}</div>}
            {avail.length > 0 && (
              <section className="box faq-box">
                <h2 style={{ fontSize: 26 }}>How much {subject ? `is a ${subject}` : 'are the cars at Korrect Cars'} in Nigeria?</h2>
                <p style={{ marginBottom: 0 }}>The {avail.length} {subject ? subject + ' ' : ''}{avail.length === 1 ? 'car' : 'cars'} in stock {lo === hi ? `costs ${naira(lo)}` : `cost from ${naira(lo)} to ${naira(hi)}`}. Every car is inspected and VIN-verified, and you can <Link to="/pay-small-small">pay small small through our credit bank partners</Link>.</p>
              </section>
            )}
          </div>
        </div>
      </div>
      {cmpCars.length > 0 && (
        <div className="cmp-bar" role="region" aria-label="Compare cars">
          <div className="wrap">
            <strong>Compare {cmpCars.length} of 3</strong>
            <span className="names">{cmpCars.map((c) => c.title).join(' · ')}</span>
            <button className="btn btn-sm" style={{ background: 'transparent', color: '#fff', border: '1px solid #5B616E' }} onClick={cmp.clear}>Clear</button>
            <Link to={'/compare?ids=' + cmpCars.map((c) => c.id).join(',')} className="btn btn-sm" style={{ background: '#fff', color: 'var(--ink)' }}>Compare side by side</Link>
          </div>
        </div>
      )}
    </>
  );
}

// Save the current filters to the account; we email the customer when a matching car arrives
function SaveSearch({ filters }) {
  const { user } = useApp();
  const { go } = useRouter();
  const [state, setState] = useState({ busy: false, msg: '', err: '' });
  const key = JSON.stringify({ ...filters, sort: undefined });
  useEffect(() => { setState({ busy: false, msg: '', err: '' }); }, [key]);
  const save = async () => {
    if (!user) { go('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); return; }
    setState({ busy: true, msg: '', err: '' });
    try {
      const { sort, ...rest } = filters; // eslint-disable-line no-unused-vars
      const d = await api('/me/searches', { method: 'POST', body: { filters: rest, alerts: true } });
      setState({ busy: false, err: '', msg: d.existed ? 'Already saved. We will email you when a match arrives.' : 'Saved. We will email you when a matching car arrives.' });
    } catch (e) { setState({ busy: false, msg: '', err: e.message }); }
  };
  if (state.msg) return <div className="okmsg small" role="status" style={{ margin: 0 }}>{state.msg} <Link to="/account?tab=searches">Manage</Link></div>;
  return (
    <>
      <button className="btn btn-red btn-block" onClick={save} disabled={state.busy}>{state.busy ? 'Saving…' : '🔔 Save search & email me'}</button>
      {!user && <div className="small muted" style={{ marginTop: 6, textAlign: 'center' }}>Free account · sign in to save</div>}
      {state.err && <div className="err small" role="alert" style={{ marginTop: 8 }}>{state.err}</div>}
    </>
  );
}

export function Compare() {
  useTitle('Compare cars | Korrect Cars');
  const { query } = useRouter();
  const { cfg } = useApp();
  const cmp = useLocalList('kc-compare', 3);
  const list = useApi('/cars?limit=100');
  const ids = (query.get('ids') || cmp.list.join(',')).split(',').map(Number).filter(Boolean);
  const cars = ((list.data && list.data.cars) || []).filter((c) => ids.includes(c.id));
  const rows = [['Price', (c) => naira(c.price)], ['Pay small small (estimate)', (c) => `about ${naira(bnpl(Number(c.price), 40, 24, cfg).monthly)}/mo`], ['Year', (c) => c.year], ['Body type', (c) => c.body], ['Mileage', (c) => c.mileage], ['Engine', (c) => c.engine], ['Transmission', (c) => c.transmission], ['Fuel', (c) => c.fuel], ['Colour', (c) => c.color], ['Status', (c) => (c.status === 'sold' ? 'Sold' : 'Available')]];
  return (
    <div className="wrap sec-sm">
      <h1>Compare cars</h1>
      {list.loading ? <Loading /> : !cars.length ? <div className="box"><p>Pick up to 3 cars with the Compare button on <Link to="/cars">Cars for sale</Link>.</p></div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="compare-tbl">
            <thead><tr><th scope="col">Car</th>{cars.map((c) => <th key={c.id} scope="col" style={{ width: 'auto', background: '#fff' }}><Link to={'/cars/' + c.slug}><img src={rs(firstPhoto(c), 400)} alt="" style={{ borderRadius: 8, aspectRatio: '4/3', objectFit: 'cover', marginBottom: 8 }} />{c.title}</Link></th>)}</tr></thead>
            <tbody>{rows.map(([l, fn]) => <tr key={l}><th scope="row">{l}</th>{cars.map((c) => <td key={c.id}>{fn(c) || '—'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CarDetail({ slug }) {
  const { cfg } = useApp();
  const { data, loading, error } = useApi('/cars/' + slug);
  const [i, setI] = useState(0);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const saved = useLocalList('kc-saved');
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
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 14 }}><Link to="/">Home</Link> / <Link to="/cars">Cars for sale</Link> / <Link to={'/cars/' + slugify(car.make)}>{car.make}</Link> / <Link to={`/cars/${slugify(car.make)}/${slugify(car.model)}`}>{car.model}</Link></nav>
      <div className="detail">
        <div>
          <div className="gallery">
            <div className="main">
              <img src={rs(photos[i], 1200)} srcSet={srcset(photos[i], [800, 1200, 1600])} sizes="(max-width: 980px) 100vw, 62vw" alt={`${car.title} photo ${i + 1}`} fetchpriority={i === 0 ? 'high' : undefined} />
              {sold && <div className="sold-ov">SOLD</div>}
              {photos.length > 1 && <>
                <button className="nav-btn prev" aria-label="Previous photo" onClick={() => setI((i - 1 + photos.length) % photos.length)}>‹</button>
                <button className="nav-btn next" aria-label="Next photo" onClick={() => setI((i + 1) % photos.length)}>›</button>
              </>}
              <span className="count">{i + 1} / {photos.length}</span>
            </div>
            <div className="thumbs">{photos.map((p, k) => <button key={p} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}><img src={rs(p, 400)} alt="" loading="lazy" /></button>)}</div>
          </div>
          <h1 style={{ fontSize: 'clamp(32px,4.4vw,52px)', marginTop: 10 }}>{car.title}</h1>
          <div className="tabs" role="tablist">
            {[['overview', 'Overview'], ['specs', 'Specifications'], ['features', 'Features'], ['bnpl', 'Pay Small Small']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === 'overview' && <div className="prose">{String(car.description || '').split(/\n\n+/).filter(Boolean).map((p, k) => <p key={k}>{p}</p>)}
            {car.info && car.info.length > 0 && <ul>{car.info.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}
          {tab === 'specs' && <table className="specs"><tbody>{spec.concat(tech.filter((r) => !spec.some((s) => s[0].toLowerCase() === String(r[0]).toLowerCase()))).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>}
          {tab === 'features' && (car.features && car.features.length ? <ul className="feat">{car.features.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Ask us on WhatsApp for the full feature list.</p>)}
          {tab === 'bnpl' && (sold ? <p className="muted">This car is sold. Pick another car to see Pay Small Small options.</p> : <BnplCalc price={Number(car.price)} carTitle={car.title} carSlug={car.slug} />)}
        </div>
        <aside className="side">
          <div className="box">
            <div className="disp" style={{ fontSize: 46 }}>{naira(car.price)}</div>
            {car.old_price && !sold ? <div className="muted">Was <s>{naira(car.old_price)}</s></div> : null}
            {sold ? <div className="tag tag-grey" style={{ marginTop: 8 }}>Sold</div> : <div className="small" style={{ color: 'var(--ok)', fontWeight: 600, marginTop: 6 }}>Pay small small from about {naira(bnpl(Number(car.price), 40, 24, cfg).monthly)}/month (estimate)</div>}
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <a className="btn btn-wa" href={waLink(cfg, wa)} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              {!sold && <>
                <button className="btn btn-red" onClick={() => setModal('viewing')}>Book a viewing</button>
                <button className="btn btn-line" onClick={() => setModal('offer')}>Make an offer</button>
                <button className="btn btn-line" onClick={() => setTab('bnpl')}>Pay small small</button>
              </>}
              {cfg && cfg.phones && <a className="btn btn-dark" href={'tel:' + cfg.phones[0].replace(/\s/g, '')}>Call {cfg.phones[0]}</a>}
              <button className={'btn ' + (saved.has(car.id) ? 'btn-saved' : 'btn-line')} aria-pressed={saved.has(car.id)} onClick={() => saved.toggle(car.id)}>{saved.has(car.id) ? 'Saved ✓' : 'Save this car'}</button>
            </div>
            {!sold && <p className="small muted" style={{ margin: '14px 0 0' }}>Parked at a partner car lot in Lagos. Book a viewing and we send you the address on WhatsApp. You inspect before you pay.</p>}
          </div>
          <div className="box">
            <h3 style={{ fontSize: 22 }}>Have a car to swap?</h3>
            <p className="small muted">Use your current car as part payment. List it on Korrect Swap and we will value it. 2% swap fee, paid only after a successful inspection.</p>
            <Link to="/swap/new" className="btn btn-line btn-sm">List my car</Link>
          </div>
          <div className="notice"><b>Stay safe:</b> only pay into the Korrect Cars company account, and only after you have seen the car and its papers.</div>
        </aside>
      </div>
      {data.similar && data.similar.length > 0 && (
        <section className="sec-sm"><h2>Similar cars</h2><div className="cards">{data.similar.map((c) => <CarCard key={c.id} car={c} />)}</div></section>
      )}
      {!sold && <div className="car-bar" role="region" aria-label="Contact about this car">
        {cfg && cfg.phones && <a className="btn btn-line" href={'tel:' + cfg.phones[0].replace(/\s/g, '')}>Call</a>}
        <a className="btn btn-wa" href={waLink(cfg, wa)} target="_blank" rel="noopener noreferrer">WhatsApp about this car</a>
        <button className="btn btn-red" onClick={() => setModal('viewing')}>Book</button>
      </div>}
      {modal && <Modal onClose={() => setModal(null)} label={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'}>
        <EnquiryForm type={modal} car={car} title={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'} cta={modal === 'viewing' ? 'Request viewing' : 'Send offer'} />
      </Modal>}
    </div>
  );
}

function NotFoundCar() {
  return <div className="wrap sec"><h1>This car is no longer listed</h1><p className="muted">It may have been sold. See what is in stock now.</p><Link to="/cars" className="btn btn-red">Browse cars</Link></div>;
}

const PSS_FAQ = [
  ['How does Pay Small Small work at Korrect Cars?', 'Pick a car and get an estimate of your deposit and monthly payment. Apply in minutes, and with your consent we pass your details to our credit bank partner. Once the bank approves you, Korrect Cars sells you the car.'],
  ['Who decides if I qualify?', 'Our credit bank partner. They check if you qualify, tell you which documents they need (usually a government ID and proof of income) and set the final deposit, charge and months.'],
  ['Is the calculator figure final?', 'No. It is an estimate based on a 40% deposit and a 20% charge on the balance. The bank sets your real terms.'],
  ['Can I pay off early?', 'Early payoff, rates and months are set by the bank. Ask them when they contact you.'],
  ['Who sees my details?', 'Korrect Cars staff and our credit bank partner, and only after you agree on the last step.']
];

export function PaySmallSmall() {
  useTitle('Pay Small Small — Car Payment Plans in Lagos | Korrect Cars');
  const { query } = useRouter();
  const { cfg, user } = useApp();
  const b = (cfg && cfg.bnpl) || { minDeposit: 40, markup: 20, minMonths: 6, maxMonths: 48 };
  const partner = (cfg && cfg.bankPartner) || 'our credit bank partner';
  const list = useApi('/cars?limit=100');
  const cars = ((list.data && list.data.cars) || []).filter((c) => c.status === 'available');
  const [slug, setSlug] = useState(query.get('car') || '');
  const [custom, setCustom] = useState(Number(query.get('price')) || 10000000);
  const [pct, setPct] = useState(Math.max(b.minDeposit, Number(query.get('deposit')) || b.minDeposit));
  const [months, setMonths] = useState(Number(query.get('months')) || 24);
  const [step, setStep] = useState(1);
  const [d, setD] = useState({ name: (user && user.name) || '', phone: (user && user.phone) || '', email: (user && user.email) || '', employment: 'Salaried', employer: '', income: '', consent: false, website: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const car = cars.find((c) => c.slug === slug);
  const price = car ? Number(car.price) : custom;
  const plan = bnpl(price, pct, months, cfg);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const detailsOk = d.name.trim().length >= 2 && /^\+?[0-9 ()-]{7,20}$/.test(d.phone.trim());
  const next = () => { setErr(''); if (step === 2 && !detailsOk) { setErr('Enter your name and a valid phone number to continue.'); return; } setStep(step + 1); };
  const send = async () => {
    if (!d.consent) { setErr('Tick the box to agree before you send.'); return; }
    setErr(''); setBusy(true);
    try {
      const message = [`Pay Small Small application (estimate) for ${car ? car.title : 'a car priced ' + naira(price)}.`, `Deposit ${naira(plan.deposit)} (${plan.pct}%), ${plan.months} months, about ${naira(plan.monthly)}/month.`,
        `Employment: ${d.employment}${d.employer ? ' — ' + d.employer : ''}.`, d.income ? `Monthly income: ₦${d.income}.` : '', 'Customer agreed to share details with the credit bank partner.'].filter(Boolean).join(' ');
      await api('/enquiries', { method: 'POST', body: { type: 'bnpl', car: car ? String(car.id) : undefined, name: d.name, phone: d.phone, email: d.email, message, deposit: plan.deposit, months: plan.months, consent: true, website: d.website } });
      setStep(4);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const labels = ['Estimate', 'Your details', 'Review and send'];
  return (
    <>
      <section className="sec-dark sec-sm"><div className="wrap">
        <div className="eyebrow">Pay Small Small</div>
        <h1>Drive now. Pay small small.</h1>
        <p style={{ color: '#D5D8DE', maxWidth: 680, fontSize: 19 }}>Spread the cost of your car through our credit bank partners. Get an estimate here, apply in minutes, and we pass your application to the bank. Once the bank approves you, we sell you the car.</p>
      </div></section>
      <section className="sec-sm"><div className="wrap pss">
        <div className="pss-side">
          <div className="box">
            <h2 style={{ fontSize: 28 }}>How it works</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li><b>Estimate:</b> see a rough deposit and monthly cost.</li>
              <li><b>Apply:</b> your details, about 3 minutes.</li>
              <li><b>Bank decides:</b> {partner} checks if you qualify.</li>
              <li><b>Drive:</b> approved? We sell you the car.</li>
            </ol>
          </div>
          <div className="box">
            <h2 style={{ fontSize: 28 }}>Questions</h2>
            {PSS_FAQ.map(([q, a]) => <details key={q} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}><summary style={{ fontWeight: 600, cursor: 'pointer' }}>{q}</summary><p className="small" style={{ margin: '6px 0 0' }}>{a}</p></details>)}
          </div>
        </div>
        <div className="box pss-main">
          {step < 4 && <>
            <h2 style={{ fontSize: 30 }}>Apply through our bank partners</h2>
            <ol className="stepbar" aria-label="Application steps">{labels.map((l, k) => <li key={l} className={k + 1 < step ? 'done' : k + 1 === step ? 'on' : ''} aria-current={k + 1 === step ? 'step' : undefined}><span />{k + 1} {l}</li>)}</ol>
          </>}
          {err && <div className="err" role="alert">{err}</div>}
          {step === 1 && <>
            <div className="field">
              <label className="f" htmlFor="pss-car">Choose a car</label>
              <select id="pss-car" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
                <option value="">Enter my own price</option>
                {cars.map((c) => <option key={c.id} value={c.slug}>{c.title} — {naira(c.price)}</option>)}
              </select>
            </div>
            {!car && <div className="field"><label className="f" htmlFor="pss-price">Car price</label><input id="pss-price" className="input" inputMode="numeric" value={custom ? custom.toLocaleString('en-NG') : ''} onChange={(e) => setCustom(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} /></div>}
            <div className="field"><div className="f">Deposit you can pay <span className="muted small">(estimate)</span></div><div className="pills">{[40, 50, 60, 70].map((v) => <button key={v} type="button" className={'pill' + (pct === v ? ' on' : '')} onClick={() => setPct(v)}>{v}%</button>)}</div></div>
            <div className="field"><div className="f">Months</div><div className="pills">{[6, 12, 24, 36, 48].filter((m) => m >= b.minMonths && m <= b.maxMonths).map((m) => <button key={m} type="button" className={'pill' + (months === m ? ' on' : '')} onClick={() => setMonths(m)}>{m}</button>)}</div></div>
            <div className="pss-est"><span>Estimate: deposit {naira(plan.deposit)} · then</span><strong>{naira(plan.monthly)} × {plan.months}</strong></div>
            <p className="small muted">Based on a {b.minDeposit}% minimum deposit and a {b.markup}% charge on the balance. The bank sets your real terms.</p>
          </>}
          {step === 2 && <div className="grid2">
            <div className="field"><label className="f" htmlFor="pss-name">Full name</label><input id="pss-name" className="input" value={d.name} onChange={set('name')} autoComplete="name" required /></div>
            <div className="field"><label className="f" htmlFor="pss-phone">Phone (WhatsApp)</label><input id="pss-phone" className="input" type="tel" value={d.phone} onChange={set('phone')} autoComplete="tel" placeholder="0803 000 0000" required /></div>
            <div className="field"><label className="f" htmlFor="pss-email">Email (optional)</label><input id="pss-email" className="input" type="email" value={d.email} onChange={set('email')} autoComplete="email" /></div>
            <div className="field"><label className="f" htmlFor="pss-emp">Employment</label><select id="pss-emp" className="input" value={d.employment} onChange={set('employment')}><option>Salaried</option><option>Self-employed</option><option>Business owner</option></select></div>
            <div className="field"><label className="f" htmlFor="pss-er">Employer or business</label><input id="pss-er" className="input" value={d.employer} onChange={set('employer')} maxLength={100} /></div>
            <div className="field"><label className="f" htmlFor="pss-inc">Monthly income (₦, optional)</label><input id="pss-inc" className="input" inputMode="numeric" value={d.income} onChange={(e) => setD({ ...d, income: e.target.value.replace(/[^0-9,]/g, '').slice(0, 15) })} /></div>
            <div style={{ position: 'absolute', left: -9999 }} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={d.website} onChange={set('website')} /></label></div>
          </div>}
          {step === 3 && <>
            <div className="pss-review">
              <div><span>Car</span><b>{car ? car.title : 'Own price'} · {naira(price)}</b></div>
              <div><span>Deposit you can pay</span><b>{naira(plan.deposit)} ({plan.pct}%)</b></div>
              <div><span>Estimated monthly</span><b>{naira(plan.monthly)} × {plan.months}</b></div>
              <div><span>Your details</span><b>{d.name} · {d.phone}</b></div>
            </div>
            <div className="note-grey" style={{ marginTop: 14 }}>This is an estimate. {partner.charAt(0).toUpperCase() + partner.slice(1)} checks if you qualify and sets the final deposit, charge and months. Korrect Cars sells you the car once the bank approves you.</div>
            <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={d.consent} onChange={set('consent')} /> I agree that Korrect Cars can share my details with its credit bank partner so they can check if I qualify, as described in the <Link to="/privacy-policy">privacy policy</Link>.</label>
          </>}
          {step < 4 && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18 }}>
            <button className="btn btn-line" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={() => { setErr(''); setStep(step - 1); }}>Back</button>
            {step < 3 ? <button className="btn btn-red" onClick={next}>Continue</button> : <button className="btn btn-red" onClick={send} disabled={busy || !d.consent}>{busy ? 'Sending…' : 'Send to bank partner'}</button>}
          </div>}
          {step === 4 && <div>
            <div className="okmsg"><div className="disp" style={{ fontSize: 28 }}>Application sent</div>We have passed your details to {partner}. They will contact you directly. We will also follow up on WhatsApp.</div>
            <h3 style={{ marginTop: 18 }}>What happens next</h3>
            <ol className="track"><li className="done">Application received</li><li className="on">Sent to our bank partner</li><li>Bank checks if you qualify</li><li>Approved: we sell you the car</li></ol>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>{user ? <Link to="/account?tab=requests" className="btn btn-red">Track it in My account</Link> : <Link to="/register?next=/account?tab=requests" className="btn btn-red">Create an account to track it</Link>}<Link to="/cars" className="btn btn-line">Back to cars</Link><a className="btn btn-wa" href={waLink(cfg, 'Hello Korrect Cars, I just applied for Pay Small Small.')} target="_blank" rel="noopener noreferrer">WhatsApp us</a></div>
          </div>}
        </div>
      </div></section>
    </>
  );
}
