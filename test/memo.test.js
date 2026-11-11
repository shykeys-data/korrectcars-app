const test = require('node:test');
const assert = require('node:assert');
const { memo, clear } = require('../server/lib/memo');

test('memo: one database call while fresh, a fresh call after clear()', async () => {
  clear();
  let calls = 0;
  const fn = async () => ++calls;
  assert.strictEqual(await memo('k', fn), 1);
  assert.strictEqual(await memo('k', fn), 1);
  assert.strictEqual(calls, 1);
  clear();
  assert.strictEqual(await memo('k', fn), 2);
});

test('memo: callers arriving together share one database call', async () => {
  clear();
  let calls = 0;
  const fn = () => new Promise((r) => setTimeout(() => r(++calls), 20));
  const out = await Promise.all([memo('k2', fn), memo('k2', fn), memo('k2', fn)]);
  assert.deepStrictEqual(out, [1, 1, 1]);
});

test('memo: a failed call is not kept', async () => {
  clear();
  await assert.rejects(memo('k3', async () => { throw new Error('db down'); }));
  assert.strictEqual(await memo('k3', async () => 'ok'), 'ok');
});
