// Staff codes typed at the end of a car title (e.g. "2012 Toyota Camry XLE BF") are for the team only.
// Customers, Google and AI assistants see the title without them. The staff area keeps the full title.
const settings = require('./settings');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function publicTitle(title) {
  const t = String(title || '');
  const codes = settings.current().internalCodes || [];
  if (!codes.length) return t;
  const cleaned = t.replace(new RegExp(`(?:[\\s\\-–—|/]+(?:${codes.map(esc).join('|')}))+\\s*$`, 'i'), '').trim();
  return cleaned || t;
}
function cleanCar(c) { if (c && c.title) c.title = publicTitle(c.title); return c; }
module.exports = { publicTitle, cleanCar };
