// Listing data fixes from the Nov 2026 audit (owner's decisions, 22 Nov 2026):
// - a car listed without its year gets the model year read from its VIN (10th character), and the year is put
//   at the front of its title like every other listing (the audit found "Lexus NX 200t" with no year);
// - a car with no mileage shows "To be confirmed" (the owner's chosen wording) instead of leaving the row out.
const { modelYear } = require('../lib/vin-prefill');
module.exports = {
  about: 'car data: year from VIN where missing, mileage "To be confirmed" where empty',
  async up({ q }) {
    for (const c of await q("SELECT id, title, vin FROM cars WHERE (year IS NULL OR year = 0) AND vin IS NOT NULL AND vin <> ''")) {
      const y = modelYear(c.vin);
      if (!y) continue;
      const title = /^\d{4}\s/.test(String(c.title)) ? c.title : `${y} ${c.title}`;
      await q('UPDATE cars SET year = ?, title = ? WHERE id = ?', [y, title.slice(0, 160), c.id]);
    }
    await q("UPDATE cars SET mileage = 'To be confirmed' WHERE (mileage IS NULL OR TRIM(mileage) = '') AND status <> 'sold'");
  }
};
