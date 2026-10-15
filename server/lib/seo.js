// Search and AI-search helpers: robots.txt, llms.txt (a plain summary for AI assistants)
// and IndexNow (tells Bing and other engines about new or changed pages within seconds).
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const settings = require('./settings');

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const isStaging = () => /staging/.test(config.siteUrl) || process.env.INDEXNOW === 'off';

// AI training bots can be blocked in Settings; AI search/answer bots are always welcome
const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'Bytespider'];
function robotsTxt() {
  if (isStaging()) return 'User-agent: *\nDisallow: /\n';
  const st = settings.current();
  const block = st.aiTraining === 'block' ? TRAINING_BOTS.map((b) => `User-agent: ${b}\nDisallow: /\n`).join('\n') + '\n' : '';
  return `${block}User-agent: *\nDisallow: /account\nDisallow: /api/\nDisallow: /compare\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}

async function llmsTxt() {
  const st = settings.current();
  const cars = await db.q("SELECT slug, title, make, model, body, year, price, mileage, transmission, status FROM cars WHERE status IN ('available','sold') ORDER BY (status = 'sold'), price DESC LIMIT 100");
  const posts = await db.q("SELECT slug, title FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30");
  const avail = cars.filter((c) => c.status === 'available');
  const models = {};
  for (const c of avail) { const k = `${c.make}|${c.model}`; (models[k] = models[k] || []).push(Number(c.price)); }
  const u = (p) => config.siteUrl + p;
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Korrect Cars',
    '',
    `> Online car dealer in Lagos, Nigeria. Sells inspected, VIN-verified tokunbo (foreign-used) cars. Customers can buy outright or pay small small (instalments) through Korrect Cars' credit partners${st.swap ? ', or swap their car with a verified owner through Korrect Swap' : ''}.`,
    '',
    `- Website: ${u('/')}`,
    `- Phone: ${st.phones.join(', ')}`,
    `- WhatsApp: https://wa.me/${st.whatsapp}`,
    `- Email: ${st.email}`,
    `- Opening hours: ${st.hours}`,
    '- Location: Lagos, Nigeria (online dealer; cars are viewed at partner car lots in Lagos, address sent on WhatsApp after booking)',
    st.instagram ? `- Instagram: https://www.instagram.com/${st.instagram}/` : '',
    '',
    '## How buying works',
    '- Every car is inspected and its VIN history checked before it is listed.',
    '- Book a viewing, inspect the car and its papers, then pay only into the Korrect Cars company account (never a personal account).',
    `- Pay Small Small: the website gives an estimate (about ${st.bnpl.minDeposit}% deposit and a ${st.bnpl.markup}% charge on the balance, over ${st.bnpl.minMonths} to ${st.bnpl.maxMonths} months). The credit partners${st.bankPartner ? ` (${st.bankPartner})` : ''} (banks or finance companies) decide who qualifies and set the final terms; once approved, Korrect Cars sells the car.`,
    st.swap ? `- Korrect Swap: owners list their car, get matched, inspect both cars at a partner car lot, and pay a ${st.swapFeePct}% swap fee only after a successful inspection.` : null,
    '',
    `## Cars in stock (updated ${today})`,
    ...avail.map((c) => `- [${c.title}](${u('/cars/' + c.slug)}): ${naira(c.price)}${c.year ? `, ${c.year}` : ''}${c.body ? `, ${c.body}` : ''}${c.mileage ? `, ${c.mileage}` : ''}${c.transmission ? `, ${c.transmission}` : ''}`),
    avail.length ? '' : '- No cars listed right now. Contact us on WhatsApp.',
    '## Prices by model',
    ...Object.entries(models).map(([k, prices]) => {
      const [make, model] = k.split('|'); const lo = Math.min(...prices); const hi = Math.max(...prices);
      return `- [${make} ${model}](${u(`/cars/${slugify(make)}/${slugify(model)}`)}): ${lo === hi ? naira(lo) : `${naira(lo)} to ${naira(hi)}`} (${prices.length} in stock)`;
    }),
    '',
    '## Key pages',
    `- [Cars for sale](${u('/cars')})`,
    `- [Pay Small Small](${u('/pay-small-small')})`,
    st.swap ? `- [Korrect Swap](${u('/swap')})` : null,
    `- [Frequently asked questions](${u('/faqs')})`,
    `- [About Korrect Cars](${u('/about-us')})`,
    `- [Contact](${u('/contact')})`,
    '',
    '## Guides',
    ...posts.map((p) => `- [${p.title}](${u('/blog/' + p.slug)})`),
    ''
  ];
  return lines.filter((l) => l !== null).filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

// IndexNow: Bing, Yandex, Seznam, Naver (Bing results also feed ChatGPT search and Copilot)
const indexKey = () => settings.internal('indexnowKey', () => crypto.randomBytes(16).toString('hex'));
async function notify(paths) {
  if (isStaging() || !config.isProd) return { skipped: true };
  try {
    const key = await indexKey();
    const host = new URL(config.siteUrl).host;
    const urlList = [...new Set(paths)].map((p) => config.siteUrl + p).slice(0, 100);
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${config.siteUrl}/${key}.txt`, urlList }), signal: AbortSignal.timeout(8000)
    });
    return { status: r.status };
  } catch (e) { console.warn('IndexNow failed:', e.message); return { error: e.message }; }
}
// Pages that change when a car changes
const carPaths = (car) => (car ? ['/cars/' + car.slug, '/cars', '/', `/cars/${slugify(car.make)}`, `/cars/${slugify(car.make)}/${slugify(car.model)}`] : ['/cars', '/']);

function routes(app) {
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robotsTxt()));
  app.get('/llms.txt', async (_req, res, next) => { try { res.set('Cache-Control', 'public, max-age=900').type('text/plain; charset=utf-8').send(await llmsTxt()); } catch (e) { next(e); } });
  app.get(/^\/([a-f0-9]{32})\.txt$/, async (req, res, next) => {
    try { const key = await indexKey(); if (req.params[0] !== key) return next(); res.type('text/plain').send(key); } catch (e) { next(e); }
  });
}

module.exports = { routes, notify, carPaths, robotsTxt, llmsTxt };
