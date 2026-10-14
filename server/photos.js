// Copies the original car/blog photos from the old WordPress uploads folder on the same
// server into this app's uploads folder, so the photos do not have to be uploaded twice.
// Safe to run on every start: files that already exist are skipped.
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');

function candidates() {
  const home = os.homedir();
  const list = (process.env.WP_UPLOADS_DIR || '').split(',').filter(Boolean);
  list.push(
    path.join(home, 'domains', 'korrectcars.com', 'wordpress_backup', 'wp-content', 'uploads'),
    path.join(home, 'domains', 'korrectcars.com', 'public_html', 'wp-content', 'uploads')
  );
  return list.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (_e) { return false; } });
}

function indexDir(dir, out, depth = 0) {
  if (depth > 3) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) indexDir(p, out, depth + 1);
    else if (!out.has(e.name)) out.set(e.name, p);
  }
}

function restorePhotos() {
  const seedDir = path.join(__dirname, '..', 'seed');
  const wanted = new Set();
  try {
    for (const c of JSON.parse(fs.readFileSync(path.join(seedDir, 'cars.json'), 'utf8'))) for (const p of c.photos || []) wanted.add(p);
    for (const p of JSON.parse(fs.readFileSync(path.join(seedDir, 'posts.json'), 'utf8'))) if (p.image) wanted.add(p.image);
    wanted.add('/uploads/site/korrect-cars-about-us-inspection-lagos.jpg');
  } catch (_e) { return { copied: 0, missing: 0 }; }
  const missing = [...wanted].filter((u) => !fs.existsSync(path.join(config.uploadsDir, 'public', u.replace(/^\/uploads\//, ''))));
  if (!missing.length) return { copied: 0, missing: 0 };
  const index = new Map();
  for (const d of candidates()) indexDir(d, index);
  let copied = 0; const still = [];
  for (const u of missing) {
    const src = index.get(path.basename(u));
    const dest = path.join(config.uploadsDir, 'public', u.replace(/^\/uploads\//, ''));
    if (src) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); copied++; } else still.push(u);
  }
  if (still.length) console.warn('Photos not found in WordPress uploads:', still.slice(0, 10).join(', '), still.length > 10 ? `(+${still.length - 10} more)` : '');
  return { copied, missing: still.length };
}

module.exports = { restorePhotos };
