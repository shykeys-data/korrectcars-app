const test = require('node:test');
const assert = require('node:assert');
const vin = require('../server/lib/vin');
test('VIN cleaning and check digit (ISO 3779)', () => {
  assert.strictEqual(vin.clean(' 1hgcm8263-3a004352 '), '1HGCM82633A004352');
  assert.ok(vin.checkDigitOk('1HGCM82633A004352'));
  assert.ok(!vin.checkDigitOk('1HGCM82643A004352'));
  assert.ok(vin.VALID.test('1HGCM82633A004352'));
  assert.ok(!vin.VALID.test('1HGCM8263OA004352')); // letter O never used
});
test('bad VINs are explained without calling the decoder', async () => {
  const a = await vin.decode('1HGCM8263OA004352'); assert.strictEqual(a.valid, false); assert.match(a.message, /I, O or Q/);
  const b = await vin.decode('ABC'); assert.strictEqual(b.valid, false); assert.match(b.message, /17/);
});
