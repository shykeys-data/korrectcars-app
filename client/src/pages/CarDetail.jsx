// One car's page: photos, price, Pay Small Small estimate, inspection notes, enquiry form and similar cars.
import React, { useState, useEffect } from 'react';
import { placeOf } from '../../../server/lib/places.js';
import { Link, useRouter, useApi, useApp, useTitle, naira, hasPrice, priceText, waLink, slugify, useLocalList, sellerWa, sellerPhone, sellerName, bnpl, rs, srcset, api } from '../lib/core.jsx';
import { CarCard, BnplCalc, EnquiryForm, Loading, ErrorBox, Modal, SellerBadge, SELLER_TYPES } from '../components/Bits.jsx';


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
  // Count this view once per car per day, however the buyer arrived (Google, WhatsApp or the site itself)
  const carId = data && data.car && data.car.id;
  useEffect(() => {
    if (!carId) return;
    const day = new Date(Date.now() + 3600000).toISOString().slice(0, 10); const k = `kc-view:${carId}`;
    try { if (localStorage.getItem(k) === day) return; localStorage.setItem(k, day); } catch (_e) { /* private mode: the server still drops repeats */ }
    api(`/cars/${carId}/view`, { method: 'POST' }).catch(() => {});
  }, [carId]);
  const car = data && data.car;
  useTitle(car ? `${car.title} for Sale in ${placeOf(car)}${hasPrice(car) ? ' — ' + priceText(car) : ''} | Korrect Cars` : null);
  if (loading && !car) return <Loading />;
  if (error) return error.status === 404 ? <NotFoundCar /> : <ErrorBox error={error} />;
  const photos = car.photos && car.photos.length ? car.photos : ['/img/hero.jpg'];
  const sold = car.status === 'sold';
  const spec = [['Year', car.year], ['Make', car.make], ['Model', car.model], ['Trim', car.trim_level], ['Body type', car.body], ['Condition', car.car_condition], ['Mileage', car.mileage], ['Engine', car.engine], ['Transmission', car.transmission], ['Drivetrain', car.drivetrain], ['Fuel', car.fuel], ['Exterior colour', car.color], ['Interior', car.interior], ['Location', car.location], ['Stock number', car.stock]].filter(([, v]) => v);
  const tech = (car.specs || []).filter((r) => r && r[0]);
  const wa = `Hello ${sellerName(car)}, I saw this on Korrect Cars. I am interested in the ${car.title}${hasPrice(car) ? ` (${priceText(car)})` : ''}. ${window.location.href}`;
  return (
    <div className="wrap sec-sm">
      <nav className="small muted" aria-label="Breadcrumb" style={{ marginBottom: 14 }}><Link to="/">Home</Link> / <Link to="/cars">Cars for sale</Link> / <Link to={'/cars/' + slugify(car.make)}>{car.make}</Link> / <Link to={`/cars/${slugify(car.make)}/${slugify(car.model)}`}>{car.model}</Link></nav>
      {sold && <div className="notice" role="status" style={{ marginBottom: 16 }}><b>This {car.make} {car.model} has been sold.</b> {data.similar && data.similar.length ? <>See <a href="#similar">similar cars in stock</a>, or </> : ''}<Link to={`/cars/${slugify(car.make)}/${slugify(car.model)}`}>every {car.make} {car.model}</Link> · <Link to="/cars">all cars for sale</Link>.</div>}
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
          {tab === 'bnpl' && (!hasPrice(car) && !sold ? <p className="muted">The seller gives this car's price on request. Ask on WhatsApp, then we can work out Pay Small Small with you.</p> : sold ? <p className="muted">This car is sold. Pick another car to see Pay Small Small options.</p> : <BnplCalc price={Number(car.price)} carTitle={car.title} carSlug={car.slug} />)}
          <InspectionNotes ins={car.inspection} />
        </div>
        <aside className="side">
          <div className="box">
            <div className="disp" style={{ fontSize: hasPrice(car) ? 46 : 36 }}>{priceText(car)}</div>
            {hasPrice(car) && car.old_price && !sold ? <div className="muted">Was <s>{naira(car.old_price)}</s></div> : null}
            {sold ? <div className="tag tag-grey" style={{ marginTop: 8 }}>Sold</div> : !hasPrice(car) ? <div className="small muted" style={{ marginTop: 6 }}>Call or WhatsApp for the price</div> : <div className="small" style={{ color: 'var(--ok)', fontWeight: 600, marginTop: 6 }}>Pay small small from about {naira(bnpl(Number(car.price), 40, 24, cfg).monthly)}/month (estimate)</div>}
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <a className="btn btn-wa" href={sellerWa(car, cfg, wa)} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              {!sold && <>
                <button className="btn btn-red" onClick={() => setModal('viewing')}>Book a viewing</button>
                <button className="btn btn-line" onClick={() => setModal('offer')}>Make an offer</button>
                <button className="btn btn-line" onClick={() => setTab('bnpl')}>Pay small small</button>
              </>}
              {sellerPhone(car, cfg) && <a className="btn btn-dark" href={'tel:' + sellerPhone(car, cfg).replace(/\s/g, '')}>Call {car.seller || 'the seller'}: {sellerPhone(car, cfg)}</a>}
              <button className={'btn ' + (saved.has(car.id) ? 'btn-saved' : 'btn-line')} aria-pressed={saved.has(car.id)} onClick={() => saved.toggle(car.id)}>{saved.has(car.id) ? 'Saved ✓' : 'Save this car'}</button>
            </div>
            <div style={{ marginTop: 14 }}><SellerBadge type={car.seller_type} long /> <span className="small muted">{(SELLER_TYPES[car.seller_type] || SELLER_TYPES.dealer)[2]} <Link to="/how-we-check-sellers">How we check sellers</Link></span></div>
            {!sold && <p className="small muted" style={{ margin: '8px 0 0' }}>Sold by {car.seller_slug ? <Link to={'/dealers/' + car.seller_slug}>{car.seller}</Link> : (car.seller || 'a verified dealer')}{car.state ? <> in {[car.lga, car.state].filter(Boolean).join(', ')}</> : null}. Contact them to view the car. Inspect it and its papers before you pay.</p>}
          </div>
          {cfg && cfg.swap && <div className="box">
            <h3 style={{ fontSize: 22 }}>Want to change your car?</h3>
            <p className="small muted">Swap it with a verified owner on Korrect Swap. We check both owners and their papers, and both cars are inspected at a partner car lot. {(cfg && cfg.swapFeePct) || 2}% fee, paid only after a successful swap.</p>
            <Link to="/swap/new" className="btn btn-line btn-sm">List my car</Link>
          </div>}
          {car.seller_type === 'private'
            ? <div className="notice notice-strong" role="note"><b>Private seller, not verified by Korrect Cars.</b> We have not checked who this seller is. See the car in person, check its papers and make sure the seller's name matches them <b>before</b> you pay anything. Never pay a deposit to "hold" a car you have not seen.</div>
            : <div className="notice"><b>Stay safe:</b> see the car in person and check its papers <b>before</b> you pay anything. Then pay only into {car.seller_type === 'verified' ? <>an account in <b>{car.seller}</b>'s own name</> : <><b>{car.seller || 'the seller'}</b>'s business account, never a personal account</>}.</div>}
          <p className="small" style={{ margin: '10px 2px 0' }}><button type="button" className="linkbtn muted" onClick={() => setModal('report')}>Report this listing</button></p>
        </aside>
      </div>
      {data.similar && data.similar.length > 0 && (
        <section className="sec-sm" id="similar"><h2>{sold ? 'Similar cars in stock' : 'Similar cars'}</h2><div className="cards">{data.similar.map((c) => <CarCard key={c.id} car={c} />)}</div></section>
      )}
      {!sold && <div className="car-bar" role="region" aria-label="Contact about this car">
        {sellerPhone(car, cfg) && <a className="btn btn-line" href={'tel:' + sellerPhone(car, cfg).replace(/\s/g, '')}>Call</a>}
        <a className="btn btn-wa" href={sellerWa(car, cfg, wa)} target="_blank" rel="noopener noreferrer">WhatsApp about this car</a>
        <button className="btn btn-red" onClick={() => setModal('viewing')}>Book</button>
      </div>}
      {!sold && <a className="wa-fab" href={sellerWa(car, cfg, wa)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${sellerName(car)} about this car`}><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path fill="#fff" d="M16 3.2A12.7 12.7 0 0 0 5.1 22.4L3.3 28.8l6.6-1.7A12.7 12.7 0 1 0 16 3.2Zm0 23.2c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.5 10.5 0 1 1 16 26.4Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.6 8.6 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8 1 3.9.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3Z" /></svg></a>}
      {modal === 'report' && <Modal onClose={() => setModal(null)} label="Report this listing"><ReportForm car={car} onDone={() => setModal(null)} /></Modal>}
      {modal && modal !== 'report' && <Modal onClose={() => setModal(null)} label={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'}>
        <EnquiryForm type={modal} car={car} title={modal === 'viewing' ? 'Book a viewing' : 'Make an offer'} cta={modal === 'viewing' ? 'Request viewing' : 'Send offer'} />
      </Modal>}
    </div>
  );
}

function NotFoundCar() {
  return <div className="wrap sec"><h1>This car is no longer listed</h1><p className="muted">It may have been sold. See what is in stock now.</p><Link to="/cars" className="btn btn-red">Browse cars</Link></div>;
}

// "Report this listing": goes to Korrect Cars staff, who can hide the car at once
const REPORT_REASONS = [['scam', 'Looks like a scam / asked for payment before viewing'], ['sold', 'Car already sold'], ['wrong', 'Wrong details or photos'], ['unreachable', 'Seller cannot be reached'], ['other', 'Something else']];
function ReportForm({ car, onDone }) {
  const [reason, setReason] = useState(''); const [details, setDetails] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!reason) return setErr('Choose what is wrong with this listing.');
    if (reason === 'other' && details.trim().length < 5) return setErr('Tell us briefly what is wrong.');
    setBusy(true);
    try { await api(`/cars/${car.id}/report`, { method: 'POST', body: { reason, details } }); setSent(true); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  if (sent) return <div><h2 style={{ fontSize: 26 }}>Thank you</h2><p>Our team will look at this listing. If something is wrong, we take it down.</p><button className="btn btn-dark" onClick={onDone}>Close</button></div>;
  return (
    <form onSubmit={submit} noValidate>
      <h2 style={{ fontSize: 26 }}>Report this listing</h2>
      <p className="small muted">{car.title}. Only our team sees your report; the seller does not.</p>
      {err && <div className="err" role="alert">{err}</div>}
      <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 12px' }}><legend className="f">What is wrong?</legend>
        {REPORT_REASONS.map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}><input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} /> {l}</label>)}
      </fieldset>
      <div className="field"><label className="f" htmlFor="rp-details">More details {reason === 'other' ? '' : '(optional)'}</label><textarea id="rp-details" className="input" rows={3} maxLength={600} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
    </form>
  );
}
