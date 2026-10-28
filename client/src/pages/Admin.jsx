// Staff area (loaded only for staff): two-step login set-up and check, overview, cars (add / edit with photos),
// leads, swap review, users, blog, audit log and site settings. Every action is checked again on the server.
import React, { useState, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Link, useApi, useApp, useTitle, naira, date, api, firstPhoto, waLink, rs, srcset, shrinkPhoto } from '../lib/core.jsx';
import { Guides, MarketFigures } from './AdminGuides.jsx';
import { INSPECTION_AREAS } from '../../../server/lib/inspection-areas.js';

const MAX_PHOTOS = 20; // per save, matches the server limit
import { Loading, Modal } from '../components/Bits.jsx';
import Cascade from '../components/Cascade.jsx';
import { AuthPage } from './Account.jsx';

// Tabs each role can see. admin = Administrator; moderator is the old name for sales.
const ALL_TABS = [['overview', 'Overview', 'admin sales editor'], ['leads', 'Leads', 'admin sales'], ['cars', 'Dealer cars', 'admin sales editor'], ['listings', 'Swap listings', 'admin sales'], ['swaps', 'Swaps & fees', 'admin sales'], ['blog', 'Guides', 'admin editor'], ['market', 'Market figures', 'admin editor'], ['users', 'Staff & users', 'admin'], ['settings', 'Settings', 'admin'], ['audit', 'Activity log', 'admin']];
const roleKey = (r) => (r === 'moderator' ? 'sales' : r);
const STAFF = ['admin', 'sales', 'editor', 'moderator'];
const ROLE_LABEL = { admin: 'Administrator', sales: 'Sales', moderator: 'Sales', editor: 'Editor', user: 'Customer' };
const T = ({ c, children }) => <span className={'tag ' + c}>{children}</span>;
const stTag = { pending: 'tag-warn', live: 'tag-ok', rejected: 'tag-bad', swapped: 'tag-grey', withdrawn: 'tag-grey', available: 'tag-ok', sold: 'tag-grey', hidden: 'tag-bad', new: 'tag-warn', contacted: 'tag-info', closed: 'tag-grey', accepted: 'tag-ok', inspection: 'tag-warn', completed: 'tag-ok', declined: 'tag-bad', cancelled: 'tag-grey', due: 'tag-bad', paid: 'tag-ok', none: 'tag-grey', published: 'tag-ok', draft: 'tag-grey' };

export default function Admin() {
  useTitle('Admin | Korrect Cars');
  const { user } = useApp();
  if (user === undefined) return <Loading />;
  if (!user) return <AuthPage mode="login" adminGate />;
  if (!STAFF.includes(user.role)) return <NoAccess user={user} />;
  if (user.twofa && !user.twofa.enabled) return <TwoFASetup user={user} />;
  if (user.twofa && !user.twofa.ok) return <TwoFAVerify user={user} />;
  return <Console user={user} />;
}

