// Public seller page (/dealers/:slug): an approved dealer or Verified Seller, their checks and their cars.
// The server sends the same facts as HTML first (render.js) for search engines and AI assistants.
import React, { useState } from 'react';
import { Link, useApi, useApp, useTitle, date, sellerWa } from '../lib/core.jsx';
import { CarCard, Loading, SellerBadge, SELLER_TYPES } from '../components/Bits.jsx';
import { NotFound } from './Content.jsx';

export function SellerPage({ slug }) {
  const { cfg } = useApp();
  const { data, error, loading } = useApi('/dealers/' + slug, [slug]);
  const [showSold, setShowSold] = useState(false);
  const s = data && data.seller;
  const where = s ? [s.lga, s.state].filter(Boolean).join(', ') : '';
  useTitle(s ? `${s.name} — ${s.type === 'dealer' ? 'Verified car dealer' : 'Verified Seller'}${where ? ' in ' + where : ''} | Korrect Cars` : 'Seller | Korrect Cars');
  if (loading && !data) return <Loading />;
  if (error || !s) return <NotFound />;
  const avail = data.cars.filter((c) => c.status === 'available');
  const sold = data.cars.filter((c) => c.status === 'sold');
  const contact = { seller: s.name, seller_whatsapp: s.whatsapp, seller_phone: s.phone, dealer_id: 2 };
  return (
    <div className="wrap sec-sm">
      <div className="small muted"><Link to="/cars">Cars for sale</Link> / {s.name}</div>
      <div className="sec-head" style={{ alignItems: 'flex-end' }}>
        <div><h1 style={{ margin: '6px 0 4px' }}>{s.name}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><SellerBadge type={s.type} long /><span className="muted">{where}</span></div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.whatsapp && <a className="btn btn-wa" href={sellerWa(contact, cfg, `Hello ${s.name}, I found you on Korrect Cars.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {s.phone && <a className="btn btn-dark" href={'tel:' + String(s.phone).replace(/\s/g, '')}>Call</a>}
        </div>
      </div>
      <div className="kpis">
        <div className="box kpi"><div className="small muted">Cars for sale</div><div className="v">{s.carsForSale}</div></div>
        <div className="box kpi"><div className="small muted">Sold on Korrect Cars</div><div className="v">{s.carsSold}</div></div>
        <div className="box kpi"><div className="small muted">{s.type === 'dealer' ? 'CAC checked' : 'ID checked'}</div><div className="v" style={{ fontSize: 22 }}>{s.verifiedAt ? date(s.verifiedAt) : '—'}</div></div>
      </div>
      <div className="box">
        <p style={{ marginTop: 0 }}>{SELLER_TYPES[s.type][2]} {s.type === 'dealer' && s.address ? <>Address: {s.address}.</> : null}</p>
        {s.about && String(s.about).split(/\n\n+/).map((p) => <p key={p}>{p}</p>)}
        <p className="small muted" style={{ marginBottom: 0 }}>Stay safe: see the car and its papers before you pay anything{s.type === 'dealer' ? `, then pay only into ${s.name}'s business account` : ', then pay only into an account in the seller\'s own name'}. <Link to="/how-we-check-sellers">How we check sellers</Link></p>
      </div>
      <h2>{avail.length ? `${avail.length} ${avail.length === 1 ? 'car' : 'cars'} for sale` : 'No cars for sale right now'}</h2>
      <div className="cards">{avail.map((c) => <CarCard key={c.id} car={c} />)}</div>
      {sold.length > 0 && <p style={{ marginTop: 16 }}><button className="btn btn-line btn-sm" onClick={() => setShowSold(!showSold)} aria-expanded={showSold}>{showSold ? 'Hide' : 'Show'} {sold.length} sold</button></p>}
      {showSold && <div className="cards">{sold.map((c) => <CarCard key={c.id} car={c} />)}</div>}
    </div>
  );
}
