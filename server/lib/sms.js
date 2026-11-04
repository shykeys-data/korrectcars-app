// Text messages for phone checks. Uses Termii (Nigerian SMS provider) when TERMII_API_KEY is set.
// Without a key: on staging and in tests the code is returned to the page (marked as a test code) so the
// sign-up can be tried end to end; on the live site the phone step refuses, so no dealer is told a text was sent.
const config = require('../config');

const KEY = process.env.TERMII_API_KEY || '';
const SENDER = process.env.TERMII_SENDER_ID || 'N-Alert';
const CHANNEL = process.env.TERMII_CHANNEL || 'dnd'; // dnd reaches numbers on the do-not-disturb list
const testMode = () => !KEY && (/staging/.test(config.siteUrl) || process.env.NODE_ENV === 'test');

// Nigerian numbers only, written as +234XXXXXXXXXX. Accepts 0803..., 234803..., +234 803 ...
function toE164(raw) {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  let n = d.replace(/^\+/, '');
  if (/^0[789][01]\d{8}$/.test(n)) n = '234' + n.slice(1);
  if (!/^234[789][01]\d{8}$/.test(n)) return null;
  return '+' + n;
}

async function send(to, text) {
  if (!KEY) {
    if (testMode()) { console.log(`[sms test] to ${to}: ${text}`); return { sent: false, test: true }; }
    throw Object.assign(new Error('Phone checks are not switched on yet. Please call or WhatsApp us to finish your sign-up.'), { status: 503, expose: true });
  }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: KEY, to: to.replace(/^\+/, ''), from: SENDER, sms: text, type: 'plain', channel: CHANNEL })
    });
    if (!res.ok) throw new Error('status ' + res.status);
    return { sent: true };
  } catch (e) {
    console.error('[sms] send failed:', e.message);
    throw Object.assign(new Error('We could not send the text message just now. Please try again in a minute.'), { status: 503, expose: true });
  } finally { clearTimeout(t); }
}

module.exports = { send, toE164, testMode };
