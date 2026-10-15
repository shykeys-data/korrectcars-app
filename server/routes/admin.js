const express = require('express');
const fs = require('fs');
const path = require('path');
const { q, one, J } = require('../db');
const { validate, list } = require('../lib/validate');
const { requireStaff, audit } = require('../lib/security');
const settings = require('../lib/settings');
const totp = require('../lib/totp');
const seo = require('../lib/seo');
const searches = require('../lib/searches');
const { memory, save, PRIVATE_DIR } = require('../lib/uploads');

const r = express.Router();
const MAX_ADMINS = 3;
// Who can do what: admin = Administrator (everything, up to 3 people); sales = leads, swaps, edit cars; editor = cars and blog
const adminOnly = requireStaff('admin');
const salesTeam = requireStaff('admin', 'sales');
const carTeam = requireStaff('admin', 'sales', 'editor');
const contentTeam = requireStaff('admin', 'editor');
const isId = (s) => /^\d{1,10}$/.test(String(s));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

r.use(requireStaff('admin', 'sales', 'editor'));

r.get('/stats', async (req, res) => {
  const c = async (sql, p) => Number((await one(sql, p)).n) || 0;
  res.json({
    carsAvail: await c("SELECT COUNT(*) AS n FROM cars WHERE status = 'available'"),
    carsSold: await c("SELECT COUNT(*) AS n FROM cars WHERE status = 'sold'"),
    pendingListings: await c("SELECT COUNT(*) AS n FROM swap_listings WHERE status = 'pending'"),
    liveListings: await c("SELECT COUNT(*) AS n FROM swap_listings WHERE status = 'live'"),
    openOffers: await c("SELECT COUNT(*) AS n FROM offers WHERE status IN ('pending','accepted','inspection')"),
    newEnquiries: await c("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'"),
    users: await c('SELECT COUNT(*) AS n FROM users'),
    feeDue: await c("SELECT COALESCE(SUM(fee),0) AS n FROM offers WHERE fee_status = 'due'"),
    feePaid: await c("SELECT COALESCE(SUM(fee),0) AS n FROM offers WHERE fee_status = 'paid'"),
    reported: await c('SELECT COUNT(*) AS n FROM messages WHERE reported = 1'),
    newPss: await c("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new' AND type = 'bnpl'"),
    role: req.user.role
  });
});

// ---------- Dealer inventory ----------
r.get('/cars', carTeam, async (_req, res) => res.json({ cars: await q('SELECT * FROM cars ORDER BY created_at DESC, id DESC') }));

const rowsFromText = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });

function carValues(v) {
  return {
    title: v.title, make: v.make, model: v.model, body: v.body, trim_level: v.trim || null, year: v.year || null, price: v.price,
    old_price: v.oldPrice || null, mileage: v.mileage || null, engine: v.engine || null, transmission: v.transmission || null,
    drivetrain: v.drivetrain || null, fuel: v.fuel || null, color: v.color || null, interior: v.interior || null,
    car_condition: v.condition || null, location: v.location || 'Lagos', vin: v.vin || null, stock: v.stock || null,
    description: v.description || null, features: J(list(String(v.features || '').includes('\n') ? String(v.features).split('\n') : v.features)),
    specs: J(rowsFromText(v.specsText)), info: J(String(v.infoText || '').split('\n').map((s) => s.trim()).filter(Boolean)),
    status: v.status || 'available', featured: v.featured === true || v.featured === 'true' ? 1 : 0
  };
}

r.post('/cars', carTeam, memory.array('photos', 15), validate('car'), async (req, res) => {
  const v = carValues(req.valid);
  let slug = slugify(`${req.valid.title}`);
  if (await one('SELECT id FROM cars WHERE slug = ?', [slug])) slug += '-' + Date.now().toString(36);
  const photos = (req.files || []).map((f) => save(f, { folder: 'cars' }));
  const cols = Object.keys(v);
  const ins = await q(`INSERT INTO cars (slug, photos, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`, [slug, J(photos), ...cols.map((c) => v[c])]);
  await audit(req, 'Added car', v.title);
  const added = await one('SELECT * FROM cars WHERE id = ?', [ins.insertId]);
  seo.notify(seo.carPaths(added)); // tell Bing & co. straight away (does not slow the save)
  searches.notifyNewCar(added); // email customers whose saved search fits (in the background)
  res.status(201).json({ car: added });
});

