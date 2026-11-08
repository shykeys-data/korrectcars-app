// "Cars to check" and "Reported listings" (mounted at /api/admin/listings). Every staff role may use these.
// Cars to check: cars from private sellers (not verified) wait here until a staff member looks at them.
// Reported listings: buyers' reports from "Report this listing"; staff hide the car in one click or dismiss the report.
const express = require('express');
const { q, one } = require('../db');
const { audit, requireStaff } = require('../lib/security');
const mail = require('../lib/mail');
const seo = require('../lib/seo');

const r = express.Router();
const isId = (s) => /^\d{1,10}$/.test(String(s));
const sqlTime = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const REASONS = require('../lib/reports').REASONS;
const owner = (dealerId) => one("SELECT u.name, u.email FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = ? AND m.role = 'owner' LIMIT 1", [dealerId]);

r.get('/checks', async (_req, res) => {
  const cars = await q(`SELECT c.id, c.slug, c.title, c.price, c.year, c.mileage, c.vin, c.photos, c.created_at, d.id AS dealer_id, d.business_name AS seller, d.state, d.lga, d.whatsapp
    FROM cars c JOIN dealers d ON d.id = c.dealer_id
    WHERE c.status = 'pending' AND c.reviewed_at IS NULL AND d.kind = 'personal' AND d.status NOT IN ('approved', 'rejected', 'suspended')
    ORDER BY c.id LIMIT 200`);
  for (const c of cars) {
    c.photos = typeof c.photos === 'string' ? JSON.parse(c.photos || '[]') : (c.photos || []);
    c.sellerCars = Number((await one('SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ?', [c.dealer_id])).n);
  }
  res.json({ cars });
});

// approve: the car goes live (and stays checked while the seller only edits words); reject: it stays off the site
r.post('/checks/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const decision = String(req.body.decision || '');
  const note = String(req.body.note || '').trim().slice(0, 400);
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
  if (decision === 'reject' && note.length < 5) return res.status(400).json({ error: 'Write a short note for the seller saying why.', field: 'note' });
  const car = await one(`SELECT c.*, d.kind, d.status AS dealer_status FROM cars c JOIN dealers d ON d.id = c.dealer_id WHERE c.id = ?`, [req.params.id]);
  if (!car || car.kind !== 'personal') return res.status(404).json({ error: 'Not found' });
  if (car.status !== 'pending') return res.status(409).json({ error: 'This car is no longer waiting.' });
  const now = sqlTime();
  if (decision === 'approve') {
    await q("UPDATE cars SET status = 'available', reviewed_at = ?, reviewed_by = ? WHERE id = ?", [now, req.user.id, car.id]);
    seo.notify(seo.carPaths(car));
    require('../lib/searches').notifyNewCar({ ...car, status: 'available' });
  } else {
    await q("UPDATE cars SET status = 'hidden', reviewed_at = NULL, reviewed_by = ? WHERE id = ?", [req.user.id, car.id]);
  }
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'car_check', ?, ?, ?)", [car.dealer_id, decision, req.user.id, `${car.title}${note ? ': ' + note : ''}`]);
  await audit(req, `Private seller car ${decision === 'approve' ? 'approved' : 'rejected'}`, `${car.title}${note ? ': ' + note : ''}`);
  const o = await owner(car.dealer_id);
  if (o) mail.send({ to: o.email, ...mail.templates.carCheckDecision(o.name.split(' ')[0], car.title, decision === 'approve', note) }).catch((e) => console.error('Car check email failed:', e.message));
  res.json({ ok: true, status: decision === 'approve' ? 'available' : 'hidden' });
});

