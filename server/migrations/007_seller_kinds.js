// Seller types (Nov 2026). One seller system, two kinds:
//   business: a dealer with CAC papers, checked by staff ("Verified Dealer")
//   personal: someone selling their own car. ID checked by staff = "Verified Seller" (up to 5 cars);
//             not checked = "Private Seller · not verified" (1 car, and staff look at that car before it goes live)
// cars.reviewed_at/by: a staff check of one car (for private sellers). listing_reports: "Report this listing".
module.exports = {
  about: "dealers.kind (business|personal); cars.reviewed_at + reviewed_by; listing_reports",
  async up({ q, t, my, hasColumn, hasIndex }) {
    if (!(await hasColumn('dealers', 'kind'))) await q(`ALTER TABLE dealers ADD COLUMN kind ${t.S(10)} NOT NULL DEFAULT 'business'`);
    if (!(await hasColumn('cars', 'reviewed_at'))) await q('ALTER TABLE cars ADD COLUMN reviewed_at DATETIME NULL');
    if (!(await hasColumn('cars', 'reviewed_by'))) await q(`ALTER TABLE cars ADD COLUMN reviewed_by ${t.FK} NULL`);
    await q(`CREATE TABLE IF NOT EXISTS listing_reports (id ${t.ID}, car_id ${t.FK} NOT NULL, reason ${t.S(20)} NOT NULL,
      details ${t.S(600)} NULL, user_id ${t.FK} NULL, ip ${t.S(60)} NULL, status ${t.S(10)} NOT NULL DEFAULT 'open',
      handled_by ${t.FK} NULL, handled_at DATETIME NULL, created_at ${t.TS})${t.TAIL}`);
    if (!(await hasIndex('listing_reports', 'lr_status'))) await q(my ? 'ALTER TABLE listing_reports ADD KEY lr_status (status, car_id)' : 'CREATE INDEX lr_status ON listing_reports (status, car_id)');
  }
};
