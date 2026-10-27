// The Express app. Order matters, top to bottom: security headers -> static files -> /api (rate limit, user, CSRF)
// -> sitemap -> old WordPress redirects -> every other address is rendered by render.js -> error handler.
// Start-up at the bottom: connect to the database, load settings, import WordPress data if the database is empty.
// See docs/ARCHITECTURE.md for the full picture.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const { loadUser, csrfGuard, sanitizeInput, limiter } = require('./lib/security');
const settings = require('./lib/settings');
const { renderPage } = require('./render');

// Send errors from async route handlers to the error handler instead of crashing the process
const Layer = require('express/lib/router/layer');
Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next();
  try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); }
};
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));

const app = express();
app.set('trust proxy', 1); // behind Apache/LiteSpeed on DirectAdmin
app.disable('x-powered-by');

// Per-request nonce for the strict Content-Security-Policy
app.use((_req, res, next) => { res.locals.nonce = crypto.randomBytes(16).toString('base64'); next(); });
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", (_req, res) => `'nonce-${res.locals.nonce}'`, "'strict-dynamic'", 'https:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://*.google.com', 'https://*.googlesyndication.com', 'https://*.doubleclick.net', 'https://*.adtrafficquality.google', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
      'frame-src': ["'self'", 'https://*.google.com', 'https://*.googlesyndication.com', 'https://*.doubleclick.net', 'https://www.google.com'],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': config.isProd ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.use((_req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next(); });
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(sanitizeInput);

// One canonical host (keeps the www address Google already knows). HTTPS is forced by the web server (DirectAdmin "Force SSL").
const canonicalHost = new URL(config.siteUrl).host;
app.use((req, res, next) => {
  const host = String(req.get('host') || '');
  if (config.isProd && host && host !== canonicalHost && host.replace(/^www\./, '') === canonicalHost.replace(/^www\./, '')) {
    return res.redirect(301, `${config.siteUrl}${req.originalUrl}`);
  }
  next();
});

