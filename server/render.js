// Serves the React app shell with page-specific title, description, social tags,
// structured data and readable HTML content, so Google, AI assistants and AdSense see real content.
// It also embeds the data each page needs (JSON in <script id="__boot">, read by booted() in core.jsx), so pages show cars straight away
// without waiting on extra API requests.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const pub = require('./routes/public');
const cats = require('./lib/categories');
const copy = require('./lib/pagecopy');
const { sanitize } = require('./lib/sanitize');

// Light photo URLs (same rule as the browser's rs()) and a preload tag for the page's main photo
const RS = /^\/(?:uploads\/(cars|blog|swap|site)|(img))\/([A-Za-z0-9._-]+)\.(?:jpe?g|png|webp)$/i;
const rs = (u, w) => { const m = String(u || '').match(RS); return m ? `/r/${w}/${m[1] || m[2]}/${m[3]}.webp` : u; };
const preloadTag = (u, sizes, widths = [800, 1200, 1600]) => (RS.test(String(u || ''))
  ? `<link rel="preload" as="image" href="${rs(u, widths[1])}" imagesrcset="${widths.map((w) => `${rs(u, w)} ${w}w`).join(', ')}" imagesizes="${sizes}" fetchpriority="high">` : '');

// The server page: a simple but complete page (header, content, footer) shown to visitors whose phone does not run
// the app (scripts off, Opera Mini, a connection that drops before the app downloads). When the app starts it
// replaces this whole block. index.html hides it while the app is loading and shows it if the app fails to arrive.
function ssrFrame(body, isAdmin) {
  if (isAdmin) return `<div class="ssr">${body}</div>`;
  const st = require('./lib/settings').current();
  const phone = (st.phones || config.phones)[0] || '';
  const wa = `https://wa.me/${esc(st.whatsapp || config.whatsapp)}`;
  const nav = [['/cars', 'Cars for sale'], ['/pay-small-small', 'Pay Small Small'], ['/vin-check', 'VIN check'], ...(st.swap ? [['/swap', 'Swap your car']] : []), ['/blog', 'Guides'], ['/contact', 'Contact']];
  return `<div class="ssr"><header class="ssr-hdr"><a href="/" class="ssr-logo"><img src="/img/logo.svg" alt="Korrect Cars" width="160" height="40"></a>`
    + `<nav aria-label="Main">${nav.map(([u, t]) => `<a href="${u}">${t}</a>`).join('')}</nav>`
    + `<p class="ssr-cta"><a class="ssr-btn" href="${wa}">WhatsApp us</a> <a href="tel:${esc(phone.replace(/\s/g, ''))}">Call ${esc(phone)}</a></p></header>`
    + `<main id="main" class="ssr-main">${body}</main>`
    + `<footer class="ssr-foot"><p><b>Korrect Cars</b> · Online car dealer in Lagos · ${esc(st.hours || config.hours)}</p><p><a href="${wa}">WhatsApp</a> · <a href="tel:${esc(phone.replace(/\s/g, ''))}">${esc(phone)}</a> · <a href="mailto:${esc(st.email || config.email)}">${esc(st.email || config.email)}</a></p>`
    + `<p><a href="/about-us">About us</a> · <a href="/faqs">FAQs</a> · <a href="/blog">Guides</a> · <a href="/vin-check">Free VIN check</a> · <a href="/privacy-policy">Privacy policy</a> · <a href="/terms-and-conditions">Terms</a></p>`
    + `<p>© 2026${new Date().getFullYear() > 2026 ? '–' + new Date().getFullYear() : ''} Korrect Cars. All rights reserved. Developed by <a href="https://www.youkay.com.ng" target="_blank" rel="noopener">YouKay Media</a> · <a href="https://www.meetoluwaseyi.com" target="_blank" rel="noopener">Meet Oluwaseyi</a></p>`
    + `<p class="ssr-note">This is the light version of the page. It switches to the full site when your connection allows.</p></footer></div>`;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const { hasPrice, priceText, priced } = require('./lib/price');
const { placeOf } = require('./lib/places');
const strip = (h) => String(h || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Stored post and page HTML goes through the same allowlist cleaner the staff editor uses (keeps safe links and our images)
const safeHtml = (h) => sanitize(h);

// Shared page copy (lib/pagecopy.js) as plain HTML: h1, lead, then sections of paragraphs, steps, lists and FAQs
function copyHtml(c, { h1 = true } = {}) {
  const sec = (x) => `<h2>${esc(x.h2)}</h2>`
    + (x.p || []).map((t) => `<p>${esc(t)}</p>`).join('')
    + (x.steps ? '<ol>' + x.steps.map(([h, t]) => `<li><strong>${esc(h)}.</strong> ${esc(t)}</li>`).join('') + '</ol>' : '')
    + (x.list ? '<ul>' + x.list.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>' : '')
    + (x.faq ? x.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('') : '');
  return (h1 ? `<h1>${esc(c.h1)}</h1>` : '') + (c.lead ? `<p>${esc(c.lead)}</p>` : '') + (c.sections || []).map(sec).join('');
}
const copyFaq = (c) => (c.sections || []).flatMap((x) => x.faq || []);
// Inspection notes on a car page (only the areas staff filled in)
function inspectionHtml(ins) {
  if (!ins || !Array.isArray(ins.items) || !ins.items.length) return '';
  return `<h2>Korrect Cars inspection notes</h2>${ins.by || ins.date ? `<p>Inspected${ins.by ? ` by ${esc(ins.by)}` : ''}${ins.date ? ` on ${esc(ins.date)}` : ''} at a partner car lot in Lagos.</p>` : ''}<ul>`
    + ins.items.map((i) => `<li><strong>${esc(i.area)}${i.status === 'watch' ? ' (worth a look)' : ''}:</strong> ${esc(i.note || (i.status === 'ok' ? 'checked, no problems found' : ''))}</li>`).join('') + '</ul>';
}

let template = null;
function shell() {
  if (template && config.isProd) return template;
  const file = path.join(config.distDir, 'index.html');
  template = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<!doctype html><html><head><!--HEAD--></head><body><div id="root"><!--BODY--></div></body></html>';
  return template;
}

const DEFAULT = {
  title: 'Korrect Cars | Buy Tokunbo & Foreign-Used Cars in Lagos, Nigeria',
  desc: 'Inspected, VIN-verified tokunbo and foreign-used cars in Lagos. Buy outright or pay small small through our credit partners. Delivery anywhere in Nigeria.',
  image: '/img/hero.jpg'
};

const STATIC = {
  '/': { title: DEFAULT.title, desc: DEFAULT.desc, h1: 'Buy inspected tokunbo cars in Lagos' },
  '/cars': { title: 'Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars', desc: 'Browse inspected, VIN-verified tokunbo and foreign-used cars for sale in Lagos. Filter by make, model, year, body type and price.', h1: 'Cars for sale in Lagos' },
  '/swap': { title: 'Korrect Swap — Swap Your Car With Verified Owners | Korrect Cars', desc: 'List your car, tell us what you want, and swap with verified owners in Lagos. Inspection at a partner car lot before any car or money changes hands.', h1: 'Swap your car' },
  '/pay-small-small': { title: 'Pay Small Small — Car Payment Plans in Lagos | Korrect Cars', desc: 'Get an estimate of your monthly payment for any car at Korrect Cars, then apply through our credit partners. Once a credit partner approves you, we sell you the car.', h1: 'Pay Small Small' },
  '/blog': { title: 'Car Buying Guides for Nigeria | Korrect Cars Blog', desc: 'Guides on buying tokunbo cars, customs duty, VIN checks, maintenance and the best cars for Lagos roads.', h1: 'Guides' },
  '/contact': { title: 'Contact Korrect Cars — WhatsApp, Call, Hours | Lagos', desc: `Call, WhatsApp or email Korrect Cars. Online car dealer in Lagos, open ${config.hours}.`, h1: 'Contact us' },
  '/faqs': { title: 'Frequently Asked Questions | Korrect Cars', desc: 'Answers about buying, viewings and inspections, payments and Pay Small Small.', h1: 'Frequently asked questions' },
  '/vin-check': { title: 'Free VIN Check Nigeria — Decode Any Car VIN | Korrect Cars', desc: 'Free VIN check: type any 17-character VIN to see the car\'s year, make, model, engine and where it was built. No sign-up. Where to find the VIN on a car in Nigeria.', h1: copy.VIN.h1 },
  '/car-market-today': { title: 'Nigeria Car Market Today — Fuel, Naira, Duty | Korrect Cars', desc: 'The figures that move car prices in Nigeria: fuel prices, the naira exchange rate and import duty, each with its source and the date checked.', h1: copy.MARKET.h1 }
};
const NOINDEX = /^\/(account|login|register|swap\/new|verify-email|forgot-password|reset-password|compare)(\/|$)/;

const PSS_FAQ = [
  ['How does Pay Small Small work at Korrect Cars?', 'Pick a car and get an estimate of your deposit and monthly payment. Apply in minutes, and with your consent we pass your details to our credit partners. Once a credit partner approves you, Korrect Cars sells you the car.'],
  ['Who decides if I qualify?', 'Our credit partner checks if you qualify and sets the final deposit, charge and number of months.'],
  ['Is the calculator figure final?', 'No. It is an estimate based on a 40% deposit and a 20% charge on the balance. The credit partner sets your real terms.'],
  ['Can I get a car on Pay Small Small outside Lagos?', 'Yes. Korrect Cars delivers anywhere in Nigeria. Apply online, and once a credit partner approves you we arrange delivery to your city.']
];

// "Sold by …" in plain words, from the data, for search engines and AI assistants (the car page's opening summary)
function soldBy(car) {
  const where = [car.lga, car.state].filter(Boolean).join(', ');
  if (!car.dealer_id || Number(car.dealer_id) === 1) return 'Sold by Korrect Cars, an online car dealer in Lagos.';
  const name = car.seller_slug ? `<a href="/dealers/${esc(car.seller_slug)}">${esc(car.seller)}</a>` : esc(car.seller);
  const what = { dealer: 'a car dealer whose CAC registration Korrect Cars has checked', verified: 'a Verified Seller (a person selling their own car; Korrect Cars has checked their ID)',
    private: 'a private seller. Korrect Cars has not checked who this seller is: see the car and its papers before you pay anything' }[car.seller_type] || 'a seller on Korrect Cars';
  return `Sold by ${name}${where ? ` in ${esc(where)}` : ''}, ${what}.`;
}
function orgLd() {
  const st = require('./lib/settings').current();
  return {
    '@context': 'https://schema.org', '@type': 'AutoDealer', '@id': config.siteUrl + '/#dealer', name: 'Korrect Cars', url: config.siteUrl + '/',
    logo: config.siteUrl + '/img/logo.svg', image: config.siteUrl + DEFAULT.image, email: st.email, telephone: st.phones,
    description: require('./lib/settings').current().marketplace
      ? 'Car marketplace and online car dealer in Lagos. Korrect Cars sells its own inspected, VIN-verified tokunbo cars and lists cars from car dealers whose CAC registration it has checked and from people selling their own car (each listing shows whether the seller was checked). One live listing per VIN. Pay Small Small through credit partners and delivery anywhere in Nigeria.'
      : 'Online car dealer in Lagos selling inspected, VIN-verified tokunbo and foreign-used cars, with Pay Small Small through credit partners and delivery anywhere in Nigeria.',
    areaServed: [{ '@type': 'City', name: 'Lagos' }, { '@type': 'Country', name: 'Nigeria' }], address: { '@type': 'PostalAddress', addressLocality: 'Lagos', addressCountry: 'NG' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: config.hoursSpec.days, opens: config.hoursSpec.opens, closes: config.hoursSpec.closes }],
    sameAs: st.instagram ? [`https://www.instagram.com/${st.instagram}/`] : []
  };
}
const faqLd = (pairs) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const crumbsLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: config.siteUrl + url })) });
const listLd = (cars) => ({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: cars.filter((c) => c.status === 'available').slice(0, 30).map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${config.siteUrl}/cars/${c.slug}`, name: c.title })) });

// Lowest Pay Small Small estimate (minimum deposit, 24 months) among cars in stock
const monthlyFrom = (cars) => { const a = priced(cars).filter((c) => c.status === 'available'); return a.length ? pub.bnplPlan(Math.min(...a.map((c) => Number(c.price))), 0, 24).monthly : 0; };
// "Shop by budget" links with live counts, for search engines and AI assistants
function budgetLinksHtml(allCars, skip) {
  const avail = allCars.filter((c) => c.status === 'available');
  const l = cats.budgets().filter((c) => c.slug !== skip).map((c) => [c, avail.filter(c.test)]).filter(([, x]) => x.length);
  return l.length ? '<h2>Shop by budget</h2><ul>' + l.map(([c, x]) => { const pr = priced(x).map((y) => Number(y.price)); const lo = Math.min(...pr); const hi = Math.max(...pr); return `<li><a href="/cars/${c.slug}">${esc(c.h1)}</a>: ${x.length} in stock, ${esc(lo === hi ? naira(lo) : `${naira(lo)} to ${naira(hi)}`)}</li>`; }).join('') + '</ul>' : '';
}

// "How much is a Toyota Camry in Nigeria?" answer from the cars actually in stock
function priceAnswer(subject, cars) {
  const avail = cars.filter((c) => c.status === 'available');
  if (!avail.length) return `We have no ${subject || 'cars'} in stock right now. Chat with us on WhatsApp and we will find one for you.`;
  const prices = priced(avail).map((c) => Number(c.price));
  const lo = Math.min(...prices); const hi = Math.max(...prices);
  const range = !prices.length ? 'are priced on request (call or WhatsApp us)' : (lo === hi ? `costs ${naira(lo)}` : `cost from ${naira(lo)} to ${naira(hi)}`) + (prices.length < avail.length ? ' (some are priced on request)' : '');
  return `The ${avail.length} ${subject ? subject + ' ' : ''}${avail.length === 1 ? 'car' : 'cars'} in stock at Korrect Cars in Lagos ${range}. Every car is inspected and VIN-verified, and you can pay small small through our credit partners.`;
}

// Works out whether /cars/:a(/:b) is a make page, a make+model page, or a single car
async function resolveCars(p) {
  const m = p.match(/^\/cars\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
  if (!m) return null;
  const cat = !m[2] && cats.bySlug(m[1]);
  if (cat) return { kind: 'category', cat }; // /cars/suv, /cars/under-20-million… (checked before makes and cars)
  const fac = await pub.facets();
  const make = Object.keys(fac.makes).find((k) => slugify(k) === m[1]);
  if (make && !m[2]) return { kind: 'make', make, fac };
  if (make && m[2]) {
    const model = Object.keys(fac.makes[make]).find((k) => slugify(k) === m[2]);
    return model ? { kind: 'model', make, model, fac } : { kind: 'missing' };
  }
  return m[2] ? { kind: 'missing' } : { kind: 'car', slug: m[1] };
}

async function renderPage(req, nonce) {
  const p = req.path.replace(/\/+$/, '') || '/';
  let meta = { ...DEFAULT, url: config.siteUrl + (p === '/' ? '/' : p) };
  const isAdmin = !!config.adminPath && p === config.adminPath;
  let body = ''; let status = 200; let noindex = NOINDEX.test(p) || isAdmin; let known = isAdmin;
  const ld = [];
  let preload = '';
  const boot = { '/config': isAdmin ? { ...pub.publicConfig(), adminPath: config.adminPath } : pub.publicConfig(), '/auth/me': { user: req.user ? await pub.withDealer(pub.publicUser(req.user, req.mfa)) : null } };

  const swapOn = require('./lib/settings').current().swap;
  const swapPath = /^\/swap(\/|$)/.test(p);
  if (STATIC[p] && !(swapPath && !swapOn)) { known = true; meta = { ...meta, ...STATIC[p] }; body = `<h1>${esc(STATIC[p].h1)}</h1><p>${esc(STATIC[p].desc)}</p>`; }
  // Pages with written copy get the same words the React page shows (lib/pagecopy.js), not a one-line summary
  const COPY = { '/contact': copy.CONTACT, '/swap': copy.SWAP, '/vin-check': copy.VIN, '/blog': copy.GUIDES };
  if (known && COPY[p]) { body = copyHtml(COPY[p]); const f = copyFaq(COPY[p]); if (f.length) ld.push(faqLd(f)); }
  // Breadcrumbs for the buyer pages, and the VIN checker described as a free web tool (helps Google and AI assistants list it)
  const CRUMB = { '/vin-check': 'Free VIN check', '/contact': 'Contact', '/swap': 'Korrect Swap', '/blog': 'Guides', '/car-market-today': 'Car market today' };
  if (known && CRUMB[p]) ld.push(crumbsLd([[CRUMB[p], p]]));
  if (p === '/vin-check') {
    ld.push({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Korrect Cars Free VIN Check', url: meta.url, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)',
      description: STATIC['/vin-check'].desc, isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'NGN' }, provider: { '@id': config.siteUrl + '/#dealer' }, areaServed: { '@type': 'Country', name: 'Nigeria' } });
  }
  if (p === '/contact') {
    const st = require('./lib/settings').current();
    body += `<h2>Contact details</h2><ul><li>WhatsApp: <a href="https://wa.me/${esc(st.whatsapp)}">+${esc(st.whatsapp)}</a></li>${st.phones.map((x) => `<li>Call: <a href="tel:${esc(x.replace(/\s/g, ''))}">${esc(x)}</a></li>`).join('')}<li>Email: <a href="mailto:${esc(st.email)}">${esc(st.email)}</a></li><li>Open: ${esc(st.hours)}. Viewings by appointment.</li></ul>`;
    ld.push({ '@context': 'https://schema.org', '@type': 'ContactPage', url: meta.url, about: { '@id': config.siteUrl + '/#dealer' } });
  }
  if (p === '/car-market-today') {
    const m = await require('./lib/settings').market();
    if (m.items.length < require('./lib/settings').MARKET_MIN) known = false; // stays hidden until staff fill it in
    else {
      boot['/market'] = m;
      body = copyHtml(copy.MARKET) + (m.updated ? `<p>Last updated ${esc(String(m.updated).slice(0, 10))}.</p>` : '') + '<ul>'
        + m.items.map((i) => `<li><strong>${esc(i.label)}:</strong> ${esc(i.value)}${i.detail ? ` — ${esc(i.detail)}` : ''}. Source: ${i.url ? `<a href="${esc(i.url)}" rel="noopener nofollow">${esc(i.source)}</a>` : esc(i.source)}, checked ${esc(i.date)}.</li>`).join('') + '</ul>'
        + (m.note ? `<h2>What this means for a car buyer</h2><p>${esc(m.note)}</p>` : '');
    }
  }

  // Pages that list cars get the whole public stock (small) and filter it in the browser
  const needsCars = p === '/' || p === '/cars' || p === '/pay-small-small' || p === '/compare' || /^\/cars\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p);
  let allCars = null;
  if (needsCars) {
    allCars = await pub.listCars({ limit: 'all' });
    boot['/cars?limit=all'] = { cars: allCars };
    boot['/cars/facets'] = await pub.facets();
  }

  if (p === '/') {
    preload = preloadTag('/img/hero.jpg', '100vw');
    ld.push(orgLd());
    const posts = await require('./lib/memo').memo('posts:3', () => db.q("SELECT slug, title, excerpt, image, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 3"));
    boot['/posts?limit=3'] = { posts };
  }
  if (p === '/' || p === '/cars') {
    const avail = allCars.filter((c) => c.status === 'available');
    body += '<ul class="ssr-cars">' + avail.map((c, i) => `<li><a href="/cars/${esc(c.slug)}">${i < 24 && (c.photos || [])[0] ? `<img src="${esc(rs(c.photos[0], 400))}" alt="" width="400" height="300" loading="lazy" decoding="async">` : ''}<span>${esc(c.title)}</span></a> <b>${esc(priceText(c))}</b></li>`).join('') + '</ul>';
    const catLinks = cats.pages().map((c) => [c, avail.filter(c.test).length]).filter(([, n]) => n > 0);
    if (catLinks.length) body += '<h2>Browse by category</h2><ul>' + catLinks.filter(([c]) => !c.budget).map(([c, n]) => `<li><a href="/cars/${c.slug}">${esc(c.name)}</a> (${n} in stock)</li>`).join('') + '</ul>';
    body += budgetLinksHtml(allCars);
    if (p === '/cars') { ld.push(listLd(allCars)); body += `<h2>How much are the cars at Korrect Cars?</h2><p>${esc(priceAnswer('', allCars))}</p>`; }
  }
  if (p === '/pay-small-small') {
    const avail = priced(allCars).filter((c) => c.status === 'available').sort((a, b) => a.price - b.price);
    const q = 'Which cars can I buy on Pay Small Small in Lagos?';
    const a = avail.length ? `Every one of the ${avail.length} cars in stock at Korrect Cars can be bought on Pay Small Small, from about ${naira(monthlyFrom(avail))} a month (estimate: ${pub.bnplPlan(Number(avail[0].price), 0, 24).months} months, minimum deposit). Credit partners confirm the final terms, and we deliver anywhere in Nigeria.` : 'Chat with us on WhatsApp and we will find a car for your budget.';
    ld.push(faqLd([[q, a], ...PSS_FAQ]), listLd(avail));
    body += `<h2>${esc(q)}</h2><p>${esc(a)}</p><ul>` + avail.map((c) => { const pl = pub.bnplPlan(Number(c.price), 0, 24); return `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a>: ${esc(priceText(c))}, about ${esc(naira(pl.deposit))} deposit then ${esc(naira(pl.monthly))}/month for ${pl.months} months</li>`; }).join('') + '</ul>'
      + budgetLinksHtml(allCars) + PSS_FAQ.map(([q2, a2]) => `<h2>${esc(q2)}</h2><p>${esc(a2)}</p>`).join('');
  }

  const rc = await resolveCars(p);
  if (rc && rc.kind === 'missing') { status = 404; noindex = true; meta.title = 'Page not found | Korrect Cars'; known = true; }
  if (rc && (rc.kind === 'make' || rc.kind === 'model')) {
    known = true;
    const subject = rc.kind === 'model' ? `${rc.make} ${rc.model}` : rc.make;
    const cars = allCars.filter((c) => c.make === rc.make && (rc.kind === 'make' || c.model === rc.model));
    const q = `How much is a ${subject} in Nigeria?`;
    const a = priceAnswer(subject, cars);
    meta = { ...meta, title: `${subject} for Sale in Lagos — Prices & Pay Small Small | Korrect Cars`, desc: clip(a, 160) };
    body = `<h1>${esc(subject)} for sale in Lagos</h1><ul>` + cars.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(priceText(c))}${c.status === 'sold' ? ' (sold)' : ''}</li>`).join('') + `</ul><h2>${esc(q)}</h2><p>${esc(a)}</p>`;
    const crumbs = [['Cars for sale', '/cars'], [rc.make, `/cars/${slugify(rc.make)}`]];
    if (rc.kind === 'model') crumbs.push([rc.model, `/cars/${slugify(rc.make)}/${slugify(rc.model)}`]);
    ld.push(crumbsLd(crumbs), listLd(cars), faqLd([[q, a]]));
  }
  if (rc && rc.kind === 'category') {
    known = true;
    const cat = rc.cat;
    const cars = allCars.filter(cat.test);
    const avail = cars.filter((c) => c.status === 'available');
    const prices = priced(avail).map((c) => Number(c.price)); const lo = Math.min(...prices); const hi = Math.max(...prices);
    const a = avail.length ? `Korrect Cars has ${avail.length} ${avail.length === 1 ? 'car' : 'cars'} in "${cat.name}" in Lagos right now${!prices.length ? ', priced on request' : lo === hi ? `, at ${naira(lo)}` : `, from ${naira(lo)} to ${naira(hi)}`}. Every car is inspected and VIN-verified, you can pay small small${monthlyFrom(avail) ? ` from about ${naira(monthlyFrom(avail))} a month` : ''} through our credit partners, and we deliver anywhere in Nigeria.`
      : `We have no cars in "${cat.name}" in stock right now. Chat with us on WhatsApp and we will find one for you.`;
    meta = { ...meta, title: `${cat.h1} — Prices & Pay Small Small | Korrect Cars`, desc: clip(`${cat.intro} ${a}`, 160) };
    // A category with too few cars in stock (e.g. no electric cars yet) stays out of search results until it fills up
    if (avail.length < cats.MIN_INDEX) noindex = true;
    body = `<h1>${esc(cat.h1)}</h1><p>${esc(cat.intro)}</p><ul>` + cars.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(priceText(c))}${c.status === 'sold' ? ' (sold)' : ''}</li>`).join('') + `</ul><h2>${esc(cat.faq)}</h2><p>${esc(a)}</p>` + budgetLinksHtml(allCars, cat.slug);
    ld.push(crumbsLd([['Cars for sale', '/cars'], [cat.name, `/cars/${cat.slug}`]]), listLd(cars), faqLd([[cat.faq, a]]));
  }
  if (rc && rc.kind === 'car') {
    known = true;
    const d = await pub.carDetail(rc.slug);
    if (d && d.movedTo) return { status: 301, redirect: `/cars/${d.movedTo}` }; // old web address of this car
    if (!d) { status = 404; noindex = true; meta.title = 'Car not found | Korrect Cars'; }
    else {
      const car = d.car;
      boot['/cars/' + rc.slug] = d;
      preload = preloadTag((car.photos || [])[0], '(max-width: 980px) 100vw, 62vw');
      // Pay Small Small estimate (same figures the car card shows: minimum deposit, 24 months)
      const plan = car.status === 'sold' || !hasPrice(car) ? null : pub.bnplPlan(Number(car.price), 0, 24);
      const pss = plan ? ` or pay small small from about ${naira(plan.monthly)}/month` : '';
      // Every car's search description leads with its price and Pay Small Small figure; old imported wording ("BNPL") is updated
      const extra = strip(car.seo_desc || car.description).replace(/\bBNPL\b/g, 'pay small small');
      const sold = car.status === 'sold';
      // A sold car keeps its page (it still gets found on Google), but sends the visitor on to similar cars in stock
      const desc = sold
        ? clip(`Sold: this ${car.title} has been sold. See similar ${car.make} ${car.model} and ${car.body || 'other'} cars in stock in Lagos, with pay small small and delivery anywhere in Nigeria.`, 160)
        : clip(`${car.title} for sale in ${car.location || 'Lagos'} ${hasPrice(car) ? 'at ' + priceText(car) : '(call for price)'}${pss}. ${extra}`, 160);
      meta = { ...meta, title: sold ? `Sold: ${car.title} — See Similar Cars in ${placeOf(car)} | Korrect Cars` : (car.seo_title || `${car.title} for Sale in ${placeOf(car)}${hasPrice(car) ? ' — ' + priceText(car) : ''} | Korrect Cars`), desc, image: (car.photos || [])[0] || DEFAULT.image };
      const similarHtml = (d.similar || []).length ? `<h2>${sold ? 'Similar cars in stock' : 'Similar cars'}</h2><ul>` + d.similar.map((x) => `<li><a href="/cars/${esc(x.slug)}">${esc(x.title)}</a> — ${esc(priceText(x))}</li>`).join('') + '</ul>' : '';
      body = `<h1>${esc(car.title)}</h1>${(car.photos || [])[0] ? `<img class="ssr-hero" src="${esc(rs(car.photos[0], 800))}" alt="${esc(car.title)}" width="800" height="600">` : ''}<p><strong>${esc(priceText(car))}</strong>${sold ? ' — SOLD' : ''}</p><p>${soldBy(car)}</p>`
        + (sold ? `<p>This car has been sold. See <a href="/cars/${slugify(car.make)}/${slugify(car.model)}">every ${esc(car.make)} ${esc(car.model)} for sale</a> or <a href="/cars">all cars in stock</a>.</p>` + similarHtml : '')
        + String(car.description || '').split(/\n\n+/).map((x) => `<p>${esc(x)}</p>`).join('')
        + (car.features && car.features.length ? '<ul>' + car.features.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>' : '')
        + inspectionHtml(car.inspection)
        + (plan ? `<h2>Pay small small for this ${esc(car.make)} ${esc(car.model)}</h2><p>Estimate: about ${esc(naira(plan.deposit))} deposit, then about ${esc(naira(plan.monthly))} a month for ${plan.months} months, through our credit partners. They confirm the final terms; once you are approved, Korrect Cars sells you the car. <a href="/pay-small-small?car=${esc(car.slug)}">Get your estimate and apply</a>.</p>` : '')
        + (sold ? '' : `<p>View it at a partner car lot in Lagos, or have it delivered anywhere in Nigeria.</p>${similarHtml}`);
      ld.push({ '@context': 'https://schema.org', '@type': 'Car', name: car.title, brand: { '@type': 'Brand', name: car.make }, model: car.model,
        vehicleModelDate: String(car.year || ''), bodyType: car.body, color: car.color || undefined, vehicleTransmission: car.transmission || undefined,
        fuelType: car.fuel || undefined, mileageFromOdometer: car.mileage || undefined,
        image: (car.photos || []).slice(0, 5).map((u) => config.siteUrl + u), description: desc, itemCondition: 'https://schema.org/UsedCondition',
        offers: !hasPrice(car) ? undefined : { '@type': 'Offer', price: Number(car.price), priceCurrency: 'NGN', availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: meta.url, seller: car.dealer_id && car.dealer_id !== 1 && car.seller ? { '@type': car.seller_type === 'dealer' ? 'AutoDealer' : 'Person', name: car.seller, address: { '@type': 'PostalAddress', addressRegion: car.state || undefined, addressCountry: 'NG' } } : { '@id': config.siteUrl + '/#dealer' } } });
      ld.push(crumbsLd([['Cars for sale', '/cars'], [car.make, `/cars/${slugify(car.make)}`], [car.model, `/cars/${slugify(car.make)}/${slugify(car.model)}`], [car.title, `/cars/${car.slug}`]]));
    }
  }

  let m = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    known = true;
    const post = await db.one(`SELECT ${pub.PUBLIC_POST_COLS} FROM posts WHERE slug = ? AND status = 'published'`, [m[1]]);
    if (!post) { status = 404; noindex = true; meta.title = 'Article not found | Korrect Cars'; }
    else {
      const more = await db.q("SELECT slug, title, image, published_at FROM posts WHERE id <> ? AND status = 'published' ORDER BY published_at DESC LIMIT 3", [post.id]);
      boot['/posts/' + m[1]] = { post, more };
      const desc = post.seo_desc || clip(strip(post.excerpt || post.content), 160);
      meta = { ...meta, title: post.seo_title || `${post.title} | Korrect Cars`, desc, image: post.image || DEFAULT.image, type: 'article' };
      const by = post.author || 'The Korrect Cars team';
      body = `<article><h1>${esc(post.title)}</h1><p>By ${esc(by)}${post.updated_at ? ` · Updated ${esc(String(post.updated_at).slice(0, 10))}` : ''}</p>${safeHtml(post.content)}${post.author_bio ? `<p><em>${esc(post.author_bio)}</em></p>` : ''}`
        + ((post.sources || []).length ? '<h2>Sources</h2><ul>' + post.sources.map((x) => `<li><a href="${esc(x.url)}" rel="noopener nofollow">${esc(x.title || x.url)}</a></li>`).join('') + '</ul>' : '')
        + (post.image_credit ? `<p>Cover: ${esc(post.image_credit)}</p>` : '') + '</article>';
      ld.push({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, datePublished: post.published_at, image: config.siteUrl + (post.image || DEFAULT.image),
        ...(post.updated_at ? { dateModified: post.updated_at } : {}),
        author: post.author && !/korrect cars/i.test(post.author) ? { '@type': 'Person', name: post.author, worksFor: { '@id': config.siteUrl + '/#dealer' } } : { '@type': 'Organization', name: 'Korrect Cars', url: config.siteUrl + '/' }, publisher: { '@type': 'Organization', name: 'Korrect Cars', logo: { '@type': 'ImageObject', url: config.siteUrl + '/img/logo.svg' } }, mainEntityOfPage: meta.url });
    }
  }
  if (p === '/blog') {
    const posts = await db.q("SELECT slug, title, excerpt, image, category, published_at, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 50");
    boot['/posts'] = { posts };
    // Every guide as a real link with its heading and excerpt, so search engines and AdSense see them without scripts
    body += posts.map((x) => `<a href="/blog/${esc(x.slug)}"><h2>${esc(x.title)}</h2><p>${esc(clip(strip(x.excerpt || ''), 200))}</p></a>`).join('');
    ld.push({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Korrect Cars guides', url: meta.url, blogPost: posts.slice(0, 20).map((x) => ({ '@type': 'BlogPosting', headline: x.title, url: `${config.siteUrl}/blog/${x.slug}`, datePublished: x.published_at })) });
  }

  m = p.match(/^\/(about-us|privacy-policy|terms-and-conditions|faqs)$/);
  if (m) {
    known = true;
    const page = await db.one('SELECT slug, title, content FROM pages WHERE slug = ?', [m[1]]);
    if (page) {
      boot['/pages/' + m[1]] = { page };
      if (m[1] === 'faqs') {
        let faqs = []; try { faqs = JSON.parse(page.content); } catch (_e) { /* not JSON */ }
        const pairs = faqs.map((f) => [f.q || f.question, strip(f.a || f.answer)]).filter(([q, a]) => q && a && (swapOn || !/swap/i.test(q)));
        if (pairs.length) { ld.push(faqLd(pairs)); body += pairs.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join(''); }
      } else {
        meta = { ...meta, title: `${page.title} | Korrect Cars`, desc: clip(strip(page.content), 160) }; body = `<h1>${esc(page.title)}</h1>${safeHtml(page.content)}`;
        if (m[1] === 'privacy-policy' && require('./lib/settings').current().marketplace) body += `<h2>${esc(copy.PRIVACY_MARKETPLACE.h1)}</h2>` + copyHtml(copy.PRIVACY_MARKETPLACE, { h1: false });
      }
    }
  }

  // Partner dealer pages (only while the switch is on). The join page may be found by search; the rest are private.
  const dealersOn = !!require('./lib/settings').current().marketplace;
  m = p.match(/^\/dealers\/([a-z0-9-]+)$/);
  if (dealersOn && m && !['join', 'invite'].includes(m[1])) {
    known = true;
    const d = await pub.sellerPage(m[1]);
    if (!d) { status = 404; noindex = true; meta.title = 'Seller not found | Korrect Cars'; }
    else {
      const sl = d.seller; const where = [sl.lga, sl.state].filter(Boolean).join(', ');
      boot['/dealers/' + m[1]] = d;
      const kindText = sl.type === 'dealer' ? 'Verified car dealer' : 'Verified Seller';
      meta = { ...meta, title: `${sl.name} — ${kindText}${where ? ' in ' + where : ''} | Korrect Cars`,
        desc: clip(`${sl.name}: ${sl.carsForSale} ${sl.carsForSale === 1 ? 'car' : 'cars'} for sale on Korrect Cars${where ? ' in ' + where : ''}. ${sl.type === 'dealer' ? 'CAC registration checked by Korrect Cars' : 'ID checked by Korrect Cars'}${sl.verifiedAt ? ' on ' + String(sl.verifiedAt).slice(0, 10) : ''}.`, 160) };
      if (!sl.indexable) noindex = true;
      const avail = d.cars.filter((c) => c.status === 'available');
      body = (sl.logo ? `<img class="ssr-logo-img" src="/r/400/logos/${esc(sl.logo.split('/').pop().replace(/\.\w+$/, ''))}.webp" alt="${esc(sl.name)} logo" width="96" height="96">` : '')
        + `<h1>${esc(sl.name)}</h1><p>${esc(kindText)}${where ? ` in ${esc(where)}` : ''}. ${sl.type === 'dealer' ? 'Korrect Cars checked this business\'s CAC registration' : 'Korrect Cars checked this seller\'s ID'}${sl.verifiedAt ? ` on ${esc(String(sl.verifiedAt).slice(0, 10))}` : ''}. ${sl.carsForSale} ${sl.carsForSale === 1 ? 'car' : 'cars'} for sale, ${sl.carsSold} sold on Korrect Cars.</p>`
        + (sl.about ? String(sl.about).split(/\n\n+/).map((x) => `<p>${esc(x)}</p>`).join('') : '')
        + '<ul class="ssr-cars">' + avail.map((c) => `<li><a href="/cars/${esc(c.slug)}"><span>${esc(c.title)}</span></a> <b>${esc(priceText(c))}</b></li>`).join('') + '</ul>';
      ld.push({ '@context': 'https://schema.org', '@type': sl.type === 'dealer' ? 'AutoDealer' : 'Person', name: sl.name, url: meta.url,
        ...(sl.logo ? { logo: config.siteUrl + sl.logo, image: config.siteUrl + sl.logo } : {}),
        ...(sl.type === 'dealer' ? { address: { '@type': 'PostalAddress', streetAddress: sl.address || undefined, addressLocality: sl.lga || undefined, addressRegion: sl.state || undefined, addressCountry: 'NG' },
          areaServed: sl.state ? { '@type': 'State', name: sl.state } : undefined, description: sl.about || undefined } : { homeLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressRegion: sl.state || undefined, addressCountry: 'NG' } } }) });
      ld.push(listLd(avail));
    }
  }
  // Boost plan fees: every plan for every length, as a table readable without scripts
  if (dealersOn && p === '/boost-plans') {
    known = true;
    const bp = require('./lib/boost-plans');
    const LEN = { 7: '7 days', 14: '14 days', 30: '30 days', 90: '3 months', 180: '6 months', 365: '1 year' };
    meta = { ...meta, title: 'Boost plan fees: 7 days to 1 year | Korrect Cars', desc: clip(`Boost your cars on Korrect Cars from ${naira(bp.quote('basic', 7).amount)} for 7 days. Featured badge, first place on the cars pages. Plans for 1 car to all your cars, 7 days to 1 year; VAT added at checkout.`, 160) };
    body = `<h1>${esc(copy.BOOSTS.h1)}</h1><p>${esc(copy.BOOSTS.lead)}</p>`
      + bp.DURATIONS.map(([d]) => `<h2>${LEN[d]}</h2><table><thead><tr><th>Plan</th><th>Cars boosted at once</th><th>Price</th><th>With VAT (${bp.VAT_PCT}%)</th></tr></thead><tbody>`
        + bp.priceList().map((pl) => { const q = pl.prices.find((x) => x.days === d); return `<tr><td>${esc(pl.name)}</td><td>${pl.cars == null ? 'All' : pl.cars}</td><td>${naira(q.amount)}</td><td>${naira(q.total)}</td></tr>`; }).join('') + '</tbody></table>').join('')
      + copyHtml(copy.BOOSTS, { h1: false }).replace(/^<p>.*?<\/p>/, '');
    const f = copyFaq(copy.BOOSTS); if (f.length) ld.push(faqLd(f));
    ld.push(crumbsLd([['Boost plan fees', p]]));
  }
  if (dealersOn && p === '/how-we-check-sellers') {
    known = true;
    meta = { ...meta, title: 'How Korrect Cars checks car sellers | Verified Dealers and Sellers', desc: clip(copy.SELLERS.lead, 160) };
    body = copyHtml(copy.SELLERS);
    const f = copyFaq(copy.SELLERS); if (f.length) ld.push(faqLd(f));
    ld.push(crumbsLd([['How we check sellers', p]]));
  }
  if (dealersOn && p === '/dealers/join') meta = { ...meta, title: 'Sell your car on Korrect Cars | Dealers and private sellers', desc: 'Car dealers and people selling their own car can list on Korrect Cars. Free to join; we check every dealer\'s CAC papers, and buyers see who has been checked.' };
  if (dealersOn && p === '/dealers/invite') noindex = true;
  if (dealersOn && /^\/dealer(\/cars\/(new|\d+))?$/.test(p)) noindex = true;
  known = known || /^\/(compare|account|login|register|verify-email|forgot-password|reset-password)$/.test(p) || (swapOn && /^\/swap\/(new|\d+)$/.test(p))
    || (dealersOn && /^\/(dealers\/join|dealers\/invite|dealer|dealer\/cars\/(new|\d+))$/.test(p));
  if (!known) { status = 404; noindex = true; meta.title = 'Page not found | Korrect Cars'; }

  const img = /^https?:/.test(meta.image) ? meta.image : config.siteUrl + meta.image;
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  // Staff visits (the staff area, or anyone signed in with a staff role) are left out of Google Analytics
  const staff = isAdmin || !!(req.user && req.user.role && req.user.role !== 'user');
  const kcNpa = "if(kcD==='denied'){(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;}";
  const head = [
    `<title>${esc(meta.title)}</title>`,
    preload,
    `<meta name="description" content="${esc(meta.desc)}">`,
    noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${esc(meta.url)}">`,
    `<meta property="og:type" content="${meta.type || 'website'}">`, '<meta property="og:site_name" content="Korrect Cars">',
    `<meta property="og:title" content="${esc(meta.title)}">`, `<meta property="og:description" content="${esc(meta.desc)}">`,
    `<meta property="og:url" content="${esc(meta.url)}">`, `<meta property="og:image" content="${esc(img)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    ...ld.map((x) => `<script type="application/ld+json">${json(x)}</script>`),
    config.adsenseClient ? `<meta name="google-adsense-account" content="${esc(config.adsenseClient)}">` : '',
    // Analytics and ads load after the page has shown (first scroll, tap or key, or 3.5 s after load), so their
    // ~400 KB of scripts never slow the first view. Page views are queued in dataLayer until gtag arrives.
    // Cookie choice (Google Consent Mode): "Decline" on the cookie bar turns off analytics cookies and personalised ads
    (config.gaId && !staff) || (config.adsenseClient && !noindex) ? `<script nonce="${nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}var kcC=null;try{kcC=localStorage.getItem('kc_consent');}catch(e){}var kcD=kcC==='no'?'denied':'granted';gtag('consent','default',{ad_storage:kcD,ad_user_data:kcD,ad_personalization:kcD,analytics_storage:kcD});${kcNpa}${config.gaId && !staff ? `gtag('js',new Date());gtag('config','${esc(config.gaId)}');` : ''}</script>` : '',
    (config.gaId && !staff) || (config.adsenseClient && !noindex) ? `<script nonce="${nonce}">(function(){var done=false,urls=${json([config.gaId && !staff ? 'https://www.googletagmanager.com/gtag/js?id=' + config.gaId : null, config.adsenseClient && !noindex ? 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + config.adsenseClient : null].filter(Boolean))};
function go(){if(done)return;done=true;urls.forEach(function(u){var s=document.createElement('script');s.async=true;s.src=u;if(/googlesyndication/.test(u))s.crossOrigin='anonymous';document.head.appendChild(s);});}
['scroll','pointerdown','keydown','touchstart'].forEach(function(e){addEventListener(e,go,{once:true,passive:true});});
addEventListener('load',function(){setTimeout(go,3500);});})();</script>` : '',
    `<script type="application/json" id="__boot">${json(boot)}</script>`
  ].filter(Boolean).join('\n');

  // <!--email_off--> stops Cloudflare's email hiding, whose script our security policy blocks (emails showed as
  // "[email protected]" and the console logged errors). The site shows emails as plain links on purpose.
  const html = shell().replace('<!--HEAD-->', head).replace('<!--BODY-->', ssrFrame(body, isAdmin)).replace(/__NONCE__/g, nonce)
    .replace('<head>', '<head><!--email_off-->').replace(/<\/html>\s*$/, '<!--/email_off--></html>\n');
  return { status, html: newTabOutside(html) };
}

// Light pages: links that leave korrectcars.com open in a new tab, same as the full site (see main.jsx).
// Only real <a href="http..."> tags match; JSON data in the page escapes its quotes, so it is untouched.
function newTabOutside(html) {
  return html.replace(/<a\s([^>]*?)href="(https?:\/\/([^/"]+)[^"]*)"([^>]*)>/gi, (m, pre, url, host, post) => {
    if (/^(www\.)?korrectcars\.com$/i.test(host) || /\starget=/i.test(' ' + pre + post)) return m;
    return `<a ${pre}href="${url}"${post} target="_blank"${/\srel=/i.test(' ' + pre + post) ? '' : ' rel="noopener"'}>`;
  });
}

module.exports = { renderPage, slugify, newTabOutside };
