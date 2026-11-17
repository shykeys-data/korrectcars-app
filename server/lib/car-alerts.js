// Saved-car alerts: when a car someone saved drops in price, is sold, or gets new photos, email them.
// Called after a car is saved by staff or its seller. Runs in the background; never throws; never slows the save.
// Rules (so nobody gets spammed):
//   price drop  - the price falls by at least ₦50,000, and is lower than the last price we told this person about
//   sold        - once per person and car; lists up to 3 similar cars still for sale
//   new photos  - photos were added to a car for sale; at most once a week per person and car
// Only people who signed in and saved the car get these (cars saved on a device without an account stay on that device),
// with a verified email, alerts on (Account > Saved cars), and not the person who made the change.
const { q, one } = require('../db');
const config = require('../config');
const mail = require('./mail');
const { priceText } = require('./price');
const { publicTitle } = require('./titles');

const MIN_DROP = 50000;
const PHOTO_GAP_DAYS = 7;
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const photosOf = (c) => (Array.isArray(c.photos) ? c.photos : (() => { try { return JSON.parse(c.photos || '[]'); } catch (_e) { return []; } })());
const forSale = (s) => s === 'available' || s === 'reserved';

// What changed, as a list of alert kinds
function changes(before, after) {
  if (!before || !after) return [];
  const out = [];
  const was = Number(before.price) || 0; const now = Number(after.price) || 0;
  if (forSale(after.status) && was > 0 && now > 0 && was - now >= MIN_DROP) out.push('price');
  if (before.status !== 'sold' && after.status === 'sold') out.push('sold');
  if (after.status === 'available' && photosOf(after).filter((p) => !photosOf(before).includes(p)).length > 0) out.push('photos');
  return out;
}

async function recipients(carId, actorId) {
  return q(`SELECT u.id, u.name, u.email FROM saved_cars s JOIN users u ON u.id = s.user_id
    WHERE s.car_id = ? AND u.car_alerts = 1 AND u.disabled = 0 AND u.email_verified = 1 AND u.id <> ?`, [carId, actorId || 0]);
}
async function last(userId, carId, kind) { return one('SELECT price, sent_at FROM saved_car_alerts WHERE user_id = ? AND car_id = ? AND kind = ?', [userId, carId, kind]); }
async function mark(userId, carId, kind, price) {
  const now = new Date();
  if (await last(userId, carId, kind)) await q('UPDATE saved_car_alerts SET price = ?, sent_at = ? WHERE user_id = ? AND car_id = ? AND kind = ?', [price || null, now, userId, carId, kind]);
  else await q('INSERT INTO saved_car_alerts (user_id, car_id, kind, price, sent_at) VALUES (?, ?, ?, ?, ?)', [userId, carId, kind, price || null, now]);
}
const daysSince = (d) => (Date.now() - new Date(d).getTime()) / 864e5;

async function similarTo(car) {
  const rows = await q(`SELECT id, slug, title, price, year, mileage FROM cars WHERE id <> ? AND status = 'available' AND (body = ? OR make = ?)
    ORDER BY ABS(price - ?) LIMIT 3`, [car.id, car.body, car.make, Number(car.price) || 0]);
  return rows.map((c) => ({ ...c, title: publicTitle(c.title) }));
}