function TwoFASetup({ user }) {
  const { setUser } = useApp();
  const [data, setData] = useState(null); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null); const [doneUser, setDoneUser] = useState(null);
  const start = async () => { setErr(''); try { setData(await api('/auth/2fa/setup', { method: 'POST' })); } catch (e) { setErr(e.message); } };
  const svg = useMemo(() => { if (!data) return ''; const qr = qrcode(0, 'M'); qr.addData(data.url); qr.make(); return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }, [data]);
  const enable = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { const d = await api('/auth/2fa/enable', { method: 'POST', body: { code } }); setCodes(d.recoveryCodes); setDoneUser(d.user); } catch (e2) { setErr(e2.message); } finally { setBusy(false); } };
  if (codes) return (
    <div className="wrap sec-sm" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 44 }}>Two-step login is on</h1>
      <div className="box">
        <h3>Save your backup codes</h3>
        <p>If you lose your phone, each of these codes lets you sign in once. Write them down or save them somewhere safe. <b>They will not be shown again.</b></p>
        <div className="codes">{codes.map((c) => <code key={c}>{c}</code>)}</div>
        <button className="btn btn-red" style={{ marginTop: 16 }} onClick={() => setUser(doneUser)}>I have saved them, open the admin</button>
      </div>
    </div>
  );
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 44 }}>Protect your staff account</h1>
      <p>Staff accounts need two-step login: your password plus a 6-digit code from an app on your phone. This keeps customer details safe even if a password leaks.</p>
      {err && <div className="err">{err}</div>}
      {!data ? <div className="box">
        <ol className="small" style={{ paddingLeft: 18 }}><li>Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone (free).</li><li>Press the button below and scan the code with the app.</li><li>Type the 6-digit code the app shows.</li></ol>
        <button className="btn btn-red" onClick={start}>Start setup</button>
      </div> : <form className="box" onSubmit={enable}>
        <div className="qr-wrap"><div className="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code for your authenticator app" role="img" />
          <div><p className="small" style={{ marginTop: 0 }}>Scan this with your authenticator app. Can't scan? Choose "enter a setup key" in the app and type:</p><code className="secret">{data.secret.replace(/(.{4})/g, '$1 ').trim()}</code></div></div>
        <div className="field" style={{ marginTop: 16 }}><label className="f" htmlFor="tf-code">6-digit code from the app</label><input id="tf-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        <button className="btn btn-red" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-step login'}</button>
      </form>}
      <p className="small muted" style={{ marginTop: 14 }}>Signed in as {user.email}.</p>
    </div>
  );
}

function TwoFAVerify({ user }) {
  const { setUser } = useApp();
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [backup, setBackup] = useState(false);
  const submit = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { const d = await api('/auth/2fa/verify', { method: 'POST', body: { code } }); setUser(d.user); } catch (e2) { setErr(e2.message); setCode(''); } finally { setBusy(false); } };
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec-sm" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 44 }}>Enter your code</h1>
      <form className="box" onSubmit={submit}>
        <p style={{ marginTop: 0 }}>Open your authenticator app and type the 6-digit code for <b>Korrect Cars</b> ({user.email}).</p>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="field"><label className="f" htmlFor="tv-code">{backup ? 'Backup code' : '6-digit code'}</label>
          <input id="tv-code" className={'input' + (backup ? '' : ' code-input')} inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus maxLength={backup ? 11 : 6} required value={code} onChange={(e) => setCode(backup ? e.target.value : e.target.value.replace(/\D/g, ''))} /></div>
        <button className="btn btn-red btn-block" disabled={busy || (!backup && code.length !== 6)}>{busy ? 'Checking…' : 'Continue'}</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }} className="small">
          <button type="button" className="linkish" onClick={() => { setBackup(!backup); setCode(''); }}>{backup ? 'Use the app code' : 'Lost your phone? Use a backup code'}</button>
          <button type="button" className="linkish" onClick={signOut}>Sign out</button>
        </div>
      </form>
    </div>
  );
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
  const { setUser, cfg } = useApp();
  const rk = roleKey(user.role);
  const TABS = ALL_TABS.filter((t) => t[2].split(' ').includes(rk) && ((cfg && cfg.swap) || !['listings', 'swaps'].includes(t[0])));
  const [tab, setTab] = useState('overview');
  const stats = useApi('/admin/stats');
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return (
    <div className="wrap sec-sm">
      <div className="dash">
        <aside className="admin-side">
          <div style={{ padding: '6px 8px 14px', borderBottom: '1px solid #26262b', marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 22, color: '#fff' }}>Admin console</div>
            <div className="small" style={{ color: '#a1a1aa' }}>{user.name} · {ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <nav className="sidenav">{TABS.map(([k, l]) => {
            const n = stats.data ? { listings: stats.data.pendingListings, leads: stats.data.newEnquiries }[k] : 0;
            return <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{n ? <span className="n">{n}</span> : null}</button>;
          })}</nav>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={logout}>Sign out</button>
        </aside>
        <main style={{ minWidth: 0, display: 'grid', gap: 18 }}>
          {tab === 'overview' && <Overview stats={stats} go={setTab} />}
          {tab === 'cars' && <Cars isAdmin={user.role === 'admin'} />}
          {tab === 'leads' && <Leads onChange={stats.reload} />}
          {tab === 'settings' && <Settings />}
          {tab === 'listings' && <Listings onChange={stats.reload} />}
          {tab === 'swaps' && <Swaps />}
          {tab === 'users' && <Users me={user} />}
          {tab === 'blog' && <Guides />}
          {tab === 'market' && <MarketFigures />}
          {tab === 'audit' && <Audit />}
        </main>
      </div>
    </div>
  );
}

