// One contact number (Nov 2026): the owner replaced the two public numbers (+234 809 139 7912 and
// +234 813 858 8818) with a single shared one, +234 806 313 5732, for calls and WhatsApp. Updates the
// settings and any page, post or car text that quoted the old numbers. Later changes go through Settings.
const NEW = '+234 806 313 5732';
const OLD = /\+?234 ?809 ?139 ?7912|\+?234 ?813 ?858 ?8818|0809 ?139 ?7912|0813 ?858 ?8818/g;
const fix = (s) => String(s)
  .replace(/<li>Alt\. WhatsApp: [^<]*<\/li>\s*/g, '') // the second number had its own line on the policy pages
  .replace(OLD, NEW);
module.exports = {
  about: 'single contact number +234 806 313 5732',
  async up({ q }) {
    for (const [k, v] of [['phones', NEW], ['whatsapp', '2348063135732']]) {
      if ((await q('SELECT k FROM settings WHERE k = ?', [k])).length) await q('UPDATE settings SET v = ? WHERE k = ?', [v, k]);
      else await q('INSERT INTO settings (k, v) VALUES (?, ?)', [k, v]);
    }
    for (const [table, cols] of [['pages', ['content']], ['posts', ['content', 'excerpt']], ['cars', ['description']]]) {
      for (const col of cols) {
        for (const r of await q(`SELECT id, ${col} AS v FROM ${table} WHERE ${col} LIKE ? OR ${col} LIKE ? OR ${col} LIKE ? OR ${col} LIKE ?`, ['%139 7912%', '%858 8818%', '%1397912%', '%8588818%'])) {
          const v = fix(r.v);
          if (v !== r.v) await q(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [v, r.id]);
        }
      }
    }
  }
};
