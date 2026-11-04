// "Dealers to review" (mounted at /api/admin/dealers). Every Korrect Cars staff role (admin, sales, editor) may
// review; dealer accounts never reach this router (requireStaff in admin.js). Opening a dealer's papers is logged.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { q, one } = require('../db');
const { audit } = require('../lib/security');
const { PRIVATE_DIR } = require('../lib/uploads');
const mail = require('../lib/mail');
const seo = require('../lib/seo');

const r = express.Router();
const isId = (s) => /^\d{1,10}$/.test(String(s));
const sqlTime = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const STATUSES = ['pending_review', 'more_info', 'approved', 'rejected', 'suspended', 'draft'];
const KEEP_PAPERS_DAYS = 365;

r.get('/', async (req, res) => {
  const st = STATUSES.includes(req.query.status) ? req.query.status : null;
  const dealers = await q(`SELECT d.id, d.slug, d.business_name, d.cac_type, d.cac_number, d.status, d.state, d.created_at, d.verified_at,
      (SELECT COUNT(*) FROM cars c WHERE c.dealer_id = d.id AND c.status IN ('pending','available','reserved')) AS live_cars,
      (SELECT COUNT(*) FROM dealer_documents x WHERE x.dealer_id = d.id) AS papers,
      (SELECT u.name FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = d.id AND m.role = 'owner' LIMIT 1) AS owner_name
    FROM dealers d WHERE d.id <> 1 ${st ? 'AND d.status = ?' : ''} ORDER BY CASE d.status WHEN 'pending_review' THEN 0 WHEN 'more_info' THEN 1 ELSE 2 END, d.id DESC LIMIT 300`, st ? [st] : []);
  const waiting = Number((await one("SELECT COUNT(*) AS n FROM dealers WHERE status = 'pending_review'")).n);
  res.json({ dealers, waiting, statuses: STATUSES });
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
  if (owner) mail.send({ to: owner.email, ...mail.templates.dealerDecision(owner.name.split(' ')[0], d.business_name, decision, note) }).catch((e) => console.error('Dealer decision email failed:', e.message));
  res.json({ ok: true, status: (await one('SELECT status FROM dealers WHERE id = ?', [d.id])).status, carsChanged: changed.length });
});

module.exports = r;
