// One car, one live listing (Nov 2026). vehicle_ids holds every VIN or chassis number ever listed; a car points at
// its row with vehicle_id_ref. live_key repeats that pointer only while the car is pending, available or reserved,
// and a UNIQUE index on live_key lets the database itself refuse a second live listing of the same car, even if two
// dealers press Save at the same moment. Sold and hidden cars keep their pointer (history) but hold nothing.
// Existing cars: their VINs are registered; if two live cars already share one, the first keeps it and the others
// are left unlinked and printed in the log for staff to check.
const { check } = require('../lib/vehicle-id');

module.exports = {
  about: 'vehicle_ids, cars.vehicle_id_ref + live_key (one live listing per VIN), car photo hashes, VIN plate photo',
  async up({ q, my, t, hasColumn, hasIndex }) {
    await q(`CREATE TABLE IF NOT EXISTS vehicle_ids (id ${t.ID}, id_type ${t.S(8)} NOT NULL, id_value ${t.S(20)} NOT NULL, wmi ${t.S(3)} NULL,
      check_digit_ok TINYINT NULL, decoded ${t.TEXT} NULL, locked TINYINT NOT NULL DEFAULT 0, first_seen_at ${t.TS},
      UNIQUE (id_type, id_value))${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS car_photo_hashes (id ${t.ID}, car_id ${t.FK} NOT NULL, url ${t.S(250)} NOT NULL, phash ${t.S(16)} NOT NULL,
      created_at ${t.TS}${my ? ', KEY cph_car (car_id), KEY cph_hash (phash)' : ''})${t.TAIL}`);
    if (!my) {
      await q('CREATE INDEX IF NOT EXISTS cph_car ON car_photo_hashes (car_id)');
      await q('CREATE INDEX IF NOT EXISTS cph_hash ON car_photo_hashes (phash)');
    }
    for (const [c, def] of [['vehicle_id_ref', `${t.FK} NULL`], ['vin_photo', `${t.S(80)} NULL`], ['created_by', `${t.FK} NULL`]]) {
      if (!(await hasColumn('cars', c))) await q(`ALTER TABLE cars ADD COLUMN ${c} ${def}`);
    }
    if (!(await hasColumn('cars', 'live_key'))) {
      const expr = "CASE WHEN status IN ('pending','available','reserved') THEN vehicle_id_ref ELSE NULL END";
      await q(my ? `ALTER TABLE cars ADD COLUMN live_key INT UNSIGNED GENERATED ALWAYS AS (${expr}) STORED`
        : `ALTER TABLE cars ADD COLUMN live_key INTEGER GENERATED ALWAYS AS (${expr}) VIRTUAL`);
    }
    if (!(await hasIndex('cars', 'uq_one_live_vin'))) {
      await q(my ? 'ALTER TABLE cars ADD UNIQUE KEY uq_one_live_vin (live_key)' : 'CREATE UNIQUE INDEX uq_one_live_vin ON cars (live_key)');
    }

    // Register the VINs already on cars. Live cars first, oldest first, so the earliest live listing keeps its VIN.
    const cars = await q(`SELECT id, vin, status FROM cars WHERE vin IS NOT NULL AND vin <> '' AND vehicle_id_ref IS NULL
      ORDER BY CASE WHEN status IN ('pending','available','reserved') THEN 0 ELSE 1 END, id`);
    let linked = 0; const clashes = []; const skipped = [];
    for (const car of cars) {
      const v = check(car.vin);
      if (!v.type || v.problems.length) { skipped.push(car.id); continue; }
      await q(my ? 'INSERT IGNORE INTO vehicle_ids (id_type, id_value, wmi, check_digit_ok) VALUES (?, ?, ?, ?)'
        : 'INSERT OR IGNORE INTO vehicle_ids (id_type, id_value, wmi, check_digit_ok) VALUES (?, ?, ?, ?)', [v.type, v.value, v.wmi, v.type === 'vin17' ? (v.warnings.length ? 0 : 1) : null]);
      const row = (await q('SELECT id FROM vehicle_ids WHERE id_type = ? AND id_value = ?', [v.type, v.value]))[0];
      try { await q('UPDATE cars SET vehicle_id_ref = ? WHERE id = ?', [row.id, car.id]); linked++; } catch (e) {
        if (/duplicate|unique/i.test(e.message)) clashes.push(car.id); else throw e;
      }
    }
    console.log(`  VINs registered: ${linked} cars linked${skipped.length ? `, ${skipped.length} with a VIN that fails the rules (cars ${skipped.join(', ')})` : ''}${clashes.length ? `, ${clashes.length} sharing a live VIN with another car (cars ${clashes.join(', ')})` : ''}`);
  }
};
