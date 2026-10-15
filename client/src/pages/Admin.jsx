import React, { useState } from 'react';
import { Link, useApi, useApp, useTitle, naira, date, api, firstPhoto } from '../lib/core.jsx';
import { Loading, Modal } from '../components/Bits.jsx';
import Cascade from '../components/Cascade.jsx';
import { AuthPage } from './Account.jsx';

const TABS = [['overview', 'Overview'], ['cars', 'Dealer cars'], ['enquiries', 'Enquiries'], ['listings', 'Swap listings'], ['swaps', 'Swaps & fees'], ['users', 'Users'], ['blog', 'Blog'], ['audit', 'Audit log']];
const T = ({ c, children }) => <span className={'tag ' + c}>{children}</span>;
const stTag = { pending: 'tag-warn', live: 'tag-ok', rejected: 'tag-bad', swapped: 'tag-grey', withdrawn: 'tag-grey', available: 'tag-ok', sold: 'tag-grey', hidden: 'tag-bad', new: 'tag-warn', contacted: 'tag-info', closed: 'tag-grey', accepted: 'tag-ok', inspection: 'tag-warn', completed: 'tag-ok', declined: 'tag-bad', cancelled: 'tag-grey', due: 'tag-bad', paid: 'tag-ok', none: 'tag-grey', published: 'tag-ok', draft: 'tag-grey' };

export default function Admin() {
  useTitle('Admin | Korrect Cars');
  const { user } = useApp();
  if (user === undefined) return <Loading />;
  if (!user) return <AuthPage mode="login" adminGate />;
  if (!['admin', 'moderator'].includes(user.role)) return <NoAccess user={user} />;
  return <Console user={user} />;
}

function NoAccess({ user }) {
  const { setUser } = useApp();
  const switchAcc = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 48 }}>Staff only</h1>
      <p>You are signed in as <b>{user.email}</b>, which is a customer account. The admin console needs a staff account.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button className="btn btn-red" onClick={switchAcc}>Sign out and use a staff account</button><Link to="/" className="btn btn-line">Back to the site</Link></div>
    </div>
  );
}

function Console({ user }) {
  const { setUser } = useApp();
  const [tab, setTab] = useState('overview');
  const stats = useApi('/admin/stats');
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec-sm">
      <div className="dash">
        <aside className="admin-side">
          <div style={{ padding: '6px 8px 14px', borderBottom: '1px solid #26262b', marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 22, color: '#fff' }}>Admin console</div>
            <div className="small" style={{ color: '#a1a1aa' }}>{user.name} · {user.role}</div>
          </div>
          <nav className="sidenav">{TABS.map(([k, l]) => {
            const n = stats.data ? { listings: stats.data.pendingListings, enquiries: stats.data.newEnquiries }[k] : 0;
            return <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{n ? <span className="n">{n}</span> : null}</button>;
          })}</nav>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={logout}>Sign out</button>
        </aside>
        <main style={{ minWidth: 0, display: 'grid', gap: 18 }}>
          {tab === 'overview' && <Overview stats={stats} go={setTab} />}
          {tab === 'cars' && <Cars isAdmin={user.role === 'admin'} />}
          {tab === 'enquiries' && <Enquiries onChange={stats.reload} />}
          {tab === 'listings' && <Listings onChange={stats.reload} />}
          {tab === 'swaps' && <Swaps />}
          {tab === 'users' && <Users me={user} />}
          {tab === 'blog' && <Blog isAdmin={user.role === 'admin'} />}
          {tab === 'audit' && <Audit />}
        </main>
      </div>
    </div>
  );
}

function Overview({ stats, go }) {
  const s = stats.data;
  const enq = useApi('/admin/enquiries');
  if (!s) return <Loading />;
  const K = ({ l, v, sub, to }) => <button className="box kpi" style={{ textAlign: 'left', cursor: to ? 'pointer' : 'default', font: 'inherit' }} onClick={() => to && go(to)}><div className="small muted">{l}</div><div className="v">{v}</div>{sub && <div className="small muted">{sub}</div>}</button>;
  return (
    <>
      <div className="kpis">
        <K l="Cars in stock" v={s.carsAvail} sub={`${s.carsSold} sold`} to="cars" />
        <K l="New enquiries" v={s.newEnquiries} to="enquiries" />
        <K l="Swap listings to review" v={s.pendingListings} sub={`${s.liveListings} live`} to="listings" />
        <K l="Open swap offers" v={s.openOffers} to="swaps" />
        <K l="Success fees paid" v={naira(s.feePaid)} sub={`${naira(s.feeDue)} due`} to="swaps" />
        <K l="Registered users" v={s.users} sub={s.reported ? `${s.reported} reported messages` : ''} to="users" />
      </div>
      <div className="box"><h3>Latest enquiries</h3>{enq.data && enq.data.enquiries.slice(0, 6).map((e) => (
        <div className="row" key={e.id}><div><b>{e.name}</b> · {e.type}{e.car_title ? ` · ${e.car_title}` : ''}<div className="small muted">{e.phone} · {date(e.created_at)}</div></div><T c={stTag[e.status]}>{e.status}</T></div>
      ))}{enq.data && !enq.data.enquiries.length && <p className="muted">No enquiries yet.</p>}</div>
    </>
  );
}

