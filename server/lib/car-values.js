// Turns the cleaned car form (validate('car')) into database columns. Shared by the staff and dealer car forms.
const { J } = require('../db');
const { list, inspectionSchema } = require('./validate');

const rowsFromText = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });

function carValues(v) {
  return {
    title: v.title, make: v.make, model: v.model, body: v.body, trim_level: v.trim || null, year: v.year || null, price: v.price,
    old_price: v.oldPrice || null, mileage: v.mileage || null, engine: v.engine || null, transmission: v.transmission || null,
    drivetrain: v.drivetrain || null, fuel: v.fuel || null, color: v.color || null, interior: v.interior || null,
    car_condition: v.condition || null, location: v.location || 'Lagos', vin: v.vin || null, stock: v.stock || null,
    description: v.description || null, features: J(list(String(v.features || '').includes('\n') ? String(v.features).split('\n') : v.features)),
    specs: J(rowsFromText(v.specsText)), info: J(String(v.infoText || '').split('\n').map((s) => s.trim()).filter(Boolean)),
    status: v.status || 'available', featured: v.featured === true || v.featured === 'true' ? 1 : 0,
    inspection: inspectionJson(v.inspection)
  };
}

// Inspection notes arrive as JSON from the car form; keep only filled-in areas
function inspectionJson(raw) {
  if (raw === undefined || raw === '') return null;
  let data;
  try { data = inspectionSchema.parse(JSON.parse(raw)); } catch (_e) { throw Object.assign(new Error('Check the inspection notes and try again.'), { status: 400 }); }
  data.items = data.items.filter((i) => (i.note && i.note.trim()) || i.status);
  return data.items.length ? JSON.stringify(data) : null;
}

module.exports = { carValues, rowsFromText, inspectionJson };
