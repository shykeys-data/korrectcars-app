// Throw-away email services. Dealers must use an inbox they keep, because every lead, claim and staff
// message goes there. The list covers the common services; add more here when one gets through.
const DOMAINS = new Set(`
10minutemail.com 10minutemail.net 20minutemail.com 33mail.com anonbox.net burnermail.io byom.de crazymailing.com
discard.email dispostable.com dropmail.me emailondeck.com emailfake.com fakeinbox.com fakemail.net getairmail.com
getnada.com guerrillamail.biz guerrillamail.com guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org
guerrillamailblock.com grr.la harakirimail.com inboxkitten.com incognitomail.org jetable.org mail.tm mail-temp.com
mailcatch.com maildrop.cc mailinator.com mailinator.net mailinator2.com mailnesia.com mailpoof.com mailsac.com
mintemail.com moakt.com mohmal.com mytemp.email mytrashmail.com nada.email nwytg.net sharklasers.com spam4.me
spambox.us spamgourmet.com temp-mail.io temp-mail.org tempail.com tempinbox.com tempmail.com tempmail.dev
tempmail.net tempmail.plus tempmailo.com tempr.email throwawaymail.com tmail.ws tmpmail.net tmpmail.org trash-mail.com
trashmail.com trashmail.de trashmail.net trbvm.com wegwerfmail.de yopmail.com yopmail.fr yopmail.net zetmail.com
emailtemporanea.net fakemailgenerator.com minuteinbox.com luxusmail.org 1secmail.com 1secmail.net 1secmail.org
`.split(/\s+/).filter(Boolean));

function isDisposable(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  if (!domain) return false;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (DOMAINS.has(parts.slice(i).join('.'))) return true; // also sub.mailinator.com
  return /(^|\.)(temp|trash|throwaway|disposable)[-]?mail/.test(domain);
}

// Passwords people pick first. Dealer accounts hold business data, so these are refused.
const COMMON = new Set(`password password1 password123 passw0rd 123456789 1234567890 12345678910 qwertyuiop qwerty123
iloveyou1 abc123456 abcd1234 football1 welcome123 admin12345 letmein123 sunshine1 princess1 monkey1234 dragon1234
1q2w3e4r5t zaq12wsx asdfghjkl 11111111111 0000000000 1234qwer 123qweasd nigeria123 lagos12345 korrectcars korrect123
toyota1234 password12 changeme123 welcome1234`.split(/\s+/));
function weakPassword(pw, { email = '', name = '' } = {}) {
  const p = String(pw || '');
  if (p.length < 10) return 'Use at least 10 characters.';
  if (p.length > 128) return 'Use at most 128 characters.';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij)/.test(low)) return 'This password is too easy to guess. Try three or four unrelated words.';
  const local = String(email).toLowerCase().split('@')[0];
  if (local.length >= 4 && low.includes(local)) return 'Do not use your email address in your password.';
  const first = String(name).toLowerCase().split(/\s+/)[0] || '';
  if (first.length >= 4 && low.replace(/[^a-z]/g, '') === first) return 'Do not use your name as your password.';
  return null;
}

module.exports = { isDisposable, weakPassword };
