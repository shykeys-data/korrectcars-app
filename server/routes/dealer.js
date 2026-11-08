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
const stepup = require('../lib/stepup');

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
  await stepup.trust(req, res, user, { quiet: true }); // this browser just proved the email with a code
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// ---------- Who am I as a dealer ----------
async function membership(userId) {
  return one(`SELECT m.role AS member_role, d.* FROM dealer_members m JOIN dealers d ON d.id = m.dealer_id
    WHERE m.user_id = ? AND d.id <> 1 ORDER BY m.id LIMIT 1`, [userId]);
}
// How many cars a seller may have for sale at once (staff can set dealers.live_limit to override):
//   business (dealer): 50 in the first 3 months after approval, then no limit
//   personal, ID checked (Verified Seller): 5, until they register as a dealer
//   personal, not checked (Private Seller): 1, and staff look at that car before it goes live
const VERIFIED_SELLER_LIMIT = 5;
const PRIVATE_SELLER_LIMIT = 1;
const isPersonal = (d) => d && d.kind === 'personal';
async function liveLimit(d) {
  if (d.live_limit != null) return Number(d.live_limit);
  if (isPersonal(d)) return d.status === 'approved' ? VERIFIED_SELLER_LIMIT : PRIVATE_SELLER_LIMIT;
  const since = d.verified_at || d.created_at;
  const ageDays = since ? (Date.now() - new Date(String(since).replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(since)) ? '' : 'Z')).getTime()) / 86400000 : 0;
  return ageDays < NEW_DEALER_DAYS ? FIRST_MONTHS_LIMIT : null; // null = no limit
}
// Cars for sale that count towards the first-3-months limit (cars handed over by staff do not count, owner decision Nov 2026)
const liveCount = async (dealerId, exceptCar) => Number((await one(`SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND moved_from IS NULL AND status IN ${registry.LIVE_SQL}${exceptCar ? ' AND id <> ?' : ''}`, exceptCar ? [dealerId, exceptCar] : [dealerId])).n);

const dealerView = async (d) => (d ? {
  id: d.id, slug: d.slug, kind: d.kind || 'business', businessName: d.business_name, cacType: d.cac_type, cacNumber: d.cac_number, status: d.status,
  verifiedAt: d.verified_at, phone: d.phone, whatsapp: d.whatsapp, email: d.email, address: d.address, state: d.state, lga: d.lga,
  about: d.about, role: d.member_role, liveLimit: await liveLimit(d), liveCars: await liveCount(d.id),
  lastNote: ((await one("SELECT note FROM verification_events WHERE dealer_id = ? AND step = 'review' ORDER BY id DESC LIMIT 1", [d.id])) || {}).note || null
} : null);

r.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null, dealer: null });
  const u = await one('SELECT id, name, email, phone, role, phone_verified_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, staff: isStaff(u), phoneVerified: !!u.phone_verified_at || (!sms.otpOn() && !!u.phone), phoneCheck: sms.otpOn() }, dealer: await dealerView(await membership(u.id)) });
});

// ---------- 4: phone ----------
r.post('/phone/send', requireAuth, limiter(60, 10, 'Too many codes requested. Please wait an hour.'), async (req, res) => {
  if (!sms.otpOn()) return res.status(400).json({ error: 'Phone texts are not needed right now: your email is confirmed.', skip: true });
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
  if (!u.phone_verified_at && sms.otpOn()) return res.status(403).json({ error: 'Please confirm your phone number first.', step: 'phone' });
  if (!u.phone) return res.status(400).json({ error: 'Add your mobile number to your account first.', step: 'phone' });
  const existing = await membership(u.id);
  if (existing && existing.member_role && existing.member_role !== 'owner') return res.status(403).json({ error: 'Only the account owner can change the business details.', code: 'ROLE' });
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
  // A private or verified seller can register as a dealer at any time (that lifts the 5-car limit once approved)
  const upgrading = existing && isPersonal(existing) && !['rejected', 'suspended'].includes(existing.status);
  if (existing && !upgrading && !['more_info', 'draft'].includes(existing.status)) return res.status(409).json({ error: 'Your business is already registered. Contact us to change its details.' });
  if ((!existing || upgrading) && !cac) return res.status(400).json({ error: 'Add a photo or PDF of your CAC certificate.', field: 'cac' });
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
    await q(`UPDATE dealers SET ${cols.map((c) => `${c} = ?`).join(', ')}, kind = 'business', status = 'pending_review' WHERE id = ?`, [...cols.map((c) => fields[c]), dealerId]);
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
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'submitted', 'pending', ?, ?)", [dealerId, u.id, upgrading ? 'Registered as a dealer (was a private seller)' : existing ? 'Sent again after "we need more"' : 'Applied']);
  mail.send({ to: u.email, ...mail.templates.dealerReceived(u.name.split(' ')[0], business) }).catch((e) => console.error('Dealer email failed:', e.message));
  mail.send({ to: config.email, ...mail.templates.staffNewDealer(business, state) }).catch((e) => console.error('Staff email failed:', e.message));
  res.status(existing ? 200 : 201).json({ dealer: await dealerView(await membership(u.id)) });
});

