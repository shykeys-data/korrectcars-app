// CAC numbers are unique per register, not overall (Nov 2026): a company (RC 1234567) and a business name
// (BN 1234567) come from different CAC registers and can share digits. One dealer per type + number.
// Also an index for finding a car from its VIN register entry, which every VIN check does.
module.exports = {
  about: 'dealers: one dealer per CAC type + number (was per number); index on cars.vehicle_id_ref',
  async up({ q, my, hasIndex }) {
    if (my) {
      if (await hasIndex('dealers', 'cac_number')) await q('ALTER TABLE dealers DROP INDEX cac_number');
      if (!(await hasIndex('dealers', 'uq_dealer_cac'))) await q('ALTER TABLE dealers ADD UNIQUE KEY uq_dealer_cac (cac_type, cac_number)');
      if (!(await hasIndex('cars', 'cars_vehicle_ref'))) await q('ALTER TABLE cars ADD KEY cars_vehicle_ref (vehicle_id_ref)');
      return;
    }
    // SQLite (tests only) cannot drop a column's UNIQUE, so the small dealers table is rebuilt without it
    const row = (await q("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dealers'"))[0];
    if (row && /cac_number TEXT NULL UNIQUE/.test(row.sql)) {
      await q(row.sql.replace('CREATE TABLE IF NOT EXISTS dealers', 'CREATE TABLE dealers_rebuild').replace('CREATE TABLE dealers', 'CREATE TABLE dealers_rebuild').replace('cac_number TEXT NULL UNIQUE', 'cac_number TEXT NULL'));
      await q('INSERT INTO dealers_rebuild SELECT * FROM dealers');
      await q('DROP TABLE dealers');
      await q('ALTER TABLE dealers_rebuild RENAME TO dealers');
    }
    await q('CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_cac ON dealers (cac_type, cac_number)');
    await q('CREATE INDEX IF NOT EXISTS cars_vehicle_ref ON cars (vehicle_id_ref)');
  }
};
