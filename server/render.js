// Serves the React app shell with page-specific title, description, social tags,
// structured data and readable HTML content, so Google, AI assistants and AdSense see real content.
// It also embeds the data each page needs (window.__BOOT), so pages show cars straight away
// without waiting on extra API requests.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const pub = require('./routes/public');
const cats = require('./lib/categories');

// Light photo URLs (same rule as the browser's rs()) and a preload tag for the page's main photo
const RS = /^\/(?:uploads\/(cars|blog|swap|site)|(img))\/([A-Za-z0-9._-]+)\.(?:jpe?g|png|webp)$/i;
const rs = (u, w) => { const m = String(u || '').match(RS); return m ? `/r/${w}/${m[1] || m[2]}/${m[3]}.webp` : u; };
const preloadTag = (u, sizes, widths = [800, 1200, 1600]) => (RS.test(String(u || ''))
  ? `<link rel="preload" as="image" href="${rs(u, widths[1])}" imagesrcset="${widths.map((w) => `${rs(u, w)} ${w}w`).join(', ')}" imagesizes="${sizes}" fetchpriority="high">` : '');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const strip = (h) => String(h || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  desc: 'Inspected, VIN-verified tokunbo and foreign-used cars in Lagos. Buy outright or pay small small through our credit partners. Delivery anywhere in Nigeria.',
  image: '/img/hero.jpg'
};

const STATIC = {
  '/': { title: DEFAULT.title, desc: DEFAULT.desc, h1: 'Buy inspected tokunbo cars in Lagos' },
  '/cars': { title: 'Cars for Sale in Lagos — Tokunbo & Foreign Used | Korrect Cars', desc: 'Browse inspected, VIN-verified tokunbo and foreign-used cars for sale in Lagos. Filter by make, model, year, body type and price.', h1: 'Cars for sale in Lagos' },
  '/swap': { title: 'Korrect Swap — Swap Your Car With Verified Owners | Korrect Cars', desc: 'List your car, tell us what you want, and swap with verified owners in Lagos. Inspection at a partner car lot before any car or money changes hands.', h1: 'Swap your car' },
  '/pay-small-small': { title: 'Pay Small Small — Car Payment Plans in Lagos | Korrect Cars', desc: 'Get an estimate of your monthly payment for any car at Korrect Cars, then apply through our credit partners. Once a credit partner approves you, we sell you the car.', h1: 'Pay Small Small' },
  '/blog': { title: 'Car Buying Guides for Nigeria | Korrect Cars Blog', desc: 'Guides on buying tokunbo cars, customs duty, VIN checks, maintenance and the best cars for Lagos roads.', h1: 'Guides' },
  '/contact': { title: 'Contact Korrect Cars — Lagos', desc: `Call, WhatsApp or email Korrect Cars. Online car dealer in Lagos, open ${config.hours}.`, h1: 'Contact us' },
  '/faqs': { title: 'Frequently Asked Questions | Korrect Cars', desc: 'Answers about buying, viewings and inspections, payments and Pay Small Small.', h1: 'Frequently asked questions' }
};
const NOINDEX = /^\/(account|login|register|swap\/new|verify-email|forgot-password|reset-password|compare)(\/|$)/;

const PSS_FAQ = [
  ['How does Pay Small Small work at Korrect Cars?', 'Pick a car and get an estimate of your deposit and monthly payment. Apply in minutes, and with your consent we pass your details to our credit partners. Once a credit partner approves you, Korrect Cars sells you the car.'],
  ['Who decides if I qualify?', 'Our credit partner checks if you qualify and sets the final deposit, charge and number of months.'],
  ['Is the calculator figure final?', 'No. It is an estimate based on a 40% deposit and a 20% charge on the balance. The credit partner sets your real terms.'],
  ['Can I get a car on Pay Small Small outside Lagos?', 'Yes. Korrect Cars delivers anywhere in Nigeria. Apply online, and once a credit partner approves you we arrange delivery to your city.']
];

