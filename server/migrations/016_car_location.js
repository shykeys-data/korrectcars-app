// Where a car is, when it is not where its seller's account is (Nov 2026): Korrect Cars lists cars from suppliers
// in other cities on its own account (e.g. Buffy's cars in Abuja). Staff set cars.state and cars.lga; when empty,
// the car is where its dealer is, as before.
module.exports = {
  about: 'cars.state and cars.lga: a car\'s own location, set by staff, used instead of the dealer\'s',
  async up({ q, t, hasColumn }) {
    if (!(await hasColumn('cars', 'state'))) await q(`ALTER TABLE cars ADD COLUMN state ${t.S(40)} NULL`);
    if (!(await hasColumn('cars', 'lga'))) await q(`ALTER TABLE cars ADD COLUMN lga ${t.S(60)} NULL`);
  }
};