function Overview({ stats, go }) {
  const { cfg } = useApp();
  const swap = !!(cfg && cfg.swap);
  const s = stats.data;
  const seesLeads = s && ['admin', 'sales', 'moderator'].includes(s.role);
  const enq = useApi(seesLeads ? '/admin/enquiries' : null);
  if (!s) return <Loading />;
  const K = ({ l, v, sub, to }) => <button className="box kpi" style={{ textAlign: 'left', cursor: to ? 'pointer' : 'default', font: 'inherit' }} onClick={() => to && go(to)}><div className="small muted">{l}</div><div className="v">{v}</div>{sub && <div className="small muted">{sub}</div>}</button>;
  return (
    <>
      <div className="kpis">
        <K l="Cars in stock" v={s.carsAvail} sub={`${s.carsSold} sold`} to="cars" />
        {seesLeads && <K l="New leads" v={s.newEnquiries} sub={s.newPss ? `${s.newPss} Pay Small Small` : ''} to="leads" />}
        {swap && <K l="Swap listings to review" v={s.pendingListings} sub={`${s.liveListings} live`} to="listings" />}
        {swap && <K l="Open swap offers" v={s.openOffers} to="swaps" />}
        {swap && <K l="Success fees paid" v={naira(s.feePaid)} sub={`${naira(s.feeDue)} due`} to="swaps" />}
        {s.role === 'admin' && <K l="Registered users" v={s.users} sub={s.reported ? `${s.reported} reported messages` : ''} to="users" />}
      </div>
      {seesLeads && <div className="box"><h3>Latest leads</h3>{enq.data && enq.data.enquiries.slice(0, 6).map((e) => (
        <div className="row" key={e.id}><div><b>{e.name}</b> · {TYPE_LABEL[e.type] || e.type}{e.car_title ? ` · ${e.car_title}` : ''}<div className="small muted">{e.phone} · {date(e.created_at)}</div></div><T c={stTag[e.status]}>{STATUS_LABEL[e.status] || e.status}</T></div>
      ))}{enq.data && !enq.data.enquiries.length && <p className="muted">No leads yet.</p>}</div>}
    </>
  );
}

const EMPTY_CAR = { title: '', make: '', model: '', body: '', trim: '', year: '', price: '', oldPrice: '', mileage: '', engine: '', transmission: '', drivetrain: '', fuel: 'Petrol', color: '', interior: '', condition: 'Foreign Used', location: 'Lagos', vin: '', stock: '', description: '', features: '', specsText: '', infoText: '', status: 'available', featured: true };

