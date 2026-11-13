// "Dealers to review" (mounted at /api/admin/dealers). Every Korrect Cars staff role (admin, sales, editor) may
// review; dealer accounts never reach this router (requireStaff in admin.js). Opening a dealer's papers is logged.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { q, one } = require('../db');
const { audit, requireStaff } = require('../lib/security');
const { publicTitle } = require('../lib/titles');
const { PRIVATE_DIR, discard } = require('../lib/uploads');
const mail = require('../lib/mail');
const seo = require('../lib/seo');

const r = express.Router();
const isId = (s) => /^\d{1,10}$/.test(String(s));
const sqlTime = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const STATUSES = ['pending_review', 'more_info', 'approved', 'unverified', 'rejected', 'suspended', 'draft'];
const KEEP_PAPERS_DAYS = 365;

r.get('/', async (req, res) => {
  const st = STATUSES.includes(req.query.status) ? req.query.status : null;
  const kind = ['business', 'personal'].includes(req.query.kind) ? req.query.kind : null;
  const dealers = await q(`SELECT d.id, d.slug, d.kind, d.business_name, d.cac_type, d.cac_number, d.status, d.state, d.created_at, d.verified_at,
      (SELECT COUNT(*) FROM cars c WHERE c.dealer_id = d.id AND c.status IN ('pending','available','reserved')) AS live_cars,
      (SELECT COUNT(*) FROM dealer_documents x WHERE x.dealer_id = d.id) AS papers,
      (SELECT u.name FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = d.id AND m.role = 'owner' LIMIT 1) AS owner_name
    FROM dealers d WHERE d.id <> 1 ${st ? 'AND d.status = ?' : ''}${kind ? ' AND d.kind = ?' : ''} ORDER BY CASE d.status WHEN 'pending_review' THEN 0 WHEN 'more_info' THEN 1 ELSE 2 END, d.id DESC LIMIT 300`, [...(st ? [st] : []), ...(kind ? [kind] : [])]);
  const waiting = Number((await one("SELECT COUNT(*) AS n FROM dealers WHERE status = 'pending_review'")).n);
  const carsToCheck = Number((await one(`SELECT COUNT(*) AS n FROM cars c JOIN dealers d ON d.id = c.dealer_id WHERE c.status = 'pending' AND c.reviewed_at IS NULL AND d.kind = 'personal' AND d.status NOT IN ('approved','rejected','suspended')`)).n);
  const reports = Number((await one("SELECT COUNT(*) AS n FROM listing_reports WHERE status = 'open'")).n);
  res.json({ dealers, waiting, carsToCheck, reports, statuses: STATUSES });
});

r.get('/:id', async (req, res) => {
  if (!isId(req.params.id) || req.params.id === '1') return res.status(404).json({ error: 'Not found' });
  const dealer = await one('SELECT * FROM dealers WHERE id = ?', [req.params.id]);
  if (!dealer) return res.status(404).json({ error: 'Not found' });
  const members = await q(`SELECT m.role, u.id, u.name, u.email, u.phone, u.phone_verified_at, u.created_at FROM dealer_members m JOIN users u ON u.id = m.user_id
    WHERE m.dealer_id = ? ORDER BY m.id`, [dealer.id]);
  const documents = await q('SELECT id, kind, sha256, created_at, reviewed_at, delete_after, file_key FROM dealer_documents WHERE dealer_id = ? ORDER BY id DESC', [dealer.id]);
  // Same certificate uploaded for another dealer? (same file, byte for byte)
  for (const d of documents) {
    d.sameFileElsewhere = Number((await one('SELECT COUNT(*) AS n FROM dealer_documents WHERE sha256 = ? AND dealer_id <> ?', [d.sha256, dealer.id])).n);
    d.type = path.extname(d.file_key).slice(1); delete d.file_key;
  }
  const events = await q(`SELECT e.step, e.result, e.note, e.created_at, u.name AS actor FROM verification_events e LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.dealer_id = ? ORDER BY e.id DESC LIMIT 50`, [dealer.id]);
  const cars = await q('SELECT id, slug, title, price, status, vin FROM cars WHERE dealer_id = ? ORDER BY id DESC LIMIT 100', [dealer.id]);
  res.json({ dealer, members, documents, events, cars });
});

// A dealer's paper (CAC certificate etc.): never cached, every view logged
r.get('/:id/documents/:doc', async (req, res) => {
  if (!isId(req.params.id) || !isId(req.params.doc)) return res.status(404).end();
  const d = await one('SELECT x.file_key, x.kind, dl.business_name FROM dealer_documents x JOIN dealers dl ON dl.id = x.dealer_id WHERE x.id = ? AND x.dealer_id = ?', [req.params.doc, req.params.id]);
  if (!d || !/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.test(d.file_key)) return res.status(404).end();
  const file = path.join(PRIVATE_DIR, d.file_key);
  if (!fs.existsSync(file)) return res.status(404).end();
  await audit(req, `Viewed dealer paper (${d.kind})`, d.business_name);
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  res.sendFile(file);
});

