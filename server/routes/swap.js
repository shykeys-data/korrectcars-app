const express = require('express');
const { q, one, J } = require('../db');
const { validate, list } = require('../lib/validate');
const { requireAuth, limiter, maskContacts } = require('../lib/security');
const { memory, save } = require('../lib/uploads');

const r = express.Router();
const isId = (s) => /^\d{1,10}$/.test(String(s));
const LISTING_COLS = 'l.id, l.make, l.model, l.body, l.year, l.mileage, l.value, l.location, l.car_condition, l.color, l.transmission, l.description, l.photos, l.wants_makes, l.wants_bodies, l.max_top_up, l.wants_notes, l.status, l.created_at';
const shortName = (n) => { const p = String(n || '').split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
const withOwner = (l) => ({ ...l, owner: { name: shortName(l.owner_name), verified: !!l.owner_verified } });

// Public: live swap listings. The owner's phone and email are never exposed here.
r.get('/listings', async (req, res) => {
  const where = ["l.status = 'live'"]; const p = [];
  for (const f of ['make', 'model', 'body']) if (req.query[f]) { where.push(`l.${f} = ?`); p.push(String(req.query[f])); }
  const rows = await q(`SELECT ${LISTING_COLS}, u.name AS owner_name, u.verified AS owner_verified FROM swap_listings l JOIN users u ON u.id = l.owner_id
    WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 100`, p);
  res.json({ listings: rows.map(withOwner) });
});

r.get('/listings/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const l = await one(`SELECT ${LISTING_COLS}, u.name AS owner_name, u.verified AS owner_verified FROM swap_listings l JOIN users u ON u.id = l.owner_id WHERE l.id = ? AND l.status = 'live'`, [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Not found' });
  res.json({ listing: withOwner(l) });
});

