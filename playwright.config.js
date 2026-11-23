// Browser tests (npm run e2e): a phone and a desktop browser against a local copy of the site.
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '4777';
// PW_CHROME: use an installed Chrome instead of Playwright's own browser (handy on machines without it)
const launchOptions = process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {};

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } }
  ],
  webServer: { command: 'node e2e/serve.js', url: `http://127.0.0.1:${PORT}/api/health`, timeout: 60000, reuseExistingServer: false }
});