// ---------- 5b: selling my own car (personal seller) ----------
// No CAC. An ID document (NIN slip, driver's licence, international passport or voter's card) plus a selfie is optional:
// without it the seller is a "Private Seller · not verified" (1 car, checked by staff before it goes live);
// with it, staff check the ID and the seller becomes a "Verified Seller" (up to 5 cars).
const ID_TYPES = { nin: 'NIN slip', licence: "Driver's licence", passport: 'International passport', voter: "Voter's card" };
r.post('/personal', requireAuth, limiter(60, 10), memory.fields([{ name: 'idDoc', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]), async (req, res) => {
  if (isStaff(req.user)) return res.status(403).json({ error: 'Staff accounts cannot sell cars. Sign up with a different email.' });
  const u = await one('SELECT id, name, email, phone, phone_verified_at FROM users WHERE id = ?', [req.user.id]);
  if (!u.phone_verified_at && sms.otpOn()) return res.status(403).json({ error: 'Please confirm your phone number first.', step: 'phone' });
  if (!u.phone) return res.status(400).json({ error: 'Add your mobile number to your account first.', step: 'phone' });
  const existing = await membership(u.id);
  if (existing && existing.member_role && existing.member_role !== 'owner') return res.status(403).json({ error: 'Only the account owner can change these details.', code: 'ROLE' });
  if (existing && !isPersonal(existing)) return res.status(409).json({ error: 'You are already registered as a dealer.' });
  if (existing && ['rejected', 'suspended'].includes(existing.status)) return res.status(403).json({ error: 'Your seller account is not active. Please contact us.' });
  if (existing && ['pending_review', 'approved'].includes(existing.status) && !(req.files && req.files.idDoc)) return res.status(409).json({ error: 'Your details are already with us. Contact us to change them.' });
  const b = req.body || {};
  const name = String(b.displayName || u.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter the name buyers will see, e.g. your first name and surname.', field: 'displayName' });
  const state = STATES.includes(b.state) ? b.state : null;
  if (!state) return res.status(400).json({ error: 'Choose the state the car is in.', field: 'state' });
  const lga = String(b.lga || '').trim();
  if (!isLga(state, lga)) return res.status(400).json({ error: `Choose the local government area (LGA) in ${state}.`, field: 'lga' });
  const whatsapp = b.whatsapp ? sms.toE164(b.whatsapp) : u.phone;
  if (!whatsapp) return res.status(400).json({ error: 'Enter a Nigerian WhatsApp number.', field: 'whatsapp' });
  const idDoc = req.files && req.files.idDoc && req.files.idDoc[0];
  const selfie = req.files && req.files.selfie && req.files.selfie[0];
  const idType = ID_TYPES[b.idType] ? b.idType : null;
  if (idDoc && !idType) return res.status(400).json({ error: 'Choose which ID this is.', field: 'idType' });
  if (idDoc && !selfie) return res.status(400).json({ error: 'Add a selfie holding the same ID, so we can see it is you.', field: 'selfie' });
  if (selfie && !idDoc) return res.status(400).json({ error: 'Add a photo of your ID too.', field: 'idDoc' });
  const status = idDoc ? 'pending_review' : (existing ? existing.status : 'unverified');
  const fields = { business_name: name, state, lga, whatsapp, phone: u.phone, email: u.email, about: null, address: null };
  const saved = [['id_' + (idType || 'other'), idDoc], ['selfie', selfie]].filter(([, f]) => f)
    .map(([kind, f]) => ({ kind, key: save(f, { privateFile: true, allowPdf: kind !== 'selfie' }), sha: crypto.createHash('sha256').update(f.buffer).digest('hex') }));
  let dealerId;
  const cols = Object.keys(fields);
  if (existing) {
    dealerId = existing.id;
    await q(`UPDATE dealers SET ${cols.map((c) => `${c} = ?`).join(', ')}, status = ? WHERE id = ?`, [...cols.map((c) => fields[c]), status, dealerId]);
  } else {
    let slug = slugify(name) || 'seller';
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`; // people share names: always a random end
    const ins = await q(`INSERT INTO dealers (slug, kind, status, ${cols.join(', ')}) VALUES (?, 'personal', ?, ${cols.map(() => '?').join(', ')})`, [slug, status, ...cols.map((c) => fields[c])]);
    dealerId = ins.insertId;
    await q("INSERT INTO dealer_members (dealer_id, user_id, role) VALUES (?, ?, 'owner')", [dealerId, u.id]);
  }
  for (const s of saved) await q('INSERT INTO dealer_documents (dealer_id, kind, file_key, sha256, uploaded_by) VALUES (?, ?, ?, ?, ?)', [dealerId, s.kind, s.key, s.sha, u.id]);
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'submitted', ?, ?, ?)",
    [dealerId, idDoc ? 'pending' : 'unverified', u.id, idDoc ? `Private seller sent ID (${ID_TYPES[idType]})` : 'Private seller (no ID yet)']);
  if (idDoc) {
    mail.send({ to: u.email, ...mail.templates.sellerIdReceived(u.name.split(' ')[0]) }).catch((e) => console.error('Seller email failed:', e.message));
    mail.send({ to: config.email, ...mail.templates.staffNewSeller(name, state) }).catch((e) => console.error('Staff email failed:', e.message));
  }
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
  req.role = d.member_role || 'owner';
  next();
}
// Roles (Nov 2026): owner = everything; manager = everything except the team; lister = adds cars and edits only the
// cars they added, and sees buyer requests for those cars only. Checked here on the server for every route.
const ROLES = ['owner', 'manager', 'lister'];
const onlyRoles = (...roles) => (req, res, next) => (roles.includes(req.role) ? next() : res.status(403).json({ error: 'Only the account owner can do this.', code: 'ROLE' }));
// SQL to limit a query on cars (alias c) to what this member may see
const scope = (req, alias = 'c') => (req.role === 'lister' ? { sql: ` AND ${alias}.created_by = ?`, p: [req.user.id] } : { sql: '', p: [] });
// A dealer's cars are where the dealer is (State and LGA from sign-up); branches come later
const whereFrom = (d, fallback) => [d.lga, d.state].filter(Boolean).join(', ') || fallback;
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
  const prefill = v.type === 'vin17' ? ((decoded && decoded.prefill) || require('../lib/vin-prefill').prefill(v.value, {})) : require('../lib/vin-prefill').prefill(v.value, {}, { chassis: true });
  res.json({ value: v.value, type: v.type, warnings: v.warnings, state, carId: state === 'yours' ? found.live.id : undefined, canClaim: state === 'taken', decoded, prefill });
});

r.get('/cars', requireDealer, async (req, res) => {
  const { lagosDay } = require('../lib/views');
  const today = lagosDay(); const weekAgo = lagosDay(Date.now() - 6 * 86400000); const monthAgo = lagosDay(Date.now() - 29 * 86400000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  // Per car: views today, in the last 7 days, the last 30 days and all time (cars.views), and buyer requests (viewings, offers, Pay Small Small)
  const cars = await q(`SELECT ${CAR_COLS},
      (SELECT COALESCE(SUM(v.views), 0) FROM car_views_daily v WHERE v.car_id = c0.id AND v.day = ?) AS views_today,
      (SELECT COALESCE(SUM(v.views), 0) FROM car_views_daily v WHERE v.car_id = c0.id AND v.day >= ?) AS views_week,
      (SELECT COALESCE(SUM(v.views), 0) FROM car_views_daily v WHERE v.car_id = c0.id AND v.day >= ?) AS views_month,
      (SELECT COUNT(*) FROM enquiries e WHERE e.car_id = c0.id) AS enquiries,
      (SELECT COUNT(*) FROM enquiries e WHERE e.car_id = c0.id AND e.created_at >= ?) AS enquiries_week, c0.boost_until
    FROM cars c0 WHERE dealer_id = ?${scope(req, 'c0').sql} ORDER BY id DESC LIMIT 500`, [today, weekAgo, monthAgo, sevenDaysAgo, req.dealer.id, ...scope(req, 'c0').p]);
  for (const c of cars) for (const k of ['views', 'views_today', 'views_week', 'views_month', 'enquiries', 'enquiries_week']) c[k] = Number(c[k]) || 0;
  for (const c of cars) { const u = c.boost_until; c.boosted = !!(u && new Date(u instanceof Date ? u : String(u).replace(' ', 'T') + 'Z') > new Date()); c.boost_until = c.boosted ? u : null; }
  res.json({ cars, liveLimit: await liveLimit(req.dealer), liveCars: await liveCount(req.dealer.id) });
});

// Views of all the dealer's cars, day by day for the last 30 days (Lagos days), for the dashboard chart
r.get('/stats', requireDealer, async (req, res) => {
  const { lastDays } = require('../lib/views');
  const days = lastDays(30);
  const sc = scope(req);
  const rows = await q(`SELECT v.day, SUM(v.views) AS views FROM car_views_daily v JOIN cars c ON c.id = v.car_id
    WHERE c.dealer_id = ?${sc.sql} AND v.day >= ? GROUP BY v.day`, [req.dealer.id, ...sc.p, days[0]]);
  const by = Object.fromEntries(rows.map((r2) => [r2.day, Number(r2.views) || 0]));
  const daily = days.map((day) => ({ day, views: by[day] || 0 }));
  const sum = (n) => daily.slice(-n).reduce((s, d) => s + d.views, 0);
  const total = Number((await one(`SELECT COALESCE(SUM(views), 0) AS n FROM cars c WHERE c.dealer_id = ?${sc.sql}`, [req.dealer.id, ...sc.p])).n) || 0;
  const enq = await one(`SELECT COUNT(*) AS n FROM enquiries e JOIN cars c ON c.id = e.car_id WHERE c.dealer_id = ?${sc.sql}`, [req.dealer.id, ...sc.p]);
  res.json({ daily, today: sum(1), week: sum(7), month: sum(30), total, enquiries: Number(enq.n) || 0 });
});
r.get('/cars/:id', requireDealer, async (req, res) => {
  const car = isId(req.params.id) && await one(`SELECT ${CAR_COLS} FROM cars c WHERE c.id = ? AND c.dealer_id = ?${scope(req).sql}`, [req.params.id, req.dealer.id, ...scope(req).p]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  res.json({ car });
});

// The status a dealer asks for, and what it becomes: cars of a dealer still waiting for review wait too
// A private seller (not verified) is different: each car waits until staff have looked at it (cars.reviewed_at)
function statusFor(asked, dealer, car) {
  const s = ['available', 'sold', 'hidden'].includes(asked) ? asked : 'available';
  if (s !== 'available' || dealer.status === 'approved') return s;
  return isPersonal(dealer) && car && car.reviewed_at ? 'available' : 'pending';
}
async function checkLimit(dealer, status, exceptCar) {
  if (!['pending', 'available', 'reserved'].includes(status)) return;
  const limit = await liveLimit(dealer);
  if (limit != null && (await liveCount(dealer.id, exceptCar)) >= limit) {
    const why = !isPersonal(dealer) ? `New dealers can have up to ${limit} cars for sale in their first 3 months.`
      : dealer.status === 'approved' ? `Verified Sellers can have up to ${limit} cars for sale. Register as a dealer to list more.`
        : 'Private sellers can list 1 car until we have checked their ID. Send your ID from your seller page to list up to 5.';
    throw Object.assign(new Error(`${why} Mark a sold car as sold, or hide one, to add another.`), { status: 403, code: 'LIMIT', limit });
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
  v.location = whereFrom(req.dealer, v.location);
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
  if (v.status === 'pending' && isPersonal(req.dealer)) mail.send({ to: config.email, ...mail.templates.staffCarToCheck(req.dealer.business_name, v.title) }).catch((e) => console.error('Staff email failed:', e.message));
  if (v.status === 'available') {
    const added = await one('SELECT * FROM cars WHERE id = ?', [ins.insertId]);
    require('../lib/seo').notify(require('../lib/seo').carPaths(added));
    require('../lib/searches').notifyNewCar(added);
  }
  res.status(201).json({ car: await one(`SELECT ${CAR_COLS} FROM cars WHERE id = ?`, [ins.insertId]), warnings: reg.v.warnings });
});

r.put('/cars/:id', requireDealer, carForm, cleanForm, validate('car'), async (req, res) => {
  const car = isId(req.params.id) && await one(`SELECT id, photos, status, vin, vehicle_id_ref, reviewed_at FROM cars c WHERE c.id = ? AND c.dealer_id = ?${scope(req).sql}`, [req.params.id, req.dealer.id, ...scope(req).p]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  if (!req.valid.vin) return res.status(422).json({ code: 'VIN_INVALID', error: 'Enter the VIN (or chassis number).', field: 'vin' });
  const v = carValues(req.valid);
  v.location = whereFrom(req.dealer, v.location);
  delete v.featured;
  const reg = await registry.refFor(v.vin);
  v.vin = reg.v.value;
  // A private seller's checked car is checked again if the VIN changes or new photos are added
  const newPhotos = ((req.files && req.files.photos) || []).length > 0;
  const recheck = isPersonal(req.dealer) && req.dealer.status !== 'approved' && car.reviewed_at && (newPhotos || v.vin !== car.vin);
  if (recheck) car.reviewed_at = null;
  v.status = car.status === 'reserved' ? 'reserved' : statusFor(req.valid.status, req.dealer, car);
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
    await registry.guarded(reg.ref, req.dealer.id, () => q(`UPDATE cars SET ${cols.map((c) => `${c} = ?`).join(', ')}, photos = ?, vehicle_id_ref = ?${vp ? ', vin_photo = ?' : ''}${recheck ? ', reviewed_at = NULL, reviewed_by = NULL' : ''} WHERE id = ? AND dealer_id = ?`,
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
  const car = isId(req.params.id) && await one(`SELECT id, status, mileage, reviewed_at FROM cars c WHERE c.id = ? AND c.dealer_id = ?${scope(req).sql}`, [req.params.id, req.dealer.id, ...scope(req).p]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  if (req.body.status === 'available' && !/\d/.test(String(car.mileage || ''))) return res.status(400).json({ error: 'Add the mileage first: open the car, fill it in and save.' });
  if (car.status === 'reserved') return res.status(409).json({ error: 'This car is reserved for a buyer. Contact us to change it.' });
  const status = statusFor(String(req.body.status || ''), req.dealer, car);
  if (!['pending', 'available'].includes(car.status)) await checkLimit(req.dealer, status, car.id);
  const row = await one('SELECT vehicle_id_ref FROM cars WHERE id = ?', [car.id]);
  await registry.guarded(row.vehicle_id_ref, req.dealer.id, () => q('UPDATE cars SET status = ? WHERE id = ? AND dealer_id = ?', [status, car.id, req.dealer.id]));
  res.json({ ok: true, status });
});


// ---------- Buyer requests (viewings, offers, questions on this seller's cars) ----------
// Korrect Cars staff see every request in Leads; here the seller sees their own and marks them replied or closed.
r.get('/leads', requireDealer, async (req, res) => {
  const sc = scope(req);
  const leads = await q(`SELECT e.id, e.type, e.name, e.phone, e.email, e.message, e.offer_amount, e.preferred_date, e.seller_status, e.created_at,
      c.id AS car_id, c.title, c.slug FROM enquiries e JOIN cars c ON c.id = e.car_id
    WHERE e.dealer_id = ? AND c.dealer_id = ?${sc.sql} ORDER BY e.id DESC LIMIT 300`, [req.dealer.id, req.dealer.id, ...sc.p]);
  res.json({ leads, open: leads.filter((l) => l.seller_status === 'new').length });
});
r.post('/leads/:id', requireDealer, async (req, res) => {
  const status = String((req.body && req.body.status) || '');
  if (!['new', 'replied', 'closed'].includes(status)) return res.status(400).json({ error: 'Choose replied, closed or new.' });
  const sc = scope(req);
  const lead = isId(req.params.id) && await one(`SELECT e.id FROM enquiries e JOIN cars c ON c.id = e.car_id WHERE e.id = ? AND e.dealer_id = ? AND c.dealer_id = ?${sc.sql}`, [req.params.id, req.dealer.id, req.dealer.id, ...sc.p]);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  await q('UPDATE enquiries SET seller_status = ? WHERE id = ?', [status, lead.id]);
  res.json({ ok: true, status });
});

// ---------- Team (dealers only): the owner invites a manager or a lister; each invite is a single-use link for 72 hours ----------
const STEP = { error: 'For your safety, enter the code we just emailed you to change your team.', code: 'STEP_UP' };
async function stepOk(req, res) {
  if (await stepup.sensitiveOk(req)) return true;
  if (!(req.body && req.body.stepCode)) await stepup.sendCode(await one('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]), 'a team change');
  res.status(403).json(req.body && req.body.stepCode ? { ...STEP, error: 'That code is wrong or has expired.' } : STEP);
  return false;
}
r.get('/team', requireDealer, onlyRoles('owner', 'manager'), async (req, res) => {
  const members = await q(`SELECT u.id, u.name, u.email, m.role, m.created_at FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = ? ORDER BY m.id`, [req.dealer.id]);
  const invites = await q('SELECT id, email, role, expires_at, created_at FROM dealer_invites WHERE dealer_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC', [req.dealer.id, sqlTime(0)]);
  res.json({ members, invites, canInvite: req.role === 'owner' && !isPersonal(req.dealer) && req.dealer.status === 'approved' });
});
r.post('/team', requireDealer, onlyRoles('owner'), limiter(60, 20), async (req, res) => {
  if (isPersonal(req.dealer)) return res.status(403).json({ error: 'Teams are for dealers. Register as a dealer to add people.' });
  if (req.dealer.status !== 'approved') return res.status(403).json({ error: 'You can add people once your business is approved.', code: 'DEALER_NOT_APPROVED' });
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const role = String((req.body && req.body.role) || '');
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter their email address.', field: 'email' });
  if (!['manager', 'lister'].includes(role)) return res.status(400).json({ error: 'Choose manager or lister.', field: 'role' });
  if (isDisposable(email)) return res.status(400).json({ error: 'Use a real email address, not a temporary one.', field: 'email' });
  const existing = await one('SELECT u.id, u.role, (SELECT m.dealer_id FROM dealer_members m WHERE m.user_id = u.id LIMIT 1) AS dealer_id FROM users u WHERE u.email = ?', [email]);
  if (existing && (isStaff(existing) || existing.dealer_id)) return res.status(409).json({ error: existing.dealer_id === req.dealer.id ? 'This person is already in your team.' : 'This email cannot be added: it already belongs to another seller or to Korrect Cars staff.', field: 'email' });
  if (Number((await one('SELECT COUNT(*) AS n FROM dealer_members WHERE dealer_id = ?', [req.dealer.id])).n) >= 20) return res.status(400).json({ error: 'A team can have up to 20 people.' });
  if (!(await stepOk(req, res))) return;
  const token = crypto.randomBytes(32).toString('hex');
  await q('UPDATE dealer_invites SET expires_at = ? WHERE dealer_id = ? AND email = ? AND used_at IS NULL', [sqlTime(0), req.dealer.id, email]);
  await q('INSERT INTO dealer_invites (dealer_id, email, role, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [req.dealer.id, email, role, hmac(`invite:${token}`), req.user.id, sqlTime(72 * 3600 * 1000)]);
  const inviter = (await one('SELECT name FROM users WHERE id = ?', [req.user.id])).name;
  await mail.send({ to: email, ...mail.templates.teamInvite(req.dealer.business_name, inviter, role, `${config.siteUrl}/dealers/invite?token=${token}`) });
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'team', 'invited', ?, ?)", [req.dealer.id, req.user.id, `${email} as ${role}`]);
  res.status(201).json({ ok: true });
});
r.delete('/team/:userId', requireDealer, onlyRoles('owner'), limiter(60, 20), async (req, res) => {
  if (!isId(req.params.userId) || Number(req.params.userId) === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
  const m = await one('SELECT m.id, u.email FROM dealer_members m JOIN users u ON u.id = m.user_id WHERE m.dealer_id = ? AND m.user_id = ? AND m.role <> ?', [req.dealer.id, req.params.userId, 'owner']);
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (!(await stepOk(req, res))) return;
  await q('DELETE FROM dealer_members WHERE id = ?', [m.id]); // their cars stay with the business
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'team', 'removed', ?, ?)", [req.dealer.id, req.user.id, m.email]);
  res.json({ ok: true });
});
r.delete('/team/invites/:id', requireDealer, onlyRoles('owner'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  await q('UPDATE dealer_invites SET expires_at = ? WHERE id = ? AND dealer_id = ? AND used_at IS NULL', [sqlTime(0), req.params.id, req.dealer.id]);
  res.json({ ok: true });
});
// Ask for a code before a team change (the page then sends it with the change)
r.post('/step-up', requireDealer, onlyRoles('owner'), limiter(60, 6), async (req, res) => {
  await stepup.sendCode(await one('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]), 'a team change');
  res.json({ ok: true });
});

// The invited person opens the link: who invited them, and whether they already have an account
async function inviteFor(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  return one(`SELECT i.*, d.business_name, d.status AS dealer_status FROM dealer_invites i JOIN dealers d ON d.id = i.dealer_id
    WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`, [hmac(`invite:${token}`), sqlTime(0)]);
}
r.get('/invite/:token', limiter(15, 30), async (req, res) => {
  const inv = await inviteFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invitation has expired or was already used. Ask for a new one.' });
  const hasAccount = !!(await one('SELECT id FROM users WHERE email = ?', [inv.email]));
  res.json({ business: inv.business_name, role: inv.role, email: inv.email, hasAccount, signedInAs: req.user ? req.user.email : null });
});
// Accept: a signed-in user with the invited email joins; or a new account is made (the link proved the email)
r.post('/invite/:token', limiter(15, 20, 'Too many tries. Please wait 15 minutes.'), async (req, res) => {
  const inv = await inviteFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invitation has expired or was already used. Ask for a new one.' });
  let user = await one('SELECT * FROM users WHERE email = ?', [inv.email]);
  if (user) {
    if (!req.user || req.user.id !== user.id) return res.status(403).json({ error: `Sign in as ${inv.email} first, then open the link again.`, signIn: true });
  } else {
    const name = String((req.body && req.body.name) || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter your full name.', field: 'name' });
    const phone = sms.toE164(req.body && req.body.phone);
    if (!phone) return res.status(400).json({ error: 'Enter a Nigerian mobile number, e.g. 0803 123 4567.', field: 'phone' });
    const weak = weakPassword(req.body && req.body.password, { email: inv.email, name });
    if (weak) return res.status(400).json({ error: weak, field: 'password' });
    let ins;
    try { ins = await q('INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?, 1)', [name, inv.email, phone, await bcrypt.hash(String(req.body.password), 12), 'user']); } catch (e) {
      if (/duplicate|unique/i.test(e.message)) return res.status(409).json({ error: 'An account with this email was just made. Sign in, then open the link again.', signIn: true });
      throw e;
    }
    user = await one('SELECT * FROM users WHERE id = ?', [ins.insertId]);
  }
  if (isStaff(user)) return res.status(403).json({ error: 'Staff accounts cannot join a seller.' });
  if (await one('SELECT id FROM dealer_members WHERE user_id = ?', [user.id])) return res.status(409).json({ error: 'This account already belongs to a seller on Korrect Cars.' });
  const used = await q('UPDATE dealer_invites SET used_at = ? WHERE id = ? AND used_at IS NULL', [sqlTime(0), inv.id]);
  if (!used.affectedRows) return res.status(409).json({ error: 'This invitation was already used.' });
  await q('INSERT INTO dealer_members (dealer_id, user_id, role) VALUES (?, ?, ?)', [inv.dealer_id, user.id, inv.role]);
  await q("INSERT INTO verification_events (dealer_id, step, result, actor_id, note) VALUES (?, 'team', 'joined', ?, ?)", [inv.dealer_id, user.id, `${user.email} as ${inv.role}`]);
  if (!req.user) issueSession(res, user);
  await stepup.trust(req, res, user, { quiet: true }); // the emailed link proved the email on this browser
  res.status(201).json({ ok: true, business: inv.business_name, role: inv.role });
});

// ---------- Boosts: a plan (how many cars are boosted at once) for a number of days, paid through Paystack ----------
const boosts = require('../lib/boosts');
r.get('/boosts', requireDealer, async (req, res) => {
  const orders = await q('SELECT id, plan, days, amount, vat, total, reference, status, paid_at, starts_at, ends_at, created_at FROM boost_orders WHERE dealer_id = ? ORDER BY id DESC LIMIT 20', [req.dealer.id]);
  res.json({ plans: boosts.priceList(), vatPct: boosts.VAT_PCT, active: await boosts.activePlan(req.dealer.id), boosted: await boosts.boostedCount(req.dealer.id),
    orders, payOnline: boosts.paystackOn(), canBuy: ['owner', 'manager'].includes(req.role) && req.dealer.status !== 'suspended' });
});
r.post('/boosts', requireDealer, onlyRoles('owner', 'manager'), limiter(60, 20), async (req, res) => {
  const qt = boosts.quote(String((req.body && req.body.plan) || ''), Number(req.body && req.body.days));
  if (!qt) return res.status(400).json({ error: 'Choose a plan and how many days.' });
  if (!boosts.paystackOn()) return res.status(503).json({ error: 'Online payment for boosts is not switched on yet. Contact Korrect Cars to buy a boost.', code: 'PAY_OFF' });
  const u = await one('SELECT email FROM users WHERE id = ?', [req.user.id]);
  const reference = boosts.newReference();
  await q('INSERT INTO boost_orders (dealer_id, user_id, plan, days, amount, vat, total, reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.dealer.id, req.user.id, qt.plan, qt.days, qt.amount, qt.vat, qt.total, reference]);
  const init = await boosts.paystack('/transaction/initialize', { email: u.email, amount: qt.total * 100, currency: 'NGN', reference,
    callback_url: `${config.siteUrl}/dealer?boost=${reference}`, metadata: { dealer_id: req.dealer.id, plan: qt.plan, days: qt.days } });
  res.status(201).json({ url: init.authorization_url, reference });
});
// Back from Paystack: check the payment with Paystack (the webhook does the same; whichever comes first wins)
r.post('/boosts/verify', requireDealer, limiter(15, 30), async (req, res) => {
  const ref = String((req.body && req.body.reference) || '');
  const own = await one('SELECT id FROM boost_orders WHERE reference = ? AND dealer_id = ?', [ref, req.dealer.id]);
  if (!own) return res.status(404).json({ error: 'Not found' });
  const out = await boosts.confirm(ref);
  res.json({ ok: out.ok, error: out.ok ? undefined : out.error, active: await boosts.activePlan(req.dealer.id) });
});
// Boost or un-boost one car under the running plan
r.post('/cars/:id/boost', requireDealer, async (req, res) => {
  const sc = scope(req);
  const car = isId(req.params.id) && await one(`SELECT id, status, boost_until FROM cars c WHERE c.id = ? AND c.dealer_id = ?${sc.sql}`, [req.params.id, req.dealer.id, ...sc.p]);
  if (!car) return res.status(404).json({ error: 'Not found' });
  if (!(req.body && req.body.on)) { await q('UPDATE cars SET boost_until = NULL, boost_rank = 0 WHERE id = ?', [car.id]); return res.json({ ok: true, boosted: false }); }
  if (car.status !== 'available') return res.status(400).json({ error: 'Only cars for sale can be boosted.' });
  const plan = await boosts.activePlan(req.dealer.id);
  if (!plan) return res.status(403).json({ error: 'Buy a boost plan first.', code: 'NO_PLAN' });
  const used = Number((await one('SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND boost_until > ? AND id <> ?', [req.dealer.id, boosts.sqlTime(), car.id])).n);
  if (plan.cars != null && used >= plan.cars) return res.status(403).json({ error: `Your ${plan.name} plan boosts ${plan.cars} car${plan.cars === 1 ? '' : 's'} at a time. Un-boost one, or choose a bigger plan.`, code: 'BOOST_FULL' });
  await q('UPDATE cars SET boost_until = ?, boost_rank = ? WHERE id = ?', [plan.endsAt, plan.rank, car.id]);
  res.json({ ok: true, boosted: true });
});

module.exports = r;
module.exports.membership = membership;
module.exports.ID_TYPES = ID_TYPES;
