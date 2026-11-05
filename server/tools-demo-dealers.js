// STAGING ONLY. Adds 4 demo dealers with about 30 cars each, to see how the site loads with 100+ cars.
//   node server/tools-demo-dealers.js add [htaccess]      adds them (does nothing if they are already there)
//   node server/tools-demo-dealers.js remove [htaccess]   removes every demo dealer, their cars and VIN entries
// Demo dealers are named "Demo: ...", their owners use @demo.korrectcars.invalid emails (no email is ever sent)
// and they have no phone numbers, so buyers' buttons fall back to Korrect Cars. Photos reuse existing car photos.
// Refuses to run unless the site address is a staging or local one.
const fs = require('fs');
const crypto = require('crypto');
const [cmd, ht] = process.argv.slice(2);
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const config = require('./config');
if (!/staging|localhost|127\.0\.0\.1/.test(config.siteUrl) && process.env.NODE_ENV !== 'test') { console.error('Refused: demo dealers are for staging only (site is ' + config.siteUrl + ').'); process.exit(1); }
if (!['add', 'remove'].includes(cmd)) { console.error('Usage: node server/tools-demo-dealers.js add|remove [htaccess]'); process.exit(1); }
const db = require('./db');

const DEALERS = [
  ['Demo: Lekki Auto Hub', 'Lagos', 'Eti-Osa'], ['Demo: Abuja Motors World', 'Abuja (FCT)', 'Abuja Municipal (AMAC)'],
  ['Demo: PH Car Mart', 'Rivers', 'Port Harcourt'], ['Demo: Ibadan Prime Autos', 'Oyo', 'Ibadan North']
];
// [make, model, body, wmi, first year, last year, price range in millions, engines]
const MODELS = [
  ['Toyota', 'Camry', 'Sedan', '4T1', 2010, 2022, [7, 28], ['2.5L 4-cylinder', '3.5L V6']], ['Toyota', 'Corolla', 'Sedan', '2T1', 2012, 2022, [6, 18], ['1.8L 4-cylinder']],
  ['Toyota', 'RAV4', 'SUV', 'JTM', 2013, 2021, [12, 35], ['2.5L 4-cylinder']], ['Toyota', 'Highlander', 'SUV', '5TD', 2011, 2021, [15, 48], ['3.5L V6']],
  ['Toyota', 'Sienna', 'Minivan', '5TD', 2011, 2020, [12, 30], ['3.5L V6']], ['Lexus', 'RX', 'SUV', '2T2', 2010, 2021, [16, 55], ['3.5L V6']],
  ['Lexus', 'ES', 'Sedan', 'JTH', 2013, 2021, [14, 40], ['3.5L V6']], ['Lexus', 'GX', 'SUV', 'JTJ', 2010, 2020, [25, 75], ['4.6L V8']],
  ['Honda', 'Accord', 'Sedan', '1HG', 2013, 2021, [8, 26], ['2.4L 4-cylinder', '1.5L 4-cylinder turbo']], ['Honda', 'CR-V', 'SUV', '2HK', 2012, 2021, [10, 28], ['2.4L 4-cylinder']],
  ['Hyundai', 'Sonata', 'Sedan', '5NP', 2011, 2019, [6, 15], ['2.4L 4-cylinder']], ['Hyundai', 'Santa Fe', 'SUV', '5XY', 2013, 2019, [9, 22], ['2.4L 4-cylinder', '3.3L V6']],
  ['Kia', 'Sorento', 'SUV', '5XY', 2014, 2020, [9, 24], ['2.4L 4-cylinder', '3.3L V6']], ['Mercedes-Benz', 'GLE', 'SUV', '4JG', 2016, 2021, [30, 85], ['3.0L V6 turbo']],
  ['Mercedes-Benz', 'C-Class', 'Sedan', '55S', 2015, 2021, [14, 38], ['2.0L 4-cylinder turbo']], ['Ford', 'Explorer', 'SUV', '1FM', 2013, 2020, [12, 30], ['3.5L V6']]
];
const COLOURS = ['Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Pearl white', 'Wine'];
const CONDITIONS = ['Foreign Used', 'Foreign Used', 'Foreign Used', 'Nigerian Used', 'Brand New'];
const FEATURES = ['Air conditioning', 'Reverse camera', 'Bluetooth', 'Push-to-start', 'Alloy wheels', 'Leather seats', 'Sunroof', 'Navigation'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A VIN with a correct check digit (9th character), so it passes the same rules as a real one
const T = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR = 'ABCDEFGHJKLMNPRSTVWXY123456789';
const CH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
function vin(wmi, year) {
  const yc = YEAR[(year - 1980) % 30];
  const body = wmi + Array.from({ length: 5 }, () => pick(CH)).join('') + '0' + yc + pick('ABCDEFGHJKLMNPRSTUVWXYZ') + String(between(100000, 999999));
  const sum = [...body].reduce((s, ch, i) => s + (/\d/.test(ch) ? Number(ch) : T[ch]) * W[i], 0);
  const r = sum % 11;
  return body.slice(0, 8) + (r === 10 ? 'X' : String(r)) + body.slice(9);
}

(async () => {
  await db.init();
  const demo = await db.q("SELECT id FROM dealers WHERE business_name LIKE 'Demo: %'");
  if (cmd === 'remove') {
    for (const d of demo) {
      const refs = (await db.q('SELECT vehicle_id_ref FROM cars WHERE dealer_id = ? AND vehicle_id_ref IS NOT NULL', [d.id])).map((r) => r.vehicle_id_ref);
      await db.q('DELETE FROM car_photo_hashes WHERE car_id IN (SELECT id FROM cars WHERE dealer_id = ?)', [d.id]).catch(() => {});
      await db.q('DELETE FROM cars WHERE dealer_id = ?', [d.id]);
      for (const r of refs) await db.q('DELETE FROM vehicle_ids WHERE id = ?', [r]).catch(() => {});
      const users = (await db.q('SELECT user_id FROM dealer_members WHERE dealer_id = ?', [d.id])).map((r) => r.user_id);
      await db.q('DELETE FROM dealer_members WHERE dealer_id = ?', [d.id]);
      await db.q('DELETE FROM verification_events WHERE dealer_id = ?', [d.id]);
      await db.q('DELETE FROM dealers WHERE id = ?', [d.id]);
      for (const u of users) await db.q("DELETE FROM users WHERE id = ? AND email LIKE '%@demo.korrectcars.invalid'", [u]);
    }
    console.log(`Removed ${demo.length} demo dealers and their cars.`);
    process.exit(0);
  }
  if (demo.length) { console.log(`Already there: ${demo.length} demo dealers. Run "remove" first to start again.`); process.exit(0); }
  const photos = [...new Set((await db.q("SELECT photos FROM cars WHERE status IN ('available','sold') AND photos IS NOT NULL")).flatMap((r) => { try { return Array.isArray(r.photos) ? r.photos : JSON.parse(r.photos || '[]'); } catch (_e) { return []; } }))];
  const groups = []; // one car's photos: a few consecutive photos of the same real car
  for (const r of await db.q("SELECT photos FROM cars WHERE status IN ('available','sold') AND photos IS NOT NULL")) { let p = r.photos; try { p = Array.isArray(p) ? p : JSON.parse(p || '[]'); } catch (_e) { p = []; } if (p.length) groups.push(p.slice(0, 6)); }
  if (!groups.length) { console.error('No car photos to reuse yet.'); process.exit(1); }
  const hash = '$2a$10$' + crypto.randomBytes(40).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 53); // nobody can sign in
  let cars = 0;
  for (const [i, [name, state, lga]] of DEALERS.entries()) {
    const u = await db.q("INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, '', ?, 'user', 1)", [name.replace('Demo: ', '') + ' (demo owner)', `owner${i + 1}@demo.korrectcars.invalid`, hash]);
    const d = await db.q(`INSERT INTO dealers (slug, business_name, cac_type, cac_number, status, verified_at, email, address, state, lga, about)
      VALUES (?, ?, 'RC', ?, 'approved', NOW(), ?, ?, ?, ?, 'Demo dealer for load testing on staging. Not a real business.')`,
    [slug(name) + '-' + crypto.randomBytes(2).toString('hex'), name, String(9000000 + between(1, 99999)), `owner${i + 1}@demo.korrectcars.invalid`, `${between(1, 120)} Demo Road, ${lga}`, state, lga]);
    const dealerId = d.insertId;
    await db.q("INSERT INTO dealer_members (dealer_id, user_id, role) VALUES (?, ?, 'owner')", [dealerId, u.insertId]);
    await db.q("INSERT INTO verification_events (dealer_id, step, result, note) VALUES (?, 'setup', 'approved', 'Demo dealer (staging load test)')", [dealerId]);
    const n = between(27, 33);
    for (let k = 0; k < n; k++) {
      const [make, model, body, wmi, y1, y2, [p1, p2], engines] = pick(MODELS);
      const year = between(y1, y2); const v = vin(wmi, year);
      const ins = await db.q('INSERT INTO vehicle_ids (id_type, id_value, wmi, check_digit_ok) VALUES (?, ?, ?, 1)', ['vin17', v, wmi]);
      const title = `${year} ${make} ${model}`;
      const callForPrice = Math.random() < 0.08;
      const price = callForPrice ? 0 : between(p1, p2) * 1000000 + between(0, 9) * 100000;
      const engine = pick(engines);
      const feats = FEATURES.filter(() => Math.random() < 0.5);
      const status = Math.random() < 0.1 ? 'sold' : 'available';
      await db.q(`INSERT INTO cars (slug, title, make, model, body, year, price, mileage, engine, transmission, drivetrain, fuel, color, interior, car_condition, location, vin,
        description, features, specs, info, photos, status, featured, dealer_id, vehicle_id_ref, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Automatic', ?, 'Petrol', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 0, ?, ?, ?)`,
      [`${slug(title)}-${crypto.randomBytes(3).toString('hex')}`, title, make, model, body, year, price, `${(between(12, 140) * 1000).toLocaleString("en-NG")} miles`, engine,
        body === 'Sedan' ? 'FWD' : pick(['FWD', 'AWD']), pick(COLOURS), pick(['Black leather', 'Beige leather', 'Grey fabric']), pick(CONDITIONS), `${lga}, ${state}`, v,
        `Demo listing for load testing. This ${title} is not a real car for sale.`, JSON.stringify(feats), JSON.stringify(pick(groups)), status, dealerId, ins.insertId,
        new Date(Date.now() - between(0, 60) * 86400000).toISOString().slice(0, 19).replace('T', ' ')]);
      cars++;
    }
    console.log(`${name}: ${n} cars (${state}, ${lga})`);
  }
  console.log(`Added ${DEALERS.length} demo dealers and ${cars} cars. Photos reused from ${photos.length} existing photos.`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });
