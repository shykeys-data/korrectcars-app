// Buyer insights: a WhatsApp tap and a filter search reach our own server (counted once, nothing personal kept)
const { test, expect } = require('@playwright/test');
const os = require('os');
const path = require('path');

const count = (sql) => { const db = new (require('node:sqlite').DatabaseSync)(path.join(os.tmpdir(), 'kc-e2e', 'db.sqlite')); const n = db.prepare(sql).get().n; db.close(); return n; };

test('a WhatsApp tap on a car page and a search on the car list are counted', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough (counts are per visitor per day)');
  await context.route(/wa\.me/, (r) => r.fulfill({ status: 200, body: 'ok' })); // don't leave for WhatsApp
  await page.goto('/cars?body=SUV');
  await page.waitForTimeout(3500); // the list counts a search once the filters settle for 3 seconds
  await expect.poll(() => count("SELECT COALESCE(SUM(searches),0) AS n FROM search_daily WHERE query_key = 'body=SUV'")).toBe(1);

  await page.locator('main a[href^="/cars/"]').filter({ has: page.locator('img') }).first().click();
  const before = count('SELECT COALESCE(SUM(taps),0) AS n FROM wa_taps_daily');
  const [popup] = await Promise.all([context.waitForEvent('page').catch(() => null), page.getByRole('link', { name: 'Chat on WhatsApp' }).click()]);
  if (popup) await popup.close();
  await expect.poll(() => count('SELECT COALESCE(SUM(taps),0) AS n FROM wa_taps_daily')).toBe(before + 1);
});
