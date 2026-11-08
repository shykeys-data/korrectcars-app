// Partner dealers, end to end on a fresh SQLite database: email code before any account, phone code, business
// papers, staff review, VIN rules, one live listing per VIN and dealers kept apart from each other.
// Run with: node --test test/*.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkDigit } = require('../server/lib/vehicle-id');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-dealer-'));
const DBFILE = path.join(TMP, 'test.db');
const PORT = 4200 + Math.floor(Math.random() * 400);
const B = `http://127.0.0.1:${PORT}`;
// A staging address switches the Partner dealers feature on and lets the phone step show test codes
const ENV = { ...process.env, DB_DRIVER: 'sqlite', SQLITE_FILE: DBFILE, PORT: String(PORT), MAIL_DISABLED: '1', ADSENSE_CLIENT: '', GA_ID: '', ADMIN_PATH: 'staff-test-address-2', PRIVATE_DIR: path.join(TMP, 'private'), TOTP_KEY: 'c'.repeat(64), NODE_ENV: 'test', SITE_URL: 'http://staging.localhost', TERMII_API_KEY: '', SMS_OTP: 'on' };
let app; let log = '';
const sqlite = () => { const db = new (require('node:sqlite').DatabaseSync)(DBFILE); db.exec('PRAGMA busy_timeout = 3000'); return db; }; // the app may be writing (photo fingerprints) at the same moment
// A real-looking VIN with a correct check digit, different for each n
const makeVin = (n) => { const base = `1HGCM826X3A${String(n).padStart(6, '0')}`; return base.slice(0, 8) + checkDigit(base) + base.slice(9); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');

// Each call comes from its own address (the app trusts one proxy, like Apache on the server) unless ip is given
let n = 0;
async function call(method, p, { body, cookie, form, ip } = {}) {
  const headers = { 'x-requested-with': 'korrect', 'x-forwarded-for': ip || `10.1.${Math.floor(++n / 250)}.${n % 250}` };
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) payload = form; else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + p, { method, headers, body: payload });
  const set = r.headers.get('set-cookie');
  let json = {}; try { json = await r.json(); } catch (_e) { /* not JSON */ }
  return { status: r.status, json, cookie: set ? set.split(';')[0] : null };
}
const codeFor = (email) => { const m = [...log.matchAll(new RegExp(`To: ${email.replace(/[.+]/g, '\\$&')} \\| (\\d{6}) is your`, 'g'))]; return m.length ? m[m.length - 1][1] : null; };
const mailsTo = (email) => log.split('\n').filter((l) => l.includes(`To: ${email} |`)).length;
const wait = (ms) => new Promise((s) => setTimeout(s, ms));

// Email code -> account -> phone -> business; returns the signed-in cookie
async function signUp(email, { business = 'Ade Motors Ltd', cac = '1234567', phone = '08031234567', personal = null } = {}) {
  assert.strictEqual((await call('POST', '/api/dealer/signup/code', { body: { email } })).status, 200);
  await wait(50);
  const v = await call('POST', '/api/dealer/signup/verify', { body: { email, code: codeFor(email) } });
  assert.strictEqual(v.status, 200, JSON.stringify(v.json));
  const a = await call('POST', '/api/dealer/signup/account', { body: { pass: v.json.pass, name: 'Ade Bello', phone, password: 'blue horse river 7' } });
  assert.strictEqual(a.status, 201, JSON.stringify(a.json));
  const cookie = a.cookie;
  const s = await call('POST', '/api/dealer/phone/send', { cookie, body: {} });
  assert.strictEqual(s.status, 200, JSON.stringify(s.json));
  assert.strictEqual((await call('POST', '/api/dealer/phone/verify', { cookie, body: { code: s.json.testCode } })).status, 200);
  if (personal) { // selling my own car: no CAC; an ID and a selfie are optional
    const pf = new FormData();
    for (const [k, val] of Object.entries({ displayName: personal.name || 'Tunde Ojo', state: 'Lagos', lga: 'Surulere', ...(personal.idType ? { idType: personal.idType } : {}) })) pf.append(k, val);
    if (personal.idType) { pf.append('idDoc', new Blob([PNG], { type: 'image/png' }), 'id.png'); pf.append('selfie', new Blob([PNG], { type: 'image/png' }), 'me.png'); }
    const pd = await call('POST', '/api/dealer/personal', { cookie, form: pf });
    assert.strictEqual(pd.status, 201, JSON.stringify(pd.json));
    return { cookie, dealer: pd.json.dealer };
  }
  const f = new FormData();
  for (const [k, val] of Object.entries({ businessName: business, cacType: 'RC', cacNumber: cac, state: 'Lagos', lga: 'Ikeja', address: '12 Allen Avenue, Ikeja' })) f.append(k, val);
  f.append('cac', new Blob([PNG], { type: 'image/png' }), 'cac.png');
  const d = await call('POST', '/api/dealer', { cookie, form: f });
  assert.strictEqual(d.status, 201, JSON.stringify(d.json));
  return { cookie, dealer: d.json.dealer };
}
function carForm(vin, extra = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ title: '2016 Toyota Camry SE', make: 'Toyota', model: 'Camry', body: 'Sedan', year: '2016', price: '9500000', mileage: '68,000 miles', vin, ...extra })) f.append(k, v);
  f.append('photos', new Blob([PNG], { type: 'image/png' }), 'car.png');
  return f;
}
async function staff() {
  const totp = require('../server/lib/totp');
  const email = 'reviewer@example.com';
  await call('POST', '/api/auth/register', { body: { name: 'Staff Reviewer', email, phone: '08012345678', password: 'testpass123' } });
  const db = sqlite(); db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email); db.close();
  execFileSync(process.execPath, [path.join(ROOT, 'server/tools-make-staff.js'), email, 'sales'], { env: ENV, stdio: 'pipe' });
  let cookie = (await call('POST', '/api/auth/login', { body: { email, password: 'testpass123' } })).cookie;
  const s = await call('POST', '/api/auth/2fa/setup', { cookie });
  cookie = (await call('POST', '/api/auth/2fa/enable', { cookie, body: { code: totp.hotp(s.json.secret, Math.floor(Date.now() / 30000)) } })).cookie;
  return cookie;
}

before(async () => {
  app = spawn(process.execPath, ['app.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(B + '/api/health')).ok) return; } catch (_e) { /* not up yet */ }
    await wait(200);
  }
  throw new Error('App did not start:\n' + log);
});
after(() => { if (app) app.kill(); fs.rmSync(TMP, { recursive: true, force: true }); });

let ade; let staffCookie;

test('temporary email services are refused before any code is sent', async () => {
  const r = await call('POST', '/api/dealer/signup/code', { body: { email: 'someone@mailinator.com' } });
  assert.strictEqual(r.status, 400);
  assert.match(r.json.error, /Temporary/);
  assert.strictEqual(mailsTo('someone@mailinator.com'), 0);
});

test('a wrong code is refused and no account exists until the code is entered', async () => {
  const email = 'wrong@example.com';
  await call('POST', '/api/dealer/signup/code', { body: { email } });
  assert.strictEqual((await call('POST', '/api/dealer/signup/verify', { body: { email, code: '000000' } })).status, 400);
  const db = sqlite(); assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get(email).n, 0); db.close();
  assert.strictEqual((await call('POST', '/api/dealer/signup/account', { body: { pass: 'made-up', name: 'X Y', phone: '08031234567', password: 'blue horse river 7' } })).status, 400);
});