r.put('/cars/:id', carTeam, memory.array('photos', 15), validate('car'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const car = await one('SELECT id, photos, status FROM cars WHERE id = ?', [req.params.id]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  const v = carValues(req.valid);
  const current = car.photos || [];
  const keep = req.valid.keepPhotos !== undefined ? list(req.valid.keepPhotos).filter((p) => current.includes(p)) : current;
  const added = (req.files || []).map((f) => save(f, { folder: 'cars' }));
  const cols = Object.keys(v);
  await q(`UPDATE cars SET ${cols.map((c) => `${c} = ?`).join(', ')}, photos = ? WHERE id = ?`, [...cols.map((c) => v[c]), J([...keep, ...added]), car.id]);
  await audit(req, 'Edited car', v.title);
  const saved = await one('SELECT * FROM cars WHERE id = ?', [car.id]);
  seo.notify(seo.carPaths(saved));
  if (car.status !== 'available' && saved.status === 'available') searches.notifyNewCar(saved); // e.g. a hidden car goes on sale
  res.json({ car: saved });
});

r.delete('/cars/:id', adminOnly, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const car = await one('SELECT title, slug, make, model FROM cars WHERE id = ?', [req.params.id]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  await q('DELETE FROM cars WHERE id = ?', [req.params.id]);
  await q('DELETE FROM saved_cars WHERE car_id = ?', [req.params.id]);
  seo.notify(seo.carPaths(car));
  await audit(req, 'Deleted car', car.title);
  res.json({ ok: true });
});

// ---------- Leads (enquiries, viewings, offers, Pay Small Small applications) ----------
const LEAD_STATUSES = ['new', 'contacted', 'viewing', 'sent_to_bank', 'won', 'lost', 'closed'];
r.get('/enquiries', salesTeam, async (req, res) => {
  const where = []; const p = [];
  if (['viewing', 'offer', 'bnpl', 'contact'].includes(req.query.type)) { where.push('e.type = ?'); p.push(req.query.type); }
  if (LEAD_STATUSES.includes(req.query.status)) { where.push('e.status = ?'); p.push(req.query.status); }
  res.json({ statuses: LEAD_STATUSES, enquiries: await q(`SELECT e.*, c.title AS car_title, c.slug AS car_slug, c.price AS car_price, u.name AS assigned_name
    FROM enquiries e LEFT JOIN cars c ON c.id = e.car_id LEFT JOIN users u ON u.id = e.assigned_to ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 500`, p) });
});
async function updateLead(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Bad request' });
  const e = await one('SELECT id, name, type FROM enquiries WHERE id = ?', [req.params.id]);
  if (!e) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {}; const sets = []; const p = [];
  if (b.status !== undefined) { if (!LEAD_STATUSES.includes(String(b.status))) return res.status(400).json({ error: 'Unknown status' }); sets.push('status = ?'); p.push(String(b.status)); }
  if (b.notes !== undefined) { sets.push('notes = ?'); p.push(String(b.notes).slice(0, 2000)); }
  if (b.assignToMe) { sets.push('assigned_to = ?'); p.push(req.user.id); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
  await q(`UPDATE enquiries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, [...p, e.id]);
  await audit(req, `Updated lead #${e.id}`, `${e.name} (${e.type}) ${b.status ? '→ ' + b.status : ''}${b.notes !== undefined ? ' notes' : ''}`);
  res.json({ ok: true });
}
r.post('/enquiries/:id', salesTeam, updateLead);
r.post('/enquiries/:id/status', salesTeam, updateLead);

// ---------- Swap listings ----------
r.get('/listings', salesTeam, async (req, res) => {
  const st = ['pending', 'live', 'rejected', 'swapped', 'withdrawn'].includes(req.query.status) ? req.query.status : null;
  res.json({ listings: await q(`SELECT l.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone, u.verified AS owner_verified
    FROM swap_listings l JOIN users u ON u.id = l.owner_id ${st ? 'WHERE l.status = ?' : ''} ORDER BY l.id DESC LIMIT 300`, st ? [st] : []) });
});
r.post('/listings/:id/status', salesTeam, async (req, res) => {
  const status = String(req.body.status);
  if (!isId(req.params.id) || !['pending', 'live', 'rejected', 'swapped', 'withdrawn'].includes(status)) return res.status(400).json({ error: 'Bad request' });
  const l = await one('SELECT id, year, make, model FROM swap_listings WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'Not found' });
  await q('UPDATE swap_listings SET status = ?, reject_reason = ? WHERE id = ?', [status, status === 'rejected' ? String(req.body.reason || '').slice(0, 300) : null, l.id]);
  await audit(req, `Set swap listing to ${status}`, `${l.year} ${l.make} ${l.model}`);
  res.json({ ok: true });
});

// Private documents (car papers): staff only, never cached, every view logged
r.get('/files/:name', salesTeam, async (req, res) => {
  const name = path.basename(String(req.params.name));
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.test(name)) return res.status(404).end();
  const file = path.join(PRIVATE_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).end();
  await audit(req, 'Viewed private document', name);
  res.set('Cache-Control', 'no-store');
  res.sendFile(file);
});

// ---------- Swaps and success fees ----------
r.get('/offers', salesTeam, async (_req, res) => {
  res.json({ offers: await q(`SELECT o.*, uf.name AS from_name, uf.phone AS from_phone, ut.name AS to_name, ut.phone AS to_phone,
      CONCAT_WS(' ', t.year, t.make, t.model) AS target_car, CONCAT_WS(' ', f.year, f.make, f.model) AS offered_car
    FROM offers o JOIN users uf ON uf.id = o.from_user JOIN users ut ON ut.id = o.to_user
    JOIN swap_listings t ON t.id = o.listing_id JOIN swap_listings f ON f.id = o.from_listing_id ORDER BY o.updated_at DESC LIMIT 300`) });
});
r.post('/offers/:id', salesTeam, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const o = await one('SELECT * FROM offers WHERE id = ?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const { action, place, time } = req.body;
  if (action === 'inspection') {
    if (!['accepted', 'inspection'].includes(o.status)) return res.status(400).json({ error: 'Both owners must accept first.' });
    await q("UPDATE offers SET status = 'inspection', inspection_place = ?, inspection_time = ? WHERE id = ?", [String(place || '').slice(0, 120), String(time || '').slice(0, 60), o.id]);
  } else if (action === 'complete') {
    if (o.status !== 'inspection') return res.status(400).json({ error: 'Book and pass the inspection first.' });
    await q("UPDATE offers SET status = 'completed', fee_status = 'due' WHERE id = ?", [o.id]);
    await q("UPDATE swap_listings SET status = 'swapped' WHERE id IN (?, ?)", [o.listing_id, o.from_listing_id]);
  } else if (action === 'feePaid') {
    if (o.fee_status !== 'due') return res.status(400).json({ error: 'No fee is due on this swap.' });
    await q("UPDATE offers SET fee_status = 'paid' WHERE id = ?", [o.id]);
  } else if (action === 'cancel') {
    await q("UPDATE offers SET status = 'cancelled' WHERE id = ?", [o.id]);
  } else return res.status(400).json({ error: 'Unknown action' });
  await audit(req, `Swap #${o.id}: ${action}`, `fee ${o.fee}`);
  res.json({ ok: true });
});
r.get('/reported', salesTeam, async (_req, res) => {
  res.json({ messages: await q('SELECT m.id, m.offer_id, m.text, m.created_at, u.name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.reported = 1 ORDER BY m.id DESC LIMIT 100') });
});

// ---------- Users ----------
r.get('/users', adminOnly, async (_req, res) => res.json({ users: await q('SELECT id, name, email, phone, role, verified, email_verified, disabled, totp_enabled, created_at FROM users ORDER BY id DESC LIMIT 500') }));
r.post('/users/:id', adminOnly, async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const u = await one('SELECT id, email, role FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const self = u.id === req.user.id;
  const { verified, role, disabled, reset2fa } = req.body;
  if (typeof verified === 'boolean') await q('UPDATE users SET verified = ? WHERE id = ?', [verified, u.id]);
  if (role === 'admin' && !self && u.role !== 'admin') {
    const c = await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0");
    if (Number(c.n) >= MAX_ADMINS) return res.status(400).json({ error: `You can have up to ${MAX_ADMINS} administrators. Change another administrator to Sales or Editor first.` });
  }
  if (['user', 'sales', 'editor', 'admin'].includes(role) && !self) await q('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?', [role, u.id]);
  if (typeof disabled === 'boolean' && !self) await q('UPDATE users SET disabled = ?, token_version = token_version + 1 WHERE id = ?', [disabled, u.id]);
  // For a staff member who lost their phone: they set up two-step login again at next sign-in
  if (reset2fa === true && !self) await q('UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL, token_version = token_version + 1 WHERE id = ?', [u.id]);
  await audit(req, 'Updated user', `${u.email} ${JSON.stringify({ verified, role, disabled, reset2fa })}`);
  res.json({ ok: true });
});

// ---------- Blog ----------
r.get('/posts', contentTeam, async (_req, res) => res.json({ posts: await q('SELECT id, slug, title, status, published_at FROM posts ORDER BY published_at DESC') }));
r.post('/posts/:id/status', contentTeam, async (req, res) => {
  const status = String(req.body.status);
  if (!isId(req.params.id) || !['published', 'draft'].includes(status)) return res.status(400).json({ error: 'Bad request' });
  await q('UPDATE posts SET status = ? WHERE id = ?', [status, req.params.id]);
  await audit(req, `Set post to ${status}`, req.params.id);
  res.json({ ok: true });
});

r.get('/audit', adminOnly, async (_req, res) => res.json({ audit: await q('SELECT * FROM audit ORDER BY id DESC LIMIT 300') }));

// ---------- Settings (owner only) ----------
r.get('/settings', adminOnly, (_req, res) => res.json({ fields: settings.FIELDS, values: settings.current() }));
r.put('/settings', adminOnly, async (req, res) => {
  const saved = await settings.save(req.body || {});
  await audit(req, 'Changed settings', Object.keys(saved).join(', '));
  res.json({ values: settings.current() });
});

module.exports = r;
