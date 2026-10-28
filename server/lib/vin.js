// Free VIN checker. Cleans and checks a VIN, then decodes it with the US government's free vPIC service (NHTSA),
// which knows most cars built for the US market, i.e. most tokunbo cars in Nigeria. It shows how the car left the
// factory (make, model, year, engine, plant). It does NOT show accidents, flood damage or mileage: that needs a paid
// history provider. Results are kept in memory for a day so repeat checks don't call the service again.
const BASE = (process.env.VIN_DECODER_URL || 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/').replace(/\/?$/, '/');

// 17 characters; the letters I, O and Q are never used (they look like 1 and 0)
const clean = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '').slice(0, 20);
const VALID = /^[A-HJ-NPR-Z0-9]{17}$/;

// The 9th character is a check digit on cars made for North America. A wrong one usually means a typo.
const T = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function checkDigitOk(vin) {
  const sum = [...vin].reduce((s, ch, i) => s + (/\d/.test(ch) ? Number(ch) : T[ch]) * W[i], 0);
  const r = sum % 11;
  return vin[8] === (r === 10 ? 'X' : String(r));
}

// The fields we show, in order, with plain labels
const FIELDS = [
  ['ModelYear', 'Year'], ['Make', 'Make'], ['Model', 'Model'], ['Trim', 'Trim'], ['Series', 'Series'], ['BodyClass', 'Body'],
  ['Doors', 'Doors'], ['DriveType', 'Drive'], ['TransmissionStyle', 'Transmission'], ['EngineCylinders', 'Cylinders'],
  ['DisplacementL', 'Engine size (litres)'], ['FuelTypePrimary', 'Fuel'], ['ElectrificationLevel', 'Hybrid / electric'],
  ['Manufacturer', 'Manufacturer'], ['PlantCountry', 'Built in'], ['PlantCity', 'Factory city'], ['VehicleType', 'Vehicle type']
];
const nice = (k, v) => {
  if (k === 'DisplacementL') { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toFixed(1) : ''; }
  if (k === 'Make' || k === 'Manufacturer' || k === 'PlantCity') return v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUsa\b/g, 'USA').replace(/\bBmw\b/g, 'BMW').replace(/\bGmc\b/g, 'GMC');
  if (k === 'VehicleType') return v.charAt(0) + v.slice(1).toLowerCase();
  if (k === 'FuelTypePrimary') return v.replace(/\bGasoline\b/i, 'Petrol');
  if (k === 'PlantCountry') return v.replace(/\s*\(.*\)$/, '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^United States Of America$/, 'United States');
  return v;
};

const cache = new Map(); // vin -> { at, data }
const DAY = 24 * 3600 * 1000;

async function decode(vinIn) {
  const vin = clean(vinIn);
  if (!VALID.test(vin)) {
    const bad = /[IOQ]/.test(vin) ? 'A VIN never uses the letters I, O or Q. Check for 1 (one) or 0 (zero) instead.' : `A VIN has 17 letters and numbers. This one has ${vin.length}.`;
    return { vin, valid: false, message: bad };
  }
  const hit = cache.get(vin);
  if (hit && Date.now() - hit.at < DAY) return hit.data;

  let row;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${BASE}${vin}?format=json`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) throw new Error('decoder status ' + res.status);
    row = ((await res.json()).Results || [])[0] || {};
  } catch (e) {
    console.warn('[vin] decoder unavailable:', e.message);
    throw Object.assign(new Error('The VIN service is busy right now. Please try again in a minute, or send us the VIN on WhatsApp.'), { status: 503 });
  }
  const s = (x) => String(x == null ? '' : x).trim();
  const details = FIELDS.map(([k, label]) => [label, nice(k, s(row[k]))]).filter(([, v]) => v && v !== 'Not Applicable');
  const make = nice('Make', s(row.Make)); const model = s(row.Model); const year = s(row.ModelYear);
  const data = {
    vin, valid: true, checkDigitOk: checkDigitOk(vin),
    found: !!(make && (model || year)),
    title: [year, make, model, s(row.Trim)].filter(Boolean).join(' '),
    make, model, year: Number(year) || null, details,
    note: s(row.ErrorCode) && s(row.ErrorCode) !== '0' ? s(row.ErrorText).split(';')[0].replace(/^\d+\s*-\s*/, '') : ''
  };
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  cache.set(vin, { at: Date.now(), data });
  return data;
}

module.exports = { clean, VALID, checkDigitOk, decode };
