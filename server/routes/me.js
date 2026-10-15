// Customer account data that follows the customer across devices:
// saved cars, saved searches (with email alerts) and their own requests.
const express = require('express');
const { q, one } = require('../db');
const { requireAuth, limiter } = require('../lib/security');
const searches = require('../lib/searches');

const r = express.Router();
r.use(requireAuth);

const MAX_SAVED = 50;
const MAX_SEARCHES = 10;
const CARD_COLS = 'id, slug, title, make, model, body, year, price, old_price, mileage, car_condition, location, photos, status';
const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

async function savedIds(userId) {
  return (await q('SELECT car_id FROM saved_cars WHERE user_id = ? ORDER BY created_at DESC', [userId])).map((x) => Number(x.car_id));
}
async function addSaved(userId, carIds) {
  const have = new Set(await savedIds(userId));
  const real = carIds.length ? (await q(`SELECT id FROM cars WHERE status <> 'hidden' AND id IN (${carIds.map(() => '?').join(',')})`, carIds)).map((x) => Number(x.id)) : [];
  for (const id of real) {
    if (have.size >= MAX_SAVED) break;
    if (!have.has(id)) { await q('INSERT INTO saved_cars (user_id, car_id) VALUES (?, ?)', [userId, id]); have.add(id); }
  }
}

// ---------- Saved cars ----------
r.get('/saved', async (req, res) => {
  const list = await savedIds(req.user.id);
  const cars = list.length ? await q(`SELECT ${CARD_COLS} FROM cars WHERE status <> 'hidden' AND id IN (${list.map(() => '?').join(',')})`, list) : [];
  const order = new Map(list.map((id, i) => [id, i]));
  cars.sort((a, b) => order.get(Number(a.id)) - order.get(Number(b.id)));
  res.json({ ids: cars.map((c) => Number(c.id)), cars });
});
// Merge the cars saved on this device into the account (used right after sign-in)
r.put('/saved', limiter(15, 60), async (req, res) => {
  await addSaved(req.user.id, ids(req.body && req.body.ids).slice(0, MAX_SAVED));
  res.json({ ids: await savedIds(req.user.id) });
});
r.post('/saved/:carId', limiter(15, 200), async (req, res) => {
  const [id] = ids([req.params.carId]);
  if (!id) return res.status(400).json({ error: 'Car not found' });
  const before = await savedIds(req.user.id);
  if (!before.includes(id) && before.length >= MAX_SAVED) return res.status(400).json({ error: `You can save up to ${MAX_SAVED} cars. Remove one first.` });
  await addSaved(req.user.id, [id]);
  res.json({ ids: await savedIds(req.user.id) });
});
r.delete('/saved/:carId', async (req, res) => {
  await q('DELETE FROM saved_cars WHERE user_id = ? AND car_id = ?', [req.user.id, Number(req.params.carId) || 0]);
  res.json({ ids: await savedIds(req.user.id) });
});

// ---------- Saved searches ----------
async function listSearches(userId) {
  const rows = await q('SELECT id, name, filters, alerts, last_alert_at, created_at FROM saved_searches WHERE user_id = ? ORDER BY id DESC', [userId]);
  const stock = await q("SELECT make, model, body, car_condition, price, year FROM cars WHERE status = 'available'");
  return rows.map((s) => {
    const f = searches.clean(s.filters || {});
    return { id: s.id, name: s.name, filters: f, url: searches.url(f), alerts: !!s.alerts, matches: stock.filter((c) => searches.matches(c, f)).length, created_at: s.created_at };
  });
}
r.get('/searches', async (req, res) => res.json({ searches: await listSearches(req.user.id) }));
r.post('/searches', limiter(60, 30), async (req, res) => {
  const f = searches.clean(req.body && req.body.filters);
  const mine = await listSearches(req.user.id);
  const same = mine.find((s) => JSON.stringify(s.filters) === JSON.stringify(f));
  if (same) return res.json({ searches: mine, id: same.id, existed: true });
  if (mine.length >= MAX_SEARCHES) return res.status(400).json({ error: `You can save up to ${MAX_SEARCHES} searches. Delete one in My account first.` });
  const ins = await q('INSERT INTO saved_searches (user_id, name, filters, alerts) VALUES (?, ?, ?, ?)', [req.user.id, searches.describe(f), JSON.stringify(f), req.body && req.body.alerts === false ? 0 : 1]);
  res.status(201).json({ searches: await listSearches(req.user.id), id: ins.insertId });
});
r.post('/searches/:id', async (req, res) => {
  const s = await one('SELECT id FROM saved_searches WHERE id = ? AND user_id = ?', [Number(req.params.id) || 0, req.user.id]);
  if (!s) return res.status(404).json({ error: 'Search not found' });
  await q('UPDATE saved_searches SET alerts = ? WHERE id = ?', [req.body && req.body.alerts ? 1 : 0, s.id]);
  res.json({ searches: await listSearches(req.user.id) });
});
r.delete('/searches/:id', async (req, res) => {
  await q('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', [Number(req.params.id) || 0, req.user.id]);
  res.json({ searches: await listSearches(req.user.id) });
});

// ---------- My requests (viewings, offers, Pay Small Small, messages) ----------
// Requests sent while signed in, plus earlier ones sent with the same (confirmed) email.
// Staff notes and who handles the lead stay internal.
r.get('/enquiries', async (req, res) => {
  const me = await one('SELECT email, email_verified FROM users WHERE id = ?', [req.user.id]);
  const byEmail = me && me.email_verified ? ' OR (e.user_id IS NULL AND LOWER(e.email) = ?)' : '';
  const p = [req.user.id]; if (byEmail) p.push(String(me.email).toLowerCase());
  const rows = await q(`SELECT e.id, e.type, e.status, e.offer_amount, e.preferred_date, e.bnpl_deposit, e.bnpl_months, e.bnpl_monthly, e.created_at, e.updated_at,
      c.slug AS car_slug, c.title AS car_title, c.price AS car_price, c.photos AS car_photos, c.status AS car_status
    FROM enquiries e LEFT JOIN cars c ON c.id = e.car_id WHERE e.user_id = ?${byEmail} ORDER BY e.id DESC LIMIT 100`, p);
  res.json({ enquiries: rows.map((e) => {
    let photos = e.car_photos; try { photos = typeof photos === 'string' ? JSON.parse(photos) : photos; } catch (_e) { photos = []; }
    return { id: e.id, type: e.type, status: e.status, offer_amount: e.offer_amount, preferred_date: e.preferred_date,
      plan: e.type === 'bnpl' && e.bnpl_months ? { deposit: e.bnpl_deposit, months: e.bnpl_months, monthly: e.bnpl_monthly } : null,
      created_at: e.created_at, updated_at: e.updated_at,
      car: e.car_slug ? { slug: e.car_slug, title: e.car_title, price: e.car_price, photo: (photos || [])[0] || null, status: e.car_status === 'hidden' ? 'sold' : e.car_status } : null };
  }) });
});

module.exports = r;
