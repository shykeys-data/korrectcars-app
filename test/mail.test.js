// Every email carries the Korrect Cars logo inside the message (not a link), so it shows on any device.
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MAIL_DISABLED = '1';
const mail = require('../server/lib/mail');

test('every email layout shows the logo, attached inside the message', () => {
  const t = mail.templates.dealerDecision('Ade', 'Ade Motors', 'approve', '');
  const msg = mail.build({ to: 'ade@example.com', ...t });
  assert.match(msg, /Content-Type: multipart\/related; boundary=/);
  assert.match(msg, /Content-ID: <logo@korrectcars\.com>/);
  assert.match(msg, /Content-Type: image\/png/);
  const htmlPart = msg.split('Content-Type: text/html; charset=UTF-8')[1].split('--kc')[0].replace(/^[\s\S]*?\n\n/, '');
  assert.match(Buffer.from(htmlPart.replace(/\s/g, ''), 'base64').toString('utf8'), /src="cid:logo@korrectcars\.com"/);
});
