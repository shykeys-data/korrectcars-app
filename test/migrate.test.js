// Database changes (server/migrations): each runs once, Korrect Cars is dealer 1 and owns every car,
// and a restart on the same database changes nothing. Starts the real app twice on one SQLite file.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-migrate-'));
const DBFILE = path.join(TMP, 'test.db');
const PORT = 3800 + Math.floor(Math.random() * 400);
const ENV = { ...process.env, DB_DRIVER: 'sqlite', SQLITE_FILE: DBFILE, PORT: String(PORT), MAIL_DISABLED: '1', ADSENSE_CLIENT: '', GA_ID: '', PRIVATE_DIR: path.join(TMP, 'private'), TOTP_KEY: 'b'.repeat(64), NODE_ENV: 'test' };
const sqlite = () => new (require('node:sqlite').DatabaseSync)(DBFILE);

async function startStop() {
  const app = spawn(process.execPath, ['app.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return log; } catch (_e) { /* not up yet */ }
      await new Promise((s) => setTimeout(s, 200));
    }
    throw new Error('App did not start:\n' + log);
  } finally {
    app.kill();
    await new Promise((s) => app.once('exit', s));
  }
}
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('first start applies the dealer change and moves every car to Korrect Cars', async () => {
  const log = await startStop();
  assert.match(log, /Database change 001_dealers/);
  const db = sqlite();
  assert.deepStrictEqual(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id), ['001_dealers', '002_dealer_signup', '003_vehicle_ids', '004_car_moves', '005_cac_per_type', '006_car_views', '007_seller_kinds']);
  const kc = db.prepare('SELECT * FROM dealers WHERE id = 1').get();
  assert.strictEqual(kc.business_name, 'Korrect Cars');
  assert.strictEqual(kc.status, 'approved');
  const cars = db.prepare('SELECT COUNT(*) AS n FROM cars').get().n;
  assert.ok(cars > 0, 'seed cars loaded');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM cars WHERE dealer_id = 1').get().n, cars);
  db.close();
});

test('a restart runs no change twice and keeps one Korrect Cars row', async () => {
  const log = await startStop();
  assert.doesNotMatch(log, /Database change 001_dealers/);
  const db = sqlite();
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 7);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM dealers').get().n, 1);
  db.close();
});

test('a car added without a dealer belongs to Korrect Cars', async () => {
  const db = sqlite();
  db.prepare("INSERT INTO cars (slug, title, make, model, body, price) VALUES ('test-car-x', 'Test car', 'Toyota', 'Camry', 'Sedan', 1000000)").run();
  assert.strictEqual(db.prepare("SELECT dealer_id FROM cars WHERE slug = 'test-car-x'").get().dealer_id, 1);
  db.close();
});

test('a CAC number can belong to one dealer per register (RC or BN)', async () => {
  const db = sqlite();
  db.prepare("INSERT INTO dealers (slug, business_name, cac_type, cac_number) VALUES ('ade-motors', 'Ade Motors', 'RC', '1234567')").run();
  assert.throws(() => db.prepare("INSERT INTO dealers (slug, business_name, cac_type, cac_number) VALUES ('ade-motors-2', 'Copy', 'RC', '1234567')").run(), /UNIQUE/);
  // A business name (BN) may share digits with a company (RC): they are different CAC registers
  db.prepare("INSERT INTO dealers (slug, business_name, cac_type, cac_number) VALUES ('bn-autos', 'BN Autos', 'BN', '1234567')").run();
  db.close();
});

test('the database itself refuses a second live listing of one VIN, but sold cars keep theirs', async () => {
  const db = sqlite();
  const ref = db.prepare("INSERT INTO vehicle_ids (id_type, id_value) VALUES ('vin17', '1HGCM82633A004352')").run().lastInsertRowid;
  const add = (slug, status) => db.prepare('INSERT INTO cars (slug, title, make, model, body, price, status, vehicle_id_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(slug, 'T', 'Honda', 'Accord', 'Sedan', 1, status, ref);
  add('live-a', 'available');
  assert.throws(() => add('live-b', 'pending'), /UNIQUE/);
  add('sold-a', 'sold'); add('hidden-a', 'hidden'); // history: any number of sold or hidden rows
  assert.throws(() => db.prepare("UPDATE cars SET status = 'available' WHERE slug = 'sold-a'").run(), /UNIQUE/);
  db.close();
});
