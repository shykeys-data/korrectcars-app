// One car's page: photos, price, Pay Small Small estimate, inspection notes, enquiry form and similar cars.
import React, { useState, useEffect } from 'react';
import { Link, useRouter, useApi, useApp, useTitle, naira, waLink, slugify, useLocalList, bnpl, rs, srcset } from '../lib/core.jsx';
import { CarCard, BnplCalc, EnquiryForm, Loading, ErrorBox, Modal } from '../components/Bits.jsx';


// Staff-written inspection notes for this car (shown only when filled in)
function InspectionNotes({ ins }) {
  if (!ins || !Array.isArray(ins.items) || !ins.items.length) return null;
  return (
    <section className="box inspect" aria-labelledby="inspect-h">
      <h2 id="inspect-h">Korrect Cars inspection notes</h2>
      {(ins.by || ins.date) && <div className="small muted">Inspected{ins.by ? ` by ${ins.by}` : ''}{ins.date ? ` on ${ins.date}` : ''} at a partner car lot, Lagos</div>}
      <dl>{ins.items.map((i) => (
        <div key={i.area} className={'inspect-row ' + (i.status === 'watch' ? 'watch' : 'ok')}>
          <span className="inspect-ic" aria-hidden="true">{i.status === 'watch' ? '!' : '✓'}</span>
          <div><dt>{i.area}{i.status === 'watch' ? <span className="sr"> (worth a look)</span> : null}</dt><dd>{i.note || (i.status === 'ok' ? 'Checked, no problems found' : '')}</dd></div>
        </div>
      ))}</dl>
    </section>
  );
}

export function CarDetail({ slug }) {
  const { cfg } = useApp();
  const { data, loading, error } = useApi('/cars/' + slug);
  const { go } = useRouter();
  useEffect(() => { if (data && data.movedTo) go('/cars/' + data.movedTo, { replace: true }); }, [data && data.movedTo]); // eslint-disable-line
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
      {sold && <div className="notice" role="status" style={{ marginBottom: 16 }}><b>This {car.make} {car.model} has been sold.</b> {data.similar && data.similar.length ? <>See <a href="#similar">similar cars in stock</a>, or </> : ''}<Link to={`/cars/${slugify(car.make)}/${slugify(car.model)}`}>every {car.make} {car.model}</Link> · <Link to="/cars">all cars for sale</Link>. Or ask us on WhatsApp to find you one like it.</div>}
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
          <InspectionNotes ins={car.inspection} />
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
            {!sold && <p className="small muted" style={{ margin: '14px 0 0' }}>Parked at a partner car lot in Lagos. Book a viewing and we send you the address on WhatsApp. You inspect before you pay. We also deliver anywhere in Nigeria.</p>}
          </div>
          {cfg && cfg.swap && <div className="box">
            <h3 style={{ fontSize: 22 }}>Want to change your car?</h3>
            <p className="small muted">Swap it with a verified owner on Korrect Swap. We check both owners and their papers, and both cars are inspected at a partner car lot. {(cfg && cfg.swapFeePct) || 2}% fee, paid only after a successful swap.</p>
            <Link to="/swap/new" className="btn btn-line btn-sm">List my car</Link>
          </div>}
          <div className="notice"><b>Stay safe:</b> only pay into the Korrect Cars company account, and only after you have seen the car and its papers.</div>
        </aside>
      </div>
      {data.similar && data.similar.length > 0 && (
        <section className="sec-sm" id="similar"><h2>{sold ? 'Similar cars in stock' : 'Similar cars'}</h2><div className="cards">{data.similar.map((c) => <CarCard key={c.id} car={c} />)}</div></section>
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
