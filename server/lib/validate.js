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
    keepPhotos: z.union([z.string(), z.array(z.string())]).optional()
  })
};

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

module.exports = { validate, list };
