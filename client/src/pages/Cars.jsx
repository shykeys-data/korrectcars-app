// Cars for sale: the stock list with filters (make, model, year, body, budget, sort), saved searches and Compare.
// The car page is in CarDetail.jsx and the Pay Small Small page in PaySmallSmall.jsx (re-exported below).
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, hasPrice, priceText, priced, waLink, slugify, useLocalList, bnpl, firstPhoto, api, rs } from '../lib/core.jsx';
import { CarCard, Loading } from '../components/Bits.jsx';
import { pages as categoryPages } from '../../../server/lib/categories.js';
import { recommended } from '../lib/rank.js';

const BUDGETS = [['', 'Any budget'], ['20000000', 'Under ₦20m'], ['30000000', 'Under ₦30m'], ['50000000', 'Under ₦50m'], ['100000000', 'Under ₦100m']];
const SORTS = [['recommended', 'Recommended'], ['price-desc', 'Price: high to low'], ['price-asc', 'Price: low to high'], ['year-desc', 'Newest year first'], ['newest', 'Recently added']];
const YEAR_QUICK = [['2018', '', '2018 and newer'], ['2015', '2017', '2015–2017'], ['', '2014', '2014 and older']];

// Filtering happens in the browser over the whole stock (it arrives with the page).
// "Recommended" (the default) is a per-visitor daily shuffle, see lib/rank.js. Sold cars always go last.
function applyFilters(all, f, cat) {
  let cars = all.filter((c) => (!cat || cat.test(c)) && (!f.make || c.make === f.make) && (!f.model || c.model === f.model) && (!f.body || c.body === f.body)
    && (!f.condition || c.car_condition === f.condition) && (!f.maxPrice || (Number(c.price) > 0 && Number(c.price) <= Number(f.maxPrice)))
    && (!f.yearMin || Number(c.year) >= Number(f.yearMin)) && (!f.yearMax || Number(c.year) <= Number(f.yearMax))
    && (!f.state || c.state === f.state) && (!f.lga || c.lga === f.lga));
  const newest = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || b.id - a.id;
  const by = { 'price-asc': (a, b) => (!hasPrice(a) - !hasPrice(b)) || (a.price - b.price), 'price-desc': (a, b) => b.price - a.price, 'year-desc': (a, b) => (b.year - a.year) || (b.price - a.price), newest };
  if (by[f.sort]) cars = cars.slice().sort(by[f.sort]);
  else cars = recommended(cars, 'inventory');
  return cars.filter((c) => c.status !== 'sold').concat(cars.filter((c) => c.status === 'sold'));
}

