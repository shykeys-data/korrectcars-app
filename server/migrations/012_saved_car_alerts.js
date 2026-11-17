// Saved-car alerts (Nov 2026): email people when a car they saved drops in price, is sold, or gets new photos.
// users.car_alerts: the buyer's on/off switch (on by default; off from Account > Saved cars).
// saved_car_alerts: when each kind of email was last sent for a person and a car, so they are never sent twice in a row.
module.exports = {
  about: 'saved-car alerts: users.car_alerts switch and saved_car_alerts (last email per person, car and kind)',
  async up({ q, t, hasColumn }) {
    if (!(await hasColumn('users', 'car_alerts'))) await q('ALTER TABLE users ADD COLUMN car_alerts TINYINT NOT NULL DEFAULT 1');
    await q(`CREATE TABLE IF NOT EXISTS saved_car_alerts (user_id ${t.FK} NOT NULL, car_id ${t.FK} NOT NULL, kind ${t.S(12)} NOT NULL,
      price BIGINT NULL, sent_at DATETIME NOT NULL, PRIMARY KEY (user_id, car_id, kind))${t.TAIL}`);
  }
};
