// Turns the cleaned car form (validate('car')) into database columns. Shared by the staff and dealer car forms.
const { J } = require('../db');
const { list, inspectionSchema } = require('./validate');
const { STATES, lgasOf } = require('./ng-lgas');

const rowsFromText = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });

const yes = (x) => x === true || x === 'true' || x === '1' || x === 'on';
const bad = (message, field) => Object.assign(new Error(message), { status: 400, field });

// A car shown for sale needs its mileage, and a price or "Call for price" (price 0). Hidden drafts and sold cars may
// be saved without them. Staff (not dealers) may list a car with the mileage "To be confirmed" while the owner gets
// a dashboard photo; buyers then see "To be confirmed" instead of a number.
const MILEAGE_TBC = 'To be confirmed';
const isMileageTbc = (m) => String(m || '').trim().toLowerCase() === MILEAGE_TBC.toLowerCase();
function carValues(v, { staff = false } = {}) {
  const call = yes(v.callForPrice);
  const price = call ? 0 : Number(v.price) || 0;
  if ((v.status || 'available') === 'available') {
    if (!call && !(price > 0)) throw bad('Enter the price, or tick "Call for price".', 'price');
    if (!/\d/.test(String(v.mileage || '')) && !(staff && isMileageTbc(v.mileage))) throw bad('Enter the mileage (as shown on the dashboard).', 'mileage');
  }
  return {
    title: v.title, make: v.make, model: v.model, body: v.body, trim_level: v.trim || null, year: v.year || null, price,
    old_price: call ? null : v.oldPrice || null, mileage: v.mileage || null, engine: v.engine || null, transmission: v.transmission || null,
    drivetrain: v.drivetrain || null, fuel: v.fuel || null, color: v.color || null, interior: v.interior || null,
    car_condition: v.condition || null, location: v.location || 'Lagos', vin: v.vin || null, stock: v.stock || null,
    description: v.description || null, features: J(list(String(v.features || '').includes('\n') ? String(v.features).split('\n') : v.features)),
    specs: J(rowsFromText(v.specsText)), info: J(String(v.infoText || '').split('\n').map((s) => s.trim()).filter(Boolean)),
    status: v.status || 'available', featured: v.featured === true || v.featured === 'true' ? 1 : 0,
    inspection: inspectionJson(v.inspection),
    ...(staff ? carPlace(v) : {}) // dealers' cars are always where the dealer is; only staff place a car elsewhere
  };
}

// Staff: where the car is, if not where its account is (e.g. Buffy's cars in Abuja on Korrect Cars' account). Empty = the account's place.
function carPlace(v) {
  if (v.carState === undefined) return {};
  const state = String(v.carState || '').trim();
  if (!state) return { state: null, lga: null };
  if (!STATES.includes(state)) throw bad('Pick the state from the list.', 'carState');
  const lga = String(v.carLga || '').trim();
  if (lga && !lgasOf(state).includes(lga)) throw bad('Pick the local government from the list for that state.', 'carLga');
  return { state, lga: lga || null };
}

// Inspection notes arrive as JSON from the car form; keep only filled-in areas
function inspectionJson(raw) {
  if (raw === undefined || raw === '') return null;
  let data;
  try { data = inspectionSchema.parse(JSON.parse(raw)); } catch (_e) { throw Object.assign(new Error('Check the inspection notes and try again.'), { status: 400 }); }
  data.items = data.items.filter((i) => (i.note && i.note.trim()) || i.status);
  return data.items.length ? JSON.stringify(data) : null;
}

module.exports = { carValues, rowsFromText, inspectionJson, MILEAGE_TBC, isMileageTbc };
