// Buyer requests go to the seller (Nov 2026). A viewing, offer or question on a dealer's or private seller's car is
// sent to that seller (email + "Buyer requests" on their page); Korrect Cars staff keep a copy in Leads.
// Also dealer teams (invites) and trusted devices for the dealer sign-in check.
module.exports = {
  about: 'enquiries.dealer_id + seller_status; dealer_invites; trusted_devices; login_codes',
  async up({ q, t, my, hasColumn, hasIndex }) {
    if (!(await hasColumn('enquiries', 'dealer_id'))) await q(`ALTER TABLE enquiries ADD COLUMN dealer_id ${t.FK} NULL`);
    if (!(await hasColumn('enquiries', 'seller_status'))) await q(`ALTER TABLE enquiries ADD COLUMN seller_status ${t.S(10)} NOT NULL DEFAULT 'new'`);
    if (!(await hasIndex('enquiries', 'enq_dealer'))) await q(my ? 'ALTER TABLE enquiries ADD KEY enq_dealer (dealer_id, created_at)' : 'CREATE INDEX enq_dealer ON enquiries (dealer_id, created_at)');
    // Team invites: single-use link, 72 hours; only the hash of the token is stored
    await q(`CREATE TABLE IF NOT EXISTS dealer_invites (id ${t.ID}, dealer_id ${t.FK} NOT NULL, email ${t.S(120)} NOT NULL, role ${t.S(10)} NOT NULL,
      token_hash ${t.S(64)} NOT NULL, invited_by ${t.FK} NOT NULL, expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at ${t.TS})${t.TAIL}`);
    if (!(await hasIndex('dealer_invites', 'di_token'))) await q(my ? 'ALTER TABLE dealer_invites ADD UNIQUE KEY di_token (token_hash)' : 'CREATE UNIQUE INDEX di_token ON dealer_invites (token_hash)');
    // Devices a seller has proved with an emailed code (cookie holds the token; only its hash is stored), 90 days
    await q(`CREATE TABLE IF NOT EXISTS trusted_devices (id ${t.ID}, user_id ${t.FK} NOT NULL, token_hash ${t.S(64)} NOT NULL, label ${t.S(120)} NULL,
      expires_at DATETIME NOT NULL, created_at ${t.TS})${t.TAIL}`);
    if (!(await hasIndex('trusted_devices', 'td_user'))) await q(my ? 'ALTER TABLE trusted_devices ADD KEY td_user (user_id, token_hash)' : 'CREATE INDEX td_user ON trusted_devices (user_id, token_hash)');
    // Sign-in codes sent when a seller's sign-in looks unusual (hash only; 10 minutes, 5 tries)
    await q(`CREATE TABLE IF NOT EXISTS login_codes (id ${t.ID}, user_id ${t.FK} NOT NULL, code_hash ${t.S(64)} NOT NULL, reason ${t.S(40)} NULL,
      attempts INT NOT NULL DEFAULT 0, expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at ${t.TS})${t.TAIL}`);
  }
};
