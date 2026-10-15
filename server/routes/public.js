const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const catalog = require('../lib/catalog');
const { q, one } = require('../db');
const { validate } = require('../lib/validate');
const { issueSession, clearSession, requireAuth, limiter, isStaff, audit } = require('../lib/security');
const totp = require('../lib/totp');
const settings = require('../lib/settings');

const r = express.Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12); // same work for unknown emails
const PUBLIC_STATUSES = "('available','sold')";

// ---------- Site settings for the client ----------
const publicConfig = () => settings.current();
r.get('/config', (_req, res) => res.json(publicConfig()));
r.get('/catalog', (_req, res) => res.json(catalog));

// ---------- Auth ----------
const crypto = require('crypto');
const mail = require('../lib/mail');
const authLimit = limiter(15, 30, 'Too many attempts. Please wait 15 minutes.');
const mailLimit = limiter(60, 5, 'Too many emails requested. Please wait an hour.');
const sqlTime = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const isAdminEmail = (email) => config.adminEmails.includes(String(email).toLowerCase());

async function makeToken(userId, purpose, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('UPDATE email_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  await q('INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)', [userId, sha(token), purpose, sqlTime(ttlMs)]);
  return token;
}
async function useToken(token, purpose) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const row = await one('SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?', [sha(token), purpose, sqlTime(0)]);
  if (!row) return null;
  await q('UPDATE email_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  return row;
}
async function sendVerify(user) {
  const token = await makeToken(user.id, 'verify', 24 * 3600 * 1000);
  const t = mail.templates.verify(user.name.split(' ')[0], `${config.siteUrl}/verify-email?token=${token}`);
  await mail.send({ to: user.email, ...t }).catch((e) => console.error('Verify email failed:', e.message));
}
async function promoteIfOwner(user) {
  if (user.role === 'user' && isAdminEmail(user.email) && user.email_verified && Number((await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0")).n) < 3) {
    await q("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
    user.role = 'admin';
  }
}

// Register: the account stays inactive until the email link is clicked
r.post('/auth/register', authLimit, validate('register'), async (req, res) => {
  const { name, email, phone, password } = req.valid;
  const existing = await one('SELECT id, name, email, email_verified FROM users WHERE email = ?', [email]);
  if (existing) {
    if (!existing.email_verified) { await sendVerify(existing); return res.status(202).json({ pending: true, email }); }
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }
  const hash = await bcrypt.hash(password, 12);
  const ins = await q('INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?, 0)', [name, email, phone, hash, 'user']);
  await sendVerify({ id: ins.insertId, name, email });
  res.status(201).json({ pending: true, email });
});

r.post('/auth/verify', authLimit, async (req, res) => {
  const row = await useToken(req.body && req.body.token, 'verify');
  if (!row) return res.status(400).json({ error: 'This link has expired or was already used. Sign in to get a new one.' });
  await q('UPDATE users SET email_verified = 1 WHERE id = ?', [row.user_id]);
  const user = await one('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!user || user.disabled) return res.status(400).json({ error: 'This account is not available.' });
  await promoteIfOwner(user);
  mail.send({ to: user.email, ...mail.templates.verified(user.name.split(' ')[0]) }).catch((e) => console.error('Welcome email failed:', e.message));
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

r.post('/auth/resend', mailLimit, async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 120);
  const user = email && await one('SELECT id, name, email, email_verified, disabled FROM users WHERE email = ?', [email]);
  if (user && !user.email_verified && !user.disabled) await sendVerify(user);
  res.json({ ok: true }); // same answer either way, so emails cannot be probed
});

r.post('/auth/login', authLimit, validate('login'), async (req, res) => {
  const { email, password } = req.valid;
  const user = await one('SELECT * FROM users WHERE email = ?', [email]);
  const fail = () => res.status(400).json({ error: 'Email or password is incorrect.' });
  if (!user || user.disabled) { await bcrypt.compare(password, DUMMY_HASH); return fail(); }
  if (user.lock_until && new Date(String(user.lock_until).replace(' ', 'T') + (String(user.lock_until).endsWith('Z') ? '' : 'Z')) > new Date()) {
    return res.status(423).json({ error: 'Account locked after too many attempts. Try again in 15 minutes, or reset your password.' });
  }
  if (!(await bcrypt.compare(password, user.password_hash))) {
    const n = (user.failed_logins || 0) + 1;
    if (n >= 5) await q('UPDATE users SET failed_logins = 0, lock_until = ? WHERE id = ?', [sqlTime(15 * 60 * 1000), user.id]);
    else await q('UPDATE users SET failed_logins = ? WHERE id = ?', [n, user.id]);
    return fail();
  }
  await q('UPDATE users SET failed_logins = 0, lock_until = NULL WHERE id = ?', [user.id]);
  if (!user.email_verified) return res.status(403).json({ error: 'Please confirm your email first. Check your inbox (and spam folder) for the link.', unverified: true });
  await promoteIfOwner(user);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

// Forgot / reset password
r.post('/auth/forgot', mailLimit, async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 120);
  const user = email && await one('SELECT id, name, email, disabled FROM users WHERE email = ?', [email]);
  if (user && !user.disabled) {
    const token = await makeToken(user.id, 'reset', 3600 * 1000);
    mail.send({ to: user.email, ...mail.templates.reset(user.name.split(' ')[0], `${config.siteUrl}/reset-password?token=${token}`) }).catch((e) => console.error('Reset email failed:', e.message));
  }
  res.json({ ok: true });
});
r.post('/auth/reset', authLimit, async (req, res) => {
  const pw = String((req.body && req.body.password) || '');
  if (pw.length < 8 || pw.length > 128 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return res.status(400).json({ error: 'Use at least 8 characters, with a letter and a number.' });
  const row = await useToken(req.body.token, 'reset');
  if (!row) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.' });
  // Clicking the emailed link also proves the email address
  await q('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, lock_until = NULL, email_verified = 1 WHERE id = ?', [await bcrypt.hash(pw, 12), row.user_id]);
  const user = await one('SELECT * FROM users WHERE id = ?', [row.user_id]);
  await promoteIfOwner(user);
  mail.send({ to: user.email, ...mail.templates.passwordChanged(user.name.split(' ')[0]) }).catch(() => {});
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

r.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
r.post('/auth/logout-all', requireAuth, async (req, res) => {
  await q('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  clearSession(res); res.json({ ok: true });
});
r.get('/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user, req.mfa) : null }));

// ---------- Two-step login for staff ----------
const codeLimit = limiter(15, 10, 'Too many codes tried. Please wait 15 minutes.');
const staffOnly = (req, res, next) => (isStaff(req.user) ? next() : res.status(403).json({ error: 'Only staff accounts use two-step login.' }));
r.post('/auth/2fa/setup', requireAuth, staffOnly, async (req, res) => {
  if (req.user.totp_enabled) return res.status(400).json({ error: 'Two-step login is already on. Ask the owner to reset it if you changed phones.' });
  const secret = totp.newSecret();
  await q('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, req.user.id]);
  res.json({ secret, url: totp.otpauthUrl(secret, req.user.email) });
});
r.post('/auth/2fa/enable', codeLimit, requireAuth, staffOnly, async (req, res) => {
  const u = await one('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);
  if (u.totp_enabled) return res.status(400).json({ error: 'Two-step login is already on.' });
  if (!totp.verify(u.totp_secret, req.body && req.body.code)) return res.status(400).json({ error: 'That code is not right. Check the time on your phone and try the newest code.' });
  const codes = totp.newRecoveryCodes();
  await q('UPDATE users SET totp_enabled = 1, recovery_codes = ? WHERE id = ?', [JSON.stringify(codes.map(totp.hashCode)), u.id]);
  await audit(req, 'Turned on two-step login', req.user.email);
  const user = await one('SELECT * FROM users WHERE id = ?', [u.id]);
  issueSession(res, user, { mfa: true });
  res.json({ user: publicUser(user, true), recoveryCodes: codes });
});
r.post('/auth/2fa/verify', codeLimit, requireAuth, staffOnly, async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!u.totp_enabled) return res.status(400).json({ error: 'Set up two-step login first.' });
  const code = String((req.body && req.body.code) || '').trim();
  let ok = totp.verify(u.totp_secret, code);
  if (!ok && /^[a-z0-9]{5}-?[a-z0-9]{5}$/i.test(code)) { // a one-time backup code
    const hashes = Array.isArray(u.recovery_codes) ? u.recovery_codes : [];
    const h = totp.hashCode(code);
    if (hashes.includes(h)) { ok = true; await q('UPDATE users SET recovery_codes = ? WHERE id = ?', [JSON.stringify(hashes.filter((x) => x !== h)), u.id]); await audit(req, 'Used a backup code', `${u.email}, ${hashes.length - 1} left`); }
  }
  if (!ok) { await audit(req, 'Wrong two-step code', u.email); return res.status(400).json({ error: 'That code is not right. Try the newest code in your authenticator app.' }); }
  issueSession(res, u, { mfa: true });
  res.json({ user: publicUser(u, true) });
});

function publicUser(u, mfa = false) {
  const out = { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, verified: !!u.verified };
  if (isStaff(u)) out.twofa = { enabled: !!u.totp_enabled, ok: !!(u.totp_enabled && mfa) };
  return out;
}

// ---------- Cars ----------
async function facets() {
  const rows = await q(`SELECT DISTINCT make, model, body FROM cars WHERE status IN ${PUBLIC_STATUSES} ORDER BY make, model, body`);
  const makes = {};
  for (const x of rows) { ((makes[x.make] = makes[x.make] || {})[x.model] = makes[x.make][x.model] || []).push(x.body); }
  const p = await one(`SELECT MIN(price) AS min, MAX(price) AS max, MIN(year) AS ymin, MAX(year) AS ymax FROM cars WHERE status IN ${PUBLIC_STATUSES}`);
  return { makes, price: { min: Number(p && p.min) || 0, max: Number(p && p.max) || 0 }, year: { min: Number(p && p.ymin) || 0, max: Number(p && p.ymax) || 0 } };
}
r.get('/cars/facets', async (_req, res) => res.json(await facets()));

const CAR_COLS = 'id, slug, title, make, model, body, trim_level, year, price, old_price, mileage, engine, transmission, drivetrain, fuel, color, interior, car_condition, location, photos, status, featured';
async function listCars(query = {}) {
  const where = [`status IN ${PUBLIC_STATUSES}`]; const p = [];
  const add = (sql, v) => { where.push(sql); p.push(v); };
  const { make, model, body, condition, minPrice, maxPrice, yearMin, yearMax, sort, featured, search, limit } = query;
  if (make) add('make = ?', String(make));
  if (model) add('model = ?', String(model));
  if (body) add('body = ?', String(body));
  if (condition) add('car_condition = ?', String(condition));
  if (featured === '1') where.push("featured = 1 AND status = 'available'");
  if (minPrice) add('price >= ?', Number(minPrice) || 0);
  if (maxPrice) add('price <= ?', Number(maxPrice) || 1e12);
  if (yearMin) add('year >= ?', Number(yearMin) || 0);
  if (yearMax) add('year <= ?', Number(yearMax) || 9999);
  if (search) add('title LIKE ?', '%' + String(search).slice(0, 60).replace(/[%_\\]/g, '\\$&') + '%');
  const sorts = { 'price-asc': 'price ASC', 'price-desc': 'price DESC', 'year-desc': 'year DESC, price DESC', newest: 'created_at DESC' };
  const lim = Math.min(Math.max(Number(limit) || 60, 1), 100);
  return q(`SELECT ${CAR_COLS} FROM cars WHERE ${where.join(' AND ')} ORDER BY (status = 'sold') ASC, ${sorts[sort] || 'price DESC'} LIMIT ${lim}`, p);
}
r.get('/cars', async (req, res) => res.json({ cars: await listCars(req.query) }));

async function carDetail(slug) {
  const car = await one("SELECT * FROM cars WHERE slug = ? AND status <> 'hidden'", [String(slug)]);
  if (!car) return null;
  const similar = await q(`SELECT id, slug, title, make, model, body, year, price, old_price, mileage, photos, status FROM cars
    WHERE id <> ? AND status = 'available' AND (body = ? OR make = ?) ORDER BY ABS(price - ?) LIMIT 3`, [car.id, car.body, car.make, car.price]);
  delete car.vin; // staff only
  return { car, similar };
}
r.get('/cars/:slug', async (req, res) => {
  const d = await carDetail(req.params.slug);
  if (!d) return res.status(404).json({ error: 'Car not found' });
  await q('UPDATE cars SET views = views + 1 WHERE id = ?', [d.car.id]);
  res.json(d);
});

// ---------- Enquiries (viewing, offer, Pay Small Small, contact) ----------
r.post('/enquiries', limiter(60, 8, 'Too many messages sent. Please call or WhatsApp us instead.'), validate('enquiry'), async (req, res) => {
  const v = req.valid;
  if (v.website) return res.json({ ok: true }); // honeypot
  let carId = null; let bnpl = [null, null, null];
  if (v.car) {
    const car = await one('SELECT id, price FROM cars WHERE id = ?', [v.car]);
    if (!car) return res.status(400).json({ error: 'Car not found' });
    carId = car.id;
    if (v.type === 'bnpl') {
      const plan = bnplPlan(Number(car.price), v.deposit, v.months);
      bnpl = [plan.deposit, plan.months, plan.monthly];
    }
  }
  await q(`INSERT INTO enquiries (car_id, type, name, phone, email, message, offer_amount, preferred_date, bnpl_deposit, bnpl_months, bnpl_monthly)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [carId, v.type, v.name, v.phone, v.email || null, v.message || null, v.offerAmount || null, v.preferredDate || null, ...bnpl]);
  res.status(201).json({ ok: true });
});

// Pay Small Small: minimum deposit, then a flat markup on the balance spread over the months
function bnplPlan(price, depositIn, monthsIn) {
  const b = settings.current().bnpl;
  const months = Math.min(b.maxMonths, Math.max(b.minMonths, Math.round(monthsIn || b.minMonths)));
  const minDep = Math.ceil(price * b.minDeposit / 100);
  const deposit = Math.min(price, Math.max(minDep, Math.round(depositIn || 0)));
  const balance = price - deposit;
  const repay = Math.round(balance * (1 + b.markup / 100));
  return { deposit, months, balance, repay, monthly: Math.ceil(repay / months) };
}
r.get('/bnpl/quote', (req, res) => {
  const price = Number(req.query.price);
  if (!(price > 0)) return res.status(400).json({ error: 'Enter a car price' });
  res.json(bnplPlan(price, Number(req.query.deposit), Number(req.query.months)));
});

// ---------- Blog and pages ----------
r.get('/posts', async (req, res) => {
  const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  res.json({ posts: await q(`SELECT slug, title, excerpt, image, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ${lim}`) });
});
r.get('/posts/:slug', async (req, res) => {
  const post = await one("SELECT * FROM posts WHERE slug = ? AND status = 'published'", [String(req.params.slug)]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const more = await q("SELECT slug, title, image, published_at FROM posts WHERE id <> ? AND status = 'published' ORDER BY published_at DESC LIMIT 3", [post.id]);
  res.json({ post, more });
});
r.get('/pages/:slug', async (req, res) => {
  const page = await one('SELECT slug, title, content FROM pages WHERE slug = ?', [String(req.params.slug)]);
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ page });
});

module.exports = r;
Object.assign(module.exports, { bnplPlan, publicConfig, facets, listCars, carDetail, publicUser });
