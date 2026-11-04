// Marketplace foundation (Nov 2026): dealers are businesses, users are people, dealer_members joins them.
// Korrect Cars becomes dealer 1 and every existing car belongs to it, so no address, slug or photo changes.
// cars.dealer_id defaults to 1, so the staff car form and the WordPress seed keep adding Korrect Cars' own cars.
module.exports = {
  about: 'dealers, dealer_members, verification_events; Korrect Cars is dealer 1; cars.dealer_id',
  async up({ q, my, t, hasColumn, hasIndex }) {
    await q(`CREATE TABLE IF NOT EXISTS dealers (id ${t.ID}, slug ${t.S(80)} NOT NULL UNIQUE, business_name ${t.S(160)} NOT NULL,
      cac_type ${t.S(2)} NULL, cac_number ${t.S(20)} NULL UNIQUE, status ${t.S(16)} NOT NULL DEFAULT 'draft', verified_at DATETIME NULL,
      phone ${t.S(20)} NULL, whatsapp ${t.S(20)} NULL, email ${t.S(120)} NULL, address ${t.S(250)} NULL, state ${t.S(40)} NULL, lga ${t.S(60)} NULL,
      logo_key ${t.S(120)} NULL, about ${t.TEXT} NULL, live_limit INT NULL, created_at ${t.TS}, updated_at ${t.TSU})${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS dealer_members (id ${t.ID}, dealer_id ${t.FK} NOT NULL, user_id ${t.FK} NOT NULL,
      role ${t.S(10)} NOT NULL DEFAULT 'lister', invited_by ${t.FK} NULL, created_at ${t.TS},
      UNIQUE (dealer_id, user_id)${my ? ', KEY dm_user (user_id)' : ''})${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS verification_events (id ${t.ID}, dealer_id ${t.FK} NOT NULL, step ${t.S(20)} NOT NULL,
      result ${t.S(20)} NOT NULL, actor_id ${t.FK} NULL, note ${t.S(400)} NULL, created_at ${t.TS}${my ? ', KEY ve_dealer (dealer_id)' : ''})${t.TAIL}`);
    if (!my) await q('CREATE INDEX IF NOT EXISTS dm_user ON dealer_members (user_id)');
    if (!my) await q('CREATE INDEX IF NOT EXISTS ve_dealer ON verification_events (dealer_id)');

    // Korrect Cars: dealer 1, approved from day one
    const kc = await q('SELECT id FROM dealers WHERE id = 1');
    if (!kc.length) {
      await q(`INSERT INTO dealers (id, slug, business_name, status, verified_at, email, state)
        VALUES (1, 'korrect-cars', 'Korrect Cars', 'approved', NOW(), 'info@korrectcars.com', 'Lagos')`);
      await q("INSERT INTO verification_events (dealer_id, step, result, note) VALUES (1, 'setup', 'approved', 'Korrect Cars is the marketplace owner (dealer 1)')");
    }

    // Every car belongs to a dealer; existing cars and new staff-added cars belong to Korrect Cars
    if (!(await hasColumn('cars', 'dealer_id'))) {
      await q(`ALTER TABLE cars ADD COLUMN dealer_id ${t.FK} NOT NULL DEFAULT 1`);
    }
    await q('UPDATE cars SET dealer_id = 1 WHERE dealer_id IS NULL OR dealer_id = 0');
    if (!(await hasIndex('cars', 'cars_dealer_status'))) {
      await q(my ? 'ALTER TABLE cars ADD KEY cars_dealer_status (dealer_id, status)' : 'CREATE INDEX cars_dealer_status ON cars (dealer_id, status)');
    }
    if (my) {
      const fk = await q("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cars' AND CONSTRAINT_NAME = 'fk_cars_dealer'");
      if (!fk.length) await q('ALTER TABLE cars ADD CONSTRAINT fk_cars_dealer FOREIGN KEY (dealer_id) REFERENCES dealers (id)');
    }
  }
};
