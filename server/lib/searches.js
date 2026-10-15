// Saved searches: clean the filters, name them in plain words, match them against a car,
// and email customers when a new car fits one of their searches.
const { q } = require('../db');
const config = require('../config');
const mail = require('./mail');

const KEYS = ['make', 'model', 'body', 'condition', 'maxPrice', 'yearMin', 'yearMax'];
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const short = (n) => (n >= 1e6 ? '₦' + (n / 1e6).toLocaleString('en-NG', { maximumFractionDigits: 1 }) + 'm' : naira(n));

function clean(f = {}) {
  const out = {};
  for (const k of KEYS) {
    let v = f[k];
    if (v === undefined || v === null || v === '') continue;
    v = String(v).trim().slice(0, 60);
    if (['maxPrice', 'yearMin', 'yearMax'].includes(k)) { v = Math.round(Number(v)); if (!Number.isFinite(v) || v <= 0) continue; }
    out[k] = v;
  }
  if (out.yearMin && out.yearMax && out.yearMin > out.yearMax) delete out.yearMax;
  return out;
}

function describe(f) {
  const parts = [];
  parts.push([f.make, f.model].filter(Boolean).join(' ') || 'Any car');
  if (f.yearMin && f.yearMax) parts.push(f.yearMin === f.yearMax ? String(f.yearMin) : `${f.yearMin}–${f.yearMax}`);
  else if (f.yearMin) parts.push(`${f.yearMin} or newer`);
  else if (f.yearMax) parts.push(`${f.yearMax} or older`);
  if (f.body) parts.push(f.body);
  if (f.condition) parts.push(f.condition);
  if (f.maxPrice) parts.push(`under ${short(f.maxPrice)}`);
  return parts.join(' · ');
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function url(f) {
  const rest = Object.entries({ body: f.body, condition: f.condition, maxPrice: f.maxPrice, yearMin: f.yearMin, yearMax: f.yearMax }).filter(([, v]) => v);
  return (f.make ? `/cars/${slug(f.make)}${f.model ? '/' + slug(f.model) : ''}` : '/cars') + (rest.length ? '?' + new URLSearchParams(rest) : '');
}

function matches(car, f) {
  return (!f.make || car.make === f.make) && (!f.model || car.model === f.model) && (!f.body || car.body === f.body)
    && (!f.condition || car.car_condition === f.condition) && (!f.maxPrice || Number(car.price) <= f.maxPrice)
    && (!f.yearMin || Number(car.year) >= f.yearMin) && (!f.yearMax || Number(car.year) <= f.yearMax);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Called after a car becomes available. Never throws; never slows the save.
async function notifyNewCar(car) {
  try {
    if (!car || car.status !== 'available') return { sent: 0 };
    const rows = await q(`SELECT s.id, s.user_id, s.name, s.filters, u.name AS user_name, u.email FROM saved_searches s
      JOIN users u ON u.id = s.user_id WHERE s.alerts = 1 AND u.disabled = 0 AND u.email_verified = 1`);
    const byUser = new Map();
    for (const r of rows) {
      if (!matches(car, r.filters || {})) continue;
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { name: r.user_name, email: r.email, searches: [] });
      byUser.get(r.user_id).searches.push(r);
    }
    let sent = 0;
    const link = `${config.siteUrl}/cars/${car.slug}`;
    for (const [, u] of byUser) {
      const first = String(u.name || '').split(' ')[0] || 'there';
      const names = u.searches.map((s) => s.name).join(', ');
      const subject = `New car for you: ${car.title} – ${naira(car.price)}`;
      const text = `Hello ${first},\n\nA car matching your saved search (${names}) just arrived at Korrect Cars:\n\n${car.title}\n${naira(car.price)}${car.mileage ? ' · ' + car.mileage : ''}\n${link}\n\nYou can pay outright or pay small small through our credit bank partners.\n\nTo stop these emails, turn off alerts in your account: ${config.siteUrl}/account?tab=searches\n\nKorrect Cars`;
      const html = mail.layout('A car matching your search just arrived', `<p>Hello ${esc(first)},</p><p>A car matching your saved search <b>${esc(names)}</b> just arrived:</p>
<p style="font-size:18px;margin:16px 0 4px"><b>${esc(car.title)}</b></p><p style="margin:0;font-size:16px;color:#c4161d"><b>${esc(naira(car.price))}</b>${car.mileage ? ' · ' + esc(car.mileage) : ''}</p>${mail.button(link, 'See the car')}
<p style="font-size:13px;color:#71717a">To stop these emails, <a href="${config.siteUrl}/account?tab=searches" style="color:#c4161d">turn off alerts in your account</a>.</p>`);
      await mail.send({ to: u.email, subject, text, html }).then(() => { sent++; }).catch((e) => console.error('Alert email failed:', e.message));
      await q(`UPDATE saved_searches SET last_alert_at = NOW() WHERE id IN (${u.searches.map(() => '?').join(',')})`, u.searches.map((s) => s.id));
    }
    return { sent };
  } catch (e) { console.error('Search alerts failed:', e.message); return { sent: 0 }; }
}

module.exports = { KEYS, clean, describe, url, matches, notifyNewCar };
