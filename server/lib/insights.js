// Buyer insights: what buyers filter for (and find nothing), and WhatsApp taps per car.
// Same rules as car views (lib/views.js): no bots, no staff, no dealers counting their own cars,
// one count per visitor per day for the same search or car. Nothing personal is stored.
const crypto = require('crypto');
const { q, one } = require('../db');
const { BOT, lagosDay, lastDays } = require('./views');

// Filters a search can carry, in a fixed order so the same search always gets the same key
const FIELDS = ['make', 'model', 'body', 'condition', 'maxPrice', 'yearMin', 'yearMax', 'state', 'lga', 'verified', 'dealer', 'category'];
const PLACES = ['page', 'bar', 'card', 'quick'];

const seen = new Map();
function repeat(req, what, day) {
  const h = crypto.createHash('sha256').update(`${req.ip}|${req.get('user-agent') || ''}|${what}|${day}`).digest('base64').slice(0, 16);
  if (seen.get(h) === day) return true;
  if (seen.size > 50000) seen.clear();
  seen.set(h, day);
  return false;
}
const skip = (req) => BOT.test(req.get('user-agent') || '') || (req.user && req.user.role && req.user.role !== 'user');

// "make=Toyota|body=SUV|maxPrice=30000000"; empty when no filter was used
function searchKey(filters) {
  const f = filters && typeof filters === 'object' ? filters : {};
  return FIELDS.map((k) => [k, String(f[k] == null ? '' : f[k]).replace(/[|=\s]+/g, ' ').trim().slice(0, 40)])
    .filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('|').slice(0, 200);
}

async function bump(sql, args, insert, insertArgs) {
  const r = await q(sql, args);
  if (!r.affectedRows) { try { await q(insert, insertArgs); } catch (_e) { await q(sql, args); } }
}

async function recordSearch(req, filters, results) {
  if (skip(req)) return 'skipped';
  const key = searchKey(filters);
  if (!key) return 'empty';
  const n = Math.max(0, Math.min(100000, Math.floor(Number(results) || 0)));
  const day = lagosDay();
  if (repeat(req, 's:' + key, day)) return 'repeat';
  const zero = n === 0 ? 1 : 0;
  await bump('UPDATE search_daily SET searches = searches + 1, zero = zero + ?, last_results = ? WHERE day = ? AND query_key = ?', [zero, n, day, key],
    'INSERT INTO search_daily (day, query_key, searches, zero, last_results) VALUES (?, ?, 1, ?, ?)', [day, key, zero, n]);
  return 'counted';
}

async function recordWaTap(req, carId, place) {
  if (skip(req)) return 'skipped';
  const p = PLACES.includes(place) ? place : 'page';
  const car = await one("SELECT id, dealer_id FROM cars WHERE id = ? AND status IN ('available','reserved')", [carId]);
  if (!car) return 'missing';
  if (req.user && await one('SELECT 1 AS x FROM dealer_members WHERE dealer_id = ? AND user_id = ?', [car.dealer_id, req.user.id])) return 'own';
  const day = lagosDay();
  if (repeat(req, 'w:' + car.id, day)) return 'repeat';
  await bump('UPDATE wa_taps_daily SET taps = taps + 1 WHERE car_id = ? AND day = ? AND place = ?', [car.id, day, p],
    'INSERT INTO wa_taps_daily (car_id, day, place, taps) VALUES (?, ?, ?, 1)', [car.id, day, p]);
  return 'counted';
}

// Staff report for the last `days` days
async function report(days = 30) {
  const from = lastDays(days)[0];
  const top = await q(`SELECT query_key, SUM(searches) AS searches, SUM(zero) AS zero FROM search_daily WHERE day >= ?
    GROUP BY query_key ORDER BY searches DESC LIMIT 15`, [from]);
  const empty = await q(`SELECT query_key, SUM(zero) AS zero FROM search_daily WHERE day >= ?
    GROUP BY query_key HAVING SUM(zero) > 0 ORDER BY SUM(zero) DESC LIMIT 15`, [from]);
  const cars = await q(`SELECT c.id, c.slug, c.title, SUM(w.taps) AS taps,
      (SELECT COALESCE(SUM(v.views), 0) FROM car_views_daily v WHERE v.car_id = c.id AND v.day >= ?) AS views
    FROM wa_taps_daily w JOIN cars c ON c.id = w.car_id WHERE w.day >= ? GROUP BY c.id, c.slug, c.title ORDER BY SUM(w.taps) DESC LIMIT 15`, [from, from]);
  const places = await q('SELECT place, SUM(taps) AS taps FROM wa_taps_daily WHERE day >= ? GROUP BY place', [from]);
  const taps = (await one('SELECT COALESCE(SUM(taps), 0) AS n FROM wa_taps_daily WHERE day >= ?', [from])).n;
  const views = (await one('SELECT COALESCE(SUM(views), 0) AS n FROM car_views_daily WHERE day >= ?', [from])).n;
  const num = (x) => Number(x) || 0;
  return {
    days, from,
    searches: top.map((r) => ({ key: r.query_key, searches: num(r.searches), zero: num(r.zero) })),
    noResults: empty.map((r) => ({ key: r.query_key, zero: num(r.zero) })),
    whatsapp: { taps: num(taps), carViews: num(views), per100Views: num(views) ? Math.round((num(taps) / num(views)) * 1000) / 10 : null,
      byPlace: Object.fromEntries(places.map((r) => [r.place, num(r.taps)])),
      cars: cars.map((r) => ({ id: r.id, slug: r.slug, title: r.title, taps: num(r.taps), views: num(r.views) })) }
  };
}

module.exports = { recordSearch, recordWaTap, report, searchKey, FIELDS, PLACES };
