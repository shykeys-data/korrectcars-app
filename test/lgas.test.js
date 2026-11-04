// The state and LGA list: 36 states + FCT, 774 LGAs, the right number in each state, no duplicates.
const { test } = require('node:test');
const assert = require('node:assert');
const { LGAS, STATES, isLga } = require('../server/lib/ng-lgas');

const COUNTS = { Abia: 17, Adamawa: 21, 'Akwa Ibom': 31, Anambra: 21, Bauchi: 20, Bayelsa: 8, Benue: 23, Borno: 27, 'Cross River': 18, Delta: 25, Ebonyi: 13, Edo: 18, Ekiti: 16, Enugu: 17, 'Abuja (FCT)': 6, Gombe: 11, Imo: 27, Jigawa: 27, Kaduna: 23, Kano: 44, Katsina: 34, Kebbi: 21, Kogi: 21, Kwara: 16, Lagos: 20, Nasarawa: 13, Niger: 25, Ogun: 20, Ondo: 18, Osun: 30, Oyo: 33, Plateau: 17, Rivers: 23, Sokoto: 23, Taraba: 16, Yobe: 17, Zamfara: 14 };

test('36 states + FCT and 774 LGAs, the official number in each state', () => {
  assert.strictEqual(STATES.length, 37);
  assert.strictEqual(Object.values(LGAS).flat().length, 774);
  for (const [s, n] of Object.entries(COUNTS)) {
    assert.strictEqual(LGAS[s].length, n, s);
    assert.strictEqual(new Set(LGAS[s]).size, n, `${s} has a duplicate`);
  }
});
test('an LGA only counts in its own state', () => {
  assert.ok(isLga('Lagos', 'Ikeja'));
  assert.ok(!isLga('Lagos', 'Bwari'));
  assert.ok(isLga('Abuja (FCT)', 'Bwari'));
});
