import React, { useState } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, date, waLink, slugify, rs, srcset } from '../lib/core.jsx';
import { CarCard, BnplCalc } from '../components/Bits.jsx';

const BUDGETS = [['', 'Any budget'], ['20000000', 'Up to ₦20m'], ['30000000', 'Up to ₦30m'], ['50000000', 'Up to ₦50m'], ['100000000', 'Up to ₦100m']];

export default function Home() {
  useTitle('Korrect Cars | Buy Tokunbo & Foreign-Used Cars in Lagos, Nigeria');
  const { go } = useRouter();
  const { cfg } = useApp();
  const swap = !!(cfg && cfg.swap);
  const stock = useApi('/cars?limit=100');
  const posts = useApi('/posts?limit=3');
  const [s, setS] = useState({ make: '', model: '', yearMin: '', body: '' });
  const [budget, setBudget] = useState('');
  const all = ((stock.data && stock.data.cars) || []).filter((c) => c.status === 'available');
  const feat = all.filter((c) => Number(c.featured));
  const cars = (feat.length >= 3 ? feat : all).slice(0, 6);
  const makes = [...new Set(all.map((c) => c.make))].sort();
  const models = [...new Set(all.filter((c) => !s.make || c.make === s.make).map((c) => c.model))].sort();
  const years = [...new Set(all.map((c) => Number(c.year)).filter(Boolean))].sort((a, b) => b - a);
  const bodiesFor = (mk, md) => [...new Set(all.filter((c) => (!mk || c.make === mk) && (!md || c.model === md)).map((c) => c.body).filter(Boolean))].sort();
  const bodies = bodiesFor(s.make, s.model);
  const autoBody = s.model && bodies.length === 1 ? bodies[0] : '';
  // When make or model changes, pick the body type automatically if there is only one, and drop one that no longer fits
  const pick = (mk, md) => { const b = bodiesFor(mk, md); return md && b.length === 1 ? b[0] : (b.includes(s.body) && !autoBody ? s.body : ''); };
  const [calcIdx, setCalcIdx] = useState(0);
  const [customPrice, setCustomPrice] = useState(10000000);
  const calcPrice = calcIdx === -1 ? customPrice : (cars[calcIdx] ? Number(cars[calcIdx].price) : customPrice);

  const search = (e) => {
    e.preventDefault();
    const base = s.make ? `/cars/${slugify(s.make)}${s.model ? '/' + slugify(s.model) : ''}` : '/cars';
    const qs = new URLSearchParams(Object.entries({ yearMin: s.yearMin, body: autoBody ? '' : s.body, maxPrice: budget }).filter(([, v]) => v));
    go(base + (qs.toString() ? '?' + qs : ''));
  };

  return (
    <>
      <section className="hero">
        <img className="bg" src={rs('/img/hero.jpg', 1600)} srcSet={srcset('/img/hero.jpg', [800, 1200, 1600])} sizes="100vw" alt="" fetchpriority="high" decoding="async" />
        <div className="shade" />
        <div className="wrap">
          <div className="eyebrow" style={{ color: '#fca5a5' }}>Lagos · Inspected · VIN-verified</div>
          <h1>Drive the right car. Pay the Korrect way.</h1>
          <p className="lead">Tokunbo and foreign-used cars we have checked inside and out. {swap ? 'Buy outright, pay small small through our credit bank partners, or swap your car with a verified owner.' : 'Buy outright or pay small small through our credit bank partners.'}</p>
          <div className="ctas">
            <Link to="/cars" className="btn btn-red">Browse cars</Link>
            <a className="btn btn-ghost" href={waLink(cfg, 'Hello Korrect Cars, I am looking for a car.')} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
          </div>
        </div>
      </section>

      <div className="wrap">
        <form className="search-card" onSubmit={search} aria-label="Find a car">
          <div className="field"><label className="f" htmlFor="home-make">Make</label><select id="home-make" className="input" value={s.make} onChange={(e) => setS({ ...s, make: e.target.value, model: '', body: pick(e.target.value, '') })}><option value="">Any make</option>{makes.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="field"><label className="f" htmlFor="home-model">Model</label><select id="home-model" className="input" value={s.model} onChange={(e) => { const mk = s.make || (all.find((c) => c.model === e.target.value) || {}).make || ''; setS({ ...s, model: e.target.value, make: mk, body: pick(mk, e.target.value) }); }}><option value="">Any model</option>{models.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="field"><label className="f" htmlFor="home-year">Year from</label><select id="home-year" className="input" value={s.yearMin} onChange={(e) => setS({ ...s, yearMin: e.target.value })}><option value="">Any year</option>{years.map((y) => <option key={y} value={y}>{y} or newer</option>)}</select></div>
          <div className="field"><label className="f" htmlFor="home-body">Body type{autoBody && <span className="muted small" style={{ fontWeight: 400 }}> · auto-selected</span>}</label><select id="home-body" className="input" value={autoBody || s.body} disabled={!!autoBody} onChange={(e) => setS({ ...s, body: e.target.value })}><option value="">Any body type</option>{bodies.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div className="field">
            <label className="f" htmlFor="home-budget">Budget</label>
            <select id="home-budget" className="input" value={budget} onChange={(e) => setBudget(e.target.value)}>{BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <button className="btn btn-red" style={{ marginBottom: 14 }}>Search cars</button>
        </form>
        <div className="trust">
          <div><b>Inspected</b><span className="muted">Mechanical, electrical and body checks on every car</span></div>
          <div><b>VIN-verified</b><span className="muted">History checked before we list it</span></div>
          <div><b>Pay Small Small</b><span className="muted">Spread the cost through our bank partners</span></div>
          {swap ? <div><b>Swap safely</b><span className="muted">Verified owners, inspection before handover</span></div>
            : <div><b>See it first</b><span className="muted">View and test-drive at a partner car lot in Lagos</span></div>}
        </div>
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><div><div className="eyebrow">In stock now</div><h2>Featured cars</h2></div><Link to="/cars" className="btn btn-line">See all cars</Link></div>
          <div className="cards">{cars.map((c) => <CarCard key={c.id} car={c} />)}</div>
        </div>
      </section>

      <section className="sec sec-grey">
        <div className="wrap">
          <div className="eyebrow">{swap ? 'Three ways to own' : 'Two ways to own'}</div>
          <h2>Your car, your way</h2>
          <div className="ways" style={{ marginTop: 24 }}>
            <div className="box"><h3>Buy outright</h3><p className="muted">Pick an inspected car, see it in person, pay and drive. Papers handed over the same day.</p><Link to="/cars">Browse cars</Link></div>
            <div className="box"><h3>Pay Small Small</h3><p className="muted">Get an estimate, apply in minutes, and we connect you to our credit bank partners. Once they approve you, we sell you the car.</p><Link to="/pay-small-small">See how it works</Link></div>
            {swap && <div className="box"><h3>Swap your car</h3><p className="muted">List your car, say what you want, and swap with a verified owner. Add or receive cash to balance it. 2% swap fee.</p><Link to="/swap">How Korrect Swap works</Link></div>}
          </div>
        </div>
      </section>

      <section className="sec" id="bnpl">
        <div className="wrap">
          <div className="sec-head"><div><div className="eyebrow">Pay Small Small</div><h2>Estimate your monthly payment</h2></div></div>
          <div className="field" style={{ maxWidth: 520 }}>
            <label className="f" htmlFor="calc-car">Choose a car</label>
            <select id="calc-car" className="input" value={calcIdx} onChange={(e) => setCalcIdx(Number(e.target.value))}>
              {cars.map((c, i) => <option key={c.id} value={i}>{c.title} — {naira(c.price)}</option>)}
              <option value={-1}>Enter my own price</option>
            </select>
          </div>
          <BnplCalc price={calcPrice} onPrice={calcIdx === -1 ? setCustomPrice : null} carTitle={calcIdx >= 0 && cars[calcIdx] ? cars[calcIdx].title : ''} carSlug={calcIdx >= 0 && cars[calcIdx] ? cars[calcIdx].slug : ''} />
        </div>
      </section>

      {swap ? <section className="sec sec-dark">
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Korrect Swap</div>
            <h2>Swap your car with a verified owner</h2>
            <p style={{ color: '#d4d4d8' }}>Tell us your car and the car you want. We check both owners and both cars' papers, match you, and host the inspection at one of our partner car lots in Lagos. No strangers' houses, no money before inspection.</p>
            <div className="ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link to="/swap/new" className="btn btn-red">List my car</Link><Link to="/swap" className="btn btn-ghost">Browse swaps</Link></div>
          </div>
          <ol className="steps" style={{ gridTemplateColumns: '1fr 1fr', padding: 0, margin: 0 }}>
            <li><b>List your car</b><div style={{ color: '#a1a1aa' }}>Photos and papers, checked by our team</div></li>
            <li><b>Get matched</b><div style={{ color: '#a1a1aa' }}>See cars that fit what you want</div></li>
            <li><b>Agree the deal</b><div style={{ color: '#a1a1aa' }}>Chat safely, agree any cash top-up</div></li>
            <li><b>Inspect and swap</b><div style={{ color: '#a1a1aa' }}>At a partner car lot in Lagos</div></li>
          </ol>
        </div>
      </section> : <section className="sec sec-dark">
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Free account</div>
            <h2>Not in stock yet? We will email you</h2>
            <p style={{ color: '#d4d4d8' }}>Save the make, model, year and budget you want. The moment a matching car arrives, we email you, before it is shared anywhere else. Your saved cars follow you to every device.</p>
            <div className="ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link to="/cars" className="btn btn-red">Choose a car and save the search</Link><Link to="/register" className="btn btn-ghost">Create a free account</Link></div>
          </div>
          <ol className="steps" style={{ gridTemplateColumns: '1fr 1fr', padding: 0, margin: 0 }}>
            <li><b>Pick what you want</b><div style={{ color: '#a1a1aa' }}>Make, model, year, body type, budget</div></li>
            <li><b>Save the search</b><div style={{ color: '#a1a1aa' }}>One tap on the cars page</div></li>
            <li><b>Get an email</b><div style={{ color: '#a1a1aa' }}>As soon as a matching car arrives</div></li>
            <li><b>Book a viewing</b><div style={{ color: '#a1a1aa' }}>At a partner car lot in Lagos</div></li>
          </ol>
        </div>
      </section>}

      <section className="sec">
        <div className="wrap">
          <div className="eyebrow">How buying works</div>
          <h2>Simple, safe, sorted</h2>
          <ol className="steps" style={{ padding: 0, marginTop: 24 }}>
            <li><b>Choose a car</b><div className="muted">Real photos, real prices, full history</div></li>
            <li><b>See it in Lagos</b><div className="muted">Book a viewing at the partner car lot where it is parked</div></li>
            <li><b>Pay safely</b><div className="muted">Only into the Korrect Cars company account</div></li>
            <li><b>Drive away</b><div className="muted">Papers, plates and handover</div></li>
          </ol>
        </div>
      </section>

      <section className="sec sec-grey" id="blog">
        <div className="wrap">
          <div className="sec-head"><div><div className="eyebrow">Guides</div><h2>Buy smarter</h2></div><Link to="/blog" className="btn btn-line">All guides</Link></div>
          <div className="post-cards">
            {((posts.data && posts.data.posts) || []).map((p) => (
              <Link key={p.slug} to={'/blog/' + p.slug} className="card">
                <div className="ph" style={{ aspectRatio: '16/9' }}>{p.image && <img src={rs(p.image, 800)} srcSet={srcset(p.image)} sizes="(max-width: 640px) 92vw, 400px" alt="" loading="lazy" />}</div>
                <div className="bd"><div className="small muted">{date(p.published_at)}</div><div className="ttl">{p.title}</div></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-band">
        <div className="wrap">
          <div><h2 style={{ marginBottom: 6 }}>Not sure which car?</h2><div>Tell us your budget and needs. We will shortlist cars for you today.</div></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-wa" href={waLink(cfg, 'Hello Korrect Cars, please help me choose a car. My budget is: ')} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
            {cfg && cfg.phones && cfg.phones[0] && <a className="btn btn-dark" href={'tel:' + cfg.phones[0].replace(/\s/g, '')}>Call {cfg.phones[0]}</a>}
          </div>
        </div>
      </section>
    </>
  );
}