// approve | more_info | reject | suspend
r.post('/:id/decision', async (req, res) => {
  if (!isId(req.params.id) || req.params.id === '1') return res.status(404).json({ error: 'Not found' });
  const decision = String(req.body.decision || '');
  const note = String(req.body.note || '').trim().slice(0, 400);
  if (!['approve', 'more_info', 'reject', 'suspend'].includes(decision)) return res.status(400).json({ error: 'Choose approve, need more, reject or pause.' });
  if (decision !== 'approve' && note.length < 5) return res.status(400).json({ error: 'Write a short note for the dealer saying why.', field: 'note' });
  const d = await one('SELECT * FROM dealers WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const now = sqlTime(0);
  let changed = [];
  if (decision === 'approve') {
    await q("UPDATE dealers SET status = 'approved', verified_at = COALESCE(verified_at, ?) WHERE id = ?", [now, d.id]);
    changed = await q("SELECT * FROM cars WHERE dealer_id = ? AND status = 'pending'", [d.id]);
    await q("UPDATE cars SET status = 'available' WHERE dealer_id = ? AND status = 'pending'", [d.id]); // their waiting cars go live
  } else {
    const status = { more_info: 'more_info', reject: 'rejected', suspend: 'suspended' }[decision];
    await q('UPDATE dealers SET status = ? WHERE id = ?', [status, d.id]);
    // Rejected or paused dealers stop holding VINs and their cars leave the site; "need more" keeps cars waiting
    if (decision !== 'more_info') {
      changed = await q("SELECT * FROM cars WHERE dealer_id = ? AND status IN ('pending','available','reserved')", [d.id]);
      await q("UPDATE cars SET status = 'hidden' WHERE dealer_id = ? AND status IN ('pending','available','reserved')", [d.id]);
    }
  }
  await q('UPDATE dealer_documents SET reviewed_by = ?, reviewed_at = ?, delete_after = ? WHERE dealer_id = ? AND reviewed_at IS NULL',
    [req.user.id, now, sqlTime(KEEP_PAPERS_DAYS * 86400000), d.id]);
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'review', ?, ?, ?)", [d.id, decision, req.user.id, note || null]);
  await audit(req, `Dealer ${decision.replace('_', ' ')}`, `${d.business_name}${note ? ': ' + note : ''}`);
  for (const c of changed) seo.notify(seo.carPaths(c));
  if (decision === 'approve') for (const c of changed) require('../lib/searches').notifyNewCar({ ...c, status: 'available' });
  const owner = await one("SELECT u.name, u.email FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = ? AND m.role = 'owner' LIMIT 1", [d.id]);
  if (owner) mail.send({ to: owner.email, ...mail.templates.dealerDecision(owner.name.split(' ')[0], d.business_name, decision, note, d.kind) }).catch((e) => console.error('Dealer decision email failed:', e.message));
  res.json({ ok: true, status: (await one('SELECT status FROM dealers WHERE id = ?', [d.id])).status, carsChanged: changed.length });
});

// Change what kind of seller this is (administrators only), e.g. a private seller who turns out to be a dealer, or the
// other way round. private = selling their own car, not checked (1 live car); verified = Verified Seller, ID checked
// Take down a dealer's logo (unsuitable image, someone else's brand). Any staff role; the dealer can add a new one.
r.post('/:id/remove-logo', async (req, res) => {
  if (!isId(req.params.id) || req.params.id === '1') return res.status(404).json({ error: 'Not found' });
  const d = await one('SELECT id, business_name, logo_key FROM dealers WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.logo_key) {
    await q('UPDATE dealers SET logo_key = NULL WHERE id = ?', [d.id]);
    discard([d.logo_key]);
    await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'logo', 'removed', ?, 'Logo taken down by Korrect Cars')", [d.id, req.user.id]);
    await audit(req, 'Removed dealer logo', `${d.business_name} (#${d.id})`);
  }
  res.json({ ok: true });
});