function orgLd() {
  const st = require('./lib/settings').current();
  return {
    '@context': 'https://schema.org', '@type': 'AutoDealer', '@id': config.siteUrl + '/#dealer', name: 'Korrect Cars', url: config.siteUrl + '/',
    logo: config.siteUrl + '/img/logo.svg', image: config.siteUrl + DEFAULT.image, email: st.email, telephone: st.phones,
    description: 'Online car dealer in Lagos selling inspected, VIN-verified tokunbo and foreign-used cars, with Pay Small Small through credit partners and delivery anywhere in Nigeria.',
    areaServed: [{ '@type': 'City', name: 'Lagos' }, { '@type': 'Country', name: 'Nigeria' }], address: { '@type': 'PostalAddress', addressLocality: 'Lagos', addressCountry: 'NG' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: config.hoursSpec.days, opens: config.hoursSpec.opens, closes: config.hoursSpec.closes }],
    sameAs: st.instagram ? [`https://www.instagram.com/${st.instagram}/`] : []
  };
}
const faqLd = (pairs) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const crumbsLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: config.siteUrl + url })) });
const listLd = (cars) => ({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: cars.filter((c) => c.status === 'available').slice(0, 30).map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${config.siteUrl}/cars/${c.slug}`, name: c.title })) });

// Lowest Pay Small Small estimate (minimum deposit, 24 months) among cars in stock
const monthlyFrom = (cars) => { const a = cars.filter((c) => c.status === 'available'); return a.length ? pub.bnplPlan(Math.min(...a.map((c) => Number(c.price))), 0, 24).monthly : 0; };
// "Shop by budget" links with live counts, for search engines and AI assistants
function budgetLinksHtml(allCars, skip) {
  const avail = allCars.filter((c) => c.status === 'available');
  const l = cats.budgets().filter((c) => c.slug !== skip).map((c) => [c, avail.filter(c.test)]).filter(([, x]) => x.length);
  return l.length ? '<h2>Shop by budget</h2><ul>' + l.map(([c, x]) => { const pr = x.map((y) => Number(y.price)); const lo = Math.min(...pr); const hi = Math.max(...pr); return `<li><a href="/cars/${c.slug}">${esc(c.h1)}</a>: ${x.length} in stock, ${esc(lo === hi ? naira(lo) : `${naira(lo)} to ${naira(hi)}`)}</li>`; }).join('') + '</ul>' : '';
}

// "How much is a Toyota Camry in Nigeria?" answer from the cars actually in stock
function priceAnswer(subject, cars) {
  const avail = cars.filter((c) => c.status === 'available');
  if (!avail.length) return `We have no ${subject || 'cars'} in stock right now. Chat with us on WhatsApp and we will find one for you.`;
  const prices = avail.map((c) => Number(c.price));
  const lo = Math.min(...prices); const hi = Math.max(...prices);
  const range = lo === hi ? `costs ${naira(lo)}` : `cost from ${naira(lo)} to ${naira(hi)}`;
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
  const isAdmin = p === config.adminPath;
  let body = ''; let status = 200; let noindex = NOINDEX.test(p) || isAdmin; let known = isAdmin;
  const ld = [];
  let preload = '';
  const boot = { '/config': isAdmin ? { ...pub.publicConfig(), adminPath: config.adminPath } : pub.publicConfig(), '/auth/me': { user: req.user ? pub.publicUser(req.user, req.mfa) : null } };

  const swapOn = require('./lib/settings').current().swap;
  const swapPath = /^\/swap(\/|$)/.test(p);
  if (STATIC[p] && !(swapPath && !swapOn)) { known = true; meta = { ...meta, ...STATIC[p] }; body = `<h1>${esc(STATIC[p].h1)}</h1><p>${esc(STATIC[p].desc)}</p>`; }

  // Pages that list cars get the whole public stock (small) and filter it in the browser
  const needsCars = p === '/' || p === '/cars' || p === '/pay-small-small' || p === '/compare' || /^\/cars\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p);
  let allCars = null;
  if (needsCars) {
    allCars = await pub.listCars({ limit: 100 });
    boot['/cars?limit=100'] = { cars: allCars };
    boot['/cars/facets'] = await pub.facets();
  }

  if (p === '/') {
    ld.push(orgLd());
    const posts = await db.q("SELECT slug, title, excerpt, image, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 3");
    boot['/posts?limit=3'] = { posts };
  }
  if (p === '/' || p === '/cars') {
    const avail = allCars.filter((c) => c.status === 'available');
    body += '<ul>' + avail.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(naira(c.price))}</li>`).join('') + '</ul>';
    const catLinks = cats.pages().map((c) => [c, avail.filter(c.test).length]).filter(([, n]) => n > 0);
    if (catLinks.length) body += '<h2>Browse by category</h2><ul>' + catLinks.filter(([c]) => !c.budget).map(([c, n]) => `<li><a href="/cars/${c.slug}">${esc(c.name)}</a> (${n} in stock)</li>`).join('') + '</ul>';
    body += budgetLinksHtml(allCars);
    if (p === '/cars') { ld.push(listLd(allCars)); body += `<h2>How much are the cars at Korrect Cars?</h2><p>${esc(priceAnswer('', allCars))}</p>`; }
  }
  if (p === '/pay-small-small') {
    const avail = allCars.filter((c) => c.status === 'available').sort((a, b) => a.price - b.price);
    const q = 'Which cars can I buy on Pay Small Small in Lagos?';
    const a = avail.length ? `Every one of the ${avail.length} cars in stock at Korrect Cars can be bought on Pay Small Small, from about ${naira(monthlyFrom(avail))} a month (estimate: ${pub.bnplPlan(Number(avail[0].price), 0, 24).months} months, minimum deposit). Credit partners confirm the final terms, and we deliver anywhere in Nigeria.` : 'Chat with us on WhatsApp and we will find a car for your budget.';
    ld.push(faqLd([[q, a], ...PSS_FAQ]), listLd(avail));
    body += `<h2>${esc(q)}</h2><p>${esc(a)}</p><ul>` + avail.map((c) => { const pl = pub.bnplPlan(Number(c.price), 0, 24); return `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a>: ${esc(naira(c.price))}, about ${esc(naira(pl.deposit))} deposit then ${esc(naira(pl.monthly))}/month for ${pl.months} months</li>`; }).join('') + '</ul>'
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
    body = `<h1>${esc(subject)} for sale in Lagos</h1><ul>` + cars.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(naira(c.price))}${c.status === 'sold' ? ' (sold)' : ''}</li>`).join('') + `</ul><h2>${esc(q)}</h2><p>${esc(a)}</p>`;
    const crumbs = [['Cars for sale', '/cars'], [rc.make, `/cars/${slugify(rc.make)}`]];
    if (rc.kind === 'model') crumbs.push([rc.model, `/cars/${slugify(rc.make)}/${slugify(rc.model)}`]);
    ld.push(crumbsLd(crumbs), listLd(cars), faqLd([[q, a]]));
  }
  if (rc && rc.kind === 'category') {
    known = true;
    const cat = rc.cat;
    const cars = allCars.filter(cat.test);
    const avail = cars.filter((c) => c.status === 'available');
    const prices = avail.map((c) => Number(c.price)); const lo = Math.min(...prices); const hi = Math.max(...prices);
    const a = avail.length ? `Korrect Cars has ${avail.length} ${avail.length === 1 ? 'car' : 'cars'} in "${cat.name}" in Lagos right now, ${lo === hi ? `at ${naira(lo)}` : `from ${naira(lo)} to ${naira(hi)}`}. Every car is inspected and VIN-verified, you can pay small small from about ${naira(monthlyFrom(avail))} a month through our credit partners, and we deliver anywhere in Nigeria.`
      : `We have no cars in "${cat.name}" in stock right now. Chat with us on WhatsApp and we will find one for you.`;
    meta = { ...meta, title: `${cat.h1} — Prices & Pay Small Small | Korrect Cars`, desc: clip(`${cat.intro} ${a}`, 160) };
    // A category with too few cars in stock (e.g. no electric cars yet) stays out of search results until it fills up
    if (avail.length < cats.MIN_INDEX) noindex = true;
    body = `<h1>${esc(cat.h1)}</h1><p>${esc(cat.intro)}</p><ul>` + cars.map((c) => `<li><a href="/cars/${esc(c.slug)}">${esc(c.title)}</a> — ${esc(naira(c.price))}${c.status === 'sold' ? ' (sold)' : ''}</li>`).join('') + `</ul><h2>${esc(cat.faq)}</h2><p>${esc(a)}</p>` + budgetLinksHtml(allCars, cat.slug);
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
      const plan = car.status === 'sold' ? null : pub.bnplPlan(Number(car.price), 0, 24);
      const pss = plan ? ` or pay small small from about ${naira(plan.monthly)}/month` : '';
      // Every car's search description leads with its price and Pay Small Small figure; old imported wording ("BNPL") is updated
      const extra = strip(car.seo_desc || car.description).replace(/\bBNPL\b/g, 'pay small small');
      const sold = car.status === 'sold';
      // A sold car keeps its page (it still gets found on Google), but sends the visitor on to similar cars in stock
      const desc = sold
        ? clip(`Sold: this ${car.title} has been sold. See similar ${car.make} ${car.model} and ${car.body || 'other'} cars in stock in Lagos, with pay small small and delivery anywhere in Nigeria.`, 160)
        : clip(`${car.title} for sale in ${car.location || 'Lagos'} at ${naira(car.price)}${pss}. ${extra}`, 160);
      meta = { ...meta, title: sold ? `Sold: ${car.title} — See Similar Cars in Lagos | Korrect Cars` : (car.seo_title || `${car.title} for Sale in Lagos — ${naira(car.price)} | Korrect Cars`), desc, image: (car.photos || [])[0] || DEFAULT.image };
      const similarHtml = (d.similar || []).length ? `<h2>${sold ? 'Similar cars in stock' : 'Similar cars'}</h2><ul>` + d.similar.map((x) => `<li><a href="/cars/${esc(x.slug)}">${esc(x.title)}</a> — ${esc(naira(x.price))}</li>`).join('') + '</ul>' : '';
      body = `<h1>${esc(car.title)}</h1><p><strong>${esc(naira(car.price))}</strong>${sold ? ' — SOLD' : ''}</p>`
        + (sold ? `<p>This car has been sold. See <a href="/cars/${slugify(car.make)}/${slugify(car.model)}">every ${esc(car.make)} ${esc(car.model)} for sale</a> or <a href="/cars">all cars in stock</a>.</p>` + similarHtml : '')
        + String(car.description || '').split(/\n\n+/).map((x) => `<p>${esc(x)}</p>`).join('')
        + (car.features && car.features.length ? '<ul>' + car.features.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>' : '')
        + (plan ? `<h2>Pay small small for this ${esc(car.make)} ${esc(car.model)}</h2><p>Estimate: about ${esc(naira(plan.deposit))} deposit, then about ${esc(naira(plan.monthly))} a month for ${plan.months} months, through our credit partners. They confirm the final terms; once you are approved, Korrect Cars sells you the car. <a href="/pay-small-small?car=${esc(car.slug)}">Get your estimate and apply</a>.</p>` : '')
        + (sold ? '' : `<p>View it at a partner car lot in Lagos, or have it delivered anywhere in Nigeria.</p>${similarHtml}`);
      ld.push({ '@context': 'https://schema.org', '@type': 'Car', name: car.title, brand: { '@type': 'Brand', name: car.make }, model: car.model,
        vehicleModelDate: String(car.year || ''), bodyType: car.body, color: car.color || undefined, vehicleTransmission: car.transmission || undefined,
        fuelType: car.fuel || undefined, mileageFromOdometer: car.mileage || undefined,
        image: (car.photos || []).slice(0, 5).map((u) => config.siteUrl + u), description: desc, itemCondition: 'https://schema.org/UsedCondition',
        offers: { '@type': 'Offer', price: Number(car.price), priceCurrency: 'NGN', availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: meta.url, seller: { '@id': config.siteUrl + '/#dealer' } } });
      ld.push(crumbsLd([['Cars for sale', '/cars'], [car.make, `/cars/${slugify(car.make)}`], [car.model, `/cars/${slugify(car.make)}/${slugify(car.model)}`], [car.title, `/cars/${car.slug}`]]));
    }
  }

  let m = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    known = true;
    const post = await db.one("SELECT * FROM posts WHERE slug = ? AND status = 'published'", [m[1]]);
    if (!post) { status = 404; noindex = true; meta.title = 'Article not found | Korrect Cars'; }
    else {
      const more = await db.q("SELECT slug, title, image, published_at FROM posts WHERE id <> ? AND status = 'published' ORDER BY published_at DESC LIMIT 3", [post.id]);
      boot['/posts/' + m[1]] = { post, more };
      const desc = post.seo_desc || clip(strip(post.excerpt || post.content), 160);
      meta = { ...meta, title: post.seo_title || `${post.title} | Korrect Cars`, desc, image: post.image || DEFAULT.image, type: 'article' };
      const by = post.author || 'The Korrect Cars team';
      body = `<article><h1>${esc(post.title)}</h1><p>By ${esc(by)}${post.updated_at ? ` · Updated ${esc(String(post.updated_at).slice(0, 10))}` : ''}</p>${safeHtml(post.content)}${post.author_bio ? `<p><em>${esc(post.author_bio)}</em></p>` : ''}</article>`;
      ld.push({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, datePublished: post.published_at, image: config.siteUrl + (post.image || DEFAULT.image),
        ...(post.updated_at ? { dateModified: post.updated_at } : {}),
        author: post.author && !/korrect cars/i.test(post.author) ? { '@type': 'Person', name: post.author, worksFor: { '@id': config.siteUrl + '/#dealer' } } : { '@type': 'Organization', name: 'Korrect Cars', url: config.siteUrl + '/' }, publisher: { '@type': 'Organization', name: 'Korrect Cars', logo: { '@type': 'ImageObject', url: config.siteUrl + '/img/logo.svg' } }, mainEntityOfPage: meta.url });
    }
  }
  if (p === '/blog') boot['/posts'] = { posts: await db.q("SELECT slug, title, excerpt, image, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 50") };

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
      } else { meta = { ...meta, title: `${page.title} | Korrect Cars`, desc: clip(strip(page.content), 160) }; body = `<h1>${esc(page.title)}</h1>${safeHtml(page.content)}`; }
    }
  }

  known = known || /^\/(compare|account|login|register|verify-email|forgot-password|reset-password)$/.test(p) || (swapOn && /^\/swap\/(new|\d+)$/.test(p));
  if (!known) { status = 404; noindex = true; meta.title = 'Page not found | Korrect Cars'; }

  const img = /^https?:/.test(meta.image) ? meta.image : config.siteUrl + meta.image;
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  // Staff visits (the staff area, or anyone signed in with a staff role) are left out of Google Analytics
  const staff = isAdmin || !!(req.user && req.user.role && req.user.role !== 'user');
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
    config.gaId && !staff ? `<script async nonce="${nonce}" src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaId)}"></script><script nonce="${nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(config.gaId)}');</script>` : '',
    config.adsenseClient && !noindex ? `<script async nonce="${nonce}" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsenseClient)}" crossorigin="anonymous"></script>` : '',
    `<script type="application/json" id="__boot">${json(boot)}</script>`
  ].filter(Boolean).join('\n');

  const html = shell().replace('<!--HEAD-->', head).replace('<!--BODY-->', `<div class="ssr">${body}</div>`).replace(/__NONCE__/g, nonce);
  return { status, html };
}

module.exports = { renderPage, slugify };
