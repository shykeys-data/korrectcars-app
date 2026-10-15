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

module.exports = { newSecret, verify, otpauthUrl, hotp, newRecoveryCodes, hashCode: sha, base32Decode, base32Encode };
