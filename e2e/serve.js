// Starts the app for the browser tests: a fresh SQLite database (seeded with the real stock on first start),
// no email, fixed Pay Small Small settings. Used by playwright.config.js; not for production.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.tmpdir(), 'kc-e2e');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'private'), { recursive: true });
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: process.env.E2E_PORT || '4777', SITE_URL: `http://127.0.0.1:${process.env.E2E_PORT || '4777'}`,
  DB_DRIVER: 'sqlite', SQLITE_FILE: path.join(dir, 'db.sqlite'), PRIVATE_DIR: path.join(dir, 'private'),
  MAIL_DISABLED: '1', TOTP_KEY: 'e'.repeat(64), ADSENSE_CLIENT: '', GA_ID: '',
  BNPL_MIN_DEPOSIT_PCT: '40', BNPL_MARKUP_PCT: '20', BNPL_MIN_MONTHS: '6', BNPL_MAX_MONTHS: '48'
});
require('../server/index.js');
