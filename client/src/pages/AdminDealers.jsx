// Staff: "Sellers to review" (dealers' CAC papers and private sellers' ID), "Cars to check" (private sellers' cars,
// each looked at before it goes live) and "Reported listings" (buyers' reports; hide the car in one click).
// Dealers to review: Every staff role can review. Open a dealer, look at the CAC certificate (each view is
// logged), check the CAC number on the CAC public search, then approve, ask for more, reject or pause.
import React, { useState } from 'react';
import { useApi, api, date, priceText } from '../lib/core.jsx';
import { Loading, Modal } from '../components/Bits.jsx';
import { T } from './AdminShared.jsx';

const KIND = { business: 'Dealer', personal: 'Own car' };
const DOC = { cac: 'CAC certificate', selfie: 'Selfie holding the ID', id_nin: 'ID: NIN slip', id_licence: "ID: driver's licence", id_passport: 'ID: international passport', id_voter: "ID: voter's card", other: 'Other paper' };
const LABEL = { unverified: ['Private (no ID)', 'tag-grey'], pending_review: ['Waiting', 'tag-warn'], more_info: ['Asked for more', 'tag-info'], approved: ['Approved', 'tag-ok'], rejected: ['Rejected', 'tag-bad'], suspended: ['Paused', 'tag-bad'], draft: ['Not sent', 'tag-grey'] };
const St = ({ s }) => <T c={(LABEL[s] || [s, 'tag-grey'])[1]}>{(LABEL[s] || [s])[0]}</T>;

export function Dealers({ onChange, isAdmin }) {
  const [filter, setFilter] = useState(''); const [kind, setKind] = useState('');
  const qs = new URLSearchParams(Object.entries({ status: filter, kind }).filter(([, v]) => v)).toString();
  const { data, reload } = useApi('/admin/dealers' + (qs ? '?' + qs : ''), [qs]);
  const [open, setOpen] = useState(null);
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Sellers to review</h2>
        <div style={{ display: 'flex', gap: 8 }}><select className="input" style={{ maxWidth: 180 }} aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Dealers and private</option><option value="business">Dealers (CAC)</option><option value="personal">Selling own car (ID)</option></select>
        <select className="input" style={{ maxWidth: 220 }} aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Any status</option>{Object.entries(LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
      {!data ? <Loading /> : !data.dealers.length ? <p className="muted">No dealers here yet.</p> : (
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Seller</th><th>CAC / ID</th><th>Owner</th><th>Cars</th><th>Applied</th><th>Status</th><th /></tr></thead><tbody>
          {data.dealers.map((d) => <tr key={d.id}>
            <td><b>{d.business_name}</b><div className="small muted">{KIND[d.kind] || 'Dealer'} · {d.state}</div></td>
            <td>{d.kind === 'personal' ? (d.papers ? `${d.papers} file(s)` : 'No ID') : `${d.cac_type} ${d.cac_number}`}</td><td>{d.owner_name}</td><td>{d.live_cars}</td><td>{date(d.created_at)}</td><td><St s={d.status} /></td>
            <td style={{ textAlign: 'right' }}><button className="btn btn-dark btn-sm" onClick={() => setOpen(d.id)}>Open</button></td>
          </tr>)}
        </tbody></table></div>)}
      {open && <DealerReview id={open} isAdmin={isAdmin} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); if (onChange) onChange(); }} />}
    </div>
  );
}

