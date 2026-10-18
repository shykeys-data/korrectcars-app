// "Recommended" order: a shuffle that is different for each visitor and changes every day,
// but stays the same while one visitor browses (so paging, Back and refreshes don't jump around).
// New arrivals (last 21 days) and featured cars get a head start, so fresh stock is seen first more often.
// The order is worked out in the browser: the HTML is not cached, and the server never needs to know.
import { isNew } from '../../../server/lib/categories.js';

let memoryId = null;
function visitorId() {
  try {
    let v = window.localStorage.getItem('kc-visitor');
    if (!v) { v = Math.random().toString(36).slice(2, 12); window.localStorage.setItem('kc-visitor', v); }
    return v;
  } catch (_e) {
    // Private browsing or storage blocked: keep one order for this visit
    if (!memoryId) memoryId = Math.random().toString(36).slice(2, 12);
    return memoryId;
  }
}
// Calendar day in Lagos, so everyone's order changes at local midnight
function lagosDay() {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }); } catch (_e) { return new Date().toISOString().slice(0, 10); }
}
// FNV-1a hash to a number between 0 and 1
function unit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000003) / 1000003;
}

// Returns a new array in the visitor's recommended order. `salt` gives each homepage row its own mix.
export function recommended(cars, salt = '') {
  const seed = `${visitorId()}|${lagosDay()}|${salt}`;
  const score = (c) => unit(`${seed}|${c.id}`) - (isNew(c) ? 0.35 : 0) - (Number(c.featured) ? 0.1 : 0);
  return cars.map((c) => [score(c), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export const newestFirst = (cars) => cars.slice().sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || b.id - a.id);