test('an email gets at most 3 codes an hour, and the answer never changes', async () => {
  const email = 'many@example.com';
  for (let i = 0; i < 4; i++) {
    const r = await call('POST', '/api/dealer/signup/code', { body: { email } });
    assert.deepStrictEqual([r.status, r.json.sent], [200, true]);
  }
  await wait(100);
  assert.strictEqual(mailsTo(email), 3);
});

test('one connection can ask for at most 10 codes an hour', async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/dealer/signup/code', { body: { email: `ip${i}@example.com` }, ip: '10.9.9.9' })).status);
  assert.deepStrictEqual([codes[9], codes[10]], [200, 429]);
});

test('an email that already has an account gets a sign-in email, not a code', async () => {
  const email = 'customer@example.com';
  await call('POST', '/api/auth/register', { body: { name: 'Old Customer', email, phone: '08012345678', password: 'testpass123' } });
  const r = await call('POST', '/api/dealer/signup/code', { body: { email } });
  assert.deepStrictEqual([r.status, r.json.sent], [200, true]);
  await wait(100);
  assert.match(log, /To: customer@example\.com \| You already have a Korrect Cars account/);
});

test('weak passwords are refused at the account step', async () => {
  const email = 'weak@example.com';
  await call('POST', '/api/dealer/signup/code', { body: { email } }); await wait(50);
  const v = await call('POST', '/api/dealer/signup/verify', { body: { email, code: codeFor(email) } });
  const a = await call('POST', '/api/dealer/signup/account', { body: { pass: v.json.pass, name: 'Weak Person', phone: '08031234567', password: 'password123' } });
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.json.field, 'password');
});

test('full sign-up: email code, account, phone code, business papers -> waiting for review', async () => {
  ade = await signUp('ade@example.com');
  assert.strictEqual(ade.dealer.status, 'pending_review');
  assert.strictEqual(ade.dealer.liveLimit, 50);
  const db = sqlite();
  const doc = db.prepare('SELECT * FROM dealer_documents').get();
  db.close();
  assert.strictEqual(doc.kind, 'cac');
  assert.ok(fs.existsSync(path.join(TMP, 'private', doc.file_key)), 'CAC file kept in the private folder');
  assert.ok(!fs.existsSync(path.join(ROOT, 'uploads', 'public', doc.file_key)));
});

test('the business step needs a confirmed phone, and a CAC number can be used once', async () => {
  const email = 'nophone@example.com';
  await call('POST', '/api/dealer/signup/code', { body: { email } }); await wait(50);
  const v = await call('POST', '/api/dealer/signup/verify', { body: { email, code: codeFor(email) } });
  const a = await call('POST', '/api/dealer/signup/account', { body: { pass: v.json.pass, name: 'No Phone', phone: '08091112222', password: 'green lamp ocean 4' } });
  const f = new FormData(); f.append('businessName', 'No Phone Autos'); f.append('cacType', 'RC'); f.append('cacNumber', '1234567');
  assert.strictEqual((await call('POST', '/api/dealer', { cookie: a.cookie, form: f })).json.step, 'phone');
  const s = await call('POST', '/api/dealer/phone/send', { cookie: a.cookie, body: {} });
  await call('POST', '/api/dealer/phone/verify', { cookie: a.cookie, body: { code: s.json.testCode } });
  const g = new FormData();
  for (const [k, val] of Object.entries({ businessName: 'Copy Motors', cacType: 'RC', cacNumber: 'RC 1234567', state: 'Lagos', lga: 'Ikeja', address: '1 Copy Street, Ikeja' })) g.append(k, val);
  g.append('cac', new Blob([PNG], { type: 'image/png' }), 'cac.png');
  const r = await call('POST', '/api/dealer', { cookie: a.cookie, form: g });
  assert.strictEqual(r.status, 409);
  // Business name, CAC number, state, LGA and the certificate are all required; the certificate is a PDF or photo
  const base = { businessName: 'Rules Motors', cacType: 'RC', cacNumber: '8881234', state: 'Lagos', lga: 'Ikeja', address: '1 Rules Street, Ikeja' };
  const send = async (fields, file) => {
    const fd = new FormData(); for (const [k, val] of Object.entries(fields)) if (val !== undefined) fd.append(k, val);
    if (file) fd.append('cac', file[0], file[1]);
    return call('POST', '/api/dealer', { cookie: a.cookie, form: fd });
  };
  const png = [new Blob([PNG], { type: 'image/png' }), 'cac.png'];
  for (const [missing, fieldName] of [['businessName', 'businessName'], ['cacNumber', 'cacNumber'], ['state', 'state'], ['lga', 'lga']]) {
    const res = await send({ ...base, [missing]: undefined }, png);
    assert.deepStrictEqual([res.status, res.json.field], [400, fieldName], `missing ${missing}`);
  }
  assert.deepStrictEqual([(await send(base)).status, (await send(base)).json.field], [400, 'cac'], 'no certificate');
  assert.strictEqual((await send(base, [new Blob(['just some text, not a certificate'], { type: 'text/plain' }), 'cac.txt'])).status, 400, 'a text file is refused');
  // The LGA must belong to the chosen state
  const h = new FormData();
  for (const [k, val] of Object.entries({ businessName: 'Wrong Area Motors', cacType: 'RC', cacNumber: '5551234', state: 'Lagos', lga: 'Bwari', address: '1 Some Street, Ikeja' })) h.append(k, val);
  h.append('cac', new Blob([PNG], { type: 'image/png' }), 'cac.png');
  const w = await call('POST', '/api/dealer', { cookie: a.cookie, form: h });
  assert.deepStrictEqual([w.status, w.json.field], [400, 'lga']);
});

test('phone codes: wrong codes are counted and a number gets at most 3 a day', async () => {
  const email = 'phone@example.com';
  await call('POST', '/api/dealer/signup/code', { body: { email } }); await wait(50);
  const v = await call('POST', '/api/dealer/signup/verify', { body: { email, code: codeFor(email) } });
  const { cookie } = await call('POST', '/api/dealer/signup/account', { body: { pass: v.json.pass, name: 'Phone Person', phone: '08055556666', password: 'yellow kite paper 3' } });
  assert.strictEqual((await call('POST', '/api/dealer/phone/send', { cookie, body: { phone: '12345' } })).status, 400);
  for (let i = 0; i < 3; i++) assert.strictEqual((await call('POST', '/api/dealer/phone/send', { cookie, body: {} })).status, 200);
  assert.strictEqual((await call('POST', '/api/dealer/phone/send', { cookie, body: {} })).status, 429);
  assert.strictEqual((await call('POST', '/api/dealer/phone/verify', { cookie, body: { code: '999999' } })).status, 400);
});

