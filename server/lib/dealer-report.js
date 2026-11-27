// Monthly seller reports (Nov 2026). On the 1st of each month (from 8am Lagos time) every approved seller with
// cars on Korrect Cars gets one email about the month before: car views, WhatsApp taps, buyer requests, their
// most-viewed cars, and the link to share their page. Sellers can switch it off on My seller page.
// There is no cron job: the app checks at most once an hour while it serves visitors (runDue), and the
// dealer_reports row (one per seller and month, written first) makes sure nobody gets the same report twice,
// even with two copies of the app running. Never throws; never slows a visitor's request.
const { q, one } = require('../db');
const config = require('../config');
const mail = require('./mail');
const { lagosDay } = require('./views');
const { publicTitle } = require('./titles');

const SEND_FROM_HOUR = 8; // Lagos time
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-NG');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// The month before the Lagos day given ('2026-12-01' -> '2026-11')
function previousMonth(day = lagosDay()) {
  const y = Number(day.slice(0, 4)); const mo = Number(day.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}
// First and last Lagos day of a month, and the same month as UTC times (enquiries are stored in UTC; Lagos is UTC+1)
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startUtc = new Date(Date.UTC(y, m - 1, 1) - 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const endUtc = new Date(Date.UTC(y, m - 1, last + 1) - 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}`, startUtc, endUtc };
}

// The figures for one seller and month
async function figures(dealerId, month) {
  const r = monthRange(month);
  const views = Number((await one(`SELECT COALESCE(SUM(v.views), 0) AS n FROM car_views_daily v JOIN cars c ON c.id = v.car_id
    WHERE c.dealer_id = ? AND v.day >= ? AND v.day <= ?`, [dealerId, r.first, r.last])).n) || 0;
  const taps = Number((await one(`SELECT COALESCE(SUM(w.taps), 0) AS n FROM wa_taps_daily w JOIN cars c ON c.id = w.car_id
    WHERE c.dealer_id = ? AND w.day >= ? AND w.day <= ?`, [dealerId, r.first, r.last])).n) || 0;
  const requests = Number((await one('SELECT COUNT(*) AS n FROM enquiries WHERE dealer_id = ? AND created_at >= ? AND created_at < ?',
    [dealerId, r.startUtc, r.endUtc])).n) || 0;
  const top = (await q(`SELECT c.slug, c.title, c.status, SUM(v.views) AS views FROM car_views_daily v JOIN cars c ON c.id = v.car_id
    WHERE c.dealer_id = ? AND v.day >= ? AND v.day <= ? GROUP BY c.id, c.slug, c.title, c.status ORDER BY views DESC LIMIT 3`,
  [dealerId, r.first, r.last])).map((c) => ({ slug: c.slug, title: publicTitle(c.title), views: Number(c.views) || 0, sold: c.status === 'sold' }));
  const forSale = Number((await one("SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND status = 'available'", [dealerId])).n) || 0;
  return { views, taps, requests, top, forSale };
}

function email(d, month, f) {
  const page = `${config.siteUrl}/dealers/${d.slug}`;
  const name = monthName(month);
  const lines = [
    `${num(f.views)} views of your cars`,
    `${num(f.taps)} WhatsApp taps (buyers who opened a chat with you)`,
    `${num(f.requests)} buyer requests (viewings, offers and questions)`
  ];
  const top = f.top.map((c) => `${c.title}: ${num(c.views)} views${c.sold ? ' (sold)' : ''}`);
  const tip = !f.forSale ? 'You have no cars for sale right now. Add your next car so buyers can find it.'
    : f.views ? 'Share your page on your WhatsApp status and in your Instagram bio: every buyer who comes from your link sees only your cars.'
      : 'No views yet? Share your page on your WhatsApp status and in your Instagram bio, and add clear photos of the front, side, interior and dashboard.';
  const text = `Hello ${d.business_name},\n\nHere is how your cars did on Korrect Cars in ${name}:\n\n${lines.map((l) => '- ' + l).join('\n')}\n`
    + (top.length ? `\nMost viewed:\n${top.map((l) => '- ' + l).join('\n')}\n` : '')
    + `\n${tip}\n\nYour page: ${page}\nMy seller page (all your figures): ${config.siteUrl}/dealer\n\nTo stop these monthly emails, untick "Email me a monthly report" on My seller page.\n\nKorrect Cars`;
  const html = mail.layout(`Your cars in ${name}`,
    `<p>Hello ${esc(d.business_name)}, here is how your cars did on Korrect Cars last month.</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px">${[[f.views, 'views of your cars'], [f.taps, 'WhatsApp taps'], [f.requests, 'buyer requests']].map(([n, l]) => `<tr><td style="font-size:26px;font-weight:bold;padding:6px 14px 6px 0;width:1%;white-space:nowrap">${num(n)}</td><td style="font-size:15px;color:#3f3f46">${l}</td></tr>`).join('')}</table>`
    + (top.length ? `<p style="margin-bottom:6px"><b>Most viewed</b></p><ul style="margin-top:0;padding-left:20px">${f.top.map((c) => `<li><a href="${config.siteUrl}/cars/${esc(c.slug)}" style="color:#c4161d">${esc(c.title)}</a>: ${num(c.views)} views${c.sold ? ' (sold)' : ''}</li>`).join('')}</ul>` : '')
    + `<p>${esc(tip)}</p>` + mail.button(page, 'Open my page to share it')
    + `<p style="font-size:13px;color:#71717a">See every figure on <a href="${config.siteUrl}/dealer" style="color:#c4161d">My seller page</a>. To stop these monthly emails, untick "Email me a monthly report" there.</p>`);
  return { subject: `Your cars on Korrect Cars in ${name}: ${num(f.views)} views, ${num(f.taps)} WhatsApp taps`, text, html };
}

