// Time-based one-time codes (RFC 6238), the 6-digit codes shown by Google Authenticator,
// Microsoft Authenticator, Authy, etc. No external library needed.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const c of s) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
const newSecret = () => base32Encode(crypto.randomBytes(20));
// Accepts the current code and one step either side (phone clocks drift a little)
function verify(secret, code, at = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  const step = Math.floor(at / 30000);
  for (const d of [-1, 0, 1]) {
    const exp = hotp(secret, step + d);
    if (crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c))) return true;
  }
  return false;
}
const otpauthUrl = (secret, account, issuer = 'Korrect Cars') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
// One-time backup codes: shown once, stored only as hashes
const sha = (t) => crypto.createHash('sha256').update(String(t).replace(/[^a-z0-9]/gi, '').toLowerCase()).digest('hex');
function newRecoveryCodes(n = 8) { return Array.from({ length: n }, () => crypto.randomBytes(5).toString('hex').replace(/(.{5})/, '$1-')); }

// The 2FA secret is stored encrypted (AES-256-GCM), so a copy of the database alone cannot make staff codes.
// Key: TOTP_KEY (64 hex characters) if set, otherwise a random key made once and kept in the private folder
// outside the app (config.privateDir), never in Git or the web folder. Stored format: "v1:" + base64(iv | tag | ciphertext).
// Old plain-text secrets still work and are encrypted at start-up (encryptExisting).
let KEY = null;
function key() {
  if (KEY) return KEY;
  const env = process.env.TOTP_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) return (KEY = Buffer.from(env, 'hex'));
  const fs = require('fs'); const path = require('path');
  const dir = require('../config').privateDir; // outside the app folder, so a redeploy or git clean can never delete it
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, '.totp-key');
  try { const k = fs.readFileSync(file, 'utf8').trim(); if (/^[0-9a-f]{64}$/i.test(k)) return (KEY = Buffer.from(k, 'hex')); } catch (_e) { /* create below */ }
  const k = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, k, { mode: 0o600 });
  return (KEY = Buffer.from(k, 'hex'));
}
function seal(secret) {
  if (!secret) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(secret), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function open(stored) {
  if (!stored) return null;
  if (!String(stored).startsWith('v1:')) return stored; // not yet encrypted
  try {
    const b = Buffer.from(String(stored).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (_e) { return null; } // wrong key or tampered: the code simply fails
}
const isSealed = (v) => String(v || '').startsWith('v1:');
async function encryptExisting(db) {
  const rows = await db.q("SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL AND totp_secret <> ''");
  let n = 0;
  for (const r of rows) if (!isSealed(r.totp_secret)) { await db.q('UPDATE users SET totp_secret = ? WHERE id = ?', [seal(r.totp_secret), r.id]); n++; }
  return n;
}

module.exports = { seal, open, isSealed, encryptExisting, newSecret, verify, otpauthUrl, hotp, newRecoveryCodes, hashCode: sha, base32Decode, base32Encode };