const EMPTY_CAR = { title: '', make: '', model: '', body: '', trim: '', year: '', price: '', oldPrice: '', mileage: '', engine: '', transmission: '', drivetrain: '', fuel: 'Petrol', color: '', interior: '', condition: 'Foreign Used', location: 'Lagos', vin: '', stock: '', description: '', features: '', specsText: '', infoText: '', status: 'available', featured: true };

function Cars({ isAdmin }) {
  const { data, reload } = useApi('/admin/cars');
  const [edit, setEdit] = useState(null);
  const del = async (c) => { if (!window.confirm(`Delete ${c.title}? This cannot be undone.`)) return; await api('/admin/cars/' + c.id, { method: 'DELETE' }); reload(); };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Dealer cars</h2><button className="btn btn-red" onClick={() => setEdit({})}>+ Add car</button></div>
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Car</th><th>Price</th><th>Views</th><th>Status</th><th /></tr></thead><tbody>
        {data.cars.map((c) => <tr key={c.id}>
          <td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={firstPhoto(c)} alt="" /><div><b>{c.title}</b><div className="small muted">{c.make} · {c.model} · {c.body}{c.featured ? ' · featured' : ''}</div></div></div></td>
          <td>{naira(c.price)}{c.old_price ? <div className="small muted"><s>{naira(c.old_price)}</s></div> : null}</td><td>{c.views}</td>
          <td><T c={stTag[c.status]}>{c.status}</T></td>
          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><Link to={'/cars/' + c.slug} className="btn btn-line btn-sm" target="_blank">View</Link> <button className="btn btn-dark btn-sm" onClick={() => setEdit(c)}>Edit</button> {isAdmin && <button className="btn btn-line btn-sm" onClick={() => del(c)}>Delete</button>}</td>
        </tr>)}
      </tbody></table></div>}
      {edit && <CarForm car={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function CarForm({ car, onClose, onSaved }) {
  const isNew = !car.id;
  const catalog = useApi('/catalog');
  const [f, setF] = useState(isNew ? EMPTY_CAR : {
    ...EMPTY_CAR, title: car.title, make: car.make, model: car.model, body: car.body, trim: car.trim_level || '', year: car.year || '', price: car.price, oldPrice: car.old_price || '',
    mileage: car.mileage || '', engine: car.engine || '', transmission: car.transmission || '', drivetrain: car.drivetrain || '', fuel: car.fuel || '', color: car.color || '', interior: car.interior || '',
    condition: car.car_condition || '', location: car.location || '', vin: car.vin || '', stock: car.stock || '', description: car.description || '',
    features: (car.features || []).join('\n'), specsText: (car.specs || []).map((r) => `${r[0]}: ${r[1]}`).join('\n'), infoText: (car.info || []).join('\n'), status: car.status, featured: !!car.featured
  });
  const [keep, setKeep] = useState(car.photos || []);
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // Allow models not in the catalogue by merging the current value in
  const tree = { ...(catalog.data || {}) };
  if (f.make) { tree[f.make] = { ...(tree[f.make] || {}) }; if (f.model && !tree[f.make][f.model]) tree[f.make][f.model] = f.body ? [f.body] : ['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan']; }
  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const fd = new FormData();
    Object.entries({ ...f, price: String(f.price).replace(/[^0-9]/g, ''), oldPrice: String(f.oldPrice || '').replace(/[^0-9]/g, '') }).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, String(v)); });
    if (!isNew) { if (!keep.length) fd.append('keepPhotos', ''); keep.forEach((p) => fd.append('keepPhotos', p)); }
    [...files].forEach((x) => fd.append('photos', x));
    try { await api('/admin/cars' + (isNew ? '' : '/' + car.id), { method: isNew ? 'POST' : 'PUT', form: fd }); onSaved(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const move = (i, d) => { const k = [...keep]; const j = i + d; if (j < 0 || j >= k.length) return; [k[i], k[j]] = [k[j], k[i]]; setKeep(k); };
  const inp = (k, label, props = {}) => <div className="field"><label className="f" htmlFor={'cf-' + k}>{label}</label><input id={'cf-' + k} className="input" value={f[k]} onChange={set(k)} {...props} /></div>;
  return (
    <Modal onClose={onClose} label={isNew ? 'Add car' : 'Edit car'}>
      <form onSubmit={save}>
        <h2>{isNew ? 'Add car' : 'Edit car'}</h2>
        {err && <div className="err">{err}</div>}
        {inp('title', 'Title', { required: true, placeholder: '2018 Toyota Camry SE' })}
        <div className="grid2">
          <div className="field"><label className="f" htmlFor="cf-make">Make</label><input id="cf-make" className="input" list="cf-makes" required value={f.make} onChange={(e) => setF({ ...f, make: e.target.value, model: '', body: '' })} /><datalist id="cf-makes">{Object.keys(tree).map((m) => <option key={m} value={m} />)}</datalist></div>
          <div className="field"><label className="f" htmlFor="cf-model">Model</label><input id="cf-model" className="input" list="cf-models" required value={f.model} onChange={(e) => { const b = (tree[f.make] || {})[e.target.value]; setF({ ...f, model: e.target.value, body: b && b.length === 1 ? b[0] : f.body }); }} /><datalist id="cf-models">{Object.keys(tree[f.make] || {}).map((m) => <option key={m} value={m} />)}</datalist></div>
          <div className="field"><label className="f" htmlFor="cf-body">Body type</label><select id="cf-body" className="input" required value={f.body} onChange={set('body')}><option value="">Choose</option>{['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan', 'Wagon', 'Bus'].map((b) => <option key={b}>{b}</option>)}</select></div>
          {inp('year', 'Year', { inputMode: 'numeric' })}
          {inp('price', 'Price (₦)', { required: true, inputMode: 'numeric' })}
          {inp('oldPrice', 'Old price (₦), shows "price drop"', { inputMode: 'numeric' })}
          {inp('trim', 'Trim')}{inp('mileage', 'Mileage')}{inp('engine', 'Engine')}{inp('transmission', 'Transmission')}{inp('drivetrain', 'Drivetrain')}{inp('fuel', 'Fuel')}
          {inp('color', 'Exterior colour')}{inp('interior', 'Interior')}{inp('condition', 'Condition')}{inp('location', 'Location')}{inp('vin', 'VIN')}{inp('stock', 'Stock number')}
          <div className="field"><label className="f" htmlFor="cf-status">Status</label><select id="cf-status" className="input" value={f.status} onChange={set('status')}><option value="available">Available</option><option value="sold">Sold</option><option value="hidden">Hidden</option></select></div>
          <label className="check field" style={{ alignItems: 'center' }}><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Show on the home page</label>
        </div>
        <div className="field"><label className="f" htmlFor="cf-desc">Description (blank line between paragraphs)</label><textarea id="cf-desc" className="input" rows={6} value={f.description} onChange={set('description')} /></div>
        <div className="grid2">
          <div className="field"><label className="f" htmlFor="cf-feat">Features (one per line)</label><textarea id="cf-feat" className="input" rows={6} value={f.features} onChange={set('features')} /></div>
          <div className="field"><label className="f" htmlFor="cf-specs">Technical specs (Label: value per line)</label><textarea id="cf-specs" className="input" rows={6} value={f.specsText} onChange={set('specsText')} /></div>
        </div>
        <div className="field"><label className="f" htmlFor="cf-info">General information (one per line)</label><textarea id="cf-info" className="input" rows={3} value={f.infoText} onChange={set('infoText')} /></div>
        {!isNew && <div className="field"><div className="f">Photos (first one is the cover)</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{keep.map((p, i) => (
          <div key={p} style={{ position: 'relative' }}><img src={p} alt="" className="thumb" style={{ width: 120, height: 90 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => move(i, -1)} aria-label="Move left">‹</button><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => move(i, 1)} aria-label="Move right">›</button><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => setKeep(keep.filter((x) => x !== p))}>Remove</button></div></div>
        ))}</div></div>}
        <div className="field"><label className="f" htmlFor="cf-ph">Add photos (JPG/PNG/WEBP, max 6 MB each)</label><input id="cf-ph" type="file" className="input" style={{ paddingTop: 12 }} multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(e.target.files)} /></div>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-red" disabled={busy}>{busy ? 'Saving…' : 'Save car'}</button><button type="button" className="btn btn-line" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function Enquiries({ onChange }) {
  const { data, reload } = useApi('/admin/enquiries');
  const setSt = async (e, status) => { await api(`/admin/enquiries/${e.id}/status`, { method: 'POST', body: { status } }); reload(); onChange(); };
  return (
    <div className="box"><h2>Enquiries</h2>
      {!data ? <Loading /> : !data.enquiries.length ? <p className="muted">No enquiries yet.</p> : <div className="scroll-x"><table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Type</th><th>Details</th><th>Status</th></tr></thead><tbody>
        {data.enquiries.map((e) => <tr key={e.id}>
          <td className="small">{date(e.created_at)}</td>
          <td><b>{e.name}</b><div className="small"><a href={'tel:' + e.phone}>{e.phone}</a>{e.email ? <> · <a href={'mailto:' + e.email}>{e.email}</a></> : null}</div></td>
          <td>{e.type}</td>
          <td className="small">{e.car_title && <div><Link to={'/cars/' + e.car_slug} target="_blank">{e.car_title}</Link></div>}
            {e.offer_amount ? <div>Offer: {naira(e.offer_amount)}</div> : null}{e.preferred_date ? <div>Day: {e.preferred_date}</div> : null}
            {e.bnpl_monthly ? <div>Deposit {naira(e.bnpl_deposit)}, {e.bnpl_months} months at {naira(e.bnpl_monthly)}</div> : null}{e.message && <div className="muted">{e.message}</div>}</td>
          <td><select className="input" style={{ minHeight: 40, width: 'auto' }} value={e.status} onChange={(ev) => setSt(e, ev.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></td>
        </tr>)}
      </tbody></table></div>}
    </div>
  );
}

function Listings({ onChange }) {
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

function Swaps() {
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

function Users({ me }) {
  const { data, reload } = useApi('/admin/users');
  const upd = async (u, body) => { try { await api('/admin/users/' + u.id, { method: 'POST', body }); reload(); } catch (e) { window.alert(e.message); } };
  const isAdmin = me.role === 'admin';
  return (
    <div className="box"><h2>Users</h2>
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Contact</th><th>Joined</th><th>Verified</th><th>Role</th><th /></tr></thead><tbody>
        {data.users.map((u) => <tr key={u.id}>
          <td><b>{u.name}</b>{u.disabled ? <div><T c="tag-bad">disabled</T></div> : null}{!u.email_verified ? <div><T c="tag-warn">email not confirmed</T></div> : null}</td>
          <td className="small">{u.email}<br />{u.phone}</td><td className="small">{date(u.created_at)}</td>
          <td>{isAdmin ? <button className={'btn btn-sm ' + (u.verified ? 'btn-ok' : 'btn-line')} onClick={() => upd(u, { verified: !u.verified })}>{u.verified ? 'Verified' : 'Verify'}</button> : (u.verified ? 'Yes' : 'No')}</td>
          <td>{isAdmin && u.id !== me.id ? <select className="input" style={{ minHeight: 40, width: 'auto' }} value={u.role} onChange={(e) => upd(u, { role: e.target.value })}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select> : u.role}</td>
          <td>{isAdmin && u.id !== me.id && <button className="btn btn-line btn-sm" onClick={() => upd(u, { disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>}</td>
        </tr>)}
      </tbody></table></div>}
      <p className="small muted" style={{ marginTop: 12 }}>Mark an owner as verified only after checking their ID against their phone number. Moderators can review listings and enquiries but cannot change users or delete cars.</p>
    </div>
  );
}

function Blog({ isAdmin }) {
  const { data, reload } = useApi('/admin/posts');
  const set = async (p, status) => { await api(`/admin/posts/${p.id}/status`, { method: 'POST', body: { status } }); reload(); };
  return (
    <div className="box"><h2>Blog posts</h2>
      {!data ? <Loading /> : data.posts.map((p) => <div className="row" key={p.id}><div><Link to={'/blog/' + p.slug} target="_blank"><b>{p.title}</b></Link><div className="small muted">{date(p.published_at)}</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><T c={stTag[p.status]}>{p.status}</T>{isAdmin && <button className="btn btn-line btn-sm" onClick={() => set(p, p.status === 'published' ? 'draft' : 'published')}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</button>}</div></div>)}
    </div>
  );
}

function Audit() {
  const { data } = useApi('/admin/audit');
  return (
    <div className="box"><h2>Audit log</h2><p className="small muted">Every staff action and every view of a private document is recorded here.</p>
      {!data ? <Loading /> : !data.audit.length ? <p className="muted">Nothing yet.</p> : data.audit.map((a) => <div className="row" key={a.id} style={{ justifyContent: 'flex-start', gap: 16 }}><span className="small muted" style={{ minWidth: 110 }}>{date(a.created_at)}</span><b style={{ minWidth: 90 }}>{a.user_name}</b><span>{a.action}{a.target ? ` — ${a.target}` : ''}</span><span className="small muted" style={{ marginLeft: 'auto' }}>{a.ip}</span></div>)}
    </div>
  );
}