function DealerReview({ id, onClose, onDone, isAdmin }) {
  const { data, error, reload } = useApi('/admin/dealers/' + id);
  const [moving, setMoving] = useState(false);
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const decide = async (decision) => {
    setErr('');
    if (decision !== 'approve' && note.trim().length < 5) { setErr('Write a short note for the dealer saying why. They will see it.'); return; }
    if (decision === 'approve' && !window.confirm('Approve this dealer? Their waiting cars go live straight away.')) return;
    if (['reject', 'suspend'].includes(decision) && !window.confirm('All this dealer\'s cars will be taken off the site. Continue?')) return;
    setBusy(decision);
    try { await api(`/admin/dealers/${id}/decision`, { method: 'POST', body: { decision, note } }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <Modal onClose={onClose} label="Dealer review">
      {error ? <div className="err">{error.message}</div> : !data ? <Loading /> : (() => {
        const d = data.dealer;
        return <>
          <h2 style={{ marginBottom: 4 }}>{d.business_name}</h2>
          <div className="small muted"><St s={d.status} /> · {d.kind === 'personal' ? 'selling their own car' : 'dealer'} · applied {date(d.created_at)}{d.verified_at ? ` · approved ${date(d.verified_at)}` : ''}</div>
          <div className="grid2" style={{ marginTop: 14 }}>
            {d.kind === 'personal'
              ? <div><div className="f">ID check</div><div className="small">Open the ID and the selfie: same face, name matching the account, ID not expired and not edited. Approving makes them a Verified Seller (up to 5 cars).</div></div>
              : <div><div className="f">CAC</div><b>{d.cac_type} {d.cac_number}</b><div className="small"><a href="https://search.cac.gov.ng/home" target="_blank" rel="noopener noreferrer">Check on the CAC public search ↗</a> (search the name and compare the number)</div></div>}
            <div><div className="f">Address</div>{d.address}<div className="small muted">{[d.lga, d.state].filter(Boolean).join(', ')}</div></div>
            <div><div className="f">Contact</div>{d.email}<div className="small muted">Phone {d.phone} · WhatsApp {d.whatsapp}</div></div>
            <div><div className="f">People</div>{data.members.map((m) => <div key={m.id}>{m.name} <span className="small muted">({m.role}) {m.phone ? `· ${m.phone} ` : ''}{m.phone_verified_at ? '· confirmed by text' : '· not confirmed by text (email confirmed): call them to check'}</span></div>)}</div>
          </div>
          {d.about && <p className="note">{d.about}</p>}
          <h3 style={{ marginTop: 18 }}>Papers</h3>
          {!data.documents.length ? <p className="muted">No papers uploaded.</p> : data.documents.map((x) => (
            <div className="row" key={x.id}><div><b>{DOC[x.kind] || 'Other paper'}</b> <span className="small muted">({x.type}, {date(x.created_at)})</span>
              {x.sameFileElsewhere > 0 && <> <span className="tag tag-bad">same file sent by {x.sameFileElsewhere} other dealer{x.sameFileElsewhere > 1 ? 's' : ''}</span></>}</div>
              <a className="btn btn-line btn-sm" href={`/api/admin/dealers/${id}/documents/${x.id}`} target="_blank" rel="noopener noreferrer">Open (logged)</a></div>))}
          {data.cars.length > 0 && <><h3 style={{ marginTop: 18 }}>Cars ({data.cars.length})</h3>
            {data.cars.slice(0, 8).map((c) => <div className="row" key={c.id}><div>{c.title} <span className="small muted">VIN {c.vin} · {priceText(c)}</span></div><span className="small">{c.status}</span></div>)}</>}
          {isAdmin && d.status === 'approved' && (moving
            ? <MoveCars dealer={d} onClose={() => setMoving(false)} onDone={() => { setMoving(false); reload(); }} />
            : <p style={{ marginTop: 14 }}><button className="btn btn-dark btn-sm" onClick={() => setMoving(true)}>Move cars to this dealer</button></p>)}
          <h3 style={{ marginTop: 18 }}>History</h3>
          {data.events.map((e, i) => <div className="small" key={i}>{date(e.created_at)} · {e.step} → <b>{e.result}</b>{e.actor ? ` by ${e.actor}` : ''}{e.note ? `: ${e.note}` : ''}</div>)}
          <div className="field" style={{ marginTop: 18 }}><label className="f" htmlFor="dr-note">Note to the dealer (needed unless approving)</label>
            <textarea id="dr-note" className="input" rows={3} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The certificate photo is blurred. Please upload a clear one." /></div>
          {err && <div className="err" role="alert">{err}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {d.status !== 'approved' && (d.kind !== 'personal' || data.documents.length > 0) && <button className="btn btn-red" disabled={!!busy} onClick={() => decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</button>}
            {['pending_review', 'more_info'].includes(d.status) && <button className="btn btn-dark" disabled={!!busy} onClick={() => decide('more_info')}>Ask for more</button>}
            {['pending_review', 'more_info'].includes(d.status) && <button className="btn btn-line" disabled={!!busy} onClick={() => decide('reject')}>Reject</button>}
            {d.status === 'unverified' && <button className="btn btn-line" disabled={!!busy} onClick={() => decide('suspend')}>Pause this seller</button>}
            {d.status === 'approved' && <button className="btn btn-line" disabled={!!busy} onClick={() => decide('suspend')}>Pause this dealer</button>}
          </div>
        </>;
      })()}
    </Modal>
  );
}

// Administrators: hand cars from Korrect Cars (or another dealer) to this dealer. All of Korrect Cars' cars start ticked.
function MoveCars({ dealer, onClose, onDone }) {
  const { data } = useApi('/admin/cars');
  const cars = ((data && data.cars) || []).filter((c) => c.dealer_id !== dealer.id);
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const sel = picked || new Set(cars.filter((c) => c.dealer_id === 1).map((c) => c.id));
  const toggle = (cid) => { const n = new Set(sel); if (n.has(cid)) n.delete(cid); else n.add(cid); setPicked(n); };
  const move = async () => {
    if (!sel.size) { setErr('Tick at least one car.'); return; }
    if (!window.confirm(`Move ${sel.size} car${sel.size === 1 ? '' : 's'} to ${dealer.business_name}? Staff codes like "BF" are taken off the titles, and the cars appear on their dealer page.`)) return;
    setBusy(true); setErr('');
    try { await api(`/admin/dealers/${dealer.id}/move-cars`, { method: 'POST', body: { carIds: [...sel] } }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="box" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>Move cars to {dealer.business_name}</h3>
      <p className="small muted">Each car keeps its web address, photos, views and VIN. Moved cars do not count towards the 50-car limit.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn btn-line btn-sm" onClick={() => setPicked(new Set(cars.map((c) => c.id)))}>Tick all</button>
        <button type="button" className="btn btn-line btn-sm" onClick={() => setPicked(new Set())}>Untick all</button>
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: '4px 10px' }}>
        {!cars.length ? <p className="muted">No other cars to move.</p> : cars.map((c) => (
          <label key={c.id} className="check" style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.title} <span className="small muted">· {c.status} · {c.dealer_name || 'Korrect Cars'}</span></span>
          </label>))}
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="btn btn-red" disabled={busy} onClick={move}>{busy ? 'Moving…' : `Move ${sel.size} car${sel.size === 1 ? '' : 's'}`}</button>
        <button className="btn btn-line" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// Private sellers' cars (not verified): each waits here until a staff member looks at it
export function CarChecks({ onChange }) {
  const { data, reload } = useApi('/admin/listings/checks');
  const [note, setNote] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(0);
  const decide = async (c, decision) => {
    setErr('');
    if (decision === 'reject' && (note[c.id] || '').trim().length < 5) { setErr('Write a short note for the seller saying why. They will see it.'); return; }
    setBusy(c.id);
    try { await api(`/admin/listings/checks/${c.id}`, { method: 'POST', body: { decision, note: note[c.id] || '' } }); reload(); if (onChange) onChange(); } catch (e) { setErr(e.message); } finally { setBusy(0); }
  };
  return (
    <div className="box">
      <h2>Cars to check</h2>
      <p className="small muted">Cars from private sellers (no ID check). Look at the photos and details: is it a real car, a fair price, and nothing asking for money before viewing? Approve to put it live.</p>
      {err && <div className="err" role="alert">{err}</div>}
      {!data ? <Loading /> : !data.cars.length ? <p className="muted">Nothing to check.</p> : data.cars.map((c) => (
        <div className="row" key={c.id} style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>{(c.photos || []).slice(0, 3).map((p) => <a key={p} href={p} target="_blank" rel="noopener noreferrer"><img className="thumb" src={p} alt="" /></a>)}</div>
          <div style={{ flex: 1, minWidth: 220 }}><b>{c.title}</b><div className="small muted">{priceText(c)} · {c.mileage || 'no mileage'} · VIN {c.vin}</div>
            <div className="small">{c.seller} · {[c.lga, c.state].filter(Boolean).join(', ')} · WhatsApp {c.whatsapp} · added {date(c.created_at)}</div>
            <input className="input" style={{ marginTop: 8 }} placeholder="Note to the seller (needed to reject)" maxLength={400} value={note[c.id] || ''} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} aria-label={`Note about ${c.title}`} /></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-red btn-sm" disabled={busy === c.id} onClick={() => decide(c, 'approve')}>Approve</button><button className="btn btn-line btn-sm" disabled={busy === c.id} onClick={() => decide(c, 'reject')}>Reject</button></div>
        </div>))}
    </div>
  );
}

// Buyers' reports from "Report this listing". Hide takes the car off the site at once.
export function Reports({ onChange }) {
  const [all, setAll] = useState(false);
  const { data, reload } = useApi('/admin/listings/reports' + (all ? '?all=1' : ''), [all]);
  const [err, setErr] = useState('');
  const act = async (x, action) => {
    setErr('');
    if (action === 'hide' && !window.confirm(`Take "${x.title}" off the site now?`)) return;
    try { await api(`/admin/listings/reports/${x.id}`, { method: 'POST', body: { action } }); reload(); if (onChange) onChange(); } catch (e) { setErr(e.message); }
  };
  const SELLER = { business: 'Dealer', personal: 'Own car' };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Reported listings</h2>
        <label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show handled reports too</label></div>
      {err && <div className="err" role="alert">{err}</div>}
      {!data ? <Loading /> : !data.reports.length ? <p className="muted">No reports.</p> : (
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Car</th><th>Reason</th><th>Seller</th><th>From</th><th>When</th><th /></tr></thead><tbody>
          {data.reports.map((x) => <tr key={x.id}>
            <td><a href={'/cars/' + x.slug} target="_blank" rel="noopener noreferrer"><b>{x.title}</b></a><div className="small muted">{x.car_status}{x.times > 1 ? ` · reported ${x.times} times` : ''}</div></td>
            <td>{x.reasonText}{x.details ? <div className="small muted">{x.details}</div> : null}</td>
            <td>{x.seller || 'Korrect Cars'}<div className="small muted">{SELLER[x.kind] || ''}{x.kind === 'personal' ? (x.seller_status === 'approved' ? ' · verified' : ' · not verified') : ''}</div></td>
            <td className="small">{x.reporter ? <>{x.reporter}<div className="muted">{x.reporter_email}</div></> : 'Not signed in'}</td>
            <td className="small">{date(x.created_at)}</td>
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{x.status === 'open' ? <><button className="btn btn-red btn-sm" onClick={() => act(x, 'hide')}>Hide car</button> <button className="btn btn-line btn-sm" onClick={() => act(x, 'dismiss')}>Dismiss</button></> : <span className="small muted">{x.status}</span>}</td>
          </tr>)}
        </tbody></table></div>)}
    </div>
  );
}