// Finds cars by title, stock number or VIN (full VIN or any part of it, e.g. the last 6 characters)
const norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function Cars({ isAdmin }) {
  const { data, reload } = useApi('/admin/cars');
  const [edit, setEdit] = useState(null);
  const [find, setFind] = useState('');
  const vinCount = useMemo(() => { const m = {}; ((data && data.cars) || []).forEach((c) => { const v = norm(c.vin); if (v.length >= 11) m[v] = (m[v] || 0) + 1; }); return m; }, [data]);
  const fq = norm(find);
  const cars = !data ? [] : !fq ? data.cars : data.cars.filter((c) => norm(c.vin).includes(fq) || norm(c.stock).includes(fq) || norm(c.title).includes(fq));
  const del = async (c) => { if (!window.confirm(`Delete ${c.title}? This cannot be undone.`)) return; await api('/admin/cars/' + c.id, { method: 'DELETE' }); reload(); };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Dealer cars</h2><button className="btn btn-red" onClick={() => setEdit({})}>+ Add car</button></div>
      <div className="field" style={{ maxWidth: 420 }}><label className="f" htmlFor="car-find">Find a car by VIN, stock number or title</label><input id="car-find" className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. the last 6 characters of the VIN" autoComplete="off" /></div>
      {data && fq && <div className="small muted" role="status">{cars.length} of {data.cars.length} cars match</div>}
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Car</th><th>Price</th><th>Views</th><th>Status</th><th /></tr></thead><tbody>
        {cars.map((c) => <tr key={c.id}>
          <td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={rs(firstPhoto(c), 400)} alt="" /><div><b>{c.title}</b><div className="small muted">{c.make} · {c.model} · {c.body}{c.featured ? ' · featured' : ''}{c.vin ? <> · VIN …{norm(c.vin).slice(-6)}</> : ' · no VIN'}{vinCount[norm(c.vin)] > 1 ? <> · <span className="tag tag-bad">same VIN on {vinCount[norm(c.vin)]} cars</span></> : null}</div></div></div></td>
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
  const ins0 = car.inspection && Array.isArray(car.inspection.items) ? car.inspection : { by: '', date: '', items: [] };
  const [ins, setIns] = useState({ by: ins0.by || '', date: ins0.date || '', items: INSPECTION_AREAS.map((a) => ({ area: a, status: '', note: '', ...(ins0.items.find((i) => i.area === a) || {}) })) });
  const setItem = (k, field) => (e) => setIns({ ...ins, items: ins.items.map((x, j) => (j === k ? { ...x, [field]: e.target.value } : x)) });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [busyText, setBusyText] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // Allow models not in the catalogue by merging the current value in
  const tree = { ...(catalog.data || {}) };
  if (f.make) { tree[f.make] = { ...(tree[f.make] || {}) }; if (f.model && !tree[f.make][f.model]) tree[f.make][f.model] = f.body ? [f.body] : ['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan']; }
  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (files.length > MAX_PHOTOS) { setErr(`You picked ${files.length} photos. Add up to ${MAX_PHOTOS} per save, then edit the car to add the rest.`); return; }
    setBusy(true);
    const fd = new FormData();
    Object.entries({ ...f, price: String(f.price).replace(/[^0-9]/g, ''), oldPrice: String(f.oldPrice || '').replace(/[^0-9]/g, '') }).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, String(v)); });
    if (!isNew) { if (!keep.length) fd.append('keepPhotos', ''); keep.forEach((p) => fd.append('keepPhotos', p)); }
    fd.append('inspection', JSON.stringify({ by: ins.by.trim(), date: ins.date, items: ins.items.filter((x) => x.status || x.note.trim()) }));
    try {
      setBusyText(files.length ? 'Preparing photos…' : 'Saving…');
      for (const x of [...files]) fd.append('photos', await shrinkPhoto(x));
      setBusyText('Saving…');
      await api('/admin/cars' + (isNew ? '' : '/' + car.id), { method: isNew ? 'POST' : 'PUT', form: fd }); onSaved(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); setBusyText(''); }
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
        <fieldset className="field inspect-edit">
          <legend className="f">Inspection notes <span className="hint">shown on the car page under "Korrect Cars inspection notes". Write only what the inspector actually found.</span></legend>
          <div className="grid2">
            <div className="field"><label className="f" htmlFor="ins-by">Inspected by</label><input id="ins-by" className="input" value={ins.by} onChange={(e) => setIns({ ...ins, by: e.target.value })} maxLength={80} /></div>
            <div className="field"><label className="f" htmlFor="ins-date">Inspection date</label><input id="ins-date" type="date" className="input" value={ins.date} onChange={(e) => setIns({ ...ins, date: e.target.value })} /></div>
          </div>
          {ins.items.map((x, k) => (
            <div key={x.area} className="inspect-line">
              <label className="f" htmlFor={'ins-s' + k}>{x.area}</label>
              <select id={'ins-s' + k} className="input" value={x.status} onChange={setItem(k, 'status')} aria-label={x.area + ' result'}><option value="">Not shown</option><option value="ok">OK</option><option value="watch">Worth a look</option></select>
              <input className="input" value={x.note} onChange={setItem(k, 'note')} maxLength={300} placeholder="What the inspector found" aria-label={x.area + ' note'} />
            </div>
          ))}
        </fieldset>
        <div className="field"><label className="f" htmlFor="cf-info">General information (one per line)</label><textarea id="cf-info" className="input" rows={3} value={f.infoText} onChange={set('infoText')} /></div>
        {!isNew && <div className="field"><div className="f">Photos (first one is the cover)</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{keep.map((p, i) => (
          <div key={p} style={{ position: 'relative' }}><img src={rs(p, 400)} alt="" className="thumb" style={{ width: 120, height: 90 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => move(i, -1)} aria-label="Move left">‹</button><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => move(i, 1)} aria-label="Move right">›</button><button type="button" className="btn btn-line btn-sm" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => setKeep(keep.filter((x) => x !== p))}>Remove</button></div></div>
        ))}</div></div>}
        <div className="field"><label className="f" htmlFor="cf-ph">Add photos (JPG/PNG/WEBP, up to {MAX_PHOTOS} per save)</label><input id="cf-ph" type="file" className="input" style={{ paddingTop: 12 }} multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(e.target.files)} />
          {files.length > 0 && <div className="hint" style={{ color: files.length > MAX_PHOTOS ? 'var(--bad)' : undefined }}>{files.length} photo{files.length === 1 ? '' : 's'} selected{files.length > MAX_PHOTOS ? ` — too many, pick up to ${MAX_PHOTOS} now and add the rest by editing the car` : '. They are resized before upload, so large phone photos are fine.'}</div>}</div>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-red" disabled={busy}>{busy ? (busyText || 'Saving…') : 'Save car'}</button><button type="button" className="btn btn-line" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

