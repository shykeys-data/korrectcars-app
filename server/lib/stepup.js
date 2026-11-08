// Extra sign-in check for sellers (dealers and private sellers), only when something looks unusual (Nov 2026).
// A seller signs in with email and password as usual. We email a 6-digit code first when:
//   - this browser is not one they have proved before (no trusted-device cookie; kept 90 days),
//   - there were 3 or more wrong passwords before this one,
//   - the sign-in comes from outside Nigeria (Cloudflare's country header).
// A password reset logs every other device out (their trusted devices are forgotten).
// Team changes (invite, remove) also need a device trusted for at least a day, or a fresh code.
// Codes and device tokens are stored only as hashes. Staff keep their own two-step login (authenticator app).
const crypto = require('crypto');
const config = require('../config');
const { q, one } = require('../db');
const mail = require('./mail');

const COOKIE = 'kc_td';
const DEVICE_DAYS = 90;
const sqlTime = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const hash = (s) => crypto.createHmac('sha256', config.jwtSecret).update(String(s)).digest('hex');
const toDate = (v) => new Date(String(v).replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z'));
const isSeller = async (userId) => !!(await one('SELECT m.id FROM dealer_members m WHERE m.user_id = ? AND m.dealer_id <> 1 LIMIT 1', [userId]));

// The trusted-device row for this browser, or null
async function device(req, userId) {
  const tok = req.cookies && req.cookies[COOKIE];
  if (!tok || !/^[a-f0-9]{64}$/.test(tok)) return null;
  return one('SELECT id, created_at FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > ?', [userId, hash(tok), sqlTime(0)]);
}
const label = (req) => String(req.get('user-agent') || 'Unknown browser').replace(/[^\w .;:/()-]/g, '').slice(0, 120);

// Why this sign-in needs a code (null = it doesn't)
async function riskReason(req, user, failedBefore) {
  if (!(await isSeller(user.id))) return null;
  const country = String(req.get('cf-ipcountry') || '').toUpperCase();
  if (country && country !== 'NG' && country !== 'XX') return 'outside Nigeria';
  if (failedBefore >= 3) return 'several wrong passwords';
  if (!(await device(req, user.id))) return 'new device';
  return null;
}

async function sendCode(user, reason) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await q('UPDATE login_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [sqlTime(0), user.id]);
  await q('INSERT INTO login_codes (user_id, code_hash, reason, expires_at) VALUES (?, ?, ?, ?)', [user.id, hash(`${user.id}:${code}`), reason, sqlTime(10 * 60 * 1000)]);
  await mail.send({ to: user.email, ...mail.templates.loginCode(user.name.split(' ')[0], code, reason) });
}

// true if the code is right (it is then used up)
async function checkCode(userId, code) {
  const row = await one('SELECT * FROM login_codes WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', [userId, sqlTime(0)]);
  if (!row || row.attempts >= 5) return false;
  const ok = /^\d{6}$/.test(String(code || '')) && crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(`${userId}:${code}`)));
  if (ok) await q('UPDATE login_codes SET used_at = ? WHERE id = ?', [sqlTime(0), row.id]);
  else await q('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
  return ok;
}

// Remember this browser for 90 days; tell the owner of the account by email
async function trust(req, res, user, { quiet = false } = {}) {
  if (await device(req, user.id)) return;
  const tok = crypto.randomBytes(32).toString('hex');
  await q('INSERT INTO trusted_devices (user_id, token_hash, label, expires_at) VALUES (?, ?, ?, ?)', [user.id, hash(tok), label(req), sqlTime(DEVICE_DAYS * 86400000)]);
  res.cookie(COOKIE, tok, { httpOnly: true, secure: config.isProd, sameSite: 'lax', maxAge: DEVICE_DAYS * 86400000, path: '/' });
  if (!quiet) mail.send({ to: user.email, ...mail.templates.newDevice(user.name.split(' ')[0], label(req)) }).catch((e) => console.error('New device email failed:', e.message));
}
const forgetDevices = (userId) => q('DELETE FROM trusted_devices WHERE user_id = ?', [userId]);

// For team changes: a device trusted for a day or more, or a code sent just now. Returns true when allowed.
async function sensitiveOk(req) {
  const d = await device(req, req.user.id);
  if (d && Date.now() - toDate(d.created_at).getTime() >= 86400000) return true;
  return req.body && req.body.stepCode ? checkCode(req.user.id, req.body.stepCode) : false;
}

module.exports = { COOKIE, riskReason, sendCode, checkCode, trust, forgetDevices, sensitiveOk, device };