test('VIN check: rules first, then free / yours / taken', async () => {
  const bad = await call('GET', '/api/dealer/vin-check?vin=1HGCM82633A00435O&decode=0', { cookie: ade.cookie });
  assert.strictEqual(bad.status, 422);
  assert.strictEqual(bad.json.code, 'VIN_INVALID');
  const wrongDigit = await call('GET', `/api/dealer/vin-check?vin=${makeVin(1).slice(0, 8)}${makeVin(1)[8] === '0' ? '1' : '0'}${makeVin(1).slice(9)}&decode=0`, { cookie: ade.cookie });
  assert.strictEqual(wrongDigit.status, 422, 'a US VIN with a wrong check digit is a typo');
  const ok = await call('GET', `/api/dealer/vin-check?vin=${makeVin(1).toLowerCase()}&decode=0`, { cookie: ade.cookie });
  assert.deepStrictEqual([ok.status, ok.json.state, ok.json.value], [200, 'free', makeVin(1)]);
});

test('a waiting dealer\'s car is saved but stays off the site until approval', async () => {
  const r = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(1)) });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  assert.strictEqual(r.json.car.status, 'pending');
  const pub = await call('GET', '/api/cars');
  assert.ok(!pub.json.cars.some((c) => c.id === r.json.car.id));
  assert.strictEqual((await call('GET', '/api/cars/' + r.json.car.slug)).status, 404, 'not even by its web address');
  assert.strictEqual((await fetch(B + '/cars/' + r.json.car.slug)).status, 404);
  const again = await call('GET', `/api/dealer/vin-check?vin=${makeVin(1)}&decode=0`, { cookie: ade.cookie });
  assert.strictEqual(again.json.state, 'yours');
});

test('a signed-in dealer is marked as one, so the header shows "My dealer page"', async () => {
  const me = await call('GET', '/api/auth/me', { cookie: ade.cookie });
  assert.strictEqual(me.json.user.dealer.status, 'pending_review');
});

test('dealers cannot open the staff review, staff can approve, and waiting cars go live', async () => {
  assert.strictEqual((await call('GET', '/api/admin/dealers', { cookie: ade.cookie })).status, 403);
  staffCookie = await staff();
  const list = await call('GET', '/api/admin/dealers', { cookie: staffCookie });
  assert.strictEqual(list.status, 200);
  assert.ok(list.json.waiting >= 1);
  const d = list.json.dealers.find((x) => x.business_name === 'Ade Motors Ltd');
  const detail = await call('GET', `/api/admin/dealers/${d.id}`, { cookie: staffCookie });
  assert.strictEqual(detail.json.documents.length, 1);
  const doc = await fetch(`${B}/api/admin/dealers/${d.id}/documents/${detail.json.documents[0].id}`, { headers: { cookie: staffCookie } });
  assert.strictEqual(doc.status, 200);
  assert.strictEqual(doc.headers.get('cache-control'), 'no-store');
  assert.strictEqual((await call('POST', `/api/admin/dealers/${d.id}/decision`, { cookie: staffCookie, body: { decision: 'reject' } })).status, 400, 'a refusal needs a note');
  const ok = await call('POST', `/api/admin/dealers/${d.id}/decision`, { cookie: staffCookie, body: { decision: 'approve' } });
  assert.deepStrictEqual([ok.status, ok.json.status, ok.json.carsChanged], [200, 'approved', 1]);
  const pub = await call('GET', '/api/cars');
  assert.ok(pub.json.cars.some((c) => c.title === '2016 Toyota Camry SE'));
  const db = sqlite(); assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'Viewed dealer paper%'").get().n >= 1); db.close();
});

test('a second dealer cannot list a car that is already live (VIN_TAKEN, can claim)', async () => {
  const bisi = await signUp('bisi@example.com', { business: 'Bisi Autos', cac: '7654321', phone: '08077778888' });
  const r = await call('POST', '/api/dealer/cars', { cookie: bisi.cookie, form: carForm(makeVin(1).replace(/^1H/, '1h')) });
  assert.strictEqual(r.status, 409, JSON.stringify(r.json));
  assert.deepStrictEqual([r.json.code, r.json.canClaim], ['VIN_TAKEN', true]);
  const check = await call('GET', `/api/dealer/vin-check?vin=${makeVin(1)}&decode=0`, { cookie: bisi.cookie });
  assert.strictEqual(check.json.state, 'taken');
  // Dealers are kept apart: Bisi sees none of Ade's cars and cannot change them
  const mine = await call('GET', '/api/dealer/cars', { cookie: bisi.cookie });
  assert.strictEqual(mine.json.cars.length, 0);
  const adeCar = (await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars[0];
  assert.strictEqual((await call('GET', `/api/dealer/cars/${adeCar.id}`, { cookie: bisi.cookie })).status, 404);
  assert.strictEqual((await call('PUT', `/api/dealer/cars/${adeCar.id}`, { cookie: bisi.cookie, form: carForm(makeVin(1)) })).status, 404);
  assert.strictEqual((await call('POST', `/api/dealer/cars/${adeCar.id}/status`, { cookie: bisi.cookie, body: { status: 'hidden' } })).status, 404);
  // Once Ade marks it sold, the VIN is free again (sold cars keep their history but hold nothing)
  assert.strictEqual((await call('POST', `/api/dealer/cars/${adeCar.id}/status`, { cookie: ade.cookie, body: { status: 'sold' } })).status, 200);
  const relist = await call('POST', '/api/dealer/cars', { cookie: bisi.cookie, form: carForm(makeVin(1)) });
  assert.strictEqual(relist.status, 201, JSON.stringify(relist.json));
});

test('ten saves of the same new VIN at the same moment: exactly one wins', async () => {
  const vin = makeVin(77);
  const results = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(vin) })));
  const codes = results.map((r) => r.status).sort();
  assert.strictEqual(codes.filter((c) => c === 201).length, 1, codes.join(','));
  assert.strictEqual(codes.filter((c) => c === 409).length, 9, codes.join(','));
  const db = sqlite();
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM cars WHERE vin = ? AND status IN ('pending','available','reserved')").get(vin).n, 1);
  db.close();
});

