// Loads the live korrectcars.com cars, blog posts and legal pages into the database.
// Runs automatically on first start when the cars table is empty; safe to re-run (skips existing slugs).
const fs = require('fs');
const path = require('path');
const { q, one, J } = require('./db');

const dir = path.join(__dirname, '..', 'seed');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const toDate = (s) => (s ? String(s).replace('T', ' ').slice(0, 19) : null);

async function seed() {
  let cars = 0; let posts = 0; let pages = 0;
  for (const c of read('cars.json')) {
    if (await one('SELECT id FROM cars WHERE slug = ?', [c.slug])) continue;
    await q(`INSERT INTO cars (slug, title, make, model, body, trim_level, year, price, old_price, mileage, engine, transmission, drivetrain, fuel, color, interior,
      car_condition, location, vin, stock, description, features, specs, info, photos, status, featured, seo_title, seo_desc, wp_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.slug, c.title, c.make, c.model, c.body, c.trim, c.year, c.price, c.oldPrice, c.mileage, c.engine, c.transmission, c.drivetrain, c.fuel, c.color, c.interior,
      c.condition, c.location, c.vin, c.stock, c.description, J(c.features), J(c.specs), J(c.info), J(c.photos), c.status, c.featured ? 1 : 0,
      c.seoTitle || null, c.seoDesc || null, c.wpUrl || null]);
    cars++;
  }
  for (const p of read('posts.json')) {
    if (await one('SELECT id FROM posts WHERE slug = ?', [p.slug])) continue;
    await q('INSERT INTO posts (slug, title, excerpt, content, image, published_at, wp_id, seo_title, seo_desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.slug, p.title, p.excerpt || null, p.content, p.image, toDate(p.publishedAt), p.wpId, p.seoTitle || null, p.seoDesc || null]);
    posts++;
  }
  const pg = read('pages.json');
  const wanted = { 'privacy-policy': 'privacy-policy', 'terms-and-conditions': 'terms-and-conditions', 'about-us': 'about-us' };
  for (const [src, slug] of Object.entries(wanted)) {
    const p = pg.pages[src];
    if (!p || await one('SELECT id FROM pages WHERE slug = ?', [slug])) continue;
    await q('INSERT INTO pages (slug, title, content) VALUES (?, ?, ?)', [slug, p.title, p.content]);
    pages++;
  }
  if (!(await one("SELECT id FROM pages WHERE slug = 'faqs'")) && pg.faqs.length) {
    await q('INSERT INTO pages (slug, title, content) VALUES (?, ?, ?)', ['faqs', 'Frequently asked questions', JSON.stringify(pg.faqs)]);
    pages++;
  }
  return { cars, posts, pages };
}

module.exports = { seed };

if (require.main === module) {
  require('./db').init().then(seed).then((r) => { console.log('Seeded', r); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}