// Owner: create a listing (it goes to staff review before it is visible)
r.post('/listings', requireAuth, limiter(60, 5, 'You have submitted several cars. Please wait an hour.'),
  memory.fields([{ name: 'photos', maxCount: 10 }, { name: 'papers', maxCount: 3 }]), validate('swapListing'), async (req, res) => {
    const photos = (req.files && req.files.photos) || [];
    const papers = (req.files && req.files.papers) || [];
    if (photos.length < 3) return res.status(400).json({ error: 'Please add at least 3 clear photos of the car.' });
    if (!papers.length) return res.status(400).json({ error: 'Please upload the car papers (customs, receipt or proof of ownership).' });
    const v = req.valid;
    const photoUrls = photos.map((f) => save(f, { folder: 'swap' }));
    const paperFiles = papers.map((f) => save(f, { privateFile: true, allowPdf: true }));
    const ins = await q(`INSERT INTO swap_listings (owner_id, make, model, body, year, mileage, value, location, car_condition, color, transmission, description,
      photos, papers, wants_makes, wants_bodies, max_top_up, wants_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, v.make, v.model, v.body, v.year, v.mileage, v.value, v.location, v.condition, v.color, v.transmission, v.description,
      J(photoUrls), J(paperFiles), J(list(v.wantsMakes)), J(list(v.wantsBodies)), v.maxTopUp || null, v.wantsNotes]);
    res.status(201).json({ listing: { id: ins.insertId, status: 'pending' } });
  });

r.get('/mine', requireAuth, async (req, res) => {
  const me = req.user.id;
  const listings = await q(`SELECT ${LISTING_COLS}, l.reject_reason FROM swap_listings l WHERE l.owner_id = ? ORDER BY l.created_at DESC`, [me]);
  const offers = await q(`SELECT o.*, uf.name AS from_name, uf.verified AS from_verified, uf.phone AS from_phone, uf.email AS from_email,
      ut.name AS to_name, ut.verified AS to_verified, ut.phone AS to_phone, ut.email AS to_email,
      t.year AS t_year, t.make AS t_make, t.model AS t_model, t.value AS t_value, t.photos AS t_photos, t.location AS t_location,
      f.year AS f_year, f.make AS f_make, f.model AS f_model, f.value AS f_value, f.photos AS f_photos, f.location AS f_location
    FROM offers o JOIN users uf ON uf.id = o.from_user JOIN users ut ON ut.id = o.to_user
    JOIN swap_listings t ON t.id = o.listing_id JOIN swap_listings f ON f.id = o.from_listing_id
    WHERE o.from_user = ? OR o.to_user = ? ORDER BY o.updated_at DESC`, [me, me]);
  res.json({
    listings,
    offers: offers.map((o) => {
      const mine = o.from_user === me;
      const shared = ['accepted', 'inspection', 'completed'].includes(o.status);
      const parse = (s) => { try { return JSON.parse(s); } catch (_e) { return []; } };
      return {
        id: o.id, status: o.status, mine, top_up: o.top_up, top_up_payer: o.top_up_payer, fee: o.fee, fee_status: o.fee_status,
        inspection: o.inspection_place ? { place: o.inspection_place, time: o.inspection_time } : null, updated_at: o.updated_at,
        target: { year: o.t_year, make: o.t_make, model: o.t_model, value: o.t_value, photos: parse(o.t_photos), location: o.t_location },
        offered: { year: o.f_year, make: o.f_make, model: o.f_model, value: o.f_value, photos: parse(o.f_photos), location: o.f_location },
        from: { name: shortName(o.from_name), verified: !!o.from_verified }, to: { name: shortName(o.to_name), verified: !!o.to_verified },
        contact: shared ? (mine ? { name: o.to_name, phone: o.to_phone, email: o.to_email } : { name: o.from_name, phone: o.from_phone, email: o.from_email }) : null
      };
    })
  });
});

r.post('/listings/:id/withdraw', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const r2 = await q("UPDATE swap_listings SET status = 'withdrawn' WHERE id = ? AND owner_id = ? AND status IN ('pending','live')", [req.params.id, req.user.id]);
  if (!r2.affectedRows) return res.status(404).json({ error: 'Listing not found' });
  res.json({ ok: true });
});

// ---------- Offers ----------
r.post('/offers', requireAuth, limiter(60, 10, 'Too many offers. Please wait an hour.'), validate('offer'), async (req, res) => {
  const v = req.valid;
  const target = await one("SELECT id, owner_id, value FROM swap_listings WHERE id = ? AND status = 'live'", [v.listing]);
  const mine = await one("SELECT id, value FROM swap_listings WHERE id = ? AND owner_id = ? AND status = 'live'", [v.fromListing, req.user.id]);
  if (!target) return res.status(400).json({ error: 'That car is no longer available for swap.' });
  if (!mine) return res.status(400).json({ error: 'Your own car must be approved and live before you can make offers.' });
  if (target.owner_id === req.user.id) return res.status(400).json({ error: 'You cannot make an offer on your own car.' });
  if (await one("SELECT id FROM offers WHERE listing_id = ? AND from_listing_id = ? AND status IN ('pending','accepted','inspection')", [target.id, mine.id])) {
    return res.status(409).json({ error: 'You already have an open offer on this car.' });
  }
  const fee = Math.round(Math.max(Number(target.value) || 0, Number(mine.value) || 0) * require('../lib/settings').current().swapFeePct / 100); // % set in admin Settings
  const ins = await q('INSERT INTO offers (listing_id, from_listing_id, from_user, to_user, top_up, top_up_payer, fee) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [target.id, mine.id, req.user.id, target.owner_id, v.topUp, v.topUp ? v.topUpPayer : 'none', fee]);
  if (v.message) { const m = maskContacts(v.message); await q('INSERT INTO messages (offer_id, sender_id, text, masked) VALUES (?, ?, ?, ?)', [ins.insertId, req.user.id, m.text, m.masked]); }
  res.status(201).json({ offer: { id: ins.insertId } });
});

async function offerFor(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  const o = await one('SELECT * FROM offers WHERE id = ? AND (from_user = ? OR to_user = ?)', [req.params.id, req.user.id, req.user.id]);
  if (!o) { res.status(404).json({ error: 'Not found' }); return null; }
  return o;
}

r.post('/offers/:id/respond', requireAuth, async (req, res) => {
  const o = await offerFor(req, res); if (!o) return;
  const action = String(req.body.action);
  const isTo = o.to_user === req.user.id;
  let status;
  if (action === 'accept' && isTo && o.status === 'pending') status = 'accepted';
  else if (action === 'decline' && isTo && o.status === 'pending') status = 'declined';
  else if (action === 'withdraw' && !isTo && ['pending', 'accepted'].includes(o.status)) status = 'withdrawn';
  else return res.status(400).json({ error: 'That action is not possible now.' });
  await q('UPDATE offers SET status = ? WHERE id = ?', [status, o.id]);
  res.json({ ok: true, status });
});

r.get('/offers/:id/messages', requireAuth, async (req, res) => {
  const o = await offerFor(req, res); if (!o) return;
  const rows = await q('SELECT m.id, m.text, m.masked, m.created_at, m.sender_id, u.name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.offer_id = ? ORDER BY m.id ASC LIMIT 500', [o.id]);
  res.json({ messages: rows.map((m) => ({ id: m.id, text: m.text, masked: !!m.masked, created_at: m.created_at, me: m.sender_id === req.user.id, name: shortName(m.name) })) });
});

r.post('/offers/:id/messages', requireAuth, limiter(60, 60, 'You are sending messages too fast.'), validate('message'), async (req, res) => {
  const o = await offerFor(req, res); if (!o) return;
  if (['declined', 'withdrawn', 'cancelled'].includes(o.status)) return res.status(400).json({ error: 'This offer is closed.' });
  const shared = ['accepted', 'inspection', 'completed'].includes(o.status);
  const m = shared ? { text: req.valid.text, masked: false } : maskContacts(req.valid.text);
  const ins = await q('INSERT INTO messages (offer_id, sender_id, text, masked) VALUES (?, ?, ?, ?)', [o.id, req.user.id, m.text, m.masked]);
  await q('UPDATE offers SET updated_at = NOW() WHERE id = ?', [o.id]);
  res.status(201).json({ message: { id: ins.insertId, text: m.text, masked: m.masked, me: true, name: shortName(req.user.name) }, masked: m.masked });
});

r.post('/messages/:id/report', requireAuth, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const m = await one(`SELECT m.id FROM messages m JOIN offers o ON o.id = m.offer_id WHERE m.id = ? AND (o.from_user = ? OR o.to_user = ?)`, [req.params.id, req.user.id, req.user.id]);
  if (!m) return res.status(404).json({ error: 'Not found' });
  await q('UPDATE messages SET reported = 1 WHERE id = ?', [m.id]);
  res.json({ ok: true });
});

module.exports = r;
