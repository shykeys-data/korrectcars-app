// All settings that come from the environment (DirectAdmin "Setup Node.js App", .htaccess SetEnv lines or a local .env),
// with safe defaults. Owner-editable values (phones, estimate figures, Swap on/off) live in lib/settings.js instead.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Session signing key: use JWT_SECRET if set, otherwise create a random one once and keep it
// in a private file next to the app (never inside the web folder).
function sessionSecret() {
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) return env.JWT_SECRET;
  const fs = require('fs');
  const file = path.join(__dirname, '..', '.session-secret');
  try { const s = fs.readFileSync(file, 'utf8').trim(); if (s.length >= 32) return s; } catch (_e) { /* create below */ }
  const s = require('crypto').randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

function staffPath(v) {
  const p = String(v || '').replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9-_]/g, '');
  if (p.length >= 12) return '/' + p;
  console.warn('ADMIN_PATH is missing or shorter than 12 characters: the staff pages are switched off.');
  return null;
}

module.exports = {
  isProd,
  port: Number(env.PORT) || 3000,
  jwtSecret: sessionSecret(),
  siteUrl: (env.SITE_URL || 'https://www.korrectcars.com').replace(/\/$/, ''),
  whatsapp: env.WHATSAPP_NUMBER || '2348138588818',
  phones: (env.CONTACT_PHONES || '+234 809 139 7912,+234 813 858 8818').split(','),
  email: env.CONTACT_EMAIL || 'info@korrectcars.com',
  mailFrom: env.MAIL_FROM || 'info@korrectcars.com',
  adsenseClient: env.ADSENSE_CLIENT === undefined ? 'ca-pub-9741732903227479' : env.ADSENSE_CLIENT,
  gaId: env.GA_ID === undefined ? 'G-T3H426CGY9' : env.GA_ID,
  bnpl: {
    minDeposit: Number(env.BNPL_MIN_DEPOSIT_PCT) || 40,
    markup: Number(env.BNPL_MARKUP_PCT) || 20,
    minMonths: Number(env.BNPL_MIN_MONTHS) || 6,
    maxMonths: Number(env.BNPL_MAX_MONTHS) || 48
  },
  swapFeePct: Number(env.SWAP_FEE_PCT) || 2,
  // Business details shown in the footer and in structured data for Google and AI assistants
  hours: env.OPENING_HOURS || 'Mon–Sat, 8am – 6pm',
  hoursSpec: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '08:00', closes: '18:00' },
  instagram: env.INSTAGRAM || 'korrectcarsofficial',
  bankPartner: env.BANK_PARTNER_NAME || '',
  // Staff sign-in address. It is set only on the server (ADMIN_PATH) and is never written in this public code.
  // Not linked anywhere on the site; staff are given it directly. Without a long ADMIN_PATH the staff pages stay off.
  adminPath: staffPath(env.ADMIN_PATH),
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  distDir: path.join(__dirname, '..', 'dist')
};
