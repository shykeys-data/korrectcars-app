// Partner dealers (mounted at /api/dealer, only while the "Partner dealers" switch is on).
//
// Sign-up, in order:
//   1. POST /signup/code         email -> a 6-digit code is emailed. No account exists yet. Same answer for every email.
//   2. POST /signup/verify       email + code -> a 30-minute sign-up pass (proves the inbox is real)
//   3. POST /signup/account      pass + name + phone + password -> the person's account, signed in
//   4. POST /phone/send, /phone/verify   a text code to a Nigerian mobile number
//   5. POST /                    business name, CAC number and certificate -> the dealer, waiting for staff review
// Someone who already has a customer account signs in and starts at step 4.
//
// Cars: GET/POST /cars, GET/PUT /cars/:id, GET /vin-check. The dealer always comes from the signed-in person's
// membership, never from the request, so one dealer can never see or change another dealer's cars.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { q, one, J } = require('../db');
const { validate, list } = require('../lib/validate');
const { issueSession, requireAuth, limiter, isStaff } = require('../lib/security');
const { isDisposable, weakPassword } = require('../lib/disposable');
const { memory, save, discard } = require('../lib/uploads');
const { carValues } = require('../lib/car-values');
const registry = require('../lib/registry');
const sms = require('../lib/sms');
const mail = require('../lib/mail');
const phash = require('../lib/phash');
const vin = require('../lib/vin');

const r = express.Router();
const sqlTime = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const hmac = (s) => crypto.createHmac('sha256', config.jwtSecret).update(String(s)).digest('hex');
const sixDigits = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const isId = (s) => /^\d{1,10}$/.test(String(s));
const emailOk = (e) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(e) && e.length <= 120;

const FIRST_MONTHS_LIMIT = 50; // live cars a new dealer may have in their first 3 months (owner decision, Nov 2026)
const NEW_DEALER_DAYS = 90;

// ---------- 1-3: email first, then the account ----------
r.post('/signup/code', limiter(60, 10, 'Too many codes requested from this connection. Please wait an hour.'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });
  if (isDisposable(email)) return res.status(400).json({ error: 'Please use an email address you keep. Temporary inboxes cannot be used, because buyers\' messages go there.', field: 'email' });
  const eh = hmac('email:' + email);
  const recent = await one('SELECT COUNT(*) AS n FROM signup_codes WHERE email_hash = ? AND created_at > ?', [eh, sqlTime(-3600 * 1000)]);
  // The answer is the same whether or not an email goes out, so nobody can test which emails have accounts
  if (Number(recent.n) < 3) {
    const exists = await one('SELECT id FROM users WHERE email = ?', [email]);
    const code = sixDigits();
    await q('UPDATE signup_codes SET used_at = ? WHERE email_hash = ? AND used_at IS NULL', [sqlTime(0), eh]);
    await q('INSERT INTO signup_codes (email_hash, code_hash, purpose, expires_at, ip) VALUES (?, ?, ?, ?, ?)',
      [eh, hmac(`code:${email}:${code}`), exists ? 'exists' : 'dealer', sqlTime(15 * 60 * 1000), String(req.ip || '').slice(0, 60)]);
    const t = exists ? mail.templates.dealerExists() : mail.templates.dealerCode(code);
    mail.send({ to: email, ...t }).catch((e) => console.error('Sign-up code email failed:', e.message));
  }
  res.json({ sent: true, email });
});

