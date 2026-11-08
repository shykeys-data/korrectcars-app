// Boosts (Nov 2026): sellers buy a plan (how many cars are boosted at once) for a number of days, paid through
// Paystack. Boosted cars show "Featured" and come first in the recommended order. Staff can also grant a plan.
// cars.boost_until / boost_rank: set when a seller boosts a car under an active plan; a car counts as boosted
// while boost_until is in the future (no job needed to switch it off).
module.exports = {
  about: 'boost_orders; cars.boost_until + boost_rank',
  async up({ q, t, my, hasColumn, hasIndex }) {
    await q(`CREATE TABLE IF NOT EXISTS boost_orders (id ${t.ID}, dealer_id ${t.FK} NOT NULL, user_id ${t.FK} NULL, plan ${t.S(20)} NOT NULL,
      days INT NOT NULL, amount BIGINT NOT NULL, vat BIGINT NOT NULL, total BIGINT NOT NULL, reference ${t.S(40)} NOT NULL,
      status ${t.S(10)} NOT NULL DEFAULT 'pending', paid_at DATETIME NULL, starts_at DATETIME NULL, ends_at DATETIME NULL,
      note ${t.S(200)} NULL, created_at ${t.TS})${t.TAIL}`);
    if (!(await hasIndex('boost_orders', 'bo_ref'))) await q(my ? 'ALTER TABLE boost_orders ADD UNIQUE KEY bo_ref (reference)' : 'CREATE UNIQUE INDEX bo_ref ON boost_orders (reference)');
    if (!(await hasIndex('boost_orders', 'bo_dealer'))) await q(my ? 'ALTER TABLE boost_orders ADD KEY bo_dealer (dealer_id, status, ends_at)' : 'CREATE INDEX bo_dealer ON boost_orders (dealer_id, status, ends_at)');
    if (!(await hasColumn('cars', 'boost_until'))) await q('ALTER TABLE cars ADD COLUMN boost_until DATETIME NULL');
    if (!(await hasColumn('cars', 'boost_rank'))) await q('ALTER TABLE cars ADD COLUMN boost_rank INT NOT NULL DEFAULT 0');
  }
};
