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
// Also strips the codes from the end of the stock number and of each info / spec line customers see
function cleanCar(c) {
  if (!c) return c;
  if (c.title) c.title = publicTitle(c.title);
  if (c.stock) c.stock = publicTitle(c.stock);
  if (Array.isArray(c.info)) c.info = c.info.map((x) => (typeof x === 'string' ? publicTitle(x) : x));
  if (Array.isArray(c.specs)) c.specs = c.specs.map((r) => (Array.isArray(r) ? [r[0], publicTitle(r[1])] : r));
  return c;
}
module.exports = { publicTitle, cleanCar };
