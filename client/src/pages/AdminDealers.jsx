// Staff: "Dealers to review". Every staff role can review. Open a dealer, look at the CAC certificate (each view is
// logged), check the CAC number on the CAC public search, then approve, ask for more, reject or pause.
import React, { useState } from 'react';
import { useApi, api, date, priceText } from '../lib/core.jsx';
import { Loading, Modal } from '../components/Bits.jsx';
import { T } from './AdminShared.jsx';

const LABEL = { pending_review: ['Waiting', 'tag-warn'], more_info: ['Asked for more', 'tag-info'], approved: ['Approved', 'tag-ok'], rejected: ['Rejected', 'tag-bad'], suspended: ['Paused', 'tag-bad'], draft: ['Not sent', 'tag-grey'] };
const St = ({ s }) => <T c={(LABEL[s] || [s, 'tag-grey'])[1]}>{(LABEL[s] || [s])[0]}</T>;

export function Dealers({ onChange, isAdmin }) {
  const [filter, setFilter] = useState('');
  const { data, reload } = useApi('/admin/dealers' + (filter ? '?status=' + filter : ''), [filter]);
  const [open, setOpen] = useState(null);
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Dealers to review</h2>
        <select className="input" style={{ maxWidth: 220 }} aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All dealers</option>{Object.entries(LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {!data ? <Loading /> : !data.dealers.length ? <p className="muted">No dealers here yet.</p> : (
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Business</th><th>CAC</th><th>Owner</th><th>Cars</th><th>Applied</th><th>Status</th><th /></tr></thead><tbody>
          {data.dealers.map((d) => <tr key={d.id}>
            <td><b>{d.business_name}</b><div className="small muted">{d.state}</div></td>
            <td>{d.cac_type} {d.cac_number}</td><td>{d.owner_name}</td><td>{d.live_cars}</td><td>{date(d.created_at)}</td><td><St s={d.status} /></td>
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
          <div className="small muted"><St s={d.status} /> · applied {date(d.created_at)}{d.verified_at ? ` · approved ${date(d.verified_at)}` : ''}</div>
          <div className="grid2" style={{ marginTop: 14 }}>
            <div><div className="f">CAC</div><b>{d.cac_type} {d.cac_number}</b><div className="small"><a href="https://search.cac.gov.ng/home" target="_blank" rel="noopener noreferrer">Check on the CAC public search ↗</a> (search the name and compare the number)</div></div>
            <div><div className="f">Address</div>{d.address}<div className="small muted">{[d.lga, d.state].filter(Boolean).join(', ')}</div></div>
            <div><div className="f">Contact</div>{d.email}<div className="small muted">Phone {d.phone} · WhatsApp {d.whatsapp}</div></div>
            <div><div className="f">People</div>{data.members.map((m) => <div key={m.id}>{m.name} <span className="small muted">({m.role}) {m.phone_verified_at ? '· phone confirmed' : '· phone NOT confirmed'}</span></div>)}</div>
          </div>
          {d.about && <p className="note">{d.about}</p>}
          <h3 style={{ marginTop: 18 }}>Papers</h3>
          {!data.documents.length ? <p className="muted">No papers uploaded.</p> : data.documents.map((x) => (
            <div className="row" key={x.id}><div><b>{x.kind === 'cac' ? 'CAC certificate' : 'Other paper'}</b> <span className="small muted">({x.type}, {date(x.created_at)})</span>
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
            {d.status !== 'approved' && <button className="btn btn-red" disabled={!!busy} onClick={() => decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</button>}
            {['pending_review', 'more_info'].includes(d.status) && <button className="btn btn-dark" disabled={!!busy} onClick={() => decide('more_info')}>Ask for more</button>}
            {['pending_review', 'more_info'].includes(d.status) && <button className="btn btn-line" disabled={!!busy} onClick={() => decide('reject')}>Reject</button>}
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