// ---------- Static files ----------
app.use('/uploads', express.static(path.join(config.uploadsDir, 'public'), { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
app.use('/assets', express.static(path.join(config.distDir, 'assets'), { maxAge: '1y', immutable: true, index: false }));
app.use('/img', express.static(path.join(config.distDir, 'img'), { maxAge: '30d', index: false }));
// Resized WebP photos (much lighter on phones)
require('./lib/images').route(app);
for (const f of ['favicon.ico', 'favicon.png']) app.get('/' + f, (_req, res) => res.sendFile(path.join(config.distDir, 'img', 'favicon.png')));

// Google Search Console site-verification files (e.g. /googlea3cf853783d752e5.html)
app.get(/^\/(google[0-9a-f]{8,32})\.html$/, (req, res) => res.type('text/html').send(`google-site-verification: ${req.params[0]}.html`));
// robots.txt, llms.txt (summary for AI assistants) and the IndexNow key file
require('./lib/seo').routes(app);
app.get('/ads.txt', (_req, res) => res.type('text/plain').send(process.env.ADS_TXT || 'google.com, pub-9741732903227479, DIRECT, f08c47fec0942fa0\n'));

// ---------- API ----------
const api = express.Router();
api.use(limiter(15, 600));
api.use(loadUser);
api.use(csrfGuard);
api.use('/', require('./routes/public'));
api.use('/swap', (_req, res, next) => (settings.current().swap ? next() : res.status(404).json({ error: 'Not found' })), require('./routes/swap'));
api.use('/me', require('./routes/me'));
api.use('/admin', require('./routes/admin'));
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// ---------- Sitemap ----------
app.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const cars = await db.q("SELECT slug, title, photos, updated_at FROM cars WHERE status IN ('available','sold')");
    const posts = await db.q("SELECT slug, published_at FROM posts WHERE status = 'published'");
    const xml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const d = (x) => (x ? new Date(String(x).replace(' ', 'T') + (String(x).includes('Z') ? '' : 'Z')).toISOString().slice(0, 10) : '');
    const { slugify } = require('./render');
    const mm = await db.q("SELECT DISTINCT make, model FROM cars WHERE status IN ('available','sold')");
    const makePages = [...new Set(mm.map((x) => '/cars/' + slugify(x.make)))].concat(mm.map((x) => `/cars/${slugify(x.make)}/${slugify(x.model)}`));
    // Category pages (/cars/suv…) that have at least one car in stock
    const stock = await require('./routes/public').listCars({ limit: 100 });
    const catLib = require('./lib/categories');
    const catPages = catLib.pages().filter((c) => stock.filter((x) => x.status === 'available' && c.test(x)).length >= catLib.MIN_INDEX).map((c) => '/cars/' + c.slug);
    const urls = ['/', '/cars', ...catPages, ...(settings.current().swap ? ['/swap'] : []), '/pay-small-small', '/blog', '/about-us', '/contact', '/faqs', '/privacy-policy', '/terms-and-conditions'].concat(makePages)
      .map((u) => `<url><loc>${config.siteUrl}${u}</loc></url>`)
      .concat(cars.map((c) => `<url><loc>${config.siteUrl}/cars/${c.slug}</loc><lastmod>${d(c.updated_at)}</lastmod>${(c.photos || []).slice(0, 5).map((ph) => `<image:image><image:loc>${config.siteUrl}${xml(ph)}</image:loc></image:image>`).join('')}</url>`))
      .concat(posts.map((p) => `<url><loc>${config.siteUrl}/blog/${p.slug}</loc><lastmod>${d(p.published_at)}</lastmod></url>`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>`);
  } catch (e) { next(e); }
});

// ---------- Old WordPress URLs -> new pages (keeps Google rankings) ----------
const LEGACY = {
  '/about-us/': '/about-us', '/contact-us/': '/contact', '/services/': '/', '/add-car-2/': '/cars', '/cars/': '/cars',
  '/privacy-policy/': '/privacy-policy', '/terms-and-conditions/': '/terms-and-conditions', '/blog/': '/blog', '/faqs/': '/faqs'
};
if (config.adminPath) LEGACY[config.adminPath + '/'] = config.adminPath;
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (LEGACY[p]) return res.redirect(301, LEGACY[p]);
  if (/^\/(feed|comments\/feed)\/?$/.test(p) || p.startsWith('/wp-content/') || p.startsWith('/wp-includes/') || p.startsWith('/wp-admin') || p === '/wp-login.php' || p === '/xmlrpc.php') return res.status(410).type('text/plain').send('Gone');
  const m = p.match(/^\/cars\/([a-z0-9-]+)\/$/);
  if (m) return res.redirect(301, `/cars/${m[1]}`);
  const m2 = p.match(/^\/(?:blog\/|\d{4}\/\d{2}\/(?:\d{2}\/)?)?([a-z0-9-]+)\/?$/);
  if (m2 && !p.startsWith('/blog/') && p !== '/') {
    try { if (await db.one('SELECT id FROM posts WHERE slug = ?', [m2[1]])) return res.redirect(301, `/blog/${m2[1]}`); } catch (_e) { /* fall through */ }
  }
  next();
});

// ---------- React app (with server-rendered meta + content for Google) ----------
app.get('*', loadUser, async (req, res, next) => {
  try {
    const { status, html, redirect } = await renderPage(req, res.locals.nonce);
    if (redirect) return res.redirect(301, redirect);
    // private: the page embeds the signed-in user's name, so shared caches must never store it
    if (config.adminPath && req.path.replace(/\/+$/, '') === config.adminPath) res.set('X-Robots-Tag', 'noindex, nofollow');
    res.status(status).set('Cache-Control', 'private, no-cache').type('html').send(html);
  } catch (e) { next(e); }
});

// ---------- Errors ----------
app.use((err, req, res, _next) => {
  // Upload limits get a clear message instead of "Something went wrong"
  const UPLOAD = { LIMIT_FILE_SIZE: 'Each photo or file must be under 8 MB.', LIMIT_FILE_COUNT: 'Too many photos at once. Add up to 20 per save; you can add more by editing the car afterwards.',
    LIMIT_UNEXPECTED_FILE: 'Too many photos at once. Add up to 20 per save; you can add more by editing the car afterwards.', LIMIT_FIELD_COUNT: 'Too many fields in the form.' };
  let upload = UPLOAD[err.code] || (err.name === 'MulterError' ? 'The upload could not be read. Try fewer or smaller photos.' : null);
  if (err.code === 'LIMIT_UNEXPECTED_FILE' && err.field && err.field !== 'photos') upload = `Unexpected file in the form (${String(err.field).slice(0, 40)}). Refresh the page and try again.`;
  if (/Unexpected end of form|Request aborted/i.test(err.message || '')) upload = 'The upload was cut off before it finished. Check your internet connection and try again.';
  const status = err.status || (upload ? 400 : 500);
  // Unexpected errors get a short reference code, shown to the user and written to the log next to the cause
  const ref = status >= 500 ? 'KC-' + require('crypto').randomBytes(3).toString('hex').toUpperCase() : null;
  const msg = upload || (status < 500 ? err.message : `Something went wrong (ref ${ref}). Please try again, or send this code to the Korrect Cars team.`);
  if (status >= 500) console.error(new Date().toISOString(), `[${ref}]`, req.method, req.originalUrl, req.user ? `user ${req.user.id}` : 'signed out', err);
  else if (upload) console.warn(new Date().toISOString(), '[upload]', req.method, req.originalUrl, err.code || err.message);
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json(ref ? { error: msg, ref } : { error: msg });
  res.status(status).type('text/plain').send(msg);
});

db.init()
  .then(async () => {
    await require('./lib/settings').load();
    try { const r = require('./photos').restorePhotos(); if (r.copied || r.missing) console.log('Photos restored from WordPress uploads:', r); } catch (e) { console.warn('Photo restore skipped:', e.message); }
    const c = await db.one('SELECT COUNT(*) AS n FROM cars');
    if (!Number(c.n)) console.log('Seeded live data:', await require('./seed').seed());
    app.listen(config.port, () => console.log(`Korrect Cars running on port ${config.port}`));
  })
  .catch((e) => { console.error('Database connection failed:', e.message); process.exit(1); });

module.exports = app;
