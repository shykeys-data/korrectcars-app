// Two-step login codes and the encryption of the stored secret
const { test } = require('node:test');
const assert = require('node:assert');
process.env.TOTP_KEY = 'b'.repeat(64);
const totp = require('../server/lib/totp');

test('RFC 6238 test vector (SHA-1, 59 seconds)', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.strictEqual(totp.hotp(secret, 1), '287082'); // last 6 digits of 94287082
  assert.ok(totp.verify(secret, '287082', 59 * 1000));
  assert.ok(!totp.verify(secret, '287083', 59 * 1000));
});

test('sealed secret opens to the original; tampering or a wrong key fails safely', () => {
  const s = totp.newSecret();
  const sealed = totp.seal(s);
  assert.ok(sealed.startsWith('v1:') && !sealed.includes(s));
  assert.notStrictEqual(totp.seal(s), sealed); // fresh IV every time
  assert.strictEqual(totp.open(sealed), s);
  const b = Buffer.from(sealed.slice(3), 'base64'); b[b.length - 1] ^= 1;
  assert.strictEqual(totp.open('v1:' + b.toString('base64')), null);
  assert.strictEqual(totp.open('PLAINOLDSECRET'), 'PLAINOLDSECRET'); // not yet encrypted rows keep working
});

test('existing plain secrets are encrypted once at start-up', async () => {
  const rows = [{ id: 1, totp_secret: 'JBSWY3DPEHPK3PXP' }, { id: 2, totp_secret: totp.seal('KRSXG5DSNFXGOIDB') }];
  const db = { q: async (sql, p) => { if (/^SELECT/.test(sql)) return rows; rows.find((r) => r.id === p[1]).totp_secret = p[0]; return {}; } };
  assert.strictEqual(await totp.encryptExisting(db), 1);
  assert.strictEqual(totp.open(rows[0].totp_secret), 'JBSWY3DPEHPK3PXP');
  assert.strictEqual(await totp.encryptExisting(db), 0);
});
