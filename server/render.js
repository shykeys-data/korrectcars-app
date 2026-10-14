// Serves the React app shell with page-specific title, description, social tags,
// structured data and readable HTML content, so Google and AdSense see real content.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const strip = (h) => String(h || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
// Allow only simple formatting tags from stored post HTML in the server-rendered copy
const safeHtml = (h) => String(h || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
  .replace(/<(\/?)(\w+)([^>]*)>/g, (_m, close, tag) => (/^(p|h2|h3|h4|ul|ol|li|strong|em|b|i|br|blockquote|table|thead|tbody|tr|td|th)$/i.test(tag) ? `<${close}${tag.toLowerCase()}>` : ''));

let template = null;
function shell() {
  if (template && config.isProd) return template;
  const file = path.join(config.distDir, 'index.html');
  template = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<!doctype html><html><head><!--HEAD--></head><body><div id="root"><!--BODY--></div></body></html>';
  return template;
}

const DEFAULT = {
  title: 'Korrect Cars | Buy Tokunbo & Foreign-Used Cars in Lagos, Nigeria',
  desc: 'Inspected, VIN-verified tokunbo and foreign-used cars in Lagos. Pay Small Small with 40% down, swap your car with verified owners, and chat with us on WhatsApp.',
  image: '/img/hero.jpg'
};

const STATIC = {
  '/': { title: DEFAULT.title, desc: DEFAULT.desc, h1: 'Buy inspected tokunbo cars in Lagos' },
  '/cars': { title: 'Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars', desc: 'Browse inspected, VIN-verified tokunbo and foreign-used cars for sale in Lagos. Filter by make, model, body type and price.', h1: 'Cars for sale' },
  '/swap': { title: 'Korrect Swap — Swap Your Car With Verified Owners | Korrect Cars', desc: 'List your car, tell us what you want, and swap with verified owners in Lagos. Inspection at a Korrect Cars point before any car or money changes hands.', h1: 'Swap your car' },
  '/pay-small-small': { title: 'Pay Small Small — Car Payment Plans in Lagos | Korrect Cars', desc: 'Pay 40% down and spread the rest over 6 to 48 months. See your monthly payment instantly for any car at Korrect Cars.', h1: 'Pay Small Small' },
  '/blog': { title: 'Car Buying Guides for Nigeria | Korrect Cars Blog', desc: 'Guides on buying tokunbo cars, customs duty, VIN checks, maintenance and the best cars for Lagos roads.', h1: 'Guides' },
  '/contact': { title: 'Contact Korrect Cars — Lagos', desc: 'Call, WhatsApp or email Korrect Cars in Lagos.', h1: 'Contact us' },
  '/faqs': { title: 'Frequently Asked Questions | Korrect Cars', desc: 'Answers about buying, inspections, Pay Small Small and Korrect Swap.', h1: 'Frequently asked questions' }
};
const NOINDEX = /^\/(myadm|account|login|register|swap\/new|verify-email|forgot-password|reset-password)(\/|$)/;

async function renderPage(req, nonce) {
  const p = req.path.replace(/\/+$/, '') || '/';
  let meta = { ...DEFAULT, url: config.siteUrl + (p === '/' ? '/' : p) };
  let body = ''; let status = 200; let data = null; let ld = null; let noindex = NOINDEX.test(p);

  if (STATIC[p]) { meta = { ...meta, ...STATIC[p] }; body = `<h1>${esc(STATIC[p].h1)}</h1><p>${esc(STATIC[p].desc)}</p>`; }

  if (p === '/' || p === '/cars') {
    const cars = await db.q("SELECT slug, title, price, mileage, body FROM cars WHERE status = 'available' ORDER BY price DESC LIMIT 30");
    body += '<ul>' + cars.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(naira(c.price))}</li>`).join('') + '</ul>';
  }

  let m = p.match(/^\/cars\/([a-z0-9-]+)$/);
  if (m) {
    const car = await db.one("SELECT * FROM cars WHERE slug = ? AND status <> 'hidden'", [m[1]]);
    if (!car) { status = 404; noindex = true; meta.title = 'Car not found | Korrect Cars'; }
    else {
      const desc = car.seo_desc || clip(`${car.title} for sale in ${car.location || 'Lagos'} at ${naira(car.price)}. ${strip(car.description)}`, 160);
      meta = { ...meta, title: car.seo_title || `${car.title} for Sale in Lagos — ${naira(car.price)} | Korrect Cars`, desc, image: (car.photos || [])[0] || DEFAULT.image };
      body = `<h1>${esc(car.title)}</h1><p><strong>${esc(naira(car.price))}</strong>${car.status === 'sold' ? ' — SOLD' : ''}</p>`
        + String(car.description || '').split(/\n\n+/).map((x) => `<p>${esc(x)}</p>`).join('')
        + (car.features && car.features.length ? '<ul>' + car.features.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>' : '');
      ld = { '@context': 'https://schema.org', '@type': 'Car', name: car.title, brand: { '@type': 'Brand', name: car.make }, model: car.model,
        vehicleModelDate: String(car.year || ''), bodyType: car.body, color: car.color || undefined, vehicleTransmission: car.transmission || undefined,
        image: (car.photos || []).slice(0, 5).map((u) => config.siteUrl + u), description: desc, itemCondition: 'https://schema.org/UsedCondition',
        offers: { '@type': 'Offer', price: Number(car.price), priceCurrency: 'NGN', availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: meta.url } };
    }
  }

  m = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    const post = await db.one("SELECT * FROM posts WHERE slug = ? AND status = 'published'", [m[1]]);
    if (!post) { status = 404; noindex = true; meta.title = 'Article not found | Korrect Cars'; }
    else {
      const desc = post.seo_desc || clip(strip(post.excerpt || post.content), 160);
      meta = { ...meta, title: post.seo_title || `${post.title} | Korrect Cars`, desc, image: post.image || DEFAULT.image, type: 'article' };
      body = `<article><h1>${esc(post.title)}</h1>${safeHtml(post.content)}</article>`;
      ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, datePublished: post.published_at, image: config.siteUrl + (post.image || DEFAULT.image),
        author: { '@type': 'Organization', name: 'Korrect Cars' }, publisher: { '@type': 'Organization', name: 'Korrect Cars', logo: { '@type': 'ImageObject', url: config.siteUrl + '/img/logo.png' } }, mainEntityOfPage: meta.url };
    }
  }

  m = p.match(/^\/(about-us|privacy-policy|terms-and-conditions)$/);
  if (m) {
    const page = await db.one('SELECT title, content FROM pages WHERE slug = ?', [m[1]]);
    if (page) { meta = { ...meta, title: `${page.title} | Korrect Cars`, desc: clip(strip(page.content), 160) }; body = `<h1>${esc(page.title)}</h1>${safeHtml(page.content)}`; }
  }

  const known = STATIC[p] || /^\/(cars|blog)\/[a-z0-9-]+$/.test(p) || /^\/(about-us|privacy-policy|terms-and-conditions|swap\/new|myadm|account|login|register|verify-email|forgot-password|reset-password)$/.test(p) || /^\/swap\/\d+$/.test(p);
  if (!known) { status = 404; noindex = true; meta.title = 'Page not found | Korrect Cars'; }

  const img = /^https?:/.test(meta.image) ? meta.image : config.siteUrl + meta.image;
  const head = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.desc)}">`,
    noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${esc(meta.url)}">`,
    `<meta property="og:type" content="${meta.type || 'website'}">`, `<meta property="og:site_name" content="Korrect Cars">`,
    `<meta property="og:title" content="${esc(meta.title)}">`, `<meta property="og:description" content="${esc(meta.desc)}">`,
    `<meta property="og:url" content="${esc(meta.url)}">`, `<meta property="og:image" content="${esc(img)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
    config.adsenseClient ? `<meta name="google-adsense-account" content="${esc(config.adsenseClient)}">` : '',
    config.gaId ? `<script async nonce="${nonce}" src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaId)}"></script><script nonce="${nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(config.gaId)}');</script>` : '',
    config.adsenseClient && !noindex ? `<script async nonce="${nonce}" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>` : '',
    data ? `<script type="application/json" id="__data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''
  ].filter(Boolean).join('\n');

  const html = shell().replace('<!--HEAD-->', head).replace('<!--BODY-->', `<div class="ssr">${body}</div>`).replace(/__NONCE__/g, nonce);
  return { status, html };
}

module.exports = { renderPage };