r.post('/signup/verify', limiter(15, 30, 'Too many tries. Please wait 15 minutes.'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').replace(/\D/g, '');
  const bad = () => res.status(400).json({ error: 'That code is wrong or has expired. Check the latest email, or ask for a new code.' });
  if (!emailOk(email) || code.length !== 6) return bad();
  const row = await one('SELECT * FROM signup_codes WHERE email_hash = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', [hmac('email:' + email), sqlTime(0)]);
  if (!row || row.purpose !== 'dealer') return bad();
  if (row.attempts >= 5) return res.status(429).json({ error: 'Too many wrong codes. Ask for a new code.' });
  if (!same(row.code_hash, hmac(`code:${email}:${code}`))) {
    await q('UPDATE signup_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return bad();
  }
  await q('UPDATE signup_codes SET used_at = ? WHERE id = ?', [sqlTime(0), row.id]);
  const pass = jwt.sign({ p: 'dealer-signup', em: email }, config.jwtSecret, { expiresIn: '30m' });
  res.json({ pass, email });
});

r.post('/signup/account', limiter(15, 20, 'Too many tries. Please wait 15 minutes.'), async (req, res) => {
  let email;
  try { const p = jwt.verify(String(req.body.pass || ''), config.jwtSecret); if (p.p !== 'dealer-signup') throw new Error('wrong pass'); email = p.em; } catch (_e) {
    return res.status(400).json({ error: 'Your sign-up session has expired. Please start again with your email.', restart: true });
  }
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter your full name.', field: 'name' });
  const phone = sms.toE164(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a Nigerian mobile number, e.g. 0803 123 4567.', field: 'phone' });
  const weak = weakPassword(req.body.password, { email, name });
  if (weak) return res.status(400).json({ error: weak, field: 'password' });
  if (await one('SELECT id FROM users WHERE email = ?', [email])) return res.status(409).json({ error: 'This email already has an account. Please sign in.', signIn: true });
  const hash = await bcrypt.hash(String(req.body.password), 12);
  let ins;
  try { ins = await q('INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?, 1)', [name, email, phone, hash, 'user']); } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return res.status(409).json({ error: 'This email already has an account. Please sign in.', signIn: true });
    throw e;
  }
  const user = await one('SELECT * FROM users WHERE id = ?', [ins.insertId]);
  issueSession(res, user);
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// ---------- Who am I as a dealer ----------
async function membership(userId) {
  return one(`SELECT m.role AS member_role, d.* FROM dealer_members m JOIN dealers d ON d.id = m.dealer_id
    WHERE m.user_id = ? AND d.id <> 1 ORDER BY m.id LIMIT 1`, [userId]);
}
async function liveLimit(d) {
  if (d.live_limit != null) return Number(d.live_limit);
  const since = d.verified_at || d.created_at;
  const ageDays = since ? (Date.now() - new Date(String(since).replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(since)) ? '' : 'Z')).getTime()) / 86400000 : 0;
  return ageDays < NEW_DEALER_DAYS ? FIRST_MONTHS_LIMIT : null; // null = no limit
}
// Cars for sale that count towards the first-3-months limit (cars handed over by staff do not count, owner decision Nov 2026)
const liveCount = async (dealerId, exceptCar) => Number((await one(`SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND moved_from IS NULL AND status IN ${registry.LIVE_SQL}${exceptCar ? ' AND id <> ?' : ''}`, exceptCar ? [dealerId, exceptCar] : [dealerId])).n);

const dealerView = async (d) => (d ? {
  id: d.id, slug: d.slug, businessName: d.business_name, cacType: d.cac_type, cacNumber: d.cac_number, status: d.status,
  verifiedAt: d.verified_at, phone: d.phone, whatsapp: d.whatsapp, email: d.email, address: d.address, state: d.state, lga: d.lga,
  about: d.about, role: d.member_role, liveLimit: await liveLimit(d), liveCars: await liveCount(d.id),
  lastNote: ((await one("SELECT note FROM verification_events WHERE dealer_id = ? AND step = 'review' ORDER BY id DESC LIMIT 1", [d.id])) || {}).note || null
} : null);

r.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null, dealer: null });
  const u = await one('SELECT id, name, email, phone, role, phone_verified_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, staff: isStaff(u), phoneVerified: !!u.phone_verified_at }, dealer: await dealerView(await membership(u.id)) });
});