test('a car for sale needs its mileage, and a price or "Call for price"; such cars stay out of price filters', async () => {
  const noMiles = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(81), { mileage: '' }) });
  assert.strictEqual(noMiles.status, 400); assert.match(noMiles.json.error, /mileage/i);
  const noPrice = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(81), { price: '' }) });
  assert.strictEqual(noPrice.status, 400); assert.match(noPrice.json.error, /Call for price/);
  const draft = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(82), { price: '', mileage: '', status: 'hidden' }) });
  assert.strictEqual(draft.status, 201, 'a hidden draft can wait for them');
  const r = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(81), { title: '2015 Toyota Venza XLE', price: '12000000', callForPrice: 'true', location: 'Abuja' }) });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  assert.deepStrictEqual([Number(r.json.car.price), r.json.car.location], [0, 'Ikeja, Lagos'], 'price left out; the car is where the dealer is');
  const all = (await call('GET', '/api/cars')).json.cars;
  assert.ok(all.some((c) => c.title === '2015 Toyota Venza XLE'));
  assert.ok(!(await call('GET', '/api/cars?maxPrice=15000000')).json.cars.some((c) => c.title === '2015 Toyota Venza XLE'), 'not "under ₦15m"');
  const html = await (await fetch(`${B}/cars/${r.json.car.slug}`, { headers: { 'x-forwarded-for': '10.9.9.9' } })).text();
  assert.match(html, /Call for price/);
  assert.strictEqual((await call('GET', `/api/cars/${r.json.car.slug}`)).json.car.seller, 'Ade Motors Ltd', 'the car page names the business buyers pay');
  const page = (await call('GET', `/api/cars/${r.json.car.slug}`)).json.car;
  assert.deepStrictEqual([page.seller_whatsapp, page.state], ['+2348031234567', 'Lagos'], "buyers reach the dealer's own WhatsApp");
  assert.ok((await call('GET', '/api/cars')).json.cars.find((c) => c.slug === r.json.car.slug).seller_whatsapp, 'car cards too');
  assert.doesNotMatch(html, /"Offer","price":0/, 'no ₦0 offer for search engines');
  // Quick status change cannot put a car without mileage on sale
  const d = await call('POST', `/api/dealer/cars/${draft.json.car.id}/status`, { cookie: ade.cookie, body: { status: 'available' } });
  assert.strictEqual(d.status, 400);
});

test('views: once per buyer per car per day; bots and the dealer team are not counted; the dashboard shows today, 7 days, 30 days and all time', async () => {
  const car = (await call('GET', '/api/cars')).json.cars.find((c) => c.seller === 'Ade Motors Ltd');
  assert.ok(car, 'an approved dealer car is public');
  const before = (await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.find((c) => c.id === car.id);
  const view = (opts) => call('POST', `/api/cars/${car.id}/view`, opts);
  assert.strictEqual((await view({ ip: '10.77.0.1' })).json.result, 'counted');
  assert.strictEqual((await view({ ip: '10.77.0.1' })).json.result, 'repeat', 'same buyer, same day');
  assert.strictEqual((await view({ ip: '10.77.0.2' })).json.result, 'counted');
  assert.strictEqual((await view({ cookie: ade.cookie })).json.result, 'own');
  const bot = await fetch(`${B}/api/cars/${car.id}/view`, { method: 'POST', headers: { 'x-requested-with': 'korrect', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'x-forwarded-for': '10.77.0.3' } });
  assert.strictEqual((await bot.json()).result, 'bot');
  assert.strictEqual((await call('GET', `/api/cars/${car.slug}`)).status, 200, 'opening the page data no longer counts by itself');
  const after = (await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.find((c) => c.id === car.id);
  assert.deepStrictEqual([after.views - before.views, after.views_today - before.views_today, after.views_week - before.views_week, after.views_month - before.views_month], [2, 2, 2, 2]);
  const st = (await call('GET', '/api/dealer/stats', { cookie: ade.cookie })).json;
  assert.strictEqual(st.daily.length, 30);
  assert.ok(st.today >= 2 && st.week >= st.today && st.month >= st.week && st.total >= st.month);
  assert.strictEqual(st.daily[29].views, st.today);
  assert.strictEqual((await call('GET', '/api/dealer/stats', { cookie: (await signUp('noview@example.com', { business: 'No View Autos', cac: '5550001', phone: '08055550001' })).cookie })).json.total, 0, 'each dealer sees only their own');
});

test('the staff car form uses the same register', async () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ title: '2016 Toyota Camry SE BF', make: 'Toyota', model: 'Camry', body: 'Sedan', price: '9000000', mileage: '50,000 km', vin: makeVin(77) })) f.append(k, v);
  const r = await call('POST', '/api/admin/cars', { cookie: staffCookie, form: f });
  assert.deepStrictEqual([r.status, r.json.code], [409, 'VIN_TAKEN']);
  const g = new FormData();
  for (const [k, v] of Object.entries({ title: 'Bad VIN car', make: 'Toyota', model: 'Camry', body: 'Sedan', price: '9000000', mileage: '1 km', vin: 'ABC' })) g.append(k, v);
  assert.strictEqual((await call('POST', '/api/admin/cars', { cookie: staffCookie, form: g })).status, 422);
});

test('a new dealer can have 50 cars for sale in the first 3 months', async () => {
  const db = sqlite();
  const id = db.prepare("SELECT id FROM dealers WHERE business_name = 'Ade Motors Ltd'").get().id;
  const live = db.prepare("SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND status IN ('pending','available','reserved')").get(id).n;
  const ins = db.prepare("INSERT INTO cars (slug, title, make, model, body, price, dealer_id, status) VALUES (?, 'Filler', 'Kia', 'Rio', 'Sedan', 1, ?, 'available')");
  for (let i = live; i < 50; i++) ins.run(`filler-${i}`, id);
  db.close();
  const r = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(99)) });
  assert.deepStrictEqual([r.status, r.json.code, r.json.limit], [403, 'LIMIT', 50]);
  const hidden = await call('POST', '/api/dealer/cars', { cookie: ade.cookie, form: carForm(makeVin(99), { status: 'hidden' }) });
  assert.strictEqual(hidden.status, 201, 'a hidden car does not count');
});

test('the dealer pages open (200) and the private ones are kept out of search', async () => {
  const join = await fetch(B + '/dealers/join');
  assert.strictEqual(join.status, 200);
  assert.match(await join.text(), /Sell your car on Korrect Cars/);
  const home = await fetch(B + '/dealer');
  assert.strictEqual(home.status, 200);
  assert.match(await home.text(), /noindex/);
});

test('buyers can search by state and LGA; a car is where its dealer is', async () => {
  const pub = await call('GET', '/api/cars?state=Lagos&lga=Ikeja&limit=100');
  assert.strictEqual(pub.status, 200);
  assert.ok(pub.json.cars.length >= 1, 'Ade Motors (Lagos, Ikeja) has cars for sale');
  assert.ok(pub.json.cars.every((c) => c.state === 'Lagos' && c.lga === 'Ikeja'));
  const lagos = await call('GET', '/api/cars?state=Lagos&limit=100');
  assert.ok(lagos.json.cars.length > pub.json.cars.length, 'Korrect Cars stock counts as Lagos');
  assert.strictEqual((await call('GET', '/api/cars?state=Kano')).json.cars.length, 0);
});

