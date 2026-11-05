// Shared by the dealer and staff car forms.
// Puts what the VIN says into the empty fields only (never over what the seller typed). Returns how many it filled,
// and the choices the seller still has to make (several trims, engines, drives or gearboxes fit one VIN).
const BODIES = ['Sedan', 'SUV', 'SUV Coupe', 'Hatchback', 'Coupe', 'Pickup', 'Minivan', 'Wagon', 'Bus'];
const isDefault = (k, v) => (k === 'transmission' && v === 'Automatic') || (k === 'fuel' && v === 'Petrol');
export function applyPrefill(x) {
  x = x || {};
  const take = { title: x.title && x.model ? x.title : '', make: x.make, model: x.model, year: x.year ? String(x.year) : '', trim: x.trim, body: BODIES.includes(x.body) ? x.body : '',
    engine: x.engine, transmission: x.transmission, drivetrain: x.drivetrain, fuel: x.fuel,
    features: (x.features || []).join('\n'), specsText: (x.specs || []).map(([k, v]) => `${k}: ${v}`).join('\n'), description: x.description };
  const keys = Object.keys(take).filter((k) => take[k]);
  const choices = { ...((x.choices) || {}) }; const withEngine = choices.withEngine || {}; delete choices.withEngine;
  if (x.trimChoices && x.trimChoices.length > 1) choices.trim = x.trimChoices;
  return {
    n: keys.length, trimChoices: x.trimChoices || [], choices, withEngine,
    fill: (p) => { const out = { ...p }; for (const k of keys) if (!String(p[k] || '').trim() || isDefault(k, p[k])) out[k] = take[k]; return out; }
  };
}

// The seller taps one of the choices: set it, and for an engine also the gearbox and fuel that come with it
export function pickChoice(p, field, value, withEngine = {}) {
  const out = { ...p, [field]: value };
  if (field === 'engine' && withEngine[value]) {
    const w = withEngine[value];
    if (w.fuel) out.fuel = w.fuel;
    if (w.transmission && (!String(p.transmission || '').trim() || isDefault('transmission', p.transmission) || Object.values(withEngine).some((x) => x.transmission === p.transmission))) out.transmission = w.transmission;
  }
  if (field === 'trim' && p.title && !new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(p.title)) out.title = `${p.title} ${value}`.trim();
  // Keep the Specs box in step with what was picked
  const label = { engine: 'Engine', transmission: 'Transmission', drivetrain: 'Drive', fuel: 'Fuel' };
  let rows = String(p.specsText || '').split('\n').filter((l) => l.trim());
  for (const k of Object.keys(label)) {
    if (out[k] === p[k] || !out[k]) continue;
    rows = rows.filter((l) => !l.toLowerCase().startsWith(label[k].toLowerCase() + ':'));
    rows.unshift(`${label[k]}: ${out[k]}`);
  }
  out.specsText = rows.join('\n');
  return out;
}

export const COLOURS = ['Black', 'White', 'Silver', 'Grey', 'Pearl white', 'Blue', 'Dark blue', 'Red', 'Wine', 'Green', 'Brown', 'Gold', 'Beige', 'Orange', 'Yellow'];
export const INTERIORS = ['Black leather', 'Beige leather', 'Grey leather', 'Brown leather', 'Red leather', 'Black fabric', 'Grey fabric', 'Beige fabric'];
// Common features the seller ticks (the VIN record only lists some safety equipment)
export const FEATURES = ['Air conditioning', 'Reverse camera', 'Parking sensors', 'Bluetooth', 'Apple CarPlay / Android Auto', 'Navigation', 'Touchscreen',
  'Push-to-start', 'Keyless entry', 'Leather seats', 'Heated seats', 'Cooled seats', 'Power seats', 'Sunroof', 'Panoramic roof', 'Third-row seats',
  'Alloy wheels', 'Fog lights', 'LED headlights', 'Cruise control', 'Adaptive cruise control', 'Blind-spot monitoring', 'Lane keeping assist',
  'Power tailgate', 'Premium sound', 'Dual-zone climate', 'Rear AC vents', 'Remote start', 'Tow hitch', '360° camera'];

// Mileage is kept as text ("68,000 miles"); the form shows a number and a unit
export function parseMileage(m) {
  const t = String(m || '');
  const digits = t.replace(/[^0-9]/g, '');
  return { num: digits, unit: /\bkm|kilomet/i.test(t) ? 'km' : 'miles' };
}
export const joinMileage = (num, unit) => (String(num).trim() === '' ? '' : `${Number(String(num).replace(/[^0-9]/g, '')).toLocaleString('en-NG')} ${unit}`);

// "Write it for me": a plain, factual description from what the form says. Nothing the seller did not enter.
const DRIVE = { FWD: 'front-wheel drive', AWD: 'all-wheel drive', '4WD': 'four-wheel drive (4x4)', RWD: 'rear-wheel drive' };
const an = (w) => (/^(8|11|18|[aeiou])/i.test(String(w)) ? 'an' : 'a');
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
export function writeDescription(f) {
  const name = String(f.title || [f.year, f.make, f.model, f.trim].filter(Boolean).join(' ')).trim();
  if (!name) return '';
  const cond = { 'Foreign Used': 'foreign-used (tokunbo)', 'Nigerian Used': 'Nigerian-used', 'Brand New': 'brand new' }[f.condition] || '';
  const p1 = [];
  p1.push(`This ${name}${f.color ? ` in ${String(f.color).toLowerCase()}` : ''} is ${cond ? `${an(cond)} ${cond} car` : 'for sale'}${f.mileage ? ` with ${f.mileage} on the clock` : ''}.`);
  const eng = String(f.engine || '').replace(/\s*\(\d+ hp\)$/, '');
  const bits = [eng && `${an(eng)} ${eng} engine`, f.transmission && `${an(f.transmission)} ${String(f.transmission).toLowerCase()} gearbox`, DRIVE[f.drivetrain] || (f.drivetrain ? String(f.drivetrain) : '')].filter(Boolean);
  if (bits.length) p1.push(`It has ${list(bits)}${f.fuel && !/petrol/i.test(f.fuel) && !/hybrid|diesel|electric/i.test(eng) ? `, and runs on ${String(f.fuel).toLowerCase()}` : ''}.`);
  if (f.interior) p1.push(`Inside: ${String(f.interior).toLowerCase()}.`);
  const feats = String(f.features || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const p2 = feats.length ? `Features include ${list(feats.slice(0, 10).map((x) => (/^[A-Z][a-z]/.test(x) && !/^(Apple|Android|Bluetooth)\b/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x)))}${feats.length > 10 ? ', and more' : ''}.` : '';
  const p3 = 'Book a viewing to inspect the car and its papers. This car is listed with its VIN on Korrect Cars.';
  return [p1.join(' '), p2, p3].filter(Boolean).join('\n\n');
}
