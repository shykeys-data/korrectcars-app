// Short-lived in-memory copies of the public stock (car list, filters, latest posts).
// The shared database host sometimes stalls for 10-25 s on even the smallest query, and every visitor's
// home or cars page used to wait for it. Now a page uses the copy kept in memory:
//  - younger than FRESH_MS: used as is;
//  - older (up to MAX_STALE_MS): used straight away while one fresh copy is fetched in the background;
//  - older than that, or none yet: the page waits for the database as before.
// Any change made through the API (a POST, PUT, PATCH or DELETE) clears the copies in that app process, so the
// person who made the change sees it at once; other app processes catch up within FRESH_MS.
const FRESH_MS = 30 * 1000;
const MAX_STALE_MS = 10 * 60 * 1000;
const store = new Map(); // key -> { value, at, pending }

function refresh(key, fn) {
  const e = store.get(key) || {};
  if (e.pending) return e.pending;
  const gen = generation;
  const pending = Promise.resolve().then(fn).then((value) => {
    if (gen === generation) store.set(key, { value, at: Date.now(), pending: null });
    else store.delete(key);
    return value;
  }, (err) => {
    const cur = store.get(key);
    if (cur) cur.pending = null;
    throw err;
  });
  store.set(key, { ...e, pending });
  return pending;
}

let generation = 0;

async function memo(key, fn) {
  const e = store.get(key);
  const age = e && e.at ? Date.now() - e.at : Infinity;
  if (age < FRESH_MS) return e.value;
  if (age < MAX_STALE_MS) {
    refresh(key, fn).catch(() => {}); // the copy we have is good enough for this page; errors show up on the next wait
    return e.value;
  }
  return refresh(key, fn);
}

function clear() { generation++; store.clear(); }

module.exports = { memo, clear, FRESH_MS, MAX_STALE_MS };