const TYPE_LABEL = { viewing: 'Viewing', offer: 'Offer', bnpl: 'Pay Small Small', contact: 'Message' };
const STATUS_LABEL = { new: 'New', contacted: 'Contacted', viewing: 'Viewing booked', sent_to_bank: 'Sent to credit partner', won: 'Sold', lost: 'Lost', closed: 'Closed' };

function Leads({ onChange }) {
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

function Settings() {
  const { data, reload } = useApi('/admin/settings');
  const [f, setF] = useState(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const vals = f || { ...data.values, phones: data.values.phones.join(', '), bnplMinDeposit: data.values.bnpl.minDeposit, bnplMarkup: data.values.bnpl.markup, bnplMaxMonths: data.values.bnpl.maxMonths };
  const save = async (e) => { e.preventDefault(); setErr(''); setMsg(''); setBusy(true); try { await api('/admin/settings', { method: 'PUT', body: vals }); setMsg('Saved. The website uses the new details straight away.'); setF(null); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <form className="box" onSubmit={save}>
      <h2>Settings</h2>
      <p className="small muted">These show on the website (footer, contact buttons, Pay Small Small estimates). Changes are saved in the activity log.</p>
      {msg && <div className="okmsg" style={{ marginBottom: 12 }}>{msg}</div>}{err && <div className="err">{err}</div>}
      <div className="grid2">{Object.entries(data.fields).map(([k, fd]) => (
        <div className="field" key={k}><label className="f" htmlFor={'st-' + k}>{fd.label}</label>
          {fd.type === 'choice'
            ? <select id={'st-' + k} className="input" value={vals[k] || fd.options[0][0]} onChange={(e) => setF({ ...vals, [k]: e.target.value })}>{fd.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : <input id={'st-' + k} className="input" inputMode={fd.type === 'number' ? 'numeric' : undefined} value={vals[k] === undefined || vals[k] === null ? '' : vals[k]} onChange={(e) => setF({ ...vals, [k]: e.target.value })} />}
          {k === 'phones' && <div className="hint">Separate numbers with commas. The first is shown in the header.</div>}
          {k === 'bankPartner' && <div className="hint">Optional. Leave empty to say "our credit partners". Add names separated by commas to show them on the Pay Small Small page.</div>}
          {k === 'aiTraining' && <div className="hint">Either way, ChatGPT search, Perplexity, Copilot and Google can still find and quote your cars.</div>}</div>
      ))}</div>
      <button className="btn btn-red" disabled={busy || !f}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
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
    <div className="box"><h2>Staff &amp; users</h2>
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Contact</th><th>Joined</th><th>Verified</th><th>Role</th><th /></tr></thead><tbody>
        {data.users.map((u) => <tr key={u.id}>
          <td><b>{u.name}</b>{u.disabled ? <div><T c="tag-bad">disabled</T></div> : null}{!u.email_verified ? <div><T c="tag-warn">email not confirmed</T></div> : null}</td>
          <td className="small">{u.email}<br />{u.phone}</td><td className="small">{date(u.created_at)}</td>
          <td>{isAdmin ? <button className={'btn btn-sm ' + (u.verified ? 'btn-ok' : 'btn-line')} onClick={() => upd(u, { verified: !u.verified })}>{u.verified ? 'Verified' : 'Verify'}</button> : (u.verified ? 'Yes' : 'No')}</td>
          <td>{isAdmin && u.id !== me.id ? <select className="input" aria-label="Role" style={{ minHeight: 40, width: 'auto' }} value={u.role === 'moderator' ? 'sales' : u.role} onChange={(e) => { if (e.target.value === 'admin' && !window.confirm(`Make ${u.name} an Administrator? Administrators can change everything, including staff. You can have up to 3.`)) return; upd(u, { role: e.target.value }); }}><option value="user">Customer</option><option value="sales">Sales</option><option value="editor">Editor</option><option value="admin">Administrator</option></select> : ROLE_LABEL[u.role] || u.role}
            {STAFF.includes(u.role) && <div className="small">{u.totp_enabled ? <T c="tag-ok">2-step on</T> : <T c="tag-warn">2-step not set up</T>}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{isAdmin && u.id !== me.id && <><button className="btn btn-line btn-sm" onClick={() => upd(u, { disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>
            {STAFF.includes(u.role) && u.totp_enabled ? <> <button className="btn btn-line btn-sm" onClick={() => { if (window.confirm(`Reset two-step login for ${u.name}? Use this if they lost their phone. They will set it up again at next sign-in.`)) upd(u, { reset2fa: true }); }}>Reset 2-step</button></> : null}</>}</td>
        </tr>)}
      </tbody></table></div>}
      <p className="small muted" style={{ marginTop: 12 }}><b>Roles:</b> Administrators (up to 3) can do everything. Sales handles leads, Pay Small Small, swaps and can edit cars. Editor manages cars and blog posts. Every staff account must use two-step login. To add staff, ask them to register on the site, then change their role here. Mark a customer as verified only after checking their ID against their phone number.</p>
    </div>
  );
}

function Audit() {
  const { data } = useApi('/admin/audit');
  return (
    <div className="box"><h2>Activity log</h2><p className="small muted">Every staff action, sign-in code problem and view of a private document is recorded here.</p>
      {!data ? <Loading /> : !data.audit.length ? <p className="muted">Nothing yet.</p> : data.audit.map((a) => <div className="row" key={a.id} style={{ justifyContent: 'flex-start', gap: 16 }}><span className="small muted" style={{ minWidth: 110 }}>{date(a.created_at)}</span><b style={{ minWidth: 90 }}>{a.user_name}</b><span>{a.action}{a.target ? ` — ${a.target}` : ''}</span><span className="small muted" style={{ marginLeft: 'auto' }}>{a.ip}</span></div>)}
    </div>
  );
}
