// Staff: dealer cars list and the add / edit form (photos, details, inspection notes).
import React, { useState, useMemo } from 'react';
import { Link, useApi, naira, date, api, firstPhoto, rs, shrinkPhoto } from '../lib/core.jsx';
import { INSPECTION_AREAS } from '../../../server/lib/inspection-areas.js';
import { Loading, Modal } from '../components/Bits.jsx';
import { T, norm, stTag } from './AdminShared.jsx';
import { applyPrefill } from '../lib/prefill.js';

const MAX_PHOTOS = 20; // per save, matches the server limit

const EMPTY_CAR = { title: '', make: '', model: '', body: '', trim: '', year: '', price: '', oldPrice: '', mileage: '', engine: '', transmission: '', drivetrain: '', fuel: 'Petrol', color: '', interior: '', condition: 'Foreign Used', location: 'Lagos', vin: '', stock: '', description: '', features: '', specsText: '', infoText: '', status: 'available', featured: true };
export function Cars({ isAdmin }) {
  const { data, reload } = useApi('/admin/cars');
  const [edit, setEdit] = useState(null);
  const [find, setFind] = useState('');
  const vinCount = useMemo(() => { const m = {}; ((data && data.cars) || []).forEach((c) => { const v = norm(c.vin); if (v.length >= 11) m[v] = (m[v] || 0) + 1; }); return m; }, [data]);
  const fq = norm(find);
  const cars = !data ? [] : !fq ? data.cars : data.cars.filter((c) => norm(c.vin).includes(fq) || norm(c.stock).includes(fq) || norm(c.title).includes(fq));
  const del = async (c) => { if (!window.confirm(`Delete ${c.title}? This cannot be undone.`)) return; await api('/admin/cars/' + c.id, { method: 'DELETE' }); reload(); };
  return (
    <div className="box">
      <div className="sec-head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Cars</h2><button className="btn btn-red" onClick={() => setEdit({})}>+ Add car</button></div>
      <div className="field" style={{ maxWidth: 420 }}><label className="f" htmlFor="car-find">Find a car by VIN, stock number or title</label><input id="car-find" className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. the last 6 characters of the VIN" autoComplete="off" /></div>
      {data && fq && <div className="small muted" role="status">{cars.length} of {data.cars.length} cars match</div>}
      {!data ? <Loading /> : <div className="scroll-x"><table className="tbl"><thead><tr><th>Car</th><th>Price</th><th>Views</th><th>Status</th><th /></tr></thead><tbody>
        {cars.map((c) => <tr key={c.id}>
          <td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><img className="thumb" src={rs(firstPhoto(c), 400)} alt="" /><div><b>{c.title}</b><div className="small muted">{c.dealer_id && c.dealer_id !== 1 ? <><span className="tag tag-info">{c.dealer_name}</span> · </> : null}{c.make} · {c.model} · {c.body}{c.featured ? ' · featured' : ''}{c.vin ? <> · VIN …{norm(c.vin).slice(-6)}</> : ' · no VIN'}{vinCount[norm(c.vin)] > 1 ? <> · <span className="tag tag-bad">same VIN on {vinCount[norm(c.vin)]} cars</span></> : null}</div></div></div></td>
          <td>{naira(c.price)}{c.old_price ? <div className="small muted"><s>{naira(c.old_price)}</s></div> : null}</td><td>{c.views}</td>
          <td><T c={stTag[c.status]}>{c.status === 'pending' ? 'waiting' : c.status}</T></td>
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
  // "Fill from VIN": empty fields are filled from the factory record (or at least the maker and year)
  const [vinNote, setVinNote] = useState('');
  const fillFromVin = async () => {
    const v = String(f.vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length !== 17) { setVinNote('Type the full 17-character VIN first.'); return; }
    setVinNote('Looking up…');
    try {
      const r = await api('/vin/' + v);
      const x = r.prefill || r.basics || {};
      const res = applyPrefill(x); setF((p) => res.fill(p));
      setVinNote((res.n ? `Filled ${res.n} empty field${res.n === 1 ? '' : 's'} from the ${x.source === 'factory' ? 'factory record' : 'VIN'}. Check them against the car.` : 'The VIN gave nothing new to fill in.')
        + (res.trimChoices.length ? ` This VIN fits several trims (${res.trimChoices.join(', ')}): type the right one in Trim and the title.` : ''));
    } catch (e2) { setVinNote(e2.message); }
  };
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
          {inp('color', 'Exterior colour')}{inp('interior', 'Interior')}{inp('condition', 'Condition')}{inp('location', 'Location')}<div className="field"><label className="f" htmlFor="cf-vin">VIN</label><div style={{ display: 'flex', gap: 8 }}><input id="cf-vin" className="input" value={f.vin} onChange={set('vin')} autoCapitalize="characters" spellCheck={false} /><button type="button" className="btn btn-dark btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={fillFromVin}>Fill from VIN</button></div>{vinNote && <div className="hint" role="status">{vinNote}</div>}</div>{inp('stock', 'Stock number')}
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
