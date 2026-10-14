import React, { useState } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, date, waLink } from '../lib/core.jsx';
import Cascade from '../components/Cascade.jsx';
import { CarCard, BnplCalc } from '../components/Bits.jsx';

const BUDGETS = [['', 'Any budget'], ['20000000', 'Up to ₦20m'], ['30000000', 'Up to ₦30m'], ['50000000', 'Up to ₦50m'], ['100000000', 'Up to ₦100m']];

export default function Home() {
  useTitle('Korrect Cars | Buy Tokunbo & Foreign-Used Cars in Lagos, Nigeria');
  const { go } = useRouter();
  const { cfg } = useApp();
  const facets = useApi('/cars/facets');
  const featured = useApi('/cars?featured=1&limit=6');
  const posts = useApi('/posts?limit=3');
  const [s, setS] = useState({ make: '', model: '', body: '' });
  const [budget, setBudget] = useState('');
  const cars = (featured.data && featured.data.cars) || [];
  const [calcIdx, setCalcIdx] = useState(0);
  const [customPrice, setCustomPrice] = useState(10000000);
  const calcPrice = calcIdx === -1 ? customPrice : (cars[calcIdx] ? Number(cars[calcIdx].price) : customPrice);

  const search = (e) => {
    e.preventDefault();
    const qs = new URLSearchParams(Object.entries({ ...s, maxPrice: budget }).filter(([, v]) => v));
    go('/cars' + (qs.toString() ? '?' + qs : ''));
  };

  return (
    <>
      <section className="hero">
        <div className="bg" style={{ backgroundImage: 'url(/img/hero.jpg)' }} />
        <div className="shade" />
        <div className="wrap">
          <div className="eyebrow" style={{ color: '#fca5a5' }}>Lagos · Inspected · VIN-verified</div>
          <h1>Drive the right car. Pay the Korrect way.</h1>
          <p className="lead">Tokunbo and foreign-used cars we have checked inside and out. Buy outright, Pay Small Small from 40% down, or swap your car with a verified owner.</p>
          <div className="ctas">
            <Link to="/cars" className="btn btn-red">Browse cars</Link>
            <a className="btn btn-ghost" href={waLink(cfg, 'Hello Korrect Cars, I am looking for a car.')} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
          </div>
        </div>
      </section>

      <div className="wrap">
        <form className="search-card" onSubmit={search} aria-label="Find a car">
          <Cascade tree={facets.data && facets.data.makes} value={s} onChange={setS} idPrefix="home" />
          <div className="field">
            <label className="f" htmlFor="home-budget">Budget</label>
            <select id="home-budget" className="input" value={budget} onChange={(e) => setBudget(e.target.value)}>{BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <button className="btn btn-red" style={{ marginBottom: 14 }}>Search cars</button>
        </form>
        <div className="trust">
          <div><b>Inspected</b><span className="muted">Mechanical, electrical and body checks on every car</span></div>
          <div><b>VIN-verified</b><span className="muted">History checked before we list it</span></div>
          <div><b>40% down</b><span className="muted">Pay Small Small over 6 to 48 months</span></div>
          <div><b>Swap safely</b><span className="muted">Verified owners, inspection before handover</span></div>
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
          <div className="eyebrow">Three ways to own</div>
          <h2>Your car, your way</h2>
          <div className="ways" style={{ marginTop: 24 }}>
            <div className="box"><h3>Buy outright</h3><p className="muted">Pick an inspected car, see it in person, pay and drive. Papers handed over the same day.</p><Link to="/cars">Browse cars</Link></div>
            <div className="box"><h3>Pay Small Small</h3><p className="muted">Pay 40% or more today, spread the balance over 6 to 48 months.</p><Link to="/pay-small-small">See your monthly payment</Link></div>
            <div className="box"><h3>Swap your car</h3><p className="muted">List your car, say what you want, and swap with a verified owner. Add or receive cash to balance it.</p><Link to="/swap">How Korrect Swap works</Link></div>
          </div>
        </div>
      </section>

      <section className="sec" id="bnpl">
        <div className="wrap">
          <div className="sec-head"><div><div className="eyebrow">Pay Small Small</div><h2>See your monthly payment</h2></div></div>
          <div className="field" style={{ maxWidth: 520 }}>
            <label className="f" htmlFor="calc-car">Choose a car</label>
            <select id="calc-car" className="input" value={calcIdx} onChange={(e) => setCalcIdx(Number(e.target.value))}>
              {cars.map((c, i) => <option key={c.id} value={i}>{c.title} — {naira(c.price)}</option>)}
              <option value={-1}>Enter my own price</option>
            </select>
          </div>
          <BnplCalc price={calcPrice} onPrice={calcIdx === -1 ? setCustomPrice : null} carTitle={calcIdx >= 0 && cars[calcIdx] ? cars[calcIdx].title : ''} />
        </div>
      </section>

      <section className="sec sec-dark">
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Korrect Swap</div>
            <h2>Swap your car with a verified owner</h2>
            <p style={{ color: '#d4d4d8' }}>Tell us your car and the car you want. We check both owners and both cars' papers, match you, and host the inspection at a Korrect Cars point. No strangers' houses, no money before inspection.</p>
            <div className="ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link to="/swap/new" className="btn btn-red">List my car</Link><Link to="/swap" className="btn btn-ghost">Browse swaps</Link></div>
          </div>
          <ol className="steps" style={{ gridTemplateColumns: '1fr 1fr', padding: 0, margin: 0 }}>
            <li><b>List your car</b><div style={{ color: '#a1a1aa' }}>Photos and papers, checked by our team</div></li>
            <li><b>Get matched</b><div style={{ color: '#a1a1aa' }}>See cars that fit what you want</div></li>
            <li><b>Agree the deal</b><div style={{ color: '#a1a1aa' }}>Chat safely, agree any cash top-up</div></li>
            <li><b>Inspect and swap</b><div style={{ color: '#a1a1aa' }}>At a Korrect Cars inspection point</div></li>
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="eyebrow">How buying works</div>
          <h2>Simple, safe, sorted</h2>
          <ol className="steps" style={{ padding: 0, marginTop: 24 }}>
            <li><b>Choose a car</b><div className="muted">Real photos, real prices, full history</div></li>
            <li><b>See it in Lagos</b><div className="muted">Book a viewing or test drive</div></li>
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
                <div className="ph" style={{ aspectRatio: '16/9' }}>{p.image && <img src={p.image} alt="" loading="lazy" />}</div>
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
