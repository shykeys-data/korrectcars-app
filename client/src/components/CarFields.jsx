// Car form pieces shared by the dealer form (pages/Dealer.jsx) and the staff form (pages/AdminCars.jsx):
// price with "Call for price", mileage with a unit, colour pick lists, feature ticks, VIN choices and
// the "Write it for me" description button.
import React from 'react';
import { COLOURS, INTERIORS, FEATURES, parseMileage, joinMileage, writeDescription, pickChoice } from '../lib/prefill.js';

export function PriceField({ f, setF, id = 'cf' }) {
  return (
    <div className="field"><label className="f" htmlFor={id + '-price'}>Price (₦) <span className="req" aria-hidden="true">*</span></label>
      <input id={id + '-price'} className="input" inputMode="numeric" value={f.callForPrice ? '' : f.price ? Number(String(f.price).replace(/[^0-9]/g, '')).toLocaleString('en-NG') : ''}
        disabled={!!f.callForPrice} required={!f.callForPrice} placeholder={f.callForPrice ? 'Buyers will see "Call for price"' : 'e.g. 14,500,000'}
        onChange={(e) => setF((p) => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))} />
      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <input type="checkbox" checked={!!f.callForPrice} onChange={(e) => setF((p) => ({ ...p, callForPrice: e.target.checked }))} /> Call for price (don't show a price)
      </label>
    </div>
  );
}

export function MileageField({ f, setF, id = 'cf' }) {
  const m = parseMileage(f.mileage);
  return (
    <div className="field"><label className="f" htmlFor={id + '-mileage'}>Mileage <span className="req" aria-hidden="true">*</span></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id={id + '-mileage'} className="input" inputMode="numeric" required value={m.num ? Number(m.num).toLocaleString('en-NG') : ''} placeholder="As shown on the dashboard"
          onChange={(e) => setF((p) => ({ ...p, mileage: joinMileage(e.target.value, parseMileage(p.mileage).unit) }))} />
        <select className="input" style={{ width: 110 }} aria-label="Unit" value={m.unit} onChange={(e) => setF((p) => ({ ...p, mileage: joinMileage(parseMileage(p.mileage).num, e.target.value) }))}>
          <option value="miles">miles</option><option value="km">km</option>
        </select>
      </div>
    </div>
  );
}

// A pick list that still allows something else
function PickList({ id, label, value, options, onChange }) {
  const other = value && !options.includes(value);
  return (
    <div className="field"><label className="f" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={other ? '__other' : value || ''} onChange={(e) => onChange(e.target.value === '__other' ? ' ' : e.target.value)}>
        <option value="">Choose</option>{options.map((o) => <option key={o}>{o}</option>)}<option value="__other">Other…</option>
      </select>
      {other && <input className="input" style={{ marginTop: 6 }} aria-label={label + ' (other)'} value={value.trim()} onChange={(e) => onChange(e.target.value || ' ')} />}
    </div>
  );
}
export function ColourFields({ f, setF, id = 'cf' }) {
  return <>
    <PickList id={id + '-color'} label="Exterior colour" value={f.color} options={COLOURS} onChange={(v) => setF((p) => ({ ...p, color: v }))} />
    <PickList id={id + '-interior'} label="Interior" value={f.interior} options={INTERIORS} onChange={(v) => setF((p) => ({ ...p, interior: v }))} />
  </>;
}

export function FeatureTicks({ f, setF, id = 'cf' }) {
  const lines = String(f.features || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const has = (x) => lines.some((l) => l.toLowerCase() === x.toLowerCase());
  const toggle = (x) => setF((p) => { const l = String(p.features || '').split('\n').map((y) => y.trim()).filter(Boolean); return { ...p, features: (l.some((y) => y.toLowerCase() === x.toLowerCase()) ? l.filter((y) => y.toLowerCase() !== x.toLowerCase()) : [...l, x]).join('\n') }; });
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
      <legend className="f">Features (tap all the car has)</legend>
      <div className="opts">{FEATURES.map((x) => <button type="button" key={x} className={'opt' + (has(x) ? ' on' : '')} aria-pressed={has(x)} onClick={() => toggle(x)}>{has(x) ? '✓ ' : ''}{x}</button>)}</div>
      <label className="f small" htmlFor={id + '-feat'} style={{ marginTop: 10 }}>All features, one per line (add any not listed above)</label>
      <textarea id={id + '-feat'} className="input" rows={4} value={f.features} onChange={(e) => setF((p) => ({ ...p, features: e.target.value }))} />
    </fieldset>
  );
}

const LABEL = { trim: 'Trim', engine: 'Engine', drivetrain: 'Drive', transmission: 'Gearbox' };
// "This VIN fits several engines: tap the one on the car"
export function VinChoices({ choices, withEngine, f, setF }) {
  const keys = Object.keys(choices || {}).filter((k) => LABEL[k] && choices[k].length > 1);
  if (!keys.length) return null;
  return (
    <div className="note" role="group" aria-label="Pick what is on this car">
      <b>The VIN fits more than one version. Tap what this car has:</b>
      {keys.map((k) => <div key={k} style={{ marginTop: 8 }}><span className="small muted">{LABEL[k]}: </span>
        <span className="opts" style={{ display: 'inline-flex' }}>{choices[k].map((v) => <button type="button" key={v} className={'opt' + (f[k] === v ? ' on' : '')} aria-pressed={f[k] === v} onClick={() => setF((p) => pickChoice(p, k, v, withEngine))}>{v}</button>)}</span></div>)}
    </div>
  );
}

export function DescriptionField({ f, setF, id = 'cf' }) {
  const write = () => setF((p) => ({ ...p, description: writeDescription(p) }));
  return (
    <div className="field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <label className="f" htmlFor={id + '-desc'}>Description (blank line between paragraphs)</label>
        <button type="button" className="btn btn-line btn-sm" onClick={write} disabled={!f.make && !f.title}>{f.description ? 'Rewrite from the details' : 'Write it for me'}</button>
      </div>
      <textarea id={id + '-desc'} className="input" rows={6} maxLength={8000} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
      <div className="hint">Uses the details above (VIN, mileage, colour, features). Read it, then add anything special: service history, new tyres, papers.</div>
    </div>
  );
}
