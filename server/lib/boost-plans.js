// Boost plan prices (Nov 2026), shared by the server and the web app (no Node-only code, like price.js).
// 30-day prices are Jiji's Cars-store package prices less 20%, before VAT. A plan says how many of a seller's cars
// can be boosted at the same time. Shorter plans cost more per day, longer plans less (owner decision).
const VAT_PCT = 7.5;
// [key, name, cars boosted at once (null = all), 30-day price in naira before VAT]
const PLANS = [
  ['basic', 'Basic', 1, 12799], ['premium', 'Premium', 3, 25599], ['vip', 'VIP', 5, 43199], ['vip_gold', 'VIP Gold', 10, 55599],
  ['diamond', 'Diamond', 20, 76799], ['diamond_elite', 'Diamond Elite', 40, 95999], ['enterprise', 'Enterprise', 70, 133199],
  ['enterprise_elite', 'Enterprise Elite', 120, 283999], ['enterprise_lux', 'Enterprise Lux', null, 426399]
].map(([key, name, cars, month], i) => ({ key, name, cars, month, rank: i + 1 }));
// Days on offer and what each costs, as a multiple of the 30-day price
const DURATIONS = [[7, 0.35], [14, 0.6], [30, 1], [90, 2.55], [180, 4.5], [365, 7.2]];

const roundPrice = (n) => Math.max(99, Math.ceil(n / 100) * 100 - 1); // ...99, like the shop prices
function quote(planKey, days) {
  const plan = PLANS.find((p) => p.key === planKey);
  const d = DURATIONS.find(([n]) => n === Number(days));
  if (!plan || !d) return null;
  const amount = d[0] === 30 ? plan.month : roundPrice(plan.month * d[1]);
  const vat = Math.round(amount * VAT_PCT / 100);
  return { plan: plan.key, name: plan.name, cars: plan.cars, rank: plan.rank, days: d[0], amount, vat, total: amount + vat, perDay: Math.round(amount / d[0]) };
}
const priceList = () => PLANS.map((p) => ({ key: p.key, name: p.name, cars: p.cars, prices: DURATIONS.map(([days]) => quote(p.key, days)) }));

module.exports = { VAT_PCT, PLANS, DURATIONS, quote, priceList };