test('an administrator can hand Korrect Cars\' cars to a dealer; codes like BF come off; the limit ignores them', async () => {
  const db = sqlite();
  db.prepare("INSERT INTO cars (slug, title, stock, make, model, body, price, status) VALUES ('buffy-test-car', '2019 Lexus RX 350 BF', 'KC-77 BF', 'Lexus', 'RX', 'SUV', 30000000, 'available')").run();
  const kcCars = db.prepare('SELECT id FROM cars WHERE dealer_id = 1').all().map((r) => r.id);
  const adeId = db.prepare("SELECT id FROM dealers WHERE business_name = 'Ade Motors Ltd'").get().id;
  db.close();
  const before = (await call('GET', '/api/dealer/me', { cookie: ade.cookie })).json.dealer.liveCars;
  // Editors may review dealers but not move stock
  assert.strictEqual((await call('POST', `/api/admin/dealers/${adeId}/move-cars`, { cookie: staffCookie, body: { carIds: kcCars } })).status, 403);
  const totp = require('../server/lib/totp');
  await call('POST', '/api/auth/register', { body: { name: 'Owner Admin', email: 'owner@example.com', phone: '08012345678', password: 'testpass123' } });
  const d2 = sqlite(); d2.prepare("UPDATE users SET email_verified = 1 WHERE email = 'owner@example.com'").run(); d2.close();
  execFileSync(process.execPath, [path.join(ROOT, 'server/tools-make-staff.js'), 'owner@example.com', 'admin'], { env: ENV, stdio: 'pipe' });
  let admin = (await call('POST', '/api/auth/login', { body: { email: 'owner@example.com', password: 'testpass123' } })).cookie;
  const s = await call('POST', '/api/auth/2fa/setup', { cookie: admin });
  admin = (await call('POST', '/api/auth/2fa/enable', { cookie: admin, body: { code: totp.hotp(s.json.secret, Math.floor(Date.now() / 30000)) } })).cookie;
  const r = await call('POST', `/api/admin/dealers/${adeId}/move-cars`, { cookie: admin, body: { carIds: kcCars } });
  assert.deepStrictEqual([r.status, r.json.moved], [200, kcCars.length]);
  const db3 = sqlite();
  const moved = db3.prepare("SELECT * FROM cars WHERE slug = 'buffy-test-car'").get();
  assert.strictEqual(db3.prepare('SELECT COUNT(*) AS n FROM cars WHERE dealer_id = 1').get().n, 0);
  db3.close();
  assert.deepStrictEqual([moved.dealer_id, moved.title, moved.stock, moved.moved_from], [adeId, '2019 Lexus RX 350', 'KC-77', 1]);
  assert.strictEqual((await call('GET', '/api/cars/buffy-test-car')).status, 200, 'same web address');
  assert.strictEqual((await call('GET', '/api/dealer/me', { cookie: ade.cookie })).json.dealer.liveCars, before, 'moved cars do not count towards the limit');
  assert.ok((await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.some((c) => c.slug === 'buffy-test-car'));
});

// ---------- Seller types (Nov 2026): Verified Dealer, Verified Seller, Private Seller (not verified) ----------
let tunde; let kemi;
test('a private seller (no ID) can list 1 car; it waits for a staff check and then shows as "private"', async () => {
  tunde = await signUp('tunde@example.com', { phone: '08035550001', personal: { name: 'Tunde Ojo' } });
  assert.deepStrictEqual([tunde.dealer.kind, tunde.dealer.status, tunde.dealer.liveLimit], ['personal', 'unverified', 1]);
  const first = await call('POST', '/api/dealer/cars', { cookie: tunde.cookie, form: carForm(makeVin(501), { title: '2012 Honda Accord EX' }) });
  assert.deepStrictEqual([first.status, first.json.car.status], [201, 'pending'], 'waits for a staff check');
  const second = await call('POST', '/api/dealer/cars', { cookie: tunde.cookie, form: carForm(makeVin(502)) });
  assert.deepStrictEqual([second.status, second.json.code, second.json.limit], [403, 'LIMIT', 1]);
  assert.match(second.json.error, /Private sellers can list 1 car/);
  assert.ok(!(await call('GET', '/api/cars')).json.cars.some((c) => c.title === '2012 Honda Accord EX'), 'not public before the check');

  const checks = await call('GET', '/api/admin/listings/checks', { cookie: staffCookie });
  const row = checks.json.cars.find((c) => c.title === '2012 Honda Accord EX');
  assert.ok(row, 'staff see it in Cars to check');
  assert.strictEqual((await call('POST', `/api/admin/listings/checks/${row.id}`, { cookie: tunde.cookie, body: { decision: 'approve' } })).status, 403);
  const ok = await call('POST', `/api/admin/listings/checks/${row.id}`, { cookie: staffCookie, body: { decision: 'approve' } });
  assert.deepStrictEqual([ok.status, ok.json.status], [200, 'available']);
  const pub = (await call('GET', '/api/cars')).json.cars.find((c) => c.title === '2012 Honda Accord EX');
  assert.deepStrictEqual([pub.seller, pub.seller_type], ['Tunde Ojo', 'private']);
  assert.ok(!(await call('GET', '/api/cars?verified=1')).json.cars.some((c) => c.title === '2012 Honda Accord EX'), '"verified only" leaves it out');
  const detail = await call('GET', `/api/cars/${pub.slug}`);
  assert.strictEqual(detail.json.car.seller_type, 'private');
  assert.strictEqual(detail.json.car.reviewed_by, undefined);

  // Editing words keeps it live; new photos send it back for a check
  const words = carForm(makeVin(501), { title: '2012 Honda Accord EX', description: 'Clean, first body' }); words.delete('photos');
  const e1 = await call('PUT', `/api/dealer/cars/${row.id}`, { cookie: tunde.cookie, form: words });
  assert.deepStrictEqual([e1.status, e1.json.car.status], [200, 'available']);
  const e2 = await call('PUT', `/api/dealer/cars/${row.id}`, { cookie: tunde.cookie, form: carForm(makeVin(501), { title: '2012 Honda Accord EX' }) });
  assert.deepStrictEqual([e2.status, e2.json.car.status], [200, 'pending']);
  assert.strictEqual((await call('POST', `/api/admin/listings/checks/${row.id}`, { cookie: staffCookie, body: { decision: 'approve' } })).json.status, 'available');
});

test('a seller who sends an ID becomes a Verified Seller once staff approve: 5 cars, shown as "verified"', async () => {
  kemi = await signUp('kemi@example.com', { phone: '08035550002', personal: { name: 'Kemi Ade', idType: 'nin' } });
  assert.deepStrictEqual([kemi.dealer.kind, kemi.dealer.status, kemi.dealer.liveLimit], ['personal', 'pending_review', 1]);
  assert.strictEqual((await call('POST', '/api/dealer/personal', { cookie: kemi.cookie, form: (() => { const f = new FormData(); f.append('state', 'Lagos'); f.append('lga', 'Surulere'); f.append('idType', 'nin'); f.append('idDoc', new Blob([PNG], { type: 'image/png' }), 'id.png'); return f; })() })).status, 400, 'an ID needs a selfie');
  const list = await call('GET', '/api/admin/dealers?kind=personal', { cookie: staffCookie });
  const d = list.json.dealers.find((x) => x.business_name === 'Kemi Ade');
  assert.ok(d && d.kind === 'personal' && list.json.dealers.every((x) => x.kind === 'personal'));
  assert.strictEqual((await call('GET', `/api/admin/dealers/${d.id}`, { cookie: staffCookie })).json.documents.length, 2, 'ID and selfie');
  assert.strictEqual((await call('POST', `/api/admin/dealers/${d.id}/decision`, { cookie: staffCookie, body: { decision: 'approve' } })).json.status, 'approved');
  const me = (await call('GET', '/api/dealer/me', { cookie: kemi.cookie })).json.dealer;
  assert.strictEqual(me.liveLimit, 5);
  for (let i = 0; i < 5; i++) {
    const c = await call('POST', '/api/dealer/cars', { cookie: kemi.cookie, form: carForm(makeVin(600 + i), { title: `2015 Kia Rio ${i}` }) });
    assert.deepStrictEqual([c.status, c.json.car.status], [201, 'available'], 'a Verified Seller\'s cars go live at once');
  }
  const sixth = await call('POST', '/api/dealer/cars', { cookie: kemi.cookie, form: carForm(makeVin(610)) });
  assert.deepStrictEqual([sixth.status, sixth.json.limit], [403, 5]);
  assert.match(sixth.json.error, /Register as a dealer/);
  assert.strictEqual((await call('GET', '/api/cars')).json.cars.find((c) => c.title === '2015 Kia Rio 0').seller_type, 'verified');
  assert.ok((await call('GET', '/api/cars?verified=1')).json.cars.some((c) => c.title === '2015 Kia Rio 0'));
});

test('a Verified Seller can register as a dealer (CAC), and dealers show as "dealer"', async () => {
  const f = new FormData();
  for (const [k, val] of Object.entries({ businessName: 'Kemi Autos', cacType: 'BN', cacNumber: '7654321', state: 'Lagos', lga: 'Ikeja', address: '3 Opebi Road, Ikeja' })) f.append(k, val);
  assert.strictEqual((await call('POST', '/api/dealer', { cookie: kemi.cookie, form: f })).status, 400, 'needs the CAC paper');
  f.append('cac', new Blob([PNG], { type: 'image/png' }), 'cac.png');
  const up = await call('POST', '/api/dealer', { cookie: kemi.cookie, form: f });
  assert.deepStrictEqual([up.status, up.json.dealer.kind, up.json.dealer.status, up.json.dealer.businessName], [200, 'business', 'pending_review', 'Kemi Autos']);
  assert.ok((await call('GET', '/api/cars')).json.cars.some((c) => c.title === '2015 Kia Rio 0'), 'cars already live stay live while the CAC is checked');
  assert.strictEqual((await call('POST', '/api/dealer/personal', { cookie: ade.cookie, form: new FormData() })).status, 409, 'a dealer is not a private seller');
  assert.strictEqual((await call('GET', '/api/cars')).json.cars.find((c) => c.seller === 'Ade Motors Ltd').seller_type, 'dealer');
});

test('report this listing: buyers report, staff hide the car in one click', async () => {
  const car = (await call('GET', '/api/cars')).json.cars.find((c) => c.title === '2012 Honda Accord EX');
  assert.strictEqual((await call('POST', `/api/cars/${car.id}/report`, { body: { reason: 'nonsense' } })).status, 400);
  assert.strictEqual((await call('POST', `/api/cars/${car.id}/report`, { body: { reason: 'other' } })).status, 400, '"something else" needs a few words');
  assert.strictEqual((await call('POST', `/api/cars/${car.id}/report`, { body: { reason: 'scam', details: 'Asked me to pay before viewing' }, ip: '10.9.9.9' })).status, 200);
  assert.strictEqual((await call('POST', `/api/cars/${car.id}/report`, { body: { reason: 'scam' }, ip: '10.9.9.9' })).status, 200, 'a repeat gets the same answer');
  const db = sqlite(); assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM listing_reports WHERE car_id = ?').get(car.id).n, 1, 'but is saved once'); db.close();
  assert.strictEqual((await call('GET', '/api/admin/listings/reports', { cookie: tunde.cookie })).status, 403);
  const reps = await call('GET', '/api/admin/listings/reports', { cookie: staffCookie });
  const rep = reps.json.reports.find((x) => x.car_id === car.id);
  assert.deepStrictEqual([rep.reason, rep.seller, rep.kind], ['scam', 'Tunde Ojo', 'personal']);
  assert.strictEqual((await call('POST', `/api/admin/listings/reports/${rep.id}`, { cookie: staffCookie, body: { action: 'hide' } })).status, 200);
  assert.strictEqual((await call('GET', `/api/cars/${car.slug}`)).status, 404, 'hidden at once');
  assert.strictEqual((await call('GET', '/api/admin/listings/reports', { cookie: staffCookie })).json.reports.filter((x) => x.car_id === car.id).length, 0, 'no longer open');
});

// ---------- Milestones 2, 5 and 7 (Nov 2026): buyer requests, seller pages, teams, unusual sign-ins ----------
const loginCodeFor = (email) => { const m = [...log.matchAll(new RegExp(`To: ${email.replace(/[.+]/g, '\\$&')} \\| Your Korrect Cars sign-in code: (\\d{6})`, 'g'))]; return m.length ? m[m.length - 1][1] : null; };
const inviteFor = (email) => { const i = log.lastIndexOf(`To: ${email} |`); const m = i >= 0 && log.slice(i).match(/dealers\/invite\?token=([a-f0-9]{64})/); return m ? m[1] : null; };
const adeSlug = () => { const db = sqlite(); const s = db.prepare("SELECT slug FROM dealers WHERE business_name = 'Ade Motors Ltd'").get().slug; db.close(); return s; };

test('buyer requests on a seller\'s car go to that seller (email + their list); Pay Small Small stays with Korrect Cars', async () => {
  const car = (await call('GET', '/api/cars')).json.cars.find((c) => c.title === '2015 Kia Rio 1');
  const before = mailsTo('kemi@example.com');
  const v = await call('POST', '/api/enquiries', { body: { type: 'viewing', car: String(car.id), name: 'Bola Buyer', phone: '08039990000', preferredDate: '2026-12-01', message: 'Is it still available?', consent: true } });
  assert.deepStrictEqual([v.status, v.json.seller], [201, true]);
  await wait(100);
  assert.strictEqual(mailsTo('kemi@example.com'), before + 1, 'the seller got an email');
  assert.match(log, /Buyer request: Bola Buyer wants to view your 2015 Kia Rio 1/);
  const b = await call('POST', '/api/enquiries', { body: { type: 'bnpl', car: String(car.id), name: 'Pss Buyer', phone: '08039990001', consent: true } });
  assert.strictEqual(b.json.seller, undefined, 'Pay Small Small goes to Korrect Cars only');
  const leads = await call('GET', '/api/dealer/leads', { cookie: kemi.cookie });
  assert.deepStrictEqual([leads.status, leads.json.leads.length, leads.json.open], [200, 1, 1]);
  const id = leads.json.leads[0].id;
  assert.strictEqual((await call('POST', `/api/dealer/leads/${id}`, { cookie: tunde.cookie, body: { status: 'replied' } })).status, 404, 'another seller cannot touch it');
  assert.strictEqual((await call('POST', `/api/dealer/leads/${id}`, { cookie: kemi.cookie, body: { status: 'replied' } })).json.status, 'replied');
  const db = sqlite(); assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM enquiries WHERE car_id = ?').get(car.id).n, 2, 'staff keep a copy of both in Leads'); db.close();
});

test('seller pages: approved dealers get a page (AutoDealer, in the sitemap); private sellers do not; filter by dealer', async () => {
  const slug = adeSlug();
  const api = await call('GET', `/api/dealers/${slug}`);
  assert.deepStrictEqual([api.status, api.json.seller.type, api.json.seller.indexable], [200, 'dealer', true]);
  assert.ok(api.json.cars.length >= 3 && api.json.cars.every((c) => c.seller === 'Ade Motors Ltd'));
  const html = await (await fetch(`${B}/dealers/${slug}`)).text();
  assert.match(html, /"@type":"AutoDealer","name":"Ade Motors Ltd"/);
  assert.match(html, /Verified car dealer in Ikeja, Lagos/);
  assert.doesNotMatch(html, /noindex/);
  const db = sqlite(); const tundeSlug = db.prepare("SELECT slug FROM dealers WHERE business_name = 'Tunde Ojo'").get().slug; db.close();
  assert.strictEqual((await call('GET', `/api/dealers/${tundeSlug}`)).status, 404, 'no page for a private seller');
  assert.strictEqual((await fetch(`${B}/dealers/${tundeSlug}`)).status, 404);
  const only = (await call('GET', `/api/cars?dealer=${slug}`)).json.cars;
  assert.ok(only.length && only.every((c) => c.seller === 'Ade Motors Ltd' && c.seller_slug === slug));
  const car = (await call('GET', '/api/cars')).json.cars.find((c) => c.seller === 'Ade Motors Ltd' && c.slug && !c.slug.startsWith('filler'));
  const carHtml = await (await fetch(`${B}/cars/${car.slug}`)).text();
  assert.match(carHtml, new RegExp(`Sold by <a href="/dealers/${slug}">Ade Motors Ltd</a> in Ikeja, Lagos, a car dealer whose CAC registration Korrect Cars has checked`));
  const how = await fetch(`${B}/how-we-check-sellers`);
  assert.strictEqual(how.status, 200);
  assert.match(await how.text(), /"@type":"FAQPage"/);
  assert.match(await (await fetch(`${B}/sitemap.xml`)).text(), new RegExp(`/dealers/${slug}<`));
  assert.match(await (await fetch(`${B}/llms.txt`)).text(), /Verified dealers and sellers \(3 or more cars for sale\)[\s\S]*Ade Motors Ltd/);
});

let lister;
test('teams: the owner invites a lister (code needed first); the lister sees and edits only their own cars', async () => {
  const first = await call('POST', '/api/dealer/team', { cookie: ade.cookie, body: { email: 'lola@example.com', role: 'lister' } });
  assert.deepStrictEqual([first.status, first.json.code], [403, 'STEP_UP'], 'a team change from a new device needs a code');
  await wait(100);
  const code = loginCodeFor('ade@example.com');
  assert.ok(code, 'code emailed');
  assert.strictEqual((await call('POST', '/api/dealer/team', { cookie: ade.cookie, body: { email: 'lola@example.com', role: 'boss', stepCode: code } })).status, 400);
  const ok = await call('POST', '/api/dealer/team', { cookie: ade.cookie, body: { email: 'lola@example.com', role: 'lister', stepCode: code } });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.json));
  await wait(100);
  const token = inviteFor('lola@example.com');
  assert.ok(token, 'invite emailed');
  const look = await call('GET', `/api/dealer/invite/${token}`);
  assert.deepStrictEqual([look.json.business, look.json.role, look.json.hasAccount], ['Ade Motors Ltd', 'lister', false]);
  const acc = await call('POST', `/api/dealer/invite/${token}`, { body: { name: 'Lola Lister', phone: '08035550009', password: 'green mango table 4' } });
  assert.strictEqual(acc.status, 201, JSON.stringify(acc.json));
  lister = acc.cookie;
  assert.strictEqual((await call('POST', `/api/dealer/invite/${token}`, { body: { name: 'X Y', phone: '08035550010', password: 'green mango table 4' } })).status, 404, 'single use');
  const mine = await call('POST', '/api/dealer/cars', { cookie: lister, form: carForm(makeVin(700), { title: '2013 Lexus ES 350', status: 'hidden' }) });
  assert.strictEqual(mine.status, 201, JSON.stringify(mine.json));
  const list = (await call('GET', '/api/dealer/cars', { cookie: lister })).json.cars;
  assert.deepStrictEqual(list.map((c) => c.title), ['2013 Lexus ES 350'], 'a lister sees only the cars they added');
  const other = (await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.find((c) => c.title !== '2013 Lexus ES 350');
  assert.strictEqual((await call('GET', `/api/dealer/cars/${other.id}`, { cookie: lister })).status, 404);
  assert.strictEqual((await call('POST', `/api/dealer/cars/${other.id}/status`, { cookie: lister, body: { status: 'sold' } })).status, 404);
  assert.strictEqual((await call('GET', '/api/dealer/team', { cookie: lister })).status, 403);
  assert.strictEqual((await call('POST', '/api/dealer/team', { cookie: lister, body: { email: 'x@example.com', role: 'lister' } })).status, 403);
  const biz = new FormData(); biz.append('businessName', 'Hijack Ltd');
  assert.strictEqual((await call('POST', '/api/dealer', { cookie: lister, form: biz })).status, 403, 'only the owner changes the business');
  assert.strictEqual((await call('GET', '/api/dealer/team', { cookie: ade.cookie })).json.members.length, 2);
  assert.strictEqual((await call('POST', '/api/dealer/team', { cookie: tunde.cookie, body: { email: 'y@example.com', role: 'lister' } })).status, 403, 'private sellers have no team');
});

