// Moving cars between dealers (Nov 2026): Korrect Cars' stock is handed to Buffy's dealer account when he joins.
// moved_from / moved_at record where a car came from. Moved cars do not count towards a new dealer's 50-car limit.
module.exports = {
  about: 'cars.moved_from + moved_at (cars handed over by staff to a dealer)',
  async up({ q, t, hasColumn }) {
    if (!(await hasColumn('cars', 'moved_from'))) await q(`ALTER TABLE cars ADD COLUMN moved_from ${t.FK} NULL`);
    if (!(await hasColumn('cars', 'moved_at'))) await q('ALTER TABLE cars ADD COLUMN moved_at DATETIME NULL');
  }
};
