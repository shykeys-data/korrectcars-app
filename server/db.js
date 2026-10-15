// MySQL / MariaDB data layer (mysql2). Tables are created automatically on first start.
// For local tests only, DB_DRIVER=sqlite runs the same SQL on Node's built-in SQLite.
const config = require('./config');

const JSON_COLS = new Set(['features', 'specs', 'info', 'photos', 'papers', 'wants_makes', 'wants_bodies', 'recovery_codes']);

let driver;

function parseRow(row) {
  if (!row) return row;
  for (const k of Object.keys(row)) {
    if (JSON_COLS.has(k) && typeof row[k] === 'string') { try { row[k] = JSON.parse(row[k]); } catch (_e) { row[k] = []; } }
    if (row[k] instanceof Date) row[k] = row[k].toISOString();
  }
  return row;
}

async function init() {
  if (process.env.DB_DRIVER === 'sqlite') {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.env.SQLITE_FILE || ':memory:');
    driver = {
      async query(sql, params = []) {
        sql = sql.replace(/NOW\(\)/g, "datetime('now')");
        const p = safeParams(params).map((v) => (v instanceof Date ? v.toISOString() : v));
        const st = db.prepare(sql);
        if (/^\s*(SELECT|SHOW|WITH)/i.test(sql)) return st.all(...p);
        const r = st.run(...p);
        return { insertId: Number(r.lastInsertRowid), affectedRows: r.changes };
      },
      exec(sql) { db.exec(sql); }
    };
    for (const s of schema('sqlite')) driver.exec(s);
    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    if (!cols.includes('email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified TINYINT NOT NULL DEFAULT 1');
    for (const [t, c, def] of MIGRATIONS) {
      const have = db.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name);
      if (!have.includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def.replace(/VARCHAR\(\d+\)/, 'TEXT').replace(/ ON UPDATE CURRENT_TIMESTAMP/, '')}`);
    }
    return;
  }
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    charset: 'utf8mb4', connectionLimit: 8, waitForConnections: true, timezone: 'Z', dateStrings: false
  });
  driver = {
    async query(sql, params = []) {
      const [rows] = await pool.query(sql, safeParams(params));
      return rows;
    }
  };
  for (const s of schema('mysql')) await pool.query(s);
  // Migration: accounts created before email verification existed stay active
  const [col] = await pool.query("SHOW COLUMNS FROM users LIKE 'email_verified'");
  if (!col.length) {
    await pool.query('ALTER TABLE users ADD COLUMN email_verified TINYINT NOT NULL DEFAULT 1');
    await pool.query('ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT 0');
  }
  for (const [t, c, def] of MIGRATIONS) {
    const [have] = await pool.query(`SHOW COLUMNS FROM ${t} LIKE ?`, [c]);
    if (!have.length) await pool.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
  }
}

// New columns added after launch: [table, column, definition]
const MIGRATIONS = [
  ['users', 'totp_secret', 'VARCHAR(64) NULL'],
  ['users', 'totp_enabled', 'TINYINT NOT NULL DEFAULT 0'],
  ['users', 'recovery_codes', 'TEXT NULL'],
  ['enquiries', 'notes', 'TEXT NULL'],
  ['enquiries', 'assigned_to', 'INT NULL'],
  ['enquiries', 'updated_at', 'DATETIME NULL']
];

// Only plain values may reach the driver: an object or array from user input could
// otherwise be expanded by mysql2 into SQL fragments.
function safeParams(params = []) {
  return params.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
    if (v instanceof Date) return v;
    return String(v);
  });
}

async function q(sql, params) { const r = await driver.query(sql, params); return Array.isArray(r) ? r.map(parseRow) : r; }
async function one(sql, params) { const r = await q(sql, params); return r[0] || null; }
const J = (v) => JSON.stringify(v || []);

function schema(kind) {
  const my = kind === 'mysql';
  const ID = my ? 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const FK = my ? 'INT UNSIGNED' : 'INTEGER';
  const TS = my ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' : "TEXT NOT NULL DEFAULT (datetime('now'))";
  const TSU = my ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' : "TEXT NOT NULL DEFAULT (datetime('now'))";
  const TAIL = my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
  const T = my ? 'MEDIUMTEXT' : 'TEXT';
  const S = (n) => (my ? `VARCHAR(${n})` : 'TEXT');
  const idx = (name, table, cols) => (my ? null : `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`);
  const k = (name, cols) => (my ? `, KEY ${name} (${cols})` : '');
  return [
    `CREATE TABLE IF NOT EXISTS users (id ${ID}, name ${S(80)} NOT NULL, email ${S(120)} NOT NULL UNIQUE, phone ${S(20)} NOT NULL,
      password_hash ${S(100)} NOT NULL, role ${S(12)} NOT NULL DEFAULT 'user', verified TINYINT NOT NULL DEFAULT 0, email_verified TINYINT NOT NULL DEFAULT 0,
      failed_logins INT NOT NULL DEFAULT 0, lock_until DATETIME NULL, token_version INT NOT NULL DEFAULT 0, disabled TINYINT NOT NULL DEFAULT 0,
      created_at ${TS}, updated_at ${TSU})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS cars (id ${ID}, slug ${S(160)} NOT NULL UNIQUE, title ${S(160)} NOT NULL, make ${S(60)} NOT NULL, model ${S(60)} NOT NULL,
      body ${S(30)} NOT NULL, trim_level ${S(60)}, year INT, price BIGINT NOT NULL, old_price BIGINT, mileage ${S(40)}, engine ${S(100)},
      transmission ${S(60)}, drivetrain ${S(60)}, fuel ${S(40)}, color ${S(60)}, interior ${S(60)}, car_condition ${S(40)}, location ${S(60)},
      vin ${S(40)}, stock ${S(40)}, description ${T}, features ${T}, specs ${T}, info ${T}, photos ${T},
      status ${S(12)} NOT NULL DEFAULT 'available', featured TINYINT NOT NULL DEFAULT 0, views INT NOT NULL DEFAULT 0,
      seo_title ${S(200)}, seo_desc ${S(320)}, wp_url ${S(200)}, created_at ${TS}, updated_at ${TSU}
      ${k('cars_mmb', 'make, model, body')}${k('cars_status', 'status')})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS enquiries (id ${ID}, car_id ${FK}, type ${S(12)} NOT NULL, name ${S(80)}, phone ${S(20)}, email ${S(120)},
      message TEXT, offer_amount BIGINT, preferred_date ${S(40)}, bnpl_deposit BIGINT, bnpl_months INT, bnpl_monthly BIGINT,
      status ${S(12)} NOT NULL DEFAULT 'new', created_at ${TS})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS swap_listings (id ${ID}, owner_id ${FK} NOT NULL, make ${S(60)}, model ${S(60)}, body ${S(30)}, year INT, mileage ${S(40)},
      value BIGINT, location ${S(60)}, car_condition ${S(40)}, color ${S(40)}, transmission ${S(40)}, description TEXT, photos ${T}, papers ${T},
      wants_makes ${T}, wants_bodies ${T}, max_top_up BIGINT, wants_notes TEXT, status ${S(12)} NOT NULL DEFAULT 'pending', reject_reason ${S(300)},
      created_at ${TS}, updated_at ${TSU}${k('sl_owner', 'owner_id')}${k('sl_status', 'status')})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS offers (id ${ID}, listing_id ${FK} NOT NULL, from_listing_id ${FK} NOT NULL, from_user ${FK} NOT NULL, to_user ${FK} NOT NULL,
      top_up BIGINT NOT NULL DEFAULT 0, top_up_payer ${S(6)} NOT NULL DEFAULT 'none', status ${S(12)} NOT NULL DEFAULT 'pending',
      inspection_place ${S(120)}, inspection_time ${S(60)}, fee BIGINT, fee_status ${S(6)} NOT NULL DEFAULT 'none',
      created_at ${TS}, updated_at ${TSU}${k('of_from', 'from_user')}${k('of_to', 'to_user')})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS messages (id ${ID}, offer_id ${FK} NOT NULL, sender_id ${FK} NOT NULL, text TEXT, masked TINYINT NOT NULL DEFAULT 0,
      reported TINYINT NOT NULL DEFAULT 0, created_at ${TS}${k('msg_offer', 'offer_id')})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS posts (id ${ID}, slug ${S(200)} NOT NULL UNIQUE, title ${S(250)}, excerpt TEXT, content ${T}, image ${S(250)},
      published_at DATETIME, wp_id INT, seo_title ${S(250)}, seo_desc ${S(400)}, status ${S(12)} NOT NULL DEFAULT 'published', created_at ${TS})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS pages (id ${ID}, slug ${S(100)} NOT NULL UNIQUE, title ${S(200)}, content ${T}, updated_at ${TSU})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS email_tokens (id ${ID}, user_id ${FK} NOT NULL, token_hash ${S(64)} NOT NULL, purpose ${S(12)} NOT NULL,
      expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at ${TS}${k('et_hash', 'token_hash')})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS audit (id ${ID}, user_id ${FK}, user_name ${S(80)}, action ${S(160)}, target ${S(300)}, ip ${S(60)}, created_at ${TS})${TAIL}`,
    `CREATE TABLE IF NOT EXISTS settings (k ${S(60)} NOT NULL PRIMARY KEY, v TEXT, updated_at ${TSU})${TAIL}`,
    idx('cars_mmb', 'cars', 'make, model, body'), idx('sl_status', 'swap_listings', 'status'), idx('of_from', 'offers', 'from_user'), idx('of_to', 'offers', 'to_user'), idx('msg_offer', 'messages', 'offer_id')
  ].filter(Boolean);
}

module.exports = { init, q, one, J, config };
