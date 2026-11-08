// Boost plans (Nov 2026). Prices are Jiji's Cars-store package prices (30 days, Nov 2026) less 20%, before VAT.
// A plan says how many of a seller's cars can be boosted at the same time. Shorter plans cost more per day and
// longer plans less, so sellers who commit longer pay less (owner decision: "days limitations" to set the price).
// VAT (7.5%) is added on top at checkout and on the receipt. Paystack takes the payment.
const crypto = require('crypto');
const { q, one } = require('../db');

const { VAT_PCT, PLANS, DURATIONS, quote, priceList } = require('./boost-plans');

const sqlTime = (ms = 0) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
// The seller's best plan running right now (highest rank), or null
async function activePlan(dealerId) {
  const rows = await q("SELECT * FROM boost_orders WHERE dealer_id = ? AND status IN ('paid','granted') AND starts_at <= ? AND ends_at > ? ORDER BY ends_at DESC", [dealerId, sqlTime(), sqlTime()]);
  if (!rows.length) return null;
  const best = rows.map((r) => ({ ...r, p: PLANS.find((p) => p.key === r.plan) })).filter((r) => r.p).sort((a, b) => b.p.rank - a.p.rank)[0];
  return best ? { order: best.id, plan: best.p.key, name: best.p.name, cars: best.p.cars, rank: best.p.rank, endsAt: best.ends_at } : null;
}
const boostedCount = async (dealerId) => Number((await one('SELECT COUNT(*) AS n FROM cars WHERE dealer_id = ? AND boost_until > ?', [dealerId, sqlTime()])).n);

// Marks an order paid (once) and starts the plan now. Returns true the first time.
async function activate(order, status = 'paid') {
  const start = sqlTime(); const end = sqlTime(order.days * 86400000);
  const r = await q("UPDATE boost_orders SET status = ?, paid_at = ?, starts_at = ?, ends_at = ? WHERE id = ? AND status = 'pending'", [status, start, start, end, order.id]);
  if (!r.affectedRows) return false;
  // Cars already boosted under an older plan carry on until this plan ends, at this plan's rank
  const plan = PLANS.find((p) => p.key === order.plan);
  await q('UPDATE cars SET boost_until = ?, boost_rank = ? WHERE dealer_id = ? AND boost_until > ?', [end, plan ? plan.rank : 1, order.dealer_id, start]);
  return true;
}

// ---------- Paystack (secret key set in the panel as PAYSTACK_SECRET_KEY; never in the code) ----------
const key = () => process.env.PAYSTACK_SECRET_KEY || '';
const paystackOn = () => /^sk_(test|live)_/.test(key());
async function paystack(path, body) {
  const r = await fetch('https://api.paystack.co' + path, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.status) throw Object.assign(new Error((j && j.message) || 'Paystack did not answer'), { status: 502 });
  return j.data;
}
const newReference = () => 'KCB-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
// Paystack signs each webhook with HMAC-SHA512 of the raw body using the secret key
function signatureOk(raw, sig) {
  if (!paystackOn() || !sig) return false;
  const want = crypto.createHmac('sha512', key()).update(raw).digest('hex');
  return want.length === String(sig).length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(String(sig)));
}
// Checks a payment with Paystack itself, then activates the order if the amount and currency match
async function confirm(reference) {
  const order = await one('SELECT * FROM boost_orders WHERE reference = ?', [String(reference || '').slice(0, 40)]);
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.status !== 'pending') return { ok: ['paid', 'granted'].includes(order.status), order };
  const tx = await paystack('/transaction/verify/' + encodeURIComponent(order.reference));
  if (tx.status !== 'success' || tx.currency !== 'NGN' || Number(tx.amount) !== Number(order.total) * 100) {
    if (['failed', 'abandoned', 'reversed'].includes(tx.status)) await q("UPDATE boost_orders SET status = 'failed' WHERE id = ? AND status = 'pending'", [order.id]);
    return { ok: false, order, error: 'The payment was not completed.' };
  }
  await activate(order);
  return { ok: true, order: await one('SELECT * FROM boost_orders WHERE id = ?', [order.id]) };
}

module.exports = { VAT_PCT, PLANS, DURATIONS, quote, priceList, activePlan, boostedCount, activate, paystack, paystackOn, newReference, signatureOk, confirm, sqlTime };
