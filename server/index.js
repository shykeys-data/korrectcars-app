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
for (const f of ['favicon.ico', 'favicon.png']) app.get('/' + f, (_req, res) => res.sendFile(path.join(config.distDir, 'img', 'favicon.png')));

// Google Search Console site-verification files (e.g. /googlea3cf853783d752e5.html)
app.get(/^\/(google[0-9a-f]{8,32})\.html$/, (req, res) => res.type('text/html').send(`google-site-verification: ${req.params[0]}.html`));
app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /myadm\nDisallow: /account\nDisallow: /api/\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
app.get('/ads.txt', (_req, res) => res.type('text/plain').send(process.env.ADS_TXT || 'google.com, pub-9741732903227479, DIRECT, f08c47fec0942fa0\n'));

// ---------- API ----------
const api = express.Router();
api.use(limiter(15, 600));
api.use(loadUser);
api.use(csrfGuard);
api.use('/', require('./routes/public'));
api.use('/swap', require('./routes/swap'));
api.use('/admin', require('./routes/admin'));
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// ---------- Sitemap ----------
app.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const cars = await db.q("SELECT slug, updated_at FROM cars WHERE status IN ('available','sold')");
    const posts = await db.q("SELECT slug, published_at FROM posts WHERE status = 'published'");
    const d = (x) => (x ? new Date(String(x).replace(' ', 'T') + (String(x).includes('Z') ? '' : 'Z')).toISOString().slice(0, 10) : '');
    const { slugify } = require('./render');
    const mm = await db.q("SELECT DISTINCT make, model FROM cars WHERE status IN ('available','sold')");
    const makePages = [...new Set(mm.map((x) => '/cars/' + slugify(x.make)))].concat(mm.map((x) => `/cars/${slugify(x.make)}/${slugify(x.model)}`));
    const urls = ['/', '/cars', '/swap', '/pay-small-small', '/blog', '/about-us', '/contact', '/faqs', '/privacy-policy', '/terms-and-conditions'].concat(makePages)
      .map((u) => `<url><loc>${config.siteUrl}${u}</loc></url>`)
      .concat(cars.map((c) => `<url><loc>${config.siteUrl}/cars/${c.slug}</loc><lastmod>${d(c.updated_at)}</lastmod></url>`))
      .concat(posts.map((p) => `<url><loc>${config.siteUrl}/blog/${p.slug}</loc><lastmod>${d(p.published_at)}</lastmod></url>`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch (e) { next(e); }
});

// ---------- Old WordPress URLs -> new pages (keeps Google rankings) ----------
const LEGACY = {
  '/about-us/': '/about-us', '/contact-us/': '/contact', '/services/': '/', '/add-car-2/': '/swap', '/cars/': '/cars',
  '/privacy-policy/': '/privacy-policy', '/terms-and-conditions/': '/terms-and-conditions', '/blog/': '/blog', '/faqs/': '/faqs',
  '/wp-login.php': '/myadm', '/wp-admin/': '/myadm', '/myadm/': '/myadm'
};
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (LEGACY[p]) return res.redirect(301, LEGACY[p]);
  if (/^\/(feed|comments\/feed)\/?$/.test(p) || p.startsWith('/wp-content/') || p.startsWith('/wp-includes/') || p === '/xmlrpc.php') return res.status(410).type('text/plain').send('Gone');
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
    const { status, html } = await renderPage(req, res.locals.nonce);
    // private: the page embeds the signed-in user's name, so shared caches must never store it
    res.status(status).set('Cache-Control', 'private, no-cache').type('html').send(html);
  } catch (e) { next(e); }
});

// ---------- Errors ----------
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be under 6 MB.' : (status < 500 ? err.message : 'Something went wrong. Please try again.');
  if (status >= 500) console.error(new Date().toISOString(), req.method, req.originalUrl, err);
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ error: msg });
  res.status(status).type('text/plain').send(msg);
});

db.init()
  .then(async () => {
    try { const r = require('./photos').restorePhotos(); if (r.copied || r.missing) console.log('Photos restored from WordPress uploads:', r); } catch (e) { console.warn('Photo restore skipped:', e.message); }
    const c = await db.one('SELECT COUNT(*) AS n FROM cars');
    if (!Number(c.n)) console.log('Seeded live data:', await require('./seed').seed());
    app.listen(config.port, () => console.log(`Korrect Cars running on port ${config.port}`));
  })
  .catch((e) => { console.error('Database connection failed:', e.message); process.exit(1); });

module.exports = app;
