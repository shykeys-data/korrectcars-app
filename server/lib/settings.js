// Site settings the owner can change in the admin (phones, hours, bank partner, estimate figures).
// Stored in the settings table; anything not set falls back to config / environment values.
const config = require('../config');
const db = require('../db');

const FIELDS = {
  phones: { type: 'list', label: 'Phone numbers' },
  whatsapp: { type: 'text', label: 'WhatsApp number (international, digits only)' },
  email: { type: 'text', label: 'Contact email' },
  hours: { type: 'text', label: 'Opening hours' },
  instagram: { type: 'text', label: 'Instagram handle' },
  bankPartner: { type: 'text', label: 'Credit bank partner name' },
  bnplMinDeposit: { type: 'number', label: 'Estimate: minimum deposit %', min: 0, max: 90 },
  bnplMarkup: { type: 'number', label: 'Estimate: charge on balance %', min: 0, max: 100 },
  bnplMaxMonths: { type: 'number', label: 'Estimate: longest plan (months)', min: 6, max: 96 },
  swapFeePct: { type: 'number', label: 'Swap fee %', min: 0, max: 20 },
  aiTraining: { type: 'choice', label: 'AI training bots (GPTBot, ClaudeBot, Google-Extended, CCBot)', options: [['allow', 'Allow: the site can be used to train AI models'], ['block', 'Block: AI search assistants can still read and cite the site']] }
};
let cache = {};

async function load() {
  try { const rows = await db.q('SELECT k, v FROM settings'); cache = Object.fromEntries(rows.map((r) => [r.k, r.v])); } catch (_e) { cache = {}; }
  return cache;
}
function current() {
  const g = (k, d) => (cache[k] !== undefined && cache[k] !== null && cache[k] !== '' ? cache[k] : d);
  const num = (k, d) => { const n = Number(g(k, d)); return Number.isFinite(n) ? n : d; };
  return {
    phones: String(g('phones', config.phones.join(','))).split(',').map((x) => x.trim()).filter(Boolean),
    whatsapp: String(g('whatsapp', config.whatsapp)).replace(/\D/g, ''),
    email: g('email', config.email), hours: g('hours', config.hours), instagram: String(g('instagram', config.instagram)).replace(/^@/, ''),
    bankPartner: g('bankPartner', config.bankPartner),
    bnpl: { ...config.bnpl, minDeposit: num('bnplMinDeposit', config.bnpl.minDeposit), markup: num('bnplMarkup', config.bnpl.markup), maxMonths: num('bnplMaxMonths', config.bnpl.maxMonths) },
    swapFeePct: num('swapFeePct', config.swapFeePct),
    aiTraining: g('aiTraining', 'allow') === 'block' ? 'block' : 'allow'
  };
}
async function save(values) {
  const clean = {};
  for (const [k, f] of Object.entries(FIELDS)) {
    if (!(k in values)) continue;
    let v = values[k];
    if (f.type === 'list') v = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 4).join(',');
    else if (f.type === 'choice') { v = String(v); if (!f.options.some(([o]) => o === v)) throw Object.assign(new Error(`Choose an option for ${f.label}.`), { status: 400 }); }
    else if (f.type === 'number') { v = Number(v); if (!Number.isFinite(v) || v < f.min || v > f.max) throw Object.assign(new Error(`${f.label} must be between ${f.min} and ${f.max}.`), { status: 400 }); v = String(v); }
    else v = String(v || '').trim().slice(0, 120);
    clean[k] = v;
  }
  for (const [k, v] of Object.entries(clean)) {
    const ex = await db.one('SELECT k FROM settings WHERE k = ?', [k]);
    if (ex) await db.q('UPDATE settings SET v = ? WHERE k = ?', [v, k]); else await db.q('INSERT INTO settings (k, v) VALUES (?, ?)', [k, v]);
  }
  await load();
  return clean;
}
// Internal values (not shown in the settings form)
async function internal(k, make) {
  if (cache[k]) return cache[k];
  const v = make();
  await db.q('INSERT INTO settings (k, v) VALUES (?, ?)', [k, v]).catch(() => {});
  await load();
  return cache[k] || v;
}
module.exports = { FIELDS, load, current, save, internal };
