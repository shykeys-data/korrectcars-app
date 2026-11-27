// End-to-end API tests: starts the real app on a fresh SQLite database and checks sign-in, two-step login,
// staff permissions, request-origin protection, Pay Small Small figures, validation and the health check.
// Run with: node --test test/*.test.js   (no MySQL or internet needed)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-test-'));
const DBFILE = path.join(TMP, 'test.db');
const PORT = 3400 + Math.floor(Math.random() * 400);
const B = `http://127.0.0.1:${PORT}`;
const ENV = { ...process.env, DB_DRIVER: 'sqlite', SQLITE_FILE: DBFILE, PORT: String(PORT), MAIL_DISABLED: '1', ADSENSE_CLIENT: '', GA_ID: '', ADMIN_PATH: 'staff-test-address-1', PRIVATE_DIR: path.join(TMP, 'private'), TOTP_KEY: 'a'.repeat(64), NODE_ENV: 'test' };
let app;

const sqlite = () => new (require('node:sqlite').DatabaseSync)(DBFILE);
async function call(method, p, { body, cookie, origin = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers['x-requested-with'] = 'korrect';
  if (cookie) headers.cookie = cookie;
  const r = await fetch(B + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  let json = {}; try { json = await r.json(); } catch (_e) { /* not JSON */ }
  return { status: r.status, json, cookie: set ? set.split(';')[0] : null };
}
async function makeUser(email, role) {
  const pw = 'testpass123';
  const r = await call('POST', '/api/auth/register', { body: { name: 'Test Person', email, phone: '08012345678', password: pw } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  const db = sqlite(); db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email); db.close();
  if (role) execFileSync(process.execPath, [path.join(ROOT, 'server/tools-make-staff.js'), email, role], { env: ENV, stdio: 'pipe' });
  const l = await call('POST', '/api/auth/login', { body: { email, password: pw } });
  assert.strictEqual(l.status, 200, JSON.stringify(l.json));
  return l.cookie;
}

before(async () => {
  app = spawn(process.execPath, ['app.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(B + '/api/health')).ok) return; } catch (_e) { /* not up yet */ }
    await new Promise((s) => setTimeout(s, 200));
  }
  throw new Error('App did not start:\n' + log);
});
after(() => { if (app) app.kill(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('health check answers with the database status', async () => {
  const r = await call('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.db, 'ok');
});

test('changes are refused without the site\'s own request header (CSRF guard)', async () => {
  const r = await call('POST', '/api/auth/login', { body: { email: 'x@example.com', password: 'whatever1' }, origin: false });
  assert.strictEqual(r.status, 403);
});

test('unknown API address gives a JSON 404, unknown page gives a 404 page', async () => {
  assert.strictEqual((await call('GET', '/api/no-such-thing')).status, 404);
  assert.strictEqual((await fetch(B + '/no-such-page-here')).status, 404);
});

test('a new account cannot sign in until the email is confirmed', async () => {
  const email = 'pending@example.com';
  await call('POST', '/api/auth/register', { body: { name: 'Pending Person', email, phone: '08012345678', password: 'testpass123' } });
  const l = await call('POST', '/api/auth/login', { body: { email, password: 'testpass123' } });
  assert.strictEqual(l.status, 403);
  assert.ok(l.json.unverified);
});

test('wrong passwords lock the account after 5 tries', async () => {
  await makeUser('locked@example.com');
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/auth/login', { body: { email: 'locked@example.com', password: 'wrongpass999' } });
  assert.strictEqual(last.status, 423);
});

test('a customer account can never reach the staff API', async () => {
  const cookie = await makeUser('customer@example.com');
  for (const p of ['/api/admin/cars', '/api/admin/users', '/api/admin/posts']) assert.strictEqual((await call('GET', p, { cookie })).status, 403, p);
  assert.strictEqual((await call('POST', '/api/auth/2fa/setup', { cookie })).status, 403);
});

test('staff need two-step login; the secret is stored encrypted; the right code opens the staff API', async () => {
  const totp = require('../server/lib/totp');
  let cookie = await makeUser('staff@example.com', 'admin');
  assert.strictEqual((await call('GET', '/api/admin/cars', { cookie })).json.needs2fa, 'setup');
  const s = await call('POST', '/api/auth/2fa/setup', { cookie });
  assert.strictEqual(s.status, 200);
  const stored = (() => { const db = sqlite(); const v = db.prepare('SELECT totp_secret FROM users WHERE email = ?').get('staff@example.com').totp_secret; db.close(); return v; })();
  assert.ok(stored.startsWith('v1:'), 'secret must be encrypted in the database');
  assert.ok(!stored.includes(s.json.secret), 'plain secret must not appear in the database');
  assert.strictEqual((await call('POST', '/api/auth/2fa/enable', { cookie, body: { code: '000000' } })).status, 400);
  const on = await call('POST', '/api/auth/2fa/enable', { cookie, body: { code: totp.hotp(s.json.secret, Math.floor(Date.now() / 30000)) } });
  assert.strictEqual(on.status, 200);
  assert.strictEqual(on.json.recoveryCodes.length, 8);
  cookie = on.cookie;
  assert.strictEqual((await call('GET', '/api/admin/cars', { cookie })).status, 200);
  // A fresh sign-in needs the code again; a one-time backup code works once only
  const again = (await call('POST', '/api/auth/login', { body: { email: 'staff@example.com', password: 'testpass123' } })).cookie;
  assert.strictEqual((await call('GET', '/api/admin/cars', { cookie: again })).json.needs2fa, 'verify');
  const backup = on.json.recoveryCodes[0];
  assert.strictEqual((await call('POST', '/api/auth/2fa/verify', { cookie: again, body: { code: backup } })).status, 200);
  assert.strictEqual((await call('POST', '/api/auth/2fa/verify', { cookie: again, body: { code: backup } })).status, 400);
});

test('an editor cannot open admin-only pages', async () => {
  const totp = require('../server/lib/totp');
  let cookie = await makeUser('editor@example.com', 'editor');
  const s = await call('POST', '/api/auth/2fa/setup', { cookie });
  cookie = (await call('POST', '/api/auth/2fa/enable', { cookie, body: { code: totp.hotp(s.json.secret, Math.floor(Date.now() / 30000)) } })).cookie;
  assert.strictEqual((await call('GET', '/api/admin/posts', { cookie })).status, 200);
  assert.strictEqual((await call('GET', '/api/admin/users', { cookie })).status, 403);
});

test('buyer insights: searches and WhatsApp taps are counted once a day, bots skipped, staff see the report', async () => {
  const car = (await call('GET', '/api/cars')).json.cars.find((c) => c.status === 'available');
  const search = (filters, results) => call('POST', '/api/searches', { body: { filters, results } }).then((r) => r.json.result);
  assert.strictEqual(await search({ make: 'Toyota', body: 'SUV' }, 3), 'counted');
  assert.strictEqual(await search({ body: 'SUV', make: 'Toyota' }, 3), 'repeat', 'same search, same visitor, same day: once');
  assert.strictEqual(await search({ make: 'Bentley', maxPrice: '20000000' }, 0), 'counted');
  assert.strictEqual(await search({ sort: 'newest' }, 5), 'empty', 'sorting alone is not a search');
  const tap = (id, place) => call('POST', `/api/cars/${id}/wa`, { body: { place } }).then((r) => r.json.result);
  assert.strictEqual(await tap(car.id, 'card'), 'counted');
  assert.strictEqual(await tap(car.id, 'page'), 'repeat');
  assert.strictEqual(await tap(99999999, 'page'), 'missing');
  const bot = await fetch(`${B}/api/searches`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'korrect', 'user-agent': 'Googlebot/2.1' }, body: JSON.stringify({ filters: { make: 'Lexus' }, results: 1 }) });
  assert.strictEqual((await bot.json()).result, 'skipped');
  // Nothing personal is stored
  const db = sqlite(); const cols = db.prepare('PRAGMA table_info(search_daily)').all().map((c) => c.name).concat(db.prepare('PRAGMA table_info(wa_taps_daily)').all().map((c) => c.name)); db.close();
  assert.ok(!cols.some((c) => /ip|phone|email|name|user/i.test(c)), cols.join(','));

  const totp = require('../server/lib/totp');
  let cookie = await makeUser('insights@example.com', 'admin');
  const s = await call('POST', '/api/auth/2fa/setup', { cookie });
  cookie = (await call('POST', '/api/auth/2fa/enable', { cookie, body: { code: totp.hotp(s.json.secret, Math.floor(Date.now() / 30000)) } })).cookie;
  const rep = (await call('GET', '/api/admin/insights?days=30', { cookie })).json;
  assert.ok(rep.searches.some((r) => r.key === 'make=Toyota|body=SUV' && r.searches === 1));
  assert.deepStrictEqual(rep.noResults.map((r) => r.key), ['make=Bentley|maxPrice=20000000']);
  assert.strictEqual(rep.whatsapp.taps, 1);
  assert.strictEqual(rep.whatsapp.byPlace.card, 1);
  assert.strictEqual(rep.whatsapp.cars[0].id, car.id);
  assert.strictEqual((await call('GET', '/api/admin/insights')).status === 200, false, 'staff only');
});

test('Pay Small Small estimate: 40% deposit and 20% charge on the balance', async () => {
  const r = await call('GET', '/api/bnpl/quote?price=10000000&deposit=0&months=12');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.json.deposit, r.json.balance, r.json.repay, r.json.monthly], [4000000, 6000000, 7200000, 600000]);
  assert.strictEqual((await call('GET', '/api/bnpl/quote?price=abc')).status, 400);
});

test('form validation answers with a clear message, never a crash', async () => {
  const r = await call('POST', '/api/enquiries', { body: { type: 'contact', name: 'A', phone: '1' } });
  assert.strictEqual(r.status, 400);
  assert.ok(r.json.error && typeof r.json.error === 'string');
  const junk = await call('POST', '/api/auth/login', { body: { email: { $gt: '' }, password: ['x'] } });
  assert.strictEqual(junk.status, 400);
});

test('partner dealer sign-up is closed while the Partner dealers switch is off (live default)', async () => {
  assert.strictEqual((await call('POST', '/api/dealer/signup/code', { body: { email: 'dealer@example.com' } })).status, 404);
  assert.strictEqual((await call('GET', '/api/dealer/me')).status, 404);
});

test('the VIN check explains Japanese chassis numbers instead of rejecting them', async () => {
  const r = await call('GET', '/api/vin/NZE121-3123456');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.json.chassis, r.json.valid], [true, false]);
});

test('ads.txt is served directly (no redirect) with the AdSense publisher line', async () => {
  const r = await fetch(B + '/ads.txt', { redirect: 'manual' });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /^google\.com, pub-9741732903227479, DIRECT, f08c47fec0942fa0/);
});

test('installable site: manifest, service worker and offline page', async () => {
  const m = await fetch(B + '/manifest.webmanifest');
  assert.strictEqual(m.status, 200);
  assert.match(m.headers.get('content-type'), /manifest\+json/);
  const j = await m.json();
  assert.strictEqual(j.display, 'standalone');
  assert.strictEqual(j.start_url, '/?source=app');
  assert.ok(j.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'has a maskable icon');
  for (const i of j.icons) assert.ok(fs.existsSync(path.join(ROOT, 'client/public', i.src)), 'icon file exists: ' + i.src);
  const sw = await fetch(B + '/sw.js');
  if (fs.existsSync(path.join(ROOT, 'dist/sw.js'))) {
    assert.strictEqual(sw.status, 200);
    assert.strictEqual(sw.headers.get('cache-control'), 'no-cache');
    const code = await sw.text();
    assert.doesNotMatch(code, /__BUILD__/, 'build version filled in');
    assert.match(code, /\/api\//, 'API requests are left alone');
  }
  const home = await (await fetch(B + '/')).text();
  assert.match(home, /rel="manifest" href="\/manifest\.webmanifest"/);
});