export function Inventory({ makeSlug, modelSlug, category }) {
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
    yearMin: query.get('yearMin') || '', yearMax: query.get('yearMax') || '', state: query.get('state') || '', lga: query.get('lga') || '', sort: query.get('sort') || (category && category.sort) || 'recommended'
  };
  const defaultSort = (category && category.sort) || 'recommended';
  const setF = (patch) => {
    const n = { ...f, ...patch };
    if ('make' in patch && patch.make !== f.make) n.model = patch.model || '';
    if ('state' in patch && patch.state !== f.state) n.lga = patch.lga || '';
    // Body type follows make/model: drop a body type the chosen make/model doesn't come in
    if (('make' in patch || 'model' in patch) && n.body && !all.some((c) => c.body === n.body && (!n.make || c.make === n.make) && (!n.model || c.model === n.model))) n.body = '';
    // On a category page (/cars/suv) make and model go in the query, so the visitor stays in the category
    const rest = Object.entries({ ...(category ? { make: n.make, model: n.model } : {}), body: n.body, condition: n.condition, maxPrice: n.maxPrice, yearMin: n.yearMin, yearMax: n.yearMax, state: n.state, lga: n.lga, sort: n.sort === defaultSort ? '' : n.sort }).filter(([, v]) => v);
    const base = category ? `/cars/${category.slug}` : n.make ? `/cars/${slugify(n.make)}${n.model ? '/' + slugify(n.model) : ''}` : '/cars';
    go(base + (rest.length ? '?' + new URLSearchParams(rest) : ''), { replace: true, keepScroll: true });
  };
  // Re-shuffle only when the stock or the filters change, not on every redraw
  const fKey = JSON.stringify(f);
  const cars = useMemo(() => applyFilters(all, f, category), [all, fKey, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const subject = f.model ? `${f.make} ${f.model}` : f.make;
  const place = f.lga ? `${f.lga}, ${f.state}` : f.state || 'Lagos';
  const heading = category ? (subject ? `${subject}: ${category.h1.replace(/ in Lagos$/, '')}` : category.h1) : subject ? `${subject} for sale in ${place}` : `Cars for sale in ${place}`;
  useTitle(category ? `${category.h1} — Prices & Pay Small Small | Korrect Cars` : subject ? `${subject} for Sale in Lagos — Prices & Pay Small Small | Korrect Cars` : 'Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars');
  // Category links with live counts (only categories that have cars)
  const catCount = (c) => [c, all.filter((x) => x.status === 'available' && c.test(x)).length];
  const catLinks = categoryPages().filter((c) => !c.budget).map(catCount).filter(([, n]) => n > 0);
  const budgetLinks = categoryPages().filter((c) => c.budget).map(catCount).filter(([, n]) => n > 0);

  // Option lists with counts, from the cars in stock
  const count = (pred) => all.filter(pred).length;
  const makes = [...new Set(all.map((c) => c.make))].sort();
  const models = [...new Set(all.filter((c) => !f.make || c.make === f.make).map((c) => c.model))].sort();
  // Body types the chosen make/model actually come in; one body type for a model = selected automatically
  const bodies = [...new Set(all.filter((c) => (!f.make || c.make === f.make) && (!f.model || c.model === f.model)).map((c) => c.body).filter(Boolean))].sort();
  const autoBody = f.model && bodies.length === 1 ? bodies[0] : '';
  const conds = [...new Set(all.map((c) => c.car_condition).filter(Boolean))].sort();
  // Where the cars are: states and LGAs that have cars, with counts
  const states = [...new Set(all.map((c) => c.state).filter(Boolean))].sort();
  const lgas = [...new Set(all.filter((c) => c.state === f.state).map((c) => c.lga).filter(Boolean))].sort();
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
  if (f.state) chips.push([f.state, { state: '', lga: '' }]);
  if (f.lga) chips.push([f.lga, { lga: '' }]);
  const reset = () => go(category ? '/cars/' + category.slug : '/cars', { replace: true, keepScroll: true });

  const avail = cars.filter((c) => c.status === 'available');
  const pricedAvail = priced(avail);
  const lo = pricedAvail.length ? Math.min(...pricedAvail.map((c) => Number(c.price))) : 0;
  const hi = pricedAvail.length ? Math.max(...pricedAvail.map((c) => Number(c.price))) : 0;
  const cmpCars = all.filter((c) => cmp.has(c.id));
  const alertMsg = `Hello Korrect Cars, please alert me when you have: ${chips.map((c) => c[0]).join(', ') || 'any car'}.`;

  return (
    <>
      <div className="wrap sec-sm">
        <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}><Link to="/">Home</Link> / <Link to="/cars">Cars for sale</Link>{category && <> / <Link to={'/cars/' + category.slug}>{category.name}</Link></>}{!category && f.make && <> / <Link to={'/cars/' + slugify(f.make)}>{f.make}</Link></>}{!category && f.model && <> / {f.model}</>}</nav>
        <h1>{heading}</h1>
        <p className="muted" style={{ marginTop: -4 }}>{category ? category.intro : 'Every car inspected and VIN-verified · parked at partner car lots in Lagos'}</p>
        {catLinks.length > 1 && <nav className="cat-links" aria-label="Browse by category">
          <Link to="/cars" className={'pill' + (!category ? ' on' : '')}>All cars</Link>
          {catLinks.map(([c, n]) => <Link key={c.slug} to={'/cars/' + c.slug} className={'pill' + (category && category.slug === c.slug ? ' on' : '')} aria-current={category && category.slug === c.slug ? 'page' : undefined}>{c.name}<span className="n">{n}</span></Link>)}
        </nav>}
        {budgetLinks.length > 0 && <><div className="small muted" style={{ margin: '12px 0 6px', fontWeight: 600 }}>Shop by budget</div><nav className="cat-links" aria-label="Shop by budget">
                    {budgetLinks.map(([c, n]) => <Link key={c.slug} to={'/cars/' + c.slug} className={'pill' + (category && category.slug === c.slug ? ' on' : '')} aria-current={category && category.slug === c.slug ? 'page' : undefined}>{c.name}<span className="n">{n}</span></Link>)}
        </nav></>}
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
            {states.length > 0 && <div className="grp"><h3>Location</h3>
              <div className="yr">
                <label className="small">State<select className="input" value={f.state} onChange={(e) => setF({ state: e.target.value })} aria-label="State"><option value="">Any state</option>{states.map((x) => <option key={x} value={x}>{x} ({count((c) => c.state === x)})</option>)}</select></label>
                <label className="small">LGA<select className="input" value={f.lga} disabled={!f.state} onChange={(e) => setF({ lga: e.target.value })} aria-label="LGA"><option value="">{f.state ? 'Any LGA' : 'Pick a state'}</option>{lgas.map((x) => <option key={x} value={x}>{x} ({count((c) => c.state === f.state && c.lga === x)})</option>)}</select></label>
              </div>
            </div>}
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
                <h2 style={{ fontSize: 26 }}>{subject ? `How much is a ${subject} in Nigeria?` : category ? category.faq : 'How much are the cars at Korrect Cars in Nigeria?'}</h2>
                <p style={{ marginBottom: 0 }}>The {avail.length} {subject ? subject + ' ' : ''}{avail.length === 1 ? 'car' : 'cars'} {category && !subject ? `in "${category.name}" ` : ''}in stock {lo === hi ? `costs ${naira(lo)}` : `cost from ${naira(lo)} to ${naira(hi)}`}. Every car is inspected and VIN-verified, and you can <Link to="/pay-small-small">pay small small through our credit partners</Link>.</p>
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
  const rows = [['Price', (c) => priceText(c)], ['Pay small small (estimate)', (c) => (hasPrice(c) ? `about ${naira(bnpl(Number(c.price), 40, 24, cfg).monthly)}/mo` : 'Ask us')], ['Year', (c) => c.year], ['Body type', (c) => c.body], ['Mileage', (c) => c.mileage], ['Engine', (c) => c.engine], ['Transmission', (c) => c.transmission], ['Fuel', (c) => c.fuel], ['Colour', (c) => c.color], ['Status', (c) => (c.status === 'sold' ? 'Sold' : 'Available')]];
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

export { CarDetail } from './CarDetail.jsx';
export { PaySmallSmall } from './PaySmallSmall.jsx';
