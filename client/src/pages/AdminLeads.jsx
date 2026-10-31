// Staff: leads (enquiries), Korrect Swap listings waiting for review, and swaps in progress.
import React, { useState } from 'react';
import { Link, useApi, useApp, naira, date, api } from '../lib/core.jsx';
import { Loading, Modal } from '../components/Bits.jsx';
import { T, stTag } from './AdminShared.jsx';


export const TYPE_LABEL = { viewing: 'Viewing', offer: 'Offer', bnpl: 'Pay Small Small', contact: 'Message' };
export const STATUS_LABEL = { new: 'New', contacted: 'Contacted', viewing: 'Viewing booked', sent_to_bank: 'Sent to credit partner', won: 'Sold', lost: 'Lost', closed: 'Closed' };

export function Leads({ onChange }) {
  const [type, setType] = useState(''); const [status, setStatus] = useState('');
  const qs = new URLSearchParams(Object.entries({ type, status }).filter(([, v]) => v)).toString();
  const { data, reload } = useApi('/admin/enquiries' + (qs ? '?' + qs : ''));
  const { cfg } = useApp();
  const [open, setOpen] = useState(null); const [notes, setNotes] = useState('');
  const upd = async (e, body) => { try { await api('/admin/enquiries/' + e.id, { method: 'POST', body }); reload(); onChange(); } catch (x) { window.alert(x.message); } };
  const statuses = (data && data.statuses) || Object.keys(STATUS_LABEL);
  const wa = (e) => `https://wa.me/${String(e.phone).replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hello ${e.name.split(' ')[0]}, this is Korrect Cars${e.car_title ? ` about the ${e.car_title}` : ''}.`)}`;
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Leads</h2>
        <div className="pills">{[['', 'All'], ['bnpl', 'Pay Small Small'], ['viewing', 'Viewings'], ['offer', 'Offers'], ['contact', 'Messages']].map(([k, l]) => <button key={l} className={'pill' + (type === k ? ' on' : '')} onClick={() => setType(k)}>{l}</button>)}</div></div>
      <div className="pills" style={{ marginBottom: 12 }}><span className="small muted" style={{ alignSelf: 'center' }}>Status:</span>{[['', 'Any'], ...statuses.map((x) => [x, STATUS_LABEL[x] || x])].map(([k, l]) => <button key={l} className={'pill' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {!data ? <Loading /> : !data.enquiries.length ? <div className="empty"><p className="muted" style={{ margin: 0 }}>No leads here.</p></div> : data.enquiries.map((e) => (
        <div className="lead-card" key={e.id}>
          <div className="lead-top">
            <div style={{ minWidth: 0 }}><b>{e.name}</b> <T c={e.type === 'bnpl' ? 'tag-info' : 'tag-grey'}>{TYPE_LABEL[e.type] || e.type}</T>
              <div className="small muted">{date(e.created_at)}{e.assigned_name ? ` · handled by ${e.assigned_name}` : ''}</div></div>
            <select className="input" aria-label="Lead status" style={{ minHeight: 40, width: 'auto' }} value={e.status} onChange={(ev) => upd(e, { status: ev.target.value })}>{statuses.map((x) => <option key={x} value={x}>{STATUS_LABEL[x] || x}</option>)}</select>
          </div>
          <div className="small lead-body">
            {e.car_title && <div>Car: <Link to={'/cars/' + e.car_slug} target="_blank">{e.car_title}</Link>{e.car_price ? ` · ${naira(e.car_price)}` : ''}</div>}
            {e.offer_amount ? <div>Offer: <b>{naira(e.offer_amount)}</b></div> : null}{e.preferred_date ? <div>Preferred day: {e.preferred_date}</div> : null}
            {e.bnpl_monthly ? <div>Estimate: deposit {naira(e.bnpl_deposit)}, {e.bnpl_months} months, about {naira(e.bnpl_monthly)}/month</div> : null}
            {e.message && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{e.message}</div>}
            {e.notes && open !== e.id && <div className="lead-notes"><b>Notes:</b> {e.notes}</div>}
          </div>
          <div className="lead-actions">
            <a className="btn btn-wa btn-sm" href={wa(e)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="btn btn-line btn-sm" href={'tel:' + e.phone}>Call {e.phone}</a>
            {e.email && <a className="btn btn-line btn-sm" href={'mailto:' + e.email}>Email</a>}
            {!e.assigned_name && <button className="btn btn-line btn-sm" onClick={() => upd(e, { assignToMe: true })}>I'll handle it</button>}
            <button className="btn btn-line btn-sm" onClick={() => { setOpen(open === e.id ? null : e.id); setNotes(e.notes || ''); }}>{open === e.id ? 'Close notes' : e.notes ? 'Edit notes' : 'Add notes'}</button>
          </div>
          {open === e.id && <div className="field" style={{ marginTop: 10 }}><textarea className="input" rows={3} value={notes} onChange={(ev) => setNotes(ev.target.value)} maxLength={2000} aria-label="Notes" placeholder="e.g. Called, wants to view Saturday" />
            <button className="btn btn-dark btn-sm" style={{ marginTop: 8 }} onClick={async () => { await upd(e, { notes }); setOpen(null); }}>Save notes</button></div>}
        </div>
      ))}
      <p className="small muted" style={{ marginTop: 12 }}>Pay Small Small applications: the customer agreed to share their details with {(cfg && cfg.bankPartner) || 'our credit partners'}. Set the status to "Sent to credit partner" once you have passed them on.</p>
    </div>
  );
}

export function Listings({ onChange }) {
  const [filter, setFilter] = useState('pending');
  const { data, reload } = useApi('/admin/listings' + (filter ? '?status=' + filter : ''));
  const setSt = async (l, status) => {
    let reason = '';
    if (status === 'rejected') { reason = window.prompt('Reason (the owner will see this):', 'Photos or papers are not clear. Please list again.') || ''; }
    await api(`/admin/listings/${l.id}/status`, { method: 'POST', body: { status, reason } }); reload(); onChange();
  };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Swap listings</h2>
        <div className="pills">{[['pending', 'To review'], ['live', 'Live'], ['rejected', 'Rejected'], ['swapped', 'Swapped'], ['', 'All']].map(([k, l]) => <button key={l} className={'pill' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>)}</div></div>
      <p className="small muted">Nothing is visible to the public until approved. Check that the papers match the car and the owner.</p>
      {!data ? <Loading /> : !data.listings.length ? <div className="empty"><p className="muted" style={{ margin: 0 }}>No listings here.</p></div> : data.listings.map((l) => (
        <div className="row" key={l.id} style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 14, flex: '1 1 420px' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 260 }}>{(l.photos || []).slice(0, 6).map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8 }} /></a>)}</div>
            <div><b>{l.year} {l.make} {l.model}</b> · {l.body}<div className="small">{naira(l.value)} · {l.mileage || 'mileage n/a'} · {l.location}</div>
              <div className="small muted">Owner: {l.owner_name} · {l.owner_phone} · {l.owner_email} {l.owner_verified ? <T c="tag-ok">verified</T> : <T c="tag-warn">not verified</T>}</div>
              <div className="small">Papers: {(l.papers || []).map((p, i) => <a key={p} href={'/api/admin/files/' + p} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>Document {i + 1}</a>)}</div>
              <div className="small muted">Wants: {[...(l.wants_makes || []), ...(l.wants_bodies || [])].join(', ') || 'any'}{l.max_top_up ? ` · adds up to ${naira(l.max_top_up)}` : ''}</div>
              {l.description && <div className="small" style={{ marginTop: 4 }}>{l.description}</div>}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <T c={stTag[l.status]}>{l.status}</T>
            {l.status !== 'live' && <button className="btn btn-ok btn-sm" onClick={() => setSt(l, 'live')}>Approve</button>}
            {l.status !== 'rejected' && <button className="btn btn-line btn-sm" onClick={() => setSt(l, 'rejected')}>Reject</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Swaps() {
  const { data, reload } = useApi('/admin/offers');
  const [insp, setInsp] = useState(null);
  const act = async (o, action, extra = {}) => { try { await api('/admin/offers/' + o.id, { method: 'POST', body: { action, ...extra } }); reload(); } catch (e) { window.alert(e.message); } };
  return (
    <div className="box"><h2>Swaps &amp; success fees</h2>
      {!data ? <Loading /> : !data.offers.length ? <p className="muted">No swap offers yet.</p> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Swap</th><th>Owners</th><th>Top-up</th><th>Inspection</th><th>Fee</th><th>Stage</th><th /></tr></thead><tbody>
        {data.offers.map((o) => <tr key={o.id}>
          <td><b>{o.offered_car}</b><div className="small muted">for {o.target_car} · #{o.id}</div></td>
          <td className="small">{o.from_name} ({o.from_phone})<br />{o.to_name} ({o.to_phone})</td>
          <td className="small">{o.top_up ? `${naira(o.top_up)} by ${o.top_up_payer === 'from' ? o.from_name : o.to_name}` : '—'}</td>
          <td className="small">{o.inspection_place ? `${o.inspection_place}, ${o.inspection_time}` : '—'}</td>
          <td>{naira(o.fee)}<div><T c={stTag[o.fee_status]}>{o.fee_status}</T></div></td>
          <td><T c={stTag[o.status] || 'tag-warn'}>{o.status}</T></td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {['accepted', 'inspection'].includes(o.status) && <button className="btn btn-dark btn-sm" onClick={() => setInsp({ o, place: o.inspection_place || 'Partner car lot, Lagos', time: o.inspection_time || '' })}>{o.status === 'inspection' ? 'Reschedule' : 'Book inspection'}</button>}
            {o.status === 'inspection' && <> <button className="btn btn-ok btn-sm" onClick={() => act(o, 'complete')}>Mark completed</button></>}
            {o.fee_status === 'due' && <button className="btn btn-red btn-sm" onClick={() => act(o, 'feePaid')}>Fee paid</button>}
          </td>
        </tr>)}
      </tbody></table></div>}
      {insp && <Modal onClose={() => setInsp(null)} label="Book inspection"><form onSubmit={(e) => { e.preventDefault(); act(insp.o, 'inspection', { place: insp.place, time: insp.time }); setInsp(null); }}>
        <h3>Book inspection</h3>
        <div className="field"><label className="f" htmlFor="in-p">Place</label><input id="in-p" className="input" required value={insp.place} onChange={(e) => setInsp({ ...insp, place: e.target.value })} /></div>
        <div className="field"><label className="f" htmlFor="in-t">Day and time</label><input id="in-t" className="input" required value={insp.time} onChange={(e) => setInsp({ ...insp, time: e.target.value })} placeholder="Sat 17 Oct, 10:00am" /></div>
        <button className="btn btn-red">Save</button>
      </form></Modal>}
    </div>
  );
}
