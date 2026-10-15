import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, api, firstPhoto, rs, srcset } from '../lib/core.jsx';
import Cascade, { bodiesFor } from '../components/Cascade.jsx';
import { Loading, ErrorBox } from '../components/Bits.jsx';

function ListingCard({ l }) {
  return (
    <Link to={'/swap/' + l.id} className="card">
      <div className="ph"><img src={rs(firstPhoto(l), 800)} srcSet={srcset(firstPhoto(l))} sizes="(max-width: 640px) 92vw, 400px" alt={`${l.year} ${l.make} ${l.model}`} loading="lazy" /></div>
      <div className="bd">
        <div className="ttl">{l.year} {l.make} {l.model}</div>
        <div className="price" style={{ fontSize: 24 }}>Valued {naira(l.value)}</div>
        <div className="meta"><span>{l.body}</span>{l.location && <span>{l.location}</span>}{l.owner && l.owner.verified && <span style={{ color: 'var(--ok)' }}>Verified owner</span>}</div>
        {(l.wants_makes || []).length > 0 || (l.wants_bodies || []).length > 0
          ? <div className="small muted">Wants: {[...(l.wants_makes || []), ...(l.wants_bodies || [])].join(', ')}</div> : null}
      </div>
    </Link>
  );
}

export function SwapHome() {
  useTitle('Korrect Swap — Swap Your Car With Verified Owners | Korrect Cars');
  const { catalog, loadCatalog } = useApp();
  useEffect(loadCatalog, [loadCatalog]);
  const [f, setF] = useState({ make: '', model: '', body: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const list = useApi('/swap/listings' + (qs ? '?' + qs : ''));
  const items = (list.data && list.data.listings) || [];
  return (
    <>
      <section className="sec-dark sec-sm"><div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 28, alignItems: 'center' }}>
        <div>
          <div className="eyebrow">Korrect Swap</div>
          <h1>Swap your car with a verified owner</h1>
          <p style={{ color: '#d4d4d8', fontSize: 19 }}>List your car and say what you want in return. Every owner and every set of papers is checked by our team before a listing goes live. You only meet at a Korrect Cars inspection point.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link to="/swap/new" className="btn btn-red">List my car</Link><Link to="/account" className="btn btn-ghost">My swaps</Link></div>
        </div>
        <ol className="steps" style={{ gridTemplateColumns: '1fr 1fr', padding: 0, margin: 0 }}>
          <li><b>List your car</b><div style={{ color: '#a1a1aa' }}>Photos, papers and what you want</div></li>
          <li><b>We verify</b><div style={{ color: '#a1a1aa' }}>Owner ID and car papers checked</div></li>
          <li><b>Make or get offers</b><div style={{ color: '#a1a1aa' }}>Agree a cash top-up if values differ</div></li>
          <li><b>Inspect and swap</b><div style={{ color: '#a1a1aa' }}>At a partner car lot; small success fee</div></li>
        </ol>
      </div></section>
      <section className="sec-sm"><div className="wrap">
        <div className="sec-head"><h2 style={{ margin: 0 }}>Cars available to swap</h2></div>
        <div className="search-card" style={{ marginTop: 0, boxShadow: 'none', border: '1px solid var(--line)', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <Cascade tree={catalog} value={f} onChange={setF} idPrefix="sw" />
        </div>
        <div style={{ marginTop: 24 }}>
          {list.loading ? <Loading /> : items.length === 0
            ? <div className="empty"><h3>No swap listings yet</h3><p className="muted" style={{ maxWidth: 520, margin: '0 auto 16px' }}>Korrect Swap has just opened. Be one of the first owners to list your car, and we will notify you when a matching car is listed.</p><Link to="/swap/new" className="btn btn-red">List my car</Link></div>
            : <div className="cards">{items.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
        </div>
      </div></section>
      <section className="sec-sm sec-grey"><div className="wrap">
        <h2>Swapping safely</h2>
        <div className="ways">
          <div className="box"><h3>Verified people</h3><p className="small muted">Phone and ID checked. Car papers checked against the VIN before a listing goes live.</p></div>
          <div className="box"><h3>Private until you agree</h3><p className="small muted">Phone numbers are hidden in chat until both owners accept an offer.</p></div>
          <div className="box"><h3>Inspection first</h3><p className="small muted">Both cars are inspected at a partner car lot in Lagos before keys, papers or any cash change hands.</p></div>
        </div>
      </div></section>
    </>
  );
}

export function SwapListing({ id }) {
  const { user, cfg } = useApp();
  const { go } = useRouter();
  const { data, loading, error } = useApi('/swap/listings/' + id);
  const mine = useApi(user ? '/swap/mine' : null, [user]);
  const [i, setI] = useState(0);
  const [o, setO] = useState({ fromListing: '', topUp: '', topUpPayer: 'from', message: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const l = data && data.listing;
  useTitle(l ? `${l.year} ${l.make} ${l.model} — Korrect Swap` : null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const myLive = ((mine.data && mine.data.listings) || []).filter((x) => x.status === 'live');
  const chosen = myLive.find((x) => String(x.id) === String(o.fromListing));
  const gap = chosen ? Number(l.value) - Number(chosen.value) : 0;
  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api('/swap/offers', { method: 'POST', body: { listing: String(l.id), fromListing: String(o.fromListing), topUp: Number(String(o.topUp).replace(/[^0-9]/g, '')) || 0, topUpPayer: o.topUpPayer, message: o.message } });
      go('/account');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const photos = l.photos && l.photos.length ? l.photos : ['/img/hero.jpg'];
  return (
    <div className="wrap sec-sm">
      <nav className="small muted" style={{ marginBottom: 14 }}><Link to="/swap">Korrect Swap</Link> / {l.make} {l.model}</nav>
      <div className="detail">
        <div>
          <div className="gallery"><div className="main"><img src={rs(photos[i], 1200)} srcSet={srcset(photos[i], [800, 1200, 1600])} sizes="(max-width: 980px) 100vw, 62vw" alt="" /><span className="count">{i + 1} / {photos.length}</span></div>
            <div className="thumbs">{photos.map((p, k) => <button key={p} className={k === i ? 'on' : ''} onClick={() => setI(k)}><img src={rs(p, 400)} alt="" loading="lazy" /></button>)}</div></div>
          <h1 style={{ fontSize: 46 }}>{l.year} {l.make} {l.model}</h1>
          <table className="specs"><tbody>
            {[['Valued at', naira(l.value)], ['Body type', l.body], ['Mileage', l.mileage], ['Condition', l.car_condition], ['Transmission', l.transmission], ['Colour', l.color], ['Location', l.location], ['Owner', `${l.owner.name}${l.owner.verified ? ' · verified' : ''}`]].filter(([, v]) => v).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
          </tbody></table>
          {l.description && <p style={{ marginTop: 16 }}>{l.description}</p>}
          <div className="box" style={{ marginTop: 16 }}><b>Wants in return:</b> {[...(l.wants_makes || []), ...(l.wants_bodies || [])].join(', ') || 'Open to offers'}{l.max_top_up ? ` · can add up to ${naira(l.max_top_up)}` : ''}{l.wants_notes ? <div className="small muted">{l.wants_notes}</div> : null}</div>
        </div>
        <aside className="side">
          <div className="box">
            <h3>Offer a swap</h3>
            {!user ? <><p className="muted">Sign in to offer your car for this one.</p><Link to={'/login?next=/swap/' + l.id} className="btn btn-red btn-block">Sign in</Link></>
              : myLive.length === 0 ? <><p className="muted">You need an approved car on Korrect Swap before you can make offers.</p><Link to="/swap/new" className="btn btn-red btn-block">List my car</Link></>
                : <form onSubmit={send}>
                  {err && <div className="err">{err}</div>}
                  <div className="field"><label className="f" htmlFor="of-car">Your car</label>
                    <select id="of-car" className="input" required value={o.fromListing} onChange={(e) => setO({ ...o, fromListing: e.target.value })}>
                      <option value="">Choose your car</option>{myLive.map((x) => <option key={x.id} value={x.id}>{x.year} {x.make} {x.model} — {naira(x.value)}</option>)}
                    </select></div>
                  {chosen && <p className="small muted">Value gap: {gap === 0 ? 'none' : `${naira(Math.abs(gap))} ${gap > 0 ? 'in their favour' : 'in your favour'}`}</p>}
                  <div className="field"><div className="f">Cash top-up</div>
                    <div className="chips">{[['from', 'I add cash'], ['to', 'They add cash'], ['none', 'No cash']].map(([k, t]) => <button type="button" key={k} className={'chip' + (o.topUpPayer === k ? ' on' : '')} onClick={() => setO({ ...o, topUpPayer: k, topUp: k === 'none' ? '' : (o.topUp || (chosen ? String(Math.abs(gap)) : '')) })}>{t}</button>)}</div></div>
                  {o.topUpPayer !== 'none' && <div className="field"><label className="f" htmlFor="of-amt">Amount (₦)</label><input id="of-amt" className="input" inputMode="numeric" value={o.topUp ? Number(String(o.topUp).replace(/[^0-9]/g, '')).toLocaleString('en-NG') : ''} onChange={(e) => setO({ ...o, topUp: e.target.value })} /></div>}
                  <div className="field"><label className="f" htmlFor="of-msg">Message</label><textarea id="of-msg" className="input" rows={3} maxLength={1000} value={o.message} onChange={(e) => setO({ ...o, message: e.target.value })} placeholder="Introduce your car" /><div className="hint">Phone numbers and links are hidden until the owner accepts.</div></div>
                  <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send swap offer'}</button>
                  <p className="small muted" style={{ marginTop: 8 }}>A success fee of {(cfg && cfg.swapFeePct) || 2}% of the higher car value is due only if the swap completes.</p>
                </form>}
          </div>
          <div className="notice">Never hand over a car, papers or money before the inspection at a partner car lot in Lagos.</div>
        </aside>
      </div>
    </div>
  );
}

export function SwapNew() {
  useTitle('List my car — Korrect Swap');
  const { user, catalog, loadCatalog } = useApp();
  const { go } = useRouter();
  useEffect(loadCatalog, [loadCatalog]);
  const [step, setStep] = useState(1);
  const [car, setCar] = useState({ make: '', model: '', body: '' });
  const [d, setD] = useState({ year: '', mileage: '', value: '', location: '', condition: 'Foreign Used', color: '', transmission: 'Automatic', description: '', maxTopUp: '', wantsNotes: '' });
  const [wantsMakes, setWM] = useState([]); const [wantsBodies, setWB] = useState([]);
  const [photos, setPhotos] = useState([]); const [papers, setPapers] = useState([]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  if (user === undefined) return <Loading />;
  if (!user) return <div className="wrap sec" style={{ maxWidth: 640 }}><h1>List your car</h1><p className="muted">Create a free account or sign in first. It keeps your car, papers and offers private to you.</p><div style={{ display: 'flex', gap: 12 }}><Link to="/register?next=/swap/new" className="btn btn-red">Create account</Link><Link to="/login?next=/swap/new" className="btn btn-line">Sign in</Link></div></div>;
  if (done) return <div className="wrap sec" style={{ maxWidth: 640 }}><div className="okmsg"><h2 style={{ marginTop: 0 }}>Sent for review</h2>Our team will check your photos and papers, usually within one working day. You will see the status in your dashboard.</div><Link to="/account" className="btn btn-red" style={{ marginTop: 16 }}>Go to my dashboard</Link></div>;
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const allBodies = bodiesFor(catalog, '', '');
  const next1 = (e) => { e.preventDefault(); if (!car.make || !car.model || !car.body) return setErr('Choose make, model and body type.'); setErr(''); setStep(2); };
  const next2 = (e) => { e.preventDefault(); setErr(''); setStep(3); };
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (photos.length < 3) return setErr('Add at least 3 photos.');
    if (!papers.length) return setErr('Add the car papers.');
    const fd = new FormData();
    Object.entries({ ...car, ...d, value: String(d.value).replace(/[^0-9]/g, ''), maxTopUp: String(d.maxTopUp).replace(/[^0-9]/g, '') }).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
    wantsMakes.forEach((m) => fd.append('wantsMakes', m)); wantsBodies.forEach((b) => fd.append('wantsBodies', b));
    [...photos].slice(0, 10).forEach((f) => fd.append('photos', f)); [...papers].slice(0, 3).forEach((f) => fd.append('papers', f));
    setBusy(true);
    try { await api('/swap/listings', { method: 'POST', form: fd }); setDone(true); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const years = []; for (let y = new Date().getFullYear() + 1; y >= 1995; y--) years.push(y);
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 760 }}>
      <div className="eyebrow">Korrect Swap · step {step} of 3</div>
      <h1>List your car</h1>
      <div className="wizard-steps">{[1, 2, 3].map((n) => <div key={n} className={n <= step ? 'on' : ''} />)}</div>
      {err && <div className="err" role="alert">{err}</div>}
      {step === 1 && <form onSubmit={next1} className="box">
        <h3>Your car</h3>
        <div className="grid2"><Cascade tree={catalog} value={car} onChange={setCar} required idPrefix="new" />
          <div className="field"><label className="f" htmlFor="n-year">Year</label><select id="n-year" className="input" required value={d.year} onChange={set('year')}><option value="">Choose year</option>{years.map((y) => <option key={y}>{y}</option>)}</select></div>
          <div className="field"><label className="f" htmlFor="n-val">Your asking value (₦)</label><input id="n-val" className="input" inputMode="numeric" required value={d.value ? Number(String(d.value).replace(/[^0-9]/g, '')).toLocaleString('en-NG') : ''} onChange={set('value')} /></div>
          <div className="field"><label className="f" htmlFor="n-mil">Mileage</label><input id="n-mil" className="input" value={d.mileage} onChange={set('mileage')} placeholder="e.g. 85,000 miles" /></div>
          <div className="field"><label className="f" htmlFor="n-loc">Location</label><input id="n-loc" className="input" required minLength={2} value={d.location} onChange={set('location')} placeholder="e.g. Ikeja, Lagos" /></div>
          <div className="field"><label className="f" htmlFor="n-cond">Condition</label><select id="n-cond" className="input" value={d.condition} onChange={set('condition')}><option>Foreign Used</option><option>Nigerian Used</option></select></div>
          <div className="field"><label className="f" htmlFor="n-tr">Transmission</label><select id="n-tr" className="input" value={d.transmission} onChange={set('transmission')}><option>Automatic</option><option>Manual</option></select></div>
          <div className="field"><label className="f" htmlFor="n-col">Colour</label><input id="n-col" className="input" value={d.color} onChange={set('color')} /></div>
        </div>
        <div className="field"><label className="f" htmlFor="n-desc">Anything buyers should know</label><textarea id="n-desc" className="input" maxLength={2000} value={d.description} onChange={set('description')} /></div>
        <button className="btn btn-red">Next: what you want</button>
      </form>}
      {step === 2 && <form onSubmit={next2} className="box">
        <h3>What do you want in return?</h3>
        <div className="field"><div className="f">Makes you would accept</div><div className="chips">{Object.keys(catalog || {}).map((m) => <button type="button" key={m} className={'chip' + (wantsMakes.includes(m) ? ' on' : '')} aria-pressed={wantsMakes.includes(m)} onClick={() => toggle(wantsMakes, setWM, m)}>{m}</button>)}</div></div>
        <div className="field"><div className="f">Body types</div><div className="chips">{allBodies.map((b) => <button type="button" key={b} className={'chip' + (wantsBodies.includes(b) ? ' on' : '')} aria-pressed={wantsBodies.includes(b)} onClick={() => toggle(wantsBodies, setWB, b)}>{b}</button>)}</div></div>
        <div className="grid2">
          <div className="field"><label className="f" htmlFor="n-top">Most cash you can add (₦)</label><input id="n-top" className="input" inputMode="numeric" value={d.maxTopUp ? Number(String(d.maxTopUp).replace(/[^0-9]/g, '')).toLocaleString('en-NG') : ''} onChange={set('maxTopUp')} placeholder="0 if none" /></div>
          <div className="field"><label className="f" htmlFor="n-notes">Notes</label><input id="n-notes" className="input" maxLength={500} value={d.wantsNotes} onChange={set('wantsNotes')} placeholder="e.g. 2015 or newer" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}><button type="button" className="btn btn-line" onClick={() => setStep(1)}>Back</button><button className="btn btn-red">Next: photos and papers</button></div>
      </form>}
      {step === 3 && <form onSubmit={submit} className="box">
        <h3>Photos and papers</h3>
        <div className="field"><label className="f" htmlFor="n-ph">Car photos (3 to 10, JPG or PNG, max 6 MB each)</label><input id="n-ph" className="input" style={{ paddingTop: 12 }} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setPhotos(e.target.files)} /><div className="hint">Front, back, both sides, dashboard with mileage, and interior. Location data is removed from photos.</div></div>
        <div className="field"><label className="f" htmlFor="n-pp">Car papers (customs, purchase receipt or proof of ownership)</label><input id="n-pp" className="input" style={{ paddingTop: 12 }} type="file" accept="image/jpeg,image/png,application/pdf" multiple onChange={(e) => setPapers(e.target.files)} /><div className="hint">Stored privately. Only Korrect Cars staff can see them, and every view is logged.</div></div>
        <div style={{ display: 'flex', gap: 10 }}><button type="button" className="btn btn-line" onClick={() => setStep(2)}>Back</button><button className="btn btn-red" disabled={busy}>{busy ? 'Uploading…' : 'Send for review'}</button></div>
      </form>}
    </div>
  );
}
