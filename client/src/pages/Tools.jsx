// Free tools for buyers: the VIN checker (/vin-check) and "Nigeria car market today" (/car-market-today).
// Their written copy comes from server/lib/pagecopy.js so the server HTML and these pages match.
import React, { useState, useRef } from 'react';
import { Link, useApi, useApp, useTitle, useRouter, api, naira, waLink, firstPhoto, rs, date } from '../lib/core.jsx';
import { Loading } from '../components/Bits.jsx';
import { CopySections } from '../components/Copy.jsx';
import { VIN, MARKET } from '../../../server/lib/pagecopy.js';

const cleanVin = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
function vinHint(v, tried) {
  if (/[IOQ]/.test(v)) return { err: true, text: 'A VIN never uses I, O or Q. Try 1 (one) or 0 (zero).' };
  if (tried && v.length !== 17) return { err: true, text: `A VIN has 17 characters. This one has ${v.length}.` };
  return { err: false, text: 'Letters and numbers only' };
}

export function VinCheck() {
  useTitle('Free VIN Check Nigeria — Decode Any Car VIN | Korrect Cars');
  const { cfg } = useApp();
  const { query } = useRouter();
  const [vin, setVin] = useState(cleanVin(query.get('vin')));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const resultRef = useRef(null);
  const hint = vinHint(vin, tried);

  const check = async (e) => {
    e.preventDefault();
    setTried(true); setErr('');
    if (vin.length !== 17 || /[IOQ]/.test(vin)) return;
    setBusy(true);
    try {
      const r = await api('/vin/' + vin);
      setRes(r);
      window.history.replaceState({}, '', '/vin-check?vin=' + vin); // shareable result
      requestAnimationFrame(() => resultRef.current && resultRef.current.focus());
    } catch (x) { setErr(x.message); setRes(null); } finally { setBusy(false); }
  };

  return (
    <>
      <section className="sec-dark sec-sm"><div className="wrap" style={{ maxWidth: 760 }}>
        <div className="eyebrow">Free · no sign-up</div>
        <h1>{VIN.h1}</h1>
        <p style={{ color: '#d4d4d8', fontSize: 19 }}>{VIN.lead}</p>
        <form className="box vin-form" onSubmit={check} noValidate>
          <label htmlFor="vin">Vehicle identification number (VIN)</label>
          <input id="vin" className={'input vin-input' + (hint.err ? ' bad' : '')} value={vin} maxLength={17} autoComplete="off" autoCapitalize="characters" spellCheck="false" inputMode="text"
            aria-describedby="vin-hint" aria-invalid={hint.err} placeholder="17 letters and numbers" onChange={(e) => { setVin(cleanVin(e.target.value)); setTried(false); }} />
          <div id="vin-hint" className={'small ' + (hint.err ? 'err-text' : 'muted')} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{hint.text}</span><span aria-hidden="true">{vin.length}/17</span></div>
          <button className="btn btn-red btn-block" disabled={busy}>{busy ? 'Checking…' : 'Check this VIN'}</button>
          {err && <div className="err-text small" role="alert">{err}</div>}
        </form>
      </div></section>

      {res && <section className="sec-sm"><div className="wrap" style={{ maxWidth: 760 }}>
        <div className="box vin-result" ref={resultRef} tabIndex={-1} aria-live="polite">
          {!res.valid ? <p className="err-text">{res.message}</p> : !res.found ? <>
            <h2>No details for this VIN</h2>
            <p>The US database has nothing for <code>{res.vin}</code>. Cars built for Europe, Asia or the Middle East are often missing. {res.checkDigitOk ? '' : 'Its 9th character also fails the check, so look for a typo.'}</p>
            <a className="btn btn-wa" href={waLink(cfg, `Hello Korrect Cars, can you check this VIN for me: ${res.vin}`)} target="_blank" rel="noopener noreferrer">Ask us on WhatsApp</a>
          </> : <>
            <div className="small muted"><code>{res.vin}</code> · {res.checkDigitOk ? 'check digit OK' : 'check digit does not match: confirm the VIN on the car'}</div>
            <h2 style={{ marginTop: 4 }}>{res.title}</h2>
            <dl className="vin-dl">{res.details.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
            {res.note && <p className="small muted">{res.note}</p>}
            <p className="small">Factory details only. This check does not show accidents, flood damage or past mileage.</p>
          </>}
        </div>
        {res.found && <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 22 }}>{res.inStock.length ? `${res.make} ${res.model} in stock at Korrect Cars` : `Looking for a ${res.make} ${res.model}?`}</h2>
          {res.inStock.length > 0 && <div className="mini-cards">{res.inStock.map((c) => (
            <Link key={c.slug} to={'/cars/' + c.slug} className="mini-card">
              <div className="ph">{firstPhoto(c) && <img src={rs(firstPhoto(c), 400)} alt="" loading="lazy" />}</div>
              <b>{c.title}</b><span>{naira(c.price)}</span>
            </Link>
          ))}</div>}
          <a className="btn btn-wa" style={{ marginTop: 12 }} href={waLink(cfg, `Hello Korrect Cars, I checked VIN ${res.vin} (${res.title}). Can you help me?`)} target="_blank" rel="noopener noreferrer">Ask us about this car on WhatsApp</a>
        </div>}
      </div></section>}

      <section className="sec-sm"><div className="wrap prose-wrap" style={{ maxWidth: 760 }}><CopySections page={VIN} /></div></section>
    </>
  );
}

export function Market() {
  useTitle('Nigeria Car Market Today — Fuel, Naira, Duty | Korrect Cars');
  const { data, loading, error } = useApi('/market');
  if (loading) return <Loading />;
  if (error || !data) return <div className="wrap sec-sm"><h1>{MARKET.h1}</h1><p className="muted">These figures are being updated. Please check back soon.</p></div>;
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 860 }}>
      {data.updated && <div className="eyebrow">Updated {date(data.updated)}</div>}
      <h1>{MARKET.h1}</h1>
      <p className="lead-text">{MARKET.lead}</p>
      <div className="market-grid">{data.items.map((i) => (
        <article key={i.label} className="box">
          <h2 className="small" style={{ margin: 0, fontWeight: 600 }}>{i.label}</h2>
          <div className="market-val">{i.value}</div>
          {i.detail && <p className="small" style={{ margin: '4px 0' }}>{i.detail}</p>}
          <div className="small muted">Source: {i.url ? <a href={i.url} target="_blank" rel="noopener nofollow noreferrer">{i.source}</a> : i.source} · checked {i.date}</div>
        </article>
      ))}</div>
      {data.note && <div className="box" style={{ marginTop: 20 }}><h2 style={{ fontSize: 20 }}>What this means for a car buyer</h2><p>{data.note}</p></div>}
    </div>
  );
}