// Send last month's report to every seller who has not had it yet. Returns how many went out.
async function sendReports({ month = previousMonth() } = {}) {
  const sellers = await q(`SELECT d.id, d.slug, d.business_name, d.email FROM dealers d
    WHERE d.id <> 1 AND d.status = 'approved' AND d.report_emails = 1 AND d.email IS NOT NULL AND d.email <> ''
      AND EXISTS (SELECT 1 FROM cars c WHERE c.dealer_id = d.id AND c.status IN ('available','reserved','sold'))
      AND NOT EXISTS (SELECT 1 FROM dealer_reports r WHERE r.dealer_id = d.id AND r.month = ?)`, [month]);
  let n = 0;
  for (const d of sellers) {
    // Claim this seller's report first: if another copy of the app got there first, the insert fails and we move on
    try { await q('INSERT INTO dealer_reports (dealer_id, month, sent_at) VALUES (?, ?, ?)', [d.id, month, new Date().toISOString().slice(0, 19).replace('T', ' ')]); } catch (_e) { continue; }
    try {
      await mail.send({ to: d.email, ...email(d, month, await figures(d.id, month)) });
      n += 1;
    } catch (e) {
      console.error('[seller report]', d.id, e.message);
      await q('DELETE FROM dealer_reports WHERE dealer_id = ? AND month = ?', [d.id, month]).catch(() => {}); // try again next hour
    }
  }
  return n;
}

// Called on visitors' requests: at most once an hour, on or after the 1st at 8am Lagos time, in the background
let lastCheck = 0; let running = false;
function runDue() {
  if (process.env.NODE_ENV === 'test' || process.env.MAIL_DISABLED === '1' || running || Date.now() - lastCheck < 3600 * 1000) return;
  lastCheck = Date.now();
  const lagosHour = new Date(Date.now() + 3600 * 1000).getUTCHours();
  if (lagosHour < SEND_FROM_HOUR && lagosDay().endsWith('-01')) return;
  running = true;
  setImmediate(() => sendReports().catch((e) => console.error('[seller reports]', e.message)).finally(() => { running = false; }));
}

module.exports = { sendReports, runDue, figures, previousMonth, monthRange };