test('unusual sign-ins: a seller signing in on a new device needs an emailed code; then that browser is trusted', async () => {
  const login = (cookie) => fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'korrect', 'x-forwarded-for': '10.7.7.7', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ email: 'ade@example.com', password: 'blue horse river 7' }) });
  const r1 = await login();
  const j1 = await r1.json();
  assert.deepStrictEqual([r1.status, j1.code], [202, 'STEP_UP']);
  assert.ok(!(r1.headers.getSetCookie() || []).some((c) => c.startsWith('kc_session=')), 'no session yet');
  await wait(100);
  const bad = await call('POST', '/api/auth/login/code', { body: { ticket: j1.ticket, code: '000000' } });
  assert.strictEqual(bad.status, 400);
  const good = await fetch(B + '/api/auth/login/code', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'korrect', 'x-forwarded-for': '10.7.7.8' }, body: JSON.stringify({ ticket: j1.ticket, code: loginCodeFor('ade@example.com') }) });
  assert.strictEqual(good.status, 200);
  const cookies = good.headers.getSetCookie().map((c) => c.split(';')[0]);
  assert.ok(cookies.some((c) => c.startsWith('kc_session=')) && cookies.some((c) => c.startsWith('kc_td=')));
  await wait(100);
  assert.match(log, /New sign-in to your Korrect Cars seller account/);
  const r2 = await login(cookies.find((c) => c.startsWith('kc_td=')));
  assert.strictEqual(r2.status, 200, 'the trusted browser signs straight in');
  const away = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'korrect', 'x-forwarded-for': '10.7.7.9', 'cf-ipcountry': 'GB', cookie: cookies.find((c) => c.startsWith('kc_td=')) }, body: JSON.stringify({ email: 'ade@example.com', password: 'blue horse river 7' }) });
  assert.strictEqual(away.status, 202, 'from outside Nigeria a code is asked again');
});

