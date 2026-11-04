// Dealer sign-up (Nov 2026): email codes sent before any account exists, phone codes, the dealer's
// CAC certificate and other papers (files live in the private folder outside the app; only staff open them).
module.exports = {
  about: 'signup_codes, phone_otps, dealer_documents; users.phone_verified_at',
  async up({ q, my, t, hasColumn }) {
    await q(`CREATE TABLE IF NOT EXISTS signup_codes (id ${t.ID}, email_hash ${t.S(64)} NOT NULL, code_hash ${t.S(64)} NOT NULL,
      purpose ${t.S(12)} NOT NULL, attempts INT NOT NULL DEFAULT 0, expires_at DATETIME NOT NULL, used_at DATETIME NULL, ip ${t.S(60)} NULL,
      created_at ${t.TS}${my ? ', KEY sc_email (email_hash)' : ''})${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS phone_otps (id ${t.ID}, user_id ${t.FK} NOT NULL, phone_e164 ${t.S(16)} NOT NULL, code_hash ${t.S(64)} NOT NULL,
      attempts INT NOT NULL DEFAULT 0, expires_at DATETIME NOT NULL, verified_at DATETIME NULL, ip ${t.S(60)} NULL, created_at ${t.TS}
      ${my ? ', KEY po_user (user_id), KEY po_phone (phone_e164)' : ''})${t.TAIL}`);
    await q(`CREATE TABLE IF NOT EXISTS dealer_documents (id ${t.ID}, dealer_id ${t.FK} NOT NULL, kind ${t.S(20)} NOT NULL, file_key ${t.S(80)} NOT NULL,
      sha256 ${t.S(64)} NOT NULL, uploaded_by ${t.FK} NULL, reviewed_by ${t.FK} NULL, reviewed_at DATETIME NULL, delete_after DATETIME NULL,
      created_at ${t.TS}${my ? ', KEY dd_dealer (dealer_id)' : ''})${t.TAIL}`);
    if (!my) {
      await q('CREATE INDEX IF NOT EXISTS sc_email ON signup_codes (email_hash)');
      await q('CREATE INDEX IF NOT EXISTS po_user ON phone_otps (user_id)');
      await q('CREATE INDEX IF NOT EXISTS po_phone ON phone_otps (phone_e164)');
      await q('CREATE INDEX IF NOT EXISTS dd_dealer ON dealer_documents (dealer_id)');
    }
    if (!(await hasColumn('users', 'phone_verified_at'))) await q('ALTER TABLE users ADD COLUMN phone_verified_at DATETIME NULL');
  }
};
