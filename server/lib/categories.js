// Car categories, shared by the website (homepage rows, category pages) and the server
// (search-engine HTML, sitemap, llms.txt). Plain CommonJS with no Node-only code, so the
// React build can import this same file. To add a category, add one entry below.
//
//   slug   web address: /cars/<slug>
//   name   short label for rows, links and chips
//   h1     page heading (also used for the page title)
//   faq    the price question answered on the page (people ask search engines and AI assistants this)
//   intro  one-sentence description shown under the heading and used by search engines
//   test   which cars belong (gets one car object from /api/cars)
//   sort   default order on the category page: 'recommended' (shuffled per visitor), 'newest' or 'price-desc'
//   page   false = homepage row only, no /cars/<slug> page
const M = 1000000;
const text = (c, k) => String((c && c[k]) || '');
const isElectric = (c) => /\b(electric|hybrid|plug-in|phev|ev)\b/i.test(`${text(c, 'fuel')} ${text(c, 'engine')}`);
const DAY = 24 * 3600 * 1000;
const ageDays = (c) => { const t = Date.parse(text(c, 'created_at')); return Number.isFinite(t) ? (Date.now() - t) / DAY : Infinity; };

const CATEGORIES = [
  { slug: 'new-arrivals', faq: 'What new cars just arrived at Korrect Cars?', name: 'New arrivals', h1: 'New arrivals', intro: 'The newest cars at Korrect Cars, just listed and ready to view at partner car lots in Lagos.', test: () => true, sort: 'newest' },
  { slug: 'featured', faq: 'Which cars does Korrect Cars recommend?', name: 'Featured cars', h1: 'Featured cars', intro: 'Cars our team recommends this week.', test: (c) => Number(c.featured) === 1, sort: 'recommended', page: false },
  { slug: 'under-20-million', faq: 'What cars can I buy for under ₦20 million in Lagos?', name: 'Under ₦20m', h1: 'Cars under ₦20 million in Lagos', intro: 'Inspected, VIN-verified tokunbo and foreign-used cars for ₦20 million or less, with Pay Small Small through our credit partners.', test: (c) => Number(c.price) <= 20 * M, sort: 'recommended' },
  { slug: 'suv', faq: 'How much is an SUV in Lagos?', name: 'SUVs', h1: 'SUVs for sale in Lagos', intro: 'Tokunbo and foreign-used SUVs and crossovers for Lagos roads, every one inspected and VIN-verified.', test: (c) => /suv|crossover/i.test(text(c, 'body')), sort: 'recommended' },
  { slug: 'sedan', faq: 'How much is a sedan in Lagos?', name: 'Sedans', h1: 'Sedans for sale in Lagos', intro: 'Tokunbo and foreign-used saloon cars, from everyday Camrys to sporty Lexus models, all inspected and VIN-verified.', test: (c) => /sedan|saloon/i.test(text(c, 'body')), sort: 'recommended' },
  { slug: 'luxury', faq: 'How much are luxury cars in Lagos?', name: 'Premium (₦30m and above)', h1: 'Luxury and premium cars in Lagos', intro: 'Premium and luxury cars from ₦30 million and above, inspected and VIN-verified.', test: (c) => Number(c.price) >= 30 * M, sort: 'price-desc' },
  { slug: 'electric-hybrid', faq: 'How much is an electric or hybrid car in Lagos?', name: 'Electric & hybrid', h1: 'Electric and hybrid cars for sale in Lagos', intro: 'Electric and hybrid cars that save fuel, inspected and VIN-verified.', test: isElectric, sort: 'recommended' }
];
const MIN_HOME = 3; // a homepage row shows only when this many cars are available in it

const bySlug = (slug) => CATEGORIES.find((c) => c.slug === slug && c.page !== false) || null;
const pages = () => CATEGORIES.filter((c) => c.page !== false);
const isNew = (c) => ageDays(c) <= 21;

module.exports = { CATEGORIES, MIN_HOME, bySlug, pages, isNew, ageDays };
