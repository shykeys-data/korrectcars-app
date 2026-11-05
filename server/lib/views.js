// Counting car page views (Nov 2026). The car page tells the server once per visitor per car per day
// (POST /api/cars/:id/view, sent by the page itself however the visitor arrived: Google, WhatsApp, the site).
// Not counted: search-engine and preview bots, staff, and the dealer's own team looking at their cars.
// The browser remembers what it already counted today; the server also ignores repeats from the same
// address and browser for a day (kept in memory, nothing personal is stored).
const crypto = require('crypto');
const { q, one } = require('../db');

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|pagespeed|headless|curl|wget|python|node-fetch|axios|monitor|uptime/i;
const lagosDay = (ms = Date.now()) => new Date(ms + 3600 * 1000).toISOString().slice(0, 10); // Lagos is UTC+1 all year
const seen = new Map(); // hash -> day
function repeat(req, carId, day) {
  const h = crypto.createHash('sha256').update(`${req.ip}|${req.get('user-agent') || ''}|${carId}|${day}`).digest('base64').slice(0, 16);
  if (seen.get(h) === day) return true;
  if (seen.size > 50000) seen.clear();
  seen.set(h, day);
  return false;
}

async function count(req, carId) {
  if (BOT.test(req.get('user-agent') || '')) return 'bot';
  if (req.user && req.user.role && req.user.role !== 'user') return 'staff';
  const car = await one("SELECT id, dealer_id FROM cars WHERE id = ? AND status IN ('available','reserved','sold')", [carId]);
  if (!car) return 'missing';
  if (req.user && await one('SELECT 1 AS x FROM dealer_members WHERE dealer_id = ? AND user_id = ?', [car.dealer_id, req.user.id])) return 'own';
  const day = lagosDay();
  if (repeat(req, car.id, day)) return 'repeat';
  await q('UPDATE cars SET views = views + 1 WHERE id = ?', [car.id]);
  const r = await q('UPDATE car_views_daily SET views = views + 1 WHERE car_id = ? AND day = ?', [car.id, day]);
  if (!r.affectedRows) {
    try { await q('INSERT INTO car_views_daily (car_id, day, views) VALUES (?, ?, 1)', [car.id, day]); } catch (_e) { await q('UPDATE car_views_daily SET views = views + 1 WHERE car_id = ? AND day = ?', [car.id, day]); }
  }
  return 'counted';
}

// The days from `days` ago to today, oldest first
function lastDays(days) { const out = []; for (let i = days - 1; i >= 0; i--) out.push(lagosDay(Date.now() - i * 86400000)); return out; }

module.exports = { count, lagosDay, lastDays, BOT };
