// One-time content update (Oct 2026): Pay Small Small guide, About page, author bylines on every guide.
// Usage: node server/tools-content-oct26.js <htaccess> <folder with pss.html and about.html>. Backs up first.
const fs = require('fs'); const path = require('path');
const [ht, dir] = process.argv.slice(2);
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const db = require('./db');
const AUTHOR = 'The Korrect Cars team';
const BIO = 'the Lagos team that inspects, lists and sells the cars on this site. We write these guides from the questions buyers ask us every day. Questions? Chat with us on WhatsApp.';
(async () => {
  await db.init();
  const pss = fs.readFileSync(path.join(dir, 'pss.html'), 'utf8'); const about = fs.readFileSync(path.join(dir, 'about.html'), 'utf8');
  const posts = await db.q('SELECT * FROM posts'); const pages = await db.q("SELECT * FROM pages WHERE slug = 'about-us'");
  const bk = `${process.env.BACKUP_DIR || require('path').join(require('os').homedir(), 'backups')}/content-before-oct26-${process.env.DB_NAME || 'local'}-${Date.now()}.json`;
  try { fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.writeFileSync(bk, JSON.stringify({ posts, pages }), { mode: 0o600 }); console.log('backup:', bk); } catch (e) { console.log('backup skipped:', e.message); }
  const g = await db.one("SELECT id FROM posts WHERE slug = 'how-korrect-cars-buy-now-pay-later-bnpl-works'");
  if (g) {
    await db.q('UPDATE posts SET title = ?, excerpt = ?, content = ?, seo_title = ?, seo_desc = ?, updated_at = NOW() WHERE id = ?', [
      'How Pay Small Small Works at Korrect Cars: A Clear Guide',
      'Pick a car, get an estimate in a minute, and apply through our credit partners. Here is exactly how Pay Small Small works, what it costs and who decides.',
      pss, 'How Pay Small Small Works: Car Instalments in Lagos | Korrect Cars',
      'How to pay small small for a car in Lagos: estimate in a minute, apply through our credit partners, worked example and who qualifies.', g.id]);
    console.log('Pay Small Small guide rewritten');
  }
  const o = await db.one("SELECT id, content FROM posts WHERE slug LIKE 'why-buying-from-online-car-dealership-nigeria%'");
  if (o && /then arrange inspection or doorstep delivery/.test(o.content)) { await db.q('UPDATE posts SET content = ?, updated_at = NOW() WHERE id = ?', [o.content.replace('then arrange inspection or doorstep delivery', 'then book a viewing and inspect the car in person'), o.id]); console.log('online dealer guide: delivery line corrected'); }
  const n = await db.q('UPDATE posts SET author = ?, author_bio = ? WHERE author IS NULL', [AUTHOR, BIO]);
  console.log('bylines added:', n.affectedRows);
  const a = await db.one("SELECT id FROM pages WHERE slug = 'about-us'");
  if (a) { await db.q('UPDATE pages SET content = ? WHERE id = ?', ['<img src="/uploads/site/korrect-cars-about-us-inspection-lagos.jpg" alt="A Korrect Cars inspection at a partner car lot in Lagos">\n' + about, a.id]); console.log('About page rewritten'); }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
