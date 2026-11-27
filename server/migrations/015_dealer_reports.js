// Monthly seller reports (Nov 2026): on the 1st of each month every approved seller gets an email with last month's
// car views, WhatsApp taps and buyer requests, and the link to share their page.
// dealers.report_emails: the seller's on/off switch (on by default; off from My seller page).
// dealer_reports: one row per seller and month, written before the email goes out, so a report is never sent twice.
module.exports = {
  about: 'monthly seller reports: dealers.report_emails switch and dealer_reports (one per seller and month)',
  async up({ q, t, hasColumn }) {
    if (!(await hasColumn('dealers', 'report_emails'))) await q('ALTER TABLE dealers ADD COLUMN report_emails TINYINT NOT NULL DEFAULT 1');
    await q(`CREATE TABLE IF NOT EXISTS dealer_reports (dealer_id ${t.FK} NOT NULL, month ${t.S(7)} NOT NULL, sent_at DATETIME NOT NULL,
      PRIMARY KEY (dealer_id, month))${t.TAIL}`);
  }
};
