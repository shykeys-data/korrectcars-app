// The VIN register: every VIN or chassis number ever listed has one row in vehicle_ids, and a car points at it
// (cars.vehicle_id_ref). The database refuses a second live listing of the same car (UNIQUE uq_one_live_vin on
// cars.live_key), so even two saves at the same moment cannot both win. Used by the dealer and staff car forms.
const { q, one } = require('../db');
const { check, LIVE_STATUSES } = require('./vehicle-id');

const LIVE_SQL = `(${LIVE_STATUSES.map((s) => `'${s}'`).join(',')})`;
const isLiveClash = (e) => /uq_one_live_vin|live_key/i.test(String(e && e.message));

function invalid(v) {
  return Object.assign(new Error(v.problems[0] || 'Enter the 17-character VIN or the chassis number.'), { status: 422, code: 'VIN_INVALID', problems: v.problems, warnings: v.warnings });
}
function taken(ownCar) {
  return Object.assign(new Error(ownCar ? 'You already have a live listing for this car.' : 'This car is already listed on Korrect Cars by another seller.'),
    { status: 409, code: 'VIN_TAKEN', yours: !!ownCar, canClaim: !ownCar, carId: ownCar ? ownCar.id : undefined });
}

// Who holds this VIN right now? -> { v, ref, live } where live is the live car (id, dealer_id, slug, title) or null
async function lookup(raw) {
  const v = check(raw);
  if (!v.type) return { v, ref: null, live: null };
  const row = await one('SELECT id, locked FROM vehicle_ids WHERE id_type = ? AND id_value = ?', [v.type, v.value]);
  if (!row) return { v, ref: null, live: null };
  const live = await one(`SELECT id, dealer_id, slug, title, status FROM cars WHERE vehicle_id_ref = ? AND status IN ${LIVE_SQL}`, [row.id]);
  return { v, ref: row, live: live || null };
}

// The register row for a VIN, created if new. Throws VIN_INVALID when the number breaks the rules.
async function refFor(raw) {
  const v = check(raw);
  if (!v.type || v.problems.length) throw invalid(v);
  const ok = v.type === 'vin17' ? (v.warnings.length ? 0 : 1) : null;
  try {
    await q('INSERT INTO vehicle_ids (id_type, id_value, wmi, check_digit_ok) VALUES (?, ?, ?, ?)', [v.type, v.value, v.wmi, ok]);
  } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; } // someone registered it first: fine
  const row = await one('SELECT id, locked FROM vehicle_ids WHERE id_type = ? AND id_value = ?', [v.type, v.value]);
  if (row.locked) throw Object.assign(new Error('This VIN is on hold while our team checks it. Please contact us.'), { status: 409, code: 'VIN_LOCKED' });
  return { v, ref: row.id };
}

// Runs a car INSERT or UPDATE and turns the database's "second live listing" refusal into VIN_TAKEN
async function guarded(ref, dealerId, fn) {
  try { return await fn(); } catch (e) {
    if (!isLiveClash(e)) throw e;
    const own = ref ? await one(`SELECT id FROM cars WHERE vehicle_id_ref = ? AND dealer_id = ? AND status IN ${LIVE_SQL}`, [ref, dealerId]) : null;
    throw taken(own);
  }
}

// Links cars that have a VIN but no register entry (e.g. cars loaded by the first-start import after the
// database changes ran). Live cars first, oldest first; a clash leaves the later car unlinked for staff to check.
async function backfill() {
  const cars = await q(`SELECT id, vin FROM cars WHERE vin IS NOT NULL AND vin <> '' AND vehicle_id_ref IS NULL
    ORDER BY CASE WHEN status IN ${LIVE_SQL} THEN 0 ELSE 1 END, id`);
  let linked = 0;
  for (const car of cars) {
    try { const { ref, v } = await refFor(car.vin); await q('UPDATE cars SET vehicle_id_ref = ?, vin = ? WHERE id = ?', [ref, v.value, car.id]); linked++; } catch (_e) { /* invalid or clashing VIN: left for staff */ }
  }
  return linked;
}

module.exports = { lookup, refFor, guarded, taken, invalid, isLiveClash, backfill, LIVE_SQL, check };