// ---------- 4: phone ----------
r.post('/phone/send', requireAuth, limiter(60, 10, 'Too many codes requested. Please wait an hour.'), async (req, res) => {
  if (isStaff(req.user)) return res.status(403).json({ error: 'Staff accounts cannot be dealer accounts. Sign up with a different email.' });
  const phone = sms.toE164(req.body.phone || req.user.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a Nigerian mobile number, e.g. 0803 123 4567.', field: 'phone' });
  const day = sqlTime(-24 * 3600 * 1000);
  const perPhone = Number((await one('SELECT COUNT(*) AS n FROM phone_otps WHERE phone_e164 = ? AND created_at > ?', [phone, day])).n);
  const perIp = Number((await one('SELECT COUNT(*) AS n FROM phone_otps WHERE ip = ? AND created_at > ?', [String(req.ip || '').slice(0, 60), day])).n);
  if (perPhone >= 3) return res.status(429).json({ error: 'We have sent 3 codes to this number today. Please try again tomorrow, or call us.' });
  if (perIp >= 10) return res.status(429).json({ error: 'Too many codes from this connection today. Please try again tomorrow.' });
  const code = sixDigits();
  await q('UPDATE phone_otps SET expires_at = ? WHERE user_id = ? AND verified_at IS NULL', [sqlTime(0), req.user.id]);
  await q('INSERT INTO phone_otps (user_id, phone_e164, code_hash, expires_at, ip) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, phone, hmac(`otp:${req.user.id}:${phone}:${code}`), sqlTime(10 * 60 * 1000), String(req.ip || '').slice(0, 60)]);
  const out = await sms.send(phone, `Your Korrect Cars code is ${code}. It works for 10 minutes. Never share it with anyone.`);
  res.json({ sent: true, phone, ...(out.test ? { testCode: code } : {}) }); // testCode only on staging without an SMS key
});

r.post('/phone/verify', requireAuth, limiter(15, 20, 'Too many tries. Please wait 15 minutes.'), async (req, res) => {
  const code = String(req.body.code || '').replace(/\D/g, '');
  const row = await one('SELECT * FROM phone_otps WHERE user_id = ? AND verified_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', [req.user.id, sqlTime(0)]);
  const bad = () => res.status(400).json({ error: 'That code is wrong or has expired. Ask for a new one.' });
  if (!row || code.length !== 6) return bad();
  if (row.attempts >= 5) return res.status(429).json({ error: 'Too many wrong codes. Ask for a new one.' });
  if (!same(row.code_hash, hmac(`otp:${req.user.id}:${row.phone_e164}:${code}`))) { await q('UPDATE phone_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]); return bad(); }
  await q('UPDATE phone_otps SET verified_at = ? WHERE id = ?', [sqlTime(0), row.id]);
  await q('UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?', [row.phone_e164, sqlTime(0), req.user.id]);
  res.json({ ok: true, phone: row.phone_e164 });
});

// ---------- 5: the business ----------
const { STATES, LGAS, isLga } = require('../lib/ng-lgas');
r.get('/states', (_req, res) => res.json({ states: STATES, lgas: LGAS }));

// CAC numbers: RC (companies) and BN (business names) are digits; IT (trustees) too. Stored without the prefix.
function cacNumber(type, raw) {
  const n = String(raw || '').toUpperCase().replace(/^(RC|BN|IT)\s*/, '').replace(/[\s-]/g, '');
  return ['RC', 'BN', 'IT'].includes(type) && /^\d{4,9}$/.test(n) ? n : null;
}

r.post('/', requireAuth, limiter(60, 10), memory.fields([{ name: 'cac', maxCount: 1 }, { name: 'extra', maxCount: 3 }]), async (req, res) => {
  if (isStaff(req.user)) return res.status(403).json({ error: 'Staff accounts cannot be dealer accounts. Sign up with a different email.' });
  const u = await one('SELECT id, name, email, phone, phone_verified_at FROM users WHERE id = ?', [req.user.id]);
  if (!u.phone_verified_at) return res.status(403).json({ error: 'Please confirm your phone number first.', step: 'phone' });
  const existing = await membership(u.id);
  const b = req.body || {};
  const business = String(b.businessName || '').trim().replace(/\s+/g, ' ');
  if (business.length < 3 || business.length > 160) return res.status(400).json({ error: 'Enter the business name as it is on your CAC certificate.', field: 'businessName' });
  const type = String(b.cacType || '').toUpperCase();
  const num = cacNumber(type, b.cacNumber);
  if (!num) return res.status(400).json({ error: 'Enter the CAC number: RC or BN, then 4 to 9 digits.', field: 'cacNumber' });
  const state = STATES.includes(b.state) ? b.state : null;
  if (!state) return res.status(400).json({ error: 'Choose the state your business is in.', field: 'state' });
  const lga = String(b.lga || '').trim();
  if (!isLga(state, lga)) return res.status(400).json({ error: `Choose the local government area (LGA) in ${state}.`, field: 'lga' });
  const address = String(b.address || '').trim().slice(0, 250);
  if (address.length < 8) return res.status(400).json({ error: 'Enter the address buyers can visit.', field: 'address' });
  const whatsapp = b.whatsapp ? sms.toE164(b.whatsapp) : u.phone;
  if (!whatsapp) return res.status(400).json({ error: 'Enter a Nigerian WhatsApp number.', field: 'whatsapp' });
  const fields = { business_name: business, cac_type: type, cac_number: num, state, lga, address,
    whatsapp, phone: u.phone, email: u.email, about: String(b.about || '').trim().slice(0, 1500) || null };

  const cac = req.files && req.files.cac && req.files.cac[0];
  // Changing a reply to "we need more" is allowed; an approved or waiting dealer edits through staff
  if (existing && !['more_info', 'draft'].includes(existing.status)) return res.status(409).json({ error: 'Your business is already registered. Contact us to change its details.' });
  if (!existing && !cac) return res.status(400).json({ error: 'Add a photo or PDF of your CAC certificate.', field: 'cac' });
  const clash = await one('SELECT id FROM dealers WHERE cac_number = ? AND cac_type = ?', [num, type]);
  if (clash && (!existing || clash.id !== existing.id)) return res.status(409).json({ error: 'A dealer with this CAC number is already registered. If this is your business, contact us.', field: 'cacNumber' });

  const files = [];
  if (cac) files.push(['cac', cac]);
  for (const f of (req.files && req.files.extra) || []) files.push(['other', f]);
  const saved = files.map(([kind, f]) => ({ kind, key: save(f, { privateFile: true, allowPdf: true }), sha: crypto.createHash('sha256').update(f.buffer).digest('hex') }));

  let dealerId;
  if (existing) {
    dealerId = existing.id;
    const cols = Object.keys(fields);
    await q(`UPDATE dealers SET ${cols.map((c) => `${c} = ?`).join(', ')}, status = 'pending_review' WHERE id = ?`, [...cols.map((c) => fields[c]), dealerId]);
  } else {
    let slug = slugify(business) || 'dealer';
    if (slug === 'korrect-cars' || await one('SELECT id FROM dealers WHERE slug = ?', [slug])) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    const cols = Object.keys(fields);
    try {
      const ins = await q(`INSERT INTO dealers (slug, status, ${cols.join(', ')}) VALUES (?, 'pending_review', ${cols.map(() => '?').join(', ')})`, [slug, ...cols.map((c) => fields[c])]);
      dealerId = ins.insertId;
    } catch (e) {
      if (/duplicate|unique/i.test(e.message)) return res.status(409).json({ error: 'A dealer with this CAC number is already registered. If this is your business, contact us.', field: 'cacNumber' });
      throw e;
    }
    await q("INSERT INTO dealer_members (dealer_id, user_id, role) VALUES (?, ?, 'owner')", [dealerId, u.id]);
  }
  for (const s of saved) await q('INSERT INTO dealer_documents (dealer_id, kind, file_key, sha256, uploaded_by) VALUES (?, ?, ?, ?, ?)', [dealerId, s.kind, s.key, s.sha, u.id]);
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'submitted', 'pending', ?, ?)", [dealerId, u.id, existing ? 'Sent again after "we need more"' : 'Applied']);
  mail.send({ to: u.email, ...mail.templates.dealerReceived(u.name.split(' ')[0], business) }).catch((e) => console.error('Dealer email failed:', e.message));
  mail.send({ to: config.email, ...mail.templates.staffNewDealer(business, state) }).catch((e) => console.error('Staff email failed:', e.message));
  res.status(existing ? 200 : 201).json({ dealer: await dealerView(await membership(u.id)) });
});

// ---------- Dealer cars ----------
// Signed in, a member of a partner dealer that is not rejected or paused
async function requireDealer(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Please sign in.', signIn: true });
  const d = await membership(req.user.id);
  if (!d) return res.status(403).json({ error: 'Register your business first.', step: 'business' });
  if (['rejected', 'suspended'].includes(d.status)) return res.status(403).json({ error: 'Your dealer account is not active. Please contact us.' });
  req.dealer = d;
  next();
}
const CAR_COLS = 'id, slug, title, make, model, body, year, price, old_price, mileage, engine, transmission, drivetrain, fuel, color, interior, car_condition, location, trim_level, vin, stock, description, features, specs, info, photos, status, views, created_at, updated_at';

r.get('/vin-check', requireDealer, limiter(15, 120), async (req, res) => {
  const found = await registry.lookup(req.query.vin);
  const { v } = found;
  if (!v.type || v.problems.length) return res.status(422).json({ code: 'VIN_INVALID', error: v.problems[0] || 'Enter the VIN.', problems: v.problems, warnings: v.warnings });
  let state = 'free';
  if (found.ref && found.ref.locked) state = 'locked';
  else if (found.live) state = found.live.dealer_id === req.dealer.id ? 'yours' : 'taken';
  let decoded = null;
  if (v.type === 'vin17' && req.query.decode !== '0') { try { decoded = await vin.decode(v.value); } catch (_e) { decoded = null; } }
  // What the form can fill in: the factory record, or at least the maker and year from the VIN itself
  const prefill = v.type === 'vin17' ? ((decoded && decoded.prefill) || require('../lib/vin-prefill').prefill(v.value, {})) : {};
  res.json({ value: v.value, type: v.type, warnings: v.warnings, state, carId: state === 'yours' ? found.live.id : undefined, canClaim: state === 'taken', decoded, prefill });
});

r.get('/cars', requireDealer, async (req, res) => {
  res.json({ cars: await q(`SELECT ${CAR_COLS} FROM cars WHERE dealer_id = ? ORDER BY id DESC LIMIT 500`, [req.dealer.id]), liveLimit: await liveLimit(req.dealer), liveCars: await liveCount(req.dealer.id) });
});
r.get('/cars/:id', requireDealer, async (req, res) => {
  const car = isId(req.params.id) && await one(`SELECT ${CAR_COLS} FROM cars WHERE id = ? AND dealer_id = ?`, [req.params.id, req.dealer.id]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  res.json({ car });
});

// The status a dealer asks for, and what it becomes: cars of a dealer still waiting for review wait too
function statusFor(asked, dealer) {
  const s = ['available', 'sold', 'hidden'].includes(asked) ? asked : 'available';
  return s === 'available' && dealer.status !== 'approved' ? 'pending' : s;
}
async function checkLimit(dealer, status, exceptCar) {
  if (!['pending', 'available', 'reserved'].includes(status)) return;
  const limit = await liveLimit(dealer);
  if (limit != null && (await liveCount(dealer.id, exceptCar)) >= limit) {
    throw Object.assign(new Error(`New dealers can have up to ${limit} cars for sale in their first 3 months. Mark a sold car as sold, or hide one, to add another.`), { status: 403, code: 'LIMIT', limit });
  }
}
async function fingerprint(carId, photos, files) {
  for (let i = 0; i < files.length; i++) {
    const h = await phash.dhash(files[i].buffer);
    if (h) await q('INSERT INTO car_photo_hashes (car_id, url, phash) VALUES (?, ?, ?)', [carId, photos[i], h]).catch(() => {});
  }
}
const carForm = memory.fields([{ name: 'photos', maxCount: 20 }, { name: 'vinPhoto', maxCount: 1 }]);
const cleanForm = (req, _res, next) => { if (req.body) { delete req.body.featured; delete req.body.inspection; } next(); }; // staff-only fields

r.post('/cars', requireDealer, limiter(60, 60, 'Too many cars added in an hour. Please wait a little.'), carForm, cleanForm, validate('car'), async (req, res) => {
  if (!req.valid.vin) return res.status(422).json({ code: 'VIN_INVALID', error: 'Enter the VIN (or chassis number) first.', field: 'vin' });
  const v = carValues(req.valid);
  v.featured = 0;
  v.status = statusFor(req.valid.status, req.dealer);
  const reg = await registry.refFor(v.vin);
  v.vin = reg.v.value;
  await checkLimit(req.dealer, v.status);
  const photos = (req.files && req.files.photos) || [];
  if (v.status !== 'hidden' && !photos.length) return res.status(400).json({ error: 'Add at least one photo of the car.', field: 'photos' });
  const vp = req.files && req.files.vinPhoto && req.files.vinPhoto[0];
  const slug = `${slugify(v.title)}-${crypto.randomBytes(3).toString('hex')}`; // random end: two saves never fight over a web address
  const urls = photos.map((f, i) => save(f, { folder: 'cars', name: `${slugify(v.title)}-${i + 1}` }));
  const vinPhoto = vp ? save(vp, { privateFile: true }) : null;
  const cols = Object.keys(v);
  let ins;
  try {
    ins = await registry.guarded(reg.ref, req.dealer.id, () => q(`INSERT INTO cars (slug, photos, dealer_id, vehicle_id_ref, vin_photo, created_by, ${cols.join(', ')})
      VALUES (?, ?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`, [slug, J(urls), req.dealer.id, reg.ref, vinPhoto, req.user.id, ...cols.map((c) => v[c])]));
  } catch (e) { discard([...urls, vinPhoto]); throw e; }
  fingerprint(ins.insertId, urls, photos).catch(() => {});
  if (v.status === 'available') {
    const added = await one('SELECT * FROM cars WHERE id = ?', [ins.insertId]);
    require('../lib/seo').notify(require('../lib/seo').carPaths(added));
    require('../lib/searches').notifyNewCar(added);
  }
  res.status(201).json({ car: await one(`SELECT ${CAR_COLS} FROM cars WHERE id = ?`, [ins.insertId]), warnings: reg.v.warnings });
});

r.put('/cars/:id', requireDealer, carForm, cleanForm, validate('car'), async (req, res) => {
  const car = isId(req.params.id) && await one('SELECT id, photos, status, vin, vehicle_id_ref FROM cars WHERE id = ? AND dealer_id = ?', [req.params.id, req.dealer.id]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  if (!req.valid.vin) return res.status(422).json({ code: 'VIN_INVALID', error: 'Enter the VIN (or chassis number).', field: 'vin' });
  const v = carValues(req.valid);
  delete v.featured;
  v.status = car.status === 'reserved' ? 'reserved' : statusFor(req.valid.status, req.dealer);
  const reg = await registry.refFor(v.vin);
  v.vin = reg.v.value;
  if (!['pending', 'available', 'reserved'].includes(car.status)) await checkLimit(req.dealer, v.status, car.id);
  const current = car.photos || [];
  const keep = req.valid.keepPhotos !== undefined ? list(req.valid.keepPhotos).filter((p) => current.includes(p)) : current;
  const files = (req.files && req.files.photos) || [];
  if (keep.length + files.length > 30) return res.status(400).json({ error: 'A car can have up to 30 photos.' });
  const added = files.map((f, i) => save(f, { folder: 'cars', name: `${slugify(v.title)}-${keep.length + i + 1}` }));
  const vp = req.files && req.files.vinPhoto && req.files.vinPhoto[0];
  const cols = Object.keys(v);
  const vinPhoto = vp ? save(vp, { privateFile: true }) : null;
  try {
    await registry.guarded(reg.ref, req.dealer.id, () => q(`UPDATE cars SET ${cols.map((c) => `${c} = ?`).join(', ')}, photos = ?, vehicle_id_ref = ?${vp ? ', vin_photo = ?' : ''} WHERE id = ? AND dealer_id = ?`,
      [...cols.map((c) => v[c]), J([...keep, ...added]), reg.ref, ...(vp ? [vinPhoto] : []), car.id, req.dealer.id]));
  } catch (e) { discard([...added, vinPhoto]); throw e; }
  fingerprint(car.id, added, files).catch(() => {});
  const saved = await one(`SELECT ${CAR_COLS} FROM cars WHERE id = ?`, [car.id]);
  if (saved.status === 'available') require('../lib/seo').notify(require('../lib/seo').carPaths(saved));
  if (car.status !== 'available' && saved.status === 'available') require('../lib/searches').notifyNewCar(saved);
  res.json({ car: saved, warnings: reg.v.warnings });
});

// Quick status change from the car list (sold / hidden / for sale)
r.post('/cars/:id/status', requireDealer, async (req, res) => {
  const car = isId(req.params.id) && await one('SELECT id, status FROM cars WHERE id = ? AND dealer_id = ?', [req.params.id, req.dealer.id]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  if (car.status === 'reserved') return res.status(409).json({ error: 'This car is reserved for a buyer. Contact us to change it.' });
  const status = statusFor(String(req.body.status || ''), req.dealer);
  if (!['pending', 'available'].includes(car.status)) await checkLimit(req.dealer, status, car.id);
  const row = await one('SELECT vehicle_id_ref FROM cars WHERE id = ?', [car.id]);
  await registry.guarded(row.vehicle_id_ref, req.dealer.id, () => q('UPDATE cars SET status = ? WHERE id = ? AND dealer_id = ?', [status, car.id, req.dealer.id]));
  res.json({ ok: true, status });
});

module.exports = r;
module.exports.membership = membership;