function email(kind, u, car, extra) {
  const first = String(u.name || '').split(' ')[0] || 'there';
  const title = publicTitle(car.title);
  const link = `${config.siteUrl}/cars/${car.slug}`;
  const off = `${config.siteUrl}/account?tab=saved`;
  const foot = `You get this because you saved this car on Korrect Cars. To stop these emails, turn off saved-car alerts in your account: ${off}`;
  const footHtml = `<p style="font-size:13px;color:#71717a">You get this because you saved this car. To stop these emails, <a href="${off}" style="color:#c4161d">turn off saved-car alerts in your account</a>.</p>`;
  if (kind === 'price') {
    const save = extra.was - Number(car.price);
    return {
      subject: `Price drop: ${title} is now ${naira(car.price)} (was ${naira(extra.was)})`,
      text: `Hello ${first},\n\nThe ${title} you saved is now ${naira(car.price)}, down from ${naira(extra.was)}. That's ${naira(save)} less.\n\nSee it: ${link}\n\nCars sell fast at a lower price. Book a viewing or ask about Pay Small Small on the car's page.\n\n${foot}`,
      html: mail.layout('A car you saved just got cheaper', `<p>Hello ${esc(first)},</p><p>The <b>${esc(title)}</b> you saved is now:</p>
<p style="font-size:22px;margin:8px 0 2px;color:#c4161d"><b>${esc(naira(car.price))}</b></p><p style="margin:0 0 6px;color:#71717a"><s>${esc(naira(extra.was))}</s> · ${esc(naira(save))} less</p>${mail.button(link, 'See the car')}
<p>Cars sell fast at a lower price. Book a viewing or ask about Pay Small Small on the car's page.</p>${footHtml}`)
    };
  }
  if (kind === 'sold') {
    const sim = extra.similar || [];
    const list = sim.map((c) => `- ${c.title}: ${priceText(c)}${c.mileage ? ' · ' + c.mileage : ''}\n  ${config.siteUrl}/cars/${c.slug}`).join('\n');
    const listHtml = sim.map((c) => `<li style="margin:0 0 10px"><a href="${config.siteUrl}/cars/${esc(c.slug)}" style="color:#111;font-weight:bold">${esc(c.title)}</a><br><span style="color:#c4161d"><b>${esc(priceText(c))}</b></span>${c.mileage ? ' · ' + esc(c.mileage) : ''}</li>`).join('');
    return {
      subject: sim.length ? `The ${title} you saved has been sold. ${sim.length === 1 ? 'This car is' : `These ${sim.length} are`} still available` : `The ${title} you saved has been sold`,
      text: `Hello ${first},\n\nThe ${title} you saved has been sold.${sim.length ? `\n\nSimilar cars still for sale:\n${list}` : ''}\n\nSee all cars: ${config.siteUrl}/cars\n\n${foot}`,
      html: mail.layout('A car you saved has been sold', `<p>Hello ${esc(first)},</p><p>The <b>${esc(title)}</b> you saved has been sold.</p>${sim.length ? `<p>Similar cars still for sale:</p><ul style="padding-left:18px">${listHtml}</ul>` : ''}${mail.button(`${config.siteUrl}/cars`, 'See all cars')}${footHtml}`)
    };
  }
  return {
    subject: `New photos: ${title}`,
    text: `Hello ${first},\n\n${extra.count} new photo${extra.count === 1 ? ' was' : 's were'} added to the ${title} you saved (${priceText(car)}).\n\nSee them: ${link}\n\n${foot}`,
    html: mail.layout('New photos of a car you saved', `<p>Hello ${esc(first)},</p><p>${extra.count} new photo${extra.count === 1 ? ' was' : 's were'} added to the <b>${esc(title)}</b> you saved.</p><p style="font-size:16px;color:#c4161d"><b>${esc(priceText(car))}</b></p>${mail.button(link, 'See the photos')}${footHtml}`)
  };
}

// Returns a promise (tests wait on it); routes call it without waiting.
async function onCarChange(before, after, actorId) {
  try {
    const kinds = changes(before, after);
    if (!kinds.length) return { sent: 0 };
    const people = await recipients(after.id, actorId);
    if (!people.length) return { sent: 0 };
    const similar = kinds.includes('sold') ? await similarTo(after) : [];
    const newPhotos = photosOf(after).filter((p) => !photosOf(before).includes(p)).length;
    let sent = 0;
    for (const u of people) {
      // Sold wins over everything; a price drop wins over photos (one email per change)
      const kind = kinds.includes('sold') ? 'sold' : kinds.includes('price') ? 'price' : 'photos';
      const prev = await last(u.id, after.id, kind);
      if (kind === 'sold' && prev) continue;
      if (kind === 'price' && prev && prev.price && Number(after.price) >= Number(prev.price)) continue; // already told them about this price or lower
      if (kind === 'photos' && prev && daysSince(prev.sent_at) < PHOTO_GAP_DAYS) continue;
      const m = email(kind, u, after, { was: Number(before.price), similar, count: newPhotos });
      try { await mail.send({ to: u.email, ...m }); sent++; await mark(u.id, after.id, kind, kind === 'price' ? Number(after.price) : null); } catch (e) { console.error('Saved-car alert failed:', e.message); }
    }
    return { sent };
  } catch (e) { console.error('Saved-car alerts failed:', e.message); return { sent: 0 }; }
}

module.exports = { changes, onCarChange, MIN_DROP };