r.get('/reports', async (req, res) => {
  const open = req.query.all ? '' : "WHERE x.status = 'open'";
  const reports = await q(`SELECT x.id, x.car_id, x.reason, x.details, x.status, x.created_at, x.handled_at, c.slug, c.title, c.status AS car_status,
      d.business_name AS seller, d.kind, d.status AS seller_status, u.name AS reporter, u.email AS reporter_email,
      (SELECT COUNT(*) FROM listing_reports y WHERE y.car_id = x.car_id) AS times
    FROM listing_reports x JOIN cars c ON c.id = x.car_id LEFT JOIN dealers d ON d.id = c.dealer_id LEFT JOIN users u ON u.id = x.user_id
    ${open} ORDER BY x.id DESC LIMIT 300`);
  for (const x of reports) x.reasonText = REASONS[x.reason] || x.reason;
  res.json({ reports, open: Number((await one("SELECT COUNT(*) AS n FROM listing_reports WHERE status = 'open'")).n) });
});

// hide: the car leaves the site at once (every open report on it is closed); dismiss: the report is closed, the car stays
r.post('/reports/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const action = String(req.body.action || '');
  if (!['hide', 'dismiss'].includes(action)) return res.status(400).json({ error: 'Choose hide or dismiss.' });
  const rep = await one('SELECT x.*, c.title, c.slug, c.make, c.model, c.status AS car_status FROM listing_reports x JOIN cars c ON c.id = x.car_id WHERE x.id = ?', [req.params.id]);
  if (!rep) return res.status(404).json({ error: 'Not found' });
  const now = sqlTime();
  if (action === 'hide') {
    if (rep.car_status !== 'sold') await q("UPDATE cars SET status = 'hidden' WHERE id = ?", [rep.car_id]);
    await q("UPDATE listing_reports SET status = 'hidden', handled_by = ?, handled_at = ? WHERE car_id = ? AND status = 'open'", [req.user.id, now, rep.car_id]);
    seo.notify(seo.carPaths(rep));
  } else {
    await q("UPDATE listing_reports SET status = 'dismissed', handled_by = ?, handled_at = ? WHERE id = ?", [req.user.id, now, rep.id]);
  }
  await audit(req, action === 'hide' ? 'Reported car hidden' : 'Report dismissed', `${rep.title} (${REASONS[rep.reason] || rep.reason})`);
  res.json({ ok: true });
});

// ---------- Boost plans: every order, and staff can grant a plan (e.g. paid by bank transfer, or a promotion) ----------
const boosts = require('../lib/boosts');
r.get('/boosts', requireStaff('admin', 'sales'), async (_req, res) => {
  const orders = await q(`SELECT o.*, d.business_name AS seller, d.kind FROM boost_orders o JOIN dealers d ON d.id = o.dealer_id ORDER BY o.id DESC LIMIT 300`);
  const sellers = await q("SELECT id, business_name, kind FROM dealers WHERE id <> 1 AND status IN ('approved','unverified','pending_review') ORDER BY business_name LIMIT 1000");
  res.json({ orders, sellers, plans: boosts.priceList(), payOnline: boosts.paystackOn() });
});
r.post('/boosts/grant', requireStaff('admin', 'sales'), async (req, res) => {
  const b = req.body || {};
  if (!isId(b.dealerId) || Number(b.dealerId) === 1) return res.status(400).json({ error: 'Choose a seller.' });
  const qt = boosts.quote(String(b.plan || ''), Number(b.days));
  if (!qt) return res.status(400).json({ error: 'Choose a plan and how many days.' });
  const note = String(b.note || '').trim().slice(0, 200);
  if (note.length < 3) return res.status(400).json({ error: 'Write why (e.g. "paid by bank transfer, ref 1234").', field: 'note' });
  const d = await one('SELECT id, business_name FROM dealers WHERE id = ?', [b.dealerId]);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const reference = boosts.newReference().replace('KCB-', 'KCG-');
  const ins = await q("INSERT INTO boost_orders (dealer_id, user_id, plan, days, amount, vat, total, reference, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [d.id, req.user.id, qt.plan, qt.days, qt.amount, qt.vat, qt.total, reference, note]);
  await boosts.activate({ id: ins.insertId, dealer_id: d.id, plan: qt.plan, days: qt.days }, 'granted');
  await audit(req, 'Boost plan granted', `${d.business_name}: ${qt.name}, ${qt.days} days (${note})`);
  res.status(201).json({ ok: true });
});

module.exports = r;
