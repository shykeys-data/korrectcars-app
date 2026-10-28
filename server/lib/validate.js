// Zod schemas for every form the API accepts. Routes use validate('<name>'), which puts the cleaned values on req.valid
// and answers 400 with a plain message when something is wrong. Add a field here first, then in the route and the form.
const { z } = require('zod');

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(120);
const shortText = (max = 120) => z.string().trim().max(max);
const money = z.coerce.number().int().min(0).max(5_000_000_000);

const schemas = {
  register: z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email, phone,
    password: z.string().min(8, 'Use at least 8 characters').max(128)
      .regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number')
  }),
  login: z.object({ email, password: z.string().min(1).max(128) }),
  enquiry: z.object({
    type: z.enum(['viewing', 'offer', 'bnpl', 'contact']),
    car: z.coerce.string().regex(/^\d{1,10}$/).optional(),
    name: z.string().trim().min(2).max(80), phone, email: email.optional().or(z.literal('')),
    message: shortText(1500).optional(),
    offerAmount: money.optional(), preferredDate: shortText(40).optional(),
    deposit: money.optional(), months: z.coerce.number().int().min(1).max(60).optional(),
    consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to be contacted' }) }),
    website: z.string().max(0).optional() // honeypot: bots fill this
  }),
  swapListing: z.object({
    make: shortText(40).min(1), model: shortText(40).min(1), body: shortText(30).min(1),
    year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
    mileage: shortText(30).optional(), value: money, location: shortText(60).min(2),
    condition: shortText(40).optional(), color: shortText(30).optional(), transmission: shortText(30).optional(),
    description: shortText(2000).optional(),
    wantsMakes: z.union([z.string(), z.array(z.string())]).optional(),
    wantsBodies: z.union([z.string(), z.array(z.string())]).optional(),
    maxTopUp: money.optional(), wantsNotes: shortText(500).optional()
  }),
  offer: z.object({
    listing: z.coerce.string().regex(/^\d{1,10}$/),
    fromListing: z.coerce.string().regex(/^\d{1,10}$/),
    topUp: money.default(0),
    topUpPayer: z.enum(['from', 'to', 'none']).default('none'),
    message: shortText(1000).optional()
  }),
  message: z.object({ text: z.string().trim().min(1).max(1000) }),
  car: z.object({
    title: shortText(140).min(3), make: shortText(40).min(1), model: shortText(60).min(1), body: shortText(30).min(1),
    year: z.coerce.number().int().min(1950).max(2100).optional(), price: money, oldPrice: money.optional().or(z.literal('')),
    mileage: shortText(40).optional(), engine: shortText(80).optional(), transmission: shortText(40).optional(),
    drivetrain: shortText(40).optional(), fuel: shortText(30).optional(), color: shortText(40).optional(),
    interior: shortText(60).optional(), condition: shortText(40).optional(), location: shortText(60).optional(),
    trim: shortText(60).optional(), vin: shortText(40).optional(), stock: shortText(40).optional(),
    specsText: shortText(4000).optional(), infoText: shortText(4000).optional(),
    description: shortText(8000).optional(), features: z.union([z.string(), z.array(z.string())]).optional(),
    status: z.enum(['available', 'sold', 'hidden']).optional(), featured: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    keepPhotos: z.union([z.string(), z.array(z.string())]).optional(),
    inspection: shortText(6000).optional() // JSON from the form; checked again by inspectionSchema
  }),
  // Guides written or edited in the staff area. Content is HTML and is cleaned by lib/sanitize.js before saving.
  post: z.object({
    title: shortText(160).min(8, 'Write a title of at least 8 characters'),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,120}$/, 'Web address: letters, numbers and dashes only').optional().or(z.literal('')),
    category: z.enum(['Buying guide', 'Car review', 'Market update', 'News', 'EV', 'Pay Small Small']),
    excerpt: shortText(300).optional(),
    content: z.string().max(200000).optional(),
    author: shortText(120).optional(),
    ownInput: shortText(2000).optional(),
    sources: z.array(z.object({ title: shortText(200).optional(), url: z.string().trim().url('Each source needs a full web address').max(500).regex(/^https?:\/\//i, 'Sources must start with http:// or https://') })).max(20).optional(),
    imageSource: z.enum(['template', 'own', 'press', 'stock', 'free', 'ai']).optional(),
    imageCredit: shortText(200).optional()
  }),
  importDraft: z.object({ text: z.string().trim().min(40, 'Paste the whole draft, starting with the Title: line').max(100000) }),
  // "Nigeria car market today": typed by staff, each figure with its source and date
  market: z.object({
    note: shortText(1500).optional(),
    items: z.array(z.object({
      label: shortText(80).min(2), value: shortText(60).min(1), detail: shortText(200).optional(),
      source: shortText(120).min(2, 'Each figure needs its source'), url: z.string().trim().url().max(500).regex(/^https?:\/\//i).optional().or(z.literal('')),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date as YYYY-MM-DD')
    })).max(12)
  })
};

// Car inspection notes (kept as JSON on the car). Every part is optional; empty notes are not shown.
const { INSPECTION_AREAS } = require('./inspection-areas');
const inspectionSchema = z.object({
  by: shortText(80).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  items: z.array(z.object({ area: z.enum(INSPECTION_AREAS), status: z.enum(['ok', 'watch', '']).optional(), note: shortText(300).optional() })).max(INSPECTION_AREAS.length)
});

function validate(name) {
  return (req, res, next) => {
    const r = schemas[name].safeParse(req.body);
    if (!r.success) {
      const first = r.error.issues[0];
      return res.status(400).json({ error: first.message, field: first.path.join('.') });
    }
    req.valid = r.data;
    next();
  };
}

const list = (v) => (v == null ? [] : (Array.isArray(v) ? v : String(v).split(','))).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);

module.exports = { validate, list, schemas, inspectionSchema, INSPECTION_AREAS };
