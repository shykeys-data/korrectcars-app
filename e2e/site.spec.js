// The three journeys buyers use most: finding a car, working out Pay Small Small, and signing in.
const { test, expect } = require('@playwright/test');
const os = require('os');
const path = require('path');

const DB = path.join(os.tmpdir(), 'kc-e2e', 'db.sqlite');

test('a buyer browses cars and opens one', async ({ page }) => {
  await page.goto('/cars');
  const first = page.locator('main a[href^="/cars/"]').filter({ has: page.locator('img') }).first();
  await expect(first).toBeVisible();
  const href = await first.getAttribute('href');
  await first.click();
  await expect(page).toHaveURL(href);
  await expect(page.locator('main h1')).toBeVisible();
  // Every car page shows a price (or "Call for price") and a way to contact the seller
  await expect(page.locator('main')).toContainText(/₦|Call for price/);
  await expect(page.locator('a[href*="wa.me"], a[href^="/api/wa/"]').first()).toBeAttached();
});

test('the Pay Small Small calculator works out the payments', async ({ page }) => {
  await page.goto('/');
  await page.locator('#calc-car').selectOption('-1'); // "Enter my own price"
  await page.locator('#bnpl-price').fill('10000000');
  await page.locator('#bnpl-dep').fill('40');
  await page.locator('#bnpl-m').fill('24');
  // 40% deposit = ₦4m; ₦6m balance + 20% charge = ₦7.2m over 24 months = ₦300,000 a month; ₦11.2m in total
  const summary = page.locator('.bnpl .summary');
  await expect(summary).toContainText('₦300,000');
  await expect(summary).toContainText('₦4,000,000');
  await expect(summary).toContainText('₦11,200,000');
  await expect(summary).toContainText('₦1,200,000');
});

test('a registered buyer signs in and reaches their account', async ({ page, request }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  const password = 'e2e-pass-12345';
  const r = await request.post('/api/auth/register', {
    headers: { 'X-Requested-With': 'korrect' }, data: { name: 'Test Buyer', email, phone: '08012345678', password }
  });
  expect(r.status()).toBe(201);
  // Email links are switched off in tests, so mark the address as confirmed directly
  const db = new (require('node:sqlite').DatabaseSync)(DB);
  db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email);
  db.close();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.locator('main form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText('Test Buyer', { exact: true }).first()).toBeVisible();
});