test('every dealer route keeps sellers apart: another seller\'s car id is "not found"', async () => {
  const kemiCar = (await call('GET', '/api/dealer/cars', { cookie: kemi.cookie })).json.cars[0];
  for (const [m, p, body] of [['GET', `/api/dealer/cars/${kemiCar.id}`], ['POST', `/api/dealer/cars/${kemiCar.id}/status`, { status: 'sold' }]]) {
    assert.strictEqual((await call(m, p, { cookie: ade.cookie, body })).status, 404, `${m} ${p}`);
  }
  const f = carForm(kemiCar.vin);
  assert.strictEqual((await call('PUT', `/api/dealer/cars/${kemiCar.id}`, { cookie: ade.cookie, form: f })).status, 404);
  assert.ok(!(await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.some((c) => c.id === kemiCar.id));
  assert.ok(!(await call('GET', '/api/dealer/leads', { cookie: ade.cookie })).json.leads.some((l) => l.car_id === kemiCar.id));
  assert.strictEqual((await call('GET', '/api/dealer/cars', {})).status, 403, 'signed out');
});

// ---------- Milestone 6 (Nov 2026): boosts ----------
test('boost prices: Jiji less 20% for 30 days, shorter plans cost more per day, VAT on top', () => {
  const b = require('../server/lib/boosts');
  const basic = b.quote('basic', 30);
  assert.deepStrictEqual([basic.amount, basic.vat, basic.total], [12799, 960, 13759]);
  assert.strictEqual(b.quote('enterprise_lux', 30).amount, 426399);
  assert.ok(b.quote('basic', 7).perDay > basic.perDay && b.quote('basic', 365).perDay < basic.perDay);
  assert.strictEqual(b.quote('basic', 5), null);
  assert.strictEqual(b.quote('gold', 30), null);
});

test('boosts: staff give a plan; the seller boosts cars up to the plan; boosted cars show as Featured and come first', async () => {
  const off = await call('POST', '/api/dealer/boosts', { cookie: ade.cookie, body: { plan: 'basic', days: 30 } });
  assert.deepStrictEqual([off.status, off.json.code], [503, 'PAY_OFF'], 'no Paystack key: online payment is off');
  const cars = (await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.filter((c) => c.status === 'available');
  assert.strictEqual((await call('POST', `/api/dealer/cars/${cars[0].id}/boost`, { cookie: ade.cookie, body: { on: true } })).json.code, 'NO_PLAN');
  const adeId = (() => { const db = sqlite(); const id = db.prepare("SELECT id FROM dealers WHERE business_name = 'Ade Motors Ltd'").get().id; db.close(); return id; })();
  assert.strictEqual((await call('POST', '/api/admin/listings/boosts/grant', { cookie: ade.cookie, body: { dealerId: adeId, plan: 'basic', days: 30, note: 'test' } })).status, 403, 'sellers cannot give themselves a plan');
  assert.strictEqual((await call('POST', '/api/admin/listings/boosts/grant', { cookie: staffCookie, body: { dealerId: adeId, plan: 'basic', days: 30, note: 'paid by transfer' } })).status, 201);
  const info = (await call('GET', '/api/dealer/boosts', { cookie: ade.cookie })).json;
  assert.deepStrictEqual([info.active.name, info.active.cars, info.boosted], ['Basic', 1, 0]);
  assert.strictEqual((await call('POST', `/api/dealer/cars/${cars[0].id}/boost`, { cookie: ade.cookie, body: { on: true } })).json.boosted, true);
  const full = await call('POST', `/api/dealer/cars/${cars[1].id}/boost`, { cookie: ade.cookie, body: { on: true } });
  assert.deepStrictEqual([full.status, full.json.code], [403, 'BOOST_FULL']);
  assert.strictEqual((await call('POST', `/api/dealer/cars/${cars[0].id}/boost`, { cookie: kemi.cookie, body: { on: true } })).status, 404, 'not another seller\'s car');
  const pub = (await call('GET', '/api/cars?limit=all')).json.cars.find((c) => c.id === cars[0].id);
  assert.strictEqual(pub.boosted, 1);
  assert.strictEqual(pub.boost_until, undefined, 'the end date is not shown publicly');
  assert.ok((await call('GET', '/api/cars?featured=1')).json.cars.some((c) => c.id === cars[0].id), 'in the featured row');
  assert.ok((await call('GET', '/api/dealer/cars', { cookie: ade.cookie })).json.cars.find((c) => c.id === cars[0].id).boosted);
  assert.strictEqual((await call('POST', `/api/dealer/cars/${cars[0].id}/boost`, { cookie: ade.cookie, body: { on: false } })).json.boosted, false);
  assert.strictEqual((await call('GET', '/api/cars?limit=all')).json.cars.find((c) => c.id === cars[0].id).boosted, 0);
  const staffList = (await call('GET', '/api/admin/listings/boosts', { cookie: staffCookie })).json;
  assert.ok(staffList.orders.some((o) => o.status === 'granted' && o.seller === 'Ade Motors Ltd'));
});

test('the Paystack webhook refuses anything without a valid signature', async () => {
  const r = await fetch(B + '/api/payments/paystack/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': 'abc' }, body: JSON.stringify({ event: 'charge.success', data: { reference: 'KCB-X' } }) });
  assert.strictEqual(r.status, 401);
  const b = require('../server/lib/boosts');
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_' + 'x'.repeat(40);
  const raw = Buffer.from('{"event":"charge.success"}');
  const sig = require('crypto').createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
  assert.ok(b.signatureOk(raw, sig));
  assert.ok(!b.signatureOk(raw, sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))));
  delete process.env.PAYSTACK_SECRET_KEY;
});
