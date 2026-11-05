// Times the busiest pages on the server itself (no network): node server/tools-measure.js [htaccess]
const fs = require('fs');
const zlib = require('zlib');
const ht = process.argv[2];
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const db = require('./db');
(async () => {
  await db.init();
  await require('./lib/settings').load?.();
  const { renderPage } = require('./render');
  const pub = require('./routes/public');
  const n = (await db.q("SELECT COUNT(*) AS n FROM cars WHERE status IN ('available','reserved','sold')"))[0].n;
  let t = Date.now(); const list = await pub.listCars({ limit: 'all' }); const listMs = Date.now() - t;
  const json = JSON.stringify({ cars: list });
  console.log(`Public cars: ${n}. Car list: ${list.length} cars in ${listMs} ms, ${(json.length / 1024).toFixed(0)} KB (${(zlib.gzipSync(json).length / 1024).toFixed(0)} KB compressed)`);
  for (const path of ['/', '/cars', '/cars/suv', '/cars/toyota/camry']) {
    const runs = [];
    let html = '';
    for (let i = 0; i < 3; i++) { t = Date.now(); const r = await renderPage({ path, query: {}, user: null, headers: {} }, 'n'); runs.push(Date.now() - t); html = r.html || ''; }
    console.log(`${path}: built in ${Math.min(...runs)}-${Math.max(...runs)} ms, page ${(html.length / 1024).toFixed(0)} KB (${(zlib.gzipSync(html).length / 1024).toFixed(0)} KB compressed)`);
  }
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });
