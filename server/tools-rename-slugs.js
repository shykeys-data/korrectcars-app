// One-time: give cars whose web address ends with a staff code (e.g. ...-camry-xle-bf) a clean address.
// The old address is kept in old_slug and redirects to the new one. Usage: node server/tools-rename-slugs.js [htaccess]
const fs = require('fs');
const ht = process.argv[2];
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const db = require('./db');
(async () => {
  await db.init(); await require('./lib/settings').load();
  const { publicTitle } = require('./lib/titles');
  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  const cars = await db.q('SELECT id, slug, title FROM cars');
  let n = 0;
  for (const c of cars) {
    const clean = publicTitle(c.title);
    // Only cars whose title ends with a staff code AND whose address was made from that full title (e.g. ...-xle-bf).
    // Older addresses (e.g. from the WordPress site) are left alone: they are already known to Google.
    if (clean === c.title || c.slug !== slugify(c.title)) continue;
    const want = slugify(clean);
    let slug = want; if (await db.one('SELECT id FROM cars WHERE slug = ? AND id <> ?', [slug, c.id])) slug += '-' + c.id;
    await db.q('UPDATE cars SET old_slug = ?, slug = ?, updated_at = NOW() WHERE id = ?', [c.slug, slug, c.id]);
    console.log('renamed:', c.slug, '->', slug); n++;
  }
  console.log('cars renamed:', n); process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