// (5 cars); dealer = Verified Dealer, CAC checked (dealer limits). Moving up to verified or dealer counts as approving
// them, so cars waiting for a check go live. Moving down leaves live cars as they are; the lower limit stops new ones.
const SELLER_TYPES = { private: 'Private Seller', verified: 'Verified Seller', dealer: 'Verified Dealer' };
const typeOf = (d) => (d.kind !== 'personal' ? 'dealer' : d.status === 'approved' ? 'verified' : 'private');
r.post('/:id/seller-type', requireStaff('admin'), async (req, res) => {
  if (!isId(req.params.id) || req.params.id === '1') return res.status(404).json({ error: 'Not found' });
  const to = String((req.body || {}).type || '');
  if (!SELLER_TYPES[to]) return res.status(400).json({ error: 'Choose Private Seller, Verified Seller or Verified Dealer.' });
  const d = await one('SELECT * FROM dealers WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const from = typeOf(d);
  if (from === to && (to !== 'dealer' || d.status === 'approved')) return res.status(400).json({ error: `This seller is already a ${SELLER_TYPES[to]}.` });
  if (['rejected', 'suspended'].includes(d.status)) return res.status(400).json({ error: 'This seller is rejected or paused. Review them first, then change the type.' });
  const note = String((req.body || {}).note || '').trim().slice(0, 400);
  const set = {};
  if (to === 'dealer') {
    // A Verified Dealer shows "CAC checked" to buyers, so a CAC number must be on file
    if (!d.cac_number) {
      const type = String(req.body.cacType || '').toUpperCase();
      const num = require('./dealer').cacNumber(type, req.body.cacNumber);
      if (!num) return res.status(400).json({ error: 'A dealer needs a CAC number: RC, BN or IT, then 4 to 9 digits.', field: 'cacNumber' });
      if (await one('SELECT id FROM dealers WHERE cac_number = ? AND cac_type = ? AND id <> ?', [num, type, d.id])) return res.status(400).json({ error: 'Another dealer already has this CAC number.', field: 'cacNumber' });
      Object.assign(set, { cac_type: type, cac_number: num });
    }
    const name = String((req.body || {}).businessName || '').trim().replace(/\s+/g, ' ');
    if (name) { if (name.length < 3 || name.length > 160) return res.status(400).json({ error: 'Enter the business name as it is on the CAC certificate.', field: 'businessName' }); set.business_name = name; }
    Object.assign(set, { kind: 'business', status: 'approved' });
  } else if (to === 'verified') Object.assign(set, { kind: 'personal', status: 'approved' });
  else Object.assign(set, { kind: 'personal', status: 'unverified' });
  const cols = Object.keys(set);
  await q(`UPDATE dealers SET ${cols.map((c) => c + ' = ?').join(', ')}${set.status === 'approved' ? ', verified_at = COALESCE(verified_at, ?)' : ''} WHERE id = ?`,
    [...cols.map((c) => set[c]), ...(set.status === 'approved' ? [sqlTime(0)] : []), d.id]);
  let changed = [];
  if (set.status === 'approved') {
    changed = await q("SELECT * FROM cars WHERE dealer_id = ? AND status = 'pending'", [d.id]);
    await q("UPDATE cars SET status = 'available' WHERE dealer_id = ? AND status = 'pending'", [d.id]);
  }
  const live = Number((await one("SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND status IN ('available','reserved')", [d.id])).n);
  const text = `${SELLER_TYPES[from]} → ${SELLER_TYPES[to]}${note ? ': ' + note : ''}`;
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'seller_type', ?, ?, ?)", [d.id, to, req.user.id, text]);
  await audit(req, 'Changed seller type', `${set.business_name || d.business_name}: ${text}`);
  for (const c of changed) seo.notify(seo.carPaths(c));
  for (const c of changed) require('../lib/searches').notifyNewCar({ ...c, status: 'available' });
  seo.notify(['/dealers/' + d.slug]);
  res.json({ ok: true, type: to, carsWentLive: changed.length, liveCars: live });
});

// Hand cars over to an approved dealer (e.g. Korrect Cars' stock to Buffy). Administrators only.
// The car keeps its web address, photos, views and VIN; the "one live listing per VIN" check simply follows it.
// Staff codes at the end of the title and stock number (e.g. "BF") are removed, since the car is now the dealer's own.
r.post('/:id/move-cars', requireStaff('admin'), async (req, res) => {
  if (!isId(req.params.id) || req.params.id === '1') return res.status(404).json({ error: 'Not found' });
  const d = await one('SELECT id, business_name, status FROM dealers WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status !== 'approved') return res.status(400).json({ error: 'Approve this dealer first, then move cars to them.' });
  const ids = [...new Set((Array.isArray(req.body.carIds) ? req.body.carIds : []).map(String).filter(isId))].slice(0, 1000);
  if (!ids.length) return res.status(400).json({ error: 'Choose at least one car to move.' });
  const cars = await q(`SELECT id, slug, title, stock, make, model, dealer_id FROM cars WHERE id IN (${ids.map(() => '?').join(',')}) AND dealer_id <> ?`, [...ids, d.id]);
  const now = sqlTime(0);
  for (const c of cars) {
    await q('UPDATE cars SET dealer_id = ?, moved_from = ?, moved_at = ?, title = ?, stock = ? WHERE id = ?',
      [d.id, c.dealer_id, now, publicTitle(c.title), c.stock ? publicTitle(c.stock) : c.stock, c.id]);
    seo.notify(seo.carPaths(c));
  }
  await audit(req, `Moved ${cars.length} car(s) to dealer`, `${d.business_name}: ${cars.map((c) => publicTitle(c.title)).slice(0, 20).join(', ')}${cars.length > 20 ? '…' : ''}`);
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'cars_moved', 'done', ?, ?)", [d.id, req.user.id, `${cars.length} car(s) handed over by staff`]);
  res.json({ ok: true, moved: cars.length });
});

module.exports = r;
