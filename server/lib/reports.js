// "Report this listing" (Nov 2026): what a buyer can report, and saving a report.
const { q, one } = require('../db');
const config = require('../config');
const mail = require('./mail');

const REASONS = {
  scam: 'Looks like a scam / asked for payment before viewing',
  sold: 'Car already sold',
  wrong: 'Wrong details or photos',
  unreachable: 'Seller cannot be reached',
  other: 'Something else'
};

// One report per car per connection per day; staff hear about the first report of a car by email
async function report({ carId, reason, details, userId, ip }) {
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const dupe = await one('SELECT id FROM listing_reports WHERE car_id = ? AND ip = ? AND created_at > ?', [carId, ip, day]);
  if (dupe) return { duplicate: true };
  await q('INSERT INTO listing_reports (car_id, reason, details, user_id, ip) VALUES (?, ?, ?, ?, ?)', [carId, reason, details || null, userId || null, ip]);
  const open = Number((await one("SELECT COUNT(*) AS n FROM listing_reports WHERE car_id = ? AND status = 'open'", [carId])).n);
  if (open === 1) {
    const car = await one('SELECT title FROM cars WHERE id = ?', [carId]);
    mail.send({ to: config.email, ...mail.templates.staffReport(car ? car.title : `car ${carId}`, REASONS[reason]) }).catch((e) => console.error('Report email failed:', e.message));
  }
  return { ok: true };
}

module.exports = { REASONS, report };
