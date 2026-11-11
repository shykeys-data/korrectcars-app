// WhatsApp numbers in international form (Nov 2026): sellers who left the WhatsApp box empty at signup got their
// account phone copied as typed (e.g. 08161562017), and wa.me links need 2348161562017, so buyers could not reach
// them. Signup now converts it; this converts the numbers already saved. Numbers that are not Nigerian mobiles
// are left as they are.
const { toE164 } = require('../lib/sms');
module.exports = {
  about: 'dealers.whatsapp to +234 form',
  async up({ q }) {
    for (const d of await q('SELECT id, whatsapp FROM dealers WHERE whatsapp IS NOT NULL')) {
      const n = toE164(d.whatsapp);
      if (n && n !== d.whatsapp) await q('UPDATE dealers SET whatsapp = ? WHERE id = ?', [n, d.id]);
    }
  }
};
