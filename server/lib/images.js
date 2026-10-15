// Fast, light photos: /r/<width>/<folder>/<name>.webp serves a resized WebP copy of an uploaded
// photo (made once, then kept on disk). If the image tool is unavailable the original photo is sent,
// so pages never break.
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

const WIDTHS = [400, 800, 1200, 1600];
const FOLDERS = { cars: 'uploads', blog: 'uploads', swap: 'uploads', site: 'uploads', img: 'dist' };
const CACHE = path.join(config.uploadsDir, 'cache');

let sharp = null;
for (const p of [process.env.SHARP_PATH, 'sharp', path.join(os.homedir(), 'tools', 'node_modules', 'sharp')].filter(Boolean)) {
  try { sharp = require(p); break; } catch (_e) { /* try next */ }
}
if (sharp) { sharp.cache(false); sharp.concurrency(1); }

function source(folder, name) {
  const base = FOLDERS[folder] === 'dist' ? path.join(config.distDir, 'img') : path.join(config.uploadsDir, 'public', folder);
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG']) {
    const f = path.join(base, name + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

const inflight = new Map();
async function resized(folder, name, width) {
  const src = source(folder, name);
  if (!src) return { status: 404 };
  if (!sharp) return { file: src };
  const out = path.join(CACHE, String(width), folder, name + '.webp');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return { file: out, webp: true };
  if (!inflight.has(out)) {
    inflight.set(out, (async () => {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const tmp = out + '.' + process.pid + '.tmp';
      await sharp(src, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72, effort: 4 }).toFile(tmp);
      fs.renameSync(tmp, out);
    })().finally(() => inflight.delete(out)));
  }
  try { await inflight.get(out); return { file: out, webp: true }; } catch (e) { console.warn('Resize failed', src, e.message); return { file: src }; }
}

function route(app) {
  app.get(/^\/r\/(\d{3,4})\/(cars|blog|swap|site|img)\/([A-Za-z0-9._-]{1,180})\.webp$/, async (req, res, next) => {
    try {
      const w = Number(req.params[0]);
      if (!WIDTHS.includes(w)) return res.status(404).end();
      const r = await resized(req.params[1], req.params[2], w);
      if (r.status) return res.status(r.status).end();
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (r.webp) res.type('image/webp');
      res.sendFile(r.file);
    } catch (e) { next(e); }
  });
}

module.exports = { route, resized, WIDTHS, available: () => !!sharp };
