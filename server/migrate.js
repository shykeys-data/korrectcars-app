// Numbered, one-time database changes. Every file in server/migrations runs once, in name order, and is
// recorded in the schema_migrations table, so a restart never runs it twice. The same file runs on MySQL
// (staging and live) and on SQLite (local tests). Write each step so it is safe to run again if the app
// stopped half-way (CREATE TABLE IF NOT EXISTS, check a column before adding it).
// To change the database: add the next file, e.g. server/migrations/002_vehicle_ids.js. Never edit one that has shipped.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migrations');

// Column and table helpers that differ between MySQL and SQLite
function helpers(q, kind) {
  const my = kind === 'mysql';
  return {
    q,
    kind,
    my,
    t: {
      ID: my ? 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
      FK: my ? 'INT UNSIGNED' : 'INTEGER',
      TS: my ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' : "TEXT NOT NULL DEFAULT (datetime('now'))",
      TSU: my ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' : "TEXT NOT NULL DEFAULT (datetime('now'))",
      TAIL: my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '',
      S: (n) => (my ? `VARCHAR(${n})` : 'TEXT'),
      TEXT: 'TEXT'
    },
    async hasColumn(table, col) {
      if (my) return (await q(`SHOW COLUMNS FROM ${table} LIKE ?`, [col])).length > 0;
      return (await q(`PRAGMA table_info(${table})`)).some((c) => c.name === col);
    },
    async hasIndex(table, name) {
      if (my) return (await q(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [name])).length > 0;
      return (await q(`PRAGMA index_list(${table})`)).some((i) => i.name === name);
    }
  };
}

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.js$/.test(f)).sort();
}

// q(sql, params) must run on ONE connection on MySQL, so the lock below covers every step
async function run(q, kind) {
  const h = helpers(q, kind);
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (id ${h.t.S(80)} NOT NULL PRIMARY KEY, applied_at ${h.t.TS})${h.t.TAIL}`);
  const done = new Set((await q('SELECT id FROM schema_migrations')).map((r) => r.id));
  const applied = [];
  for (const file of list()) {
    const id = file.replace(/\.js$/, '');
    if (done.has(id)) continue;
    const m = require(path.join(DIR, file));
    console.log(`Database change ${id}: ${m.about || ''}`);
    await m.up(h);
    await q('INSERT INTO schema_migrations (id) VALUES (?)', [id]);
    applied.push(id);
  }
  return applied;
}

module.exports = { run, list };
