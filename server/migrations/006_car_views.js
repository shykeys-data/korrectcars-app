// Views per car per day (Nov 2026), for the dealer dashboard: today, this week, the last 30 days and all time.
// One row per car per Lagos day; cars.views stays the all-time total. Day is 'YYYY-MM-DD' (Lagos time).
module.exports = {
  about: 'car_views_daily (views per car per day for the dealer dashboard); index on enquiries.car_id',
  async up({ q, t, my, hasIndex }) {
    await q(`CREATE TABLE IF NOT EXISTS car_views_daily (car_id ${t.FK} NOT NULL, day ${t.S(10)} NOT NULL, views INT NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, day))${t.TAIL}`);
    // Buyer requests per car, counted on the dealer dashboard
    if (!(await hasIndex('enquiries', 'enq_car'))) await q(my ? 'ALTER TABLE enquiries ADD KEY enq_car (car_id)' : 'CREATE INDEX enq_car ON enquiries (car_id)');
  }
};
