// One-time content update (23 Oct 2026): nationwide delivery and the owner-to-owner Swap wording.
// Usage: node server/tools-content-oct23.js <htaccess>   (reads the database settings from that file; backs up first)
// Each change is a find-and-replace on the stored text, so anything else staff have edited stays as it is.
// Safe to run twice: a change that is already in place is skipped.
const fs = require('fs'); const path = require('path');
const [ht] = process.argv.slice(2);
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const db = require('./db');

const ABOUT = [
  // New paragraph after "Online first, in person where it matters"
  ['and puts the time into checking cars instead of polishing floors.</p>',
    'and puts the time into checking cars instead of polishing floors.</p>\n<h3>Delivery anywhere in Nigeria</h3>\n<p>Not in Lagos? We deliver cars to every state in Nigeria. Tell us your city on WhatsApp and we will give you the delivery cost and timing before you commit.</p>',
    'Delivery anywhere in Nigeria'],
  // Korrect Swap is owner-to-owner; Korrect Cars is the trusted middleman
  ['<p>Want to trade in what you drive now? On <a href="/swap">Korrect Swap</a>, owners list their cars and our team checks the owner and papers before a listing goes live. Both cars are inspected at a partner car lot before anything changes hands.</p>',
    '<p>Want to change the car you drive now? <a href="/swap">Korrect Swap</a> lets owners swap cars with each other, with Korrect Cars as the trusted middleman. Our team checks each owner and their papers before a listing goes live, and both cars are inspected at a partner car lot before anything changes hands.</p>',
    'Korrect Cars as the trusted middleman']
];
const GUIDE = ['then book a viewing and inspect the car in person', 'then book a viewing and inspect the car in person, or have it delivered anywhere in Nigeria', 'or have it delivered anywhere in Nigeria'];

(async () => {
  await db.init();
  const a = await db.one("SELECT id, slug, content FROM pages WHERE slug = 'about-us'");
  const o = await db.one("SELECT id, slug, content FROM posts WHERE slug LIKE 'why-buying-from-online-car-dealership-nigeria%'");
  const bk = `/home/kcars/backups/content-before-oct23-${process.env.DB_NAME || 'local'}-${Date.now()}.json`;
  try { fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.writeFileSync(bk, JSON.stringify({ about: a, guide: o }), { mode: 0o600 }); console.log('backup:', bk); } catch (e) { console.log('backup skipped:', e.code); }

  if (a) {
    let c = a.content; const done = [];
    for (const [from, to, marker] of ABOUT) {
      if (c.includes(marker)) done.push('already: ' + marker);
      else if (c.includes(from)) { c = c.replace(from, to); done.push('added: ' + marker); }
      else done.push('NOT FOUND (left as is): ' + marker);
    }
    if (c !== a.content) await db.q('UPDATE pages SET content = ? WHERE id = ?', [c, a.id]);
    console.log('About page:', done.join(' | '));
  } else console.log('About page: not found');

  if (!o) console.log('Online dealer guide: not found');
  else if (o.content.includes(GUIDE[2])) console.log('Online dealer guide: delivery line already there');
  else if (o.content.includes(GUIDE[0])) { await db.q('UPDATE posts SET content = ?, updated_at = NOW() WHERE id = ?', [o.content.replace(GUIDE[0], GUIDE[1]), o.id]); console.log('Online dealer guide: delivery line added'); }
  else console.log('Online dealer guide: sentence NOT FOUND (left as is)');
  process.exit(0);
})().catch((e) => { console.error('content update failed:', e.message); process.exit(1); });
