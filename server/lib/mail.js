// Sends email through the server's own sendmail (Exim on DirectAdmin), so no SMTP password
// is needed. In development (or when sendmail is missing) messages are written to the log.
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const config = require('../config');

const SENDMAIL = ['/usr/sbin/sendmail', '/usr/lib/sendmail'].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (_e) { return false; } });
const sent = []; // last messages, for tests
// The Korrect Cars logo (white, for the dark header of every email), attached to each message
const LOGO_CID = 'logo@korrectcars.com';
const LOGO_SRC = `cid:${LOGO_CID}`;
let LOGO = null;
try { LOGO = fs.readFileSync(require('path').join(__dirname, '..', 'assets', 'email-logo.png')).toString('base64').replace(/.{76}/g, '$&\n'); } catch (_e) { /* falls back to the logo on the website */ }

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\n');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

// The full message as sendmail receives it (also used by the tests)
function build({ to, subject, text, html }) {
  const from = clean(config.mailFrom);
  const boundary = 'kc' + crypto.randomBytes(12).toString('hex');
  const outer = 'kr' + crypto.randomBytes(12).toString('hex');
  const domain = (from.match(/@([^>\s]+)/) || [, 'korrectcars.com'])[1];
  const msg = [
    `From: ${encHeader('Korrect Cars')} <${from}>`,
    `To: <${to}>`,
    `Reply-To: <${clean(config.email)}>`,
    `Subject: ${encHeader(clean(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    // The logo travels inside the email (multipart/related + Content-ID), so it shows even when the site
    // cannot be reached (staging is behind a password) and does not depend on remote images being allowed
    ...(LOGO ? [`Content-Type: multipart/related; boundary="${outer}"`, '', `--${outer}`, `Content-Type: multipart/alternative; boundary="${boundary}"`]
      : [`Content-Type: multipart/alternative; boundary="${boundary}"`]),
    '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(LOGO ? html : html.replace(LOGO_SRC, `${config.siteUrl}/img/logo-white.svg`)),
    `--${boundary}--`,
    ...(LOGO ? ['', `--${outer}`, 'Content-Type: image/png; name="korrect-cars.png"', 'Content-Transfer-Encoding: base64', `Content-ID: <${LOGO_CID}>`,
      'Content-Disposition: inline; filename="korrect-cars.png"', '', LOGO, `--${outer}--`] : []),
    ''
  ].join('\n'); // sendmail expects local (LF) line endings
  return msg;
}

function send({ to, subject, text, html }) {
  to = clean(to);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return Promise.reject(new Error('Bad recipient'));
  const from = clean(config.mailFrom);
  const msg = build({ to, subject, text, html });
  sent.push({ to, subject, text });
  if (sent.length > 20) sent.shift();
  if (!SENDMAIL || process.env.MAIL_DISABLED === '1') {
    console.log(`[mail not sent: ${SENDMAIL ? 'disabled' : 'no sendmail'}] To: ${to} | ${subject}\n${text}`);
    return Promise.resolve({ logged: true });
  }
  return new Promise((resolve, reject) => {
    const p = spawn(SENDMAIL, ['-t', '-i', '-f', from]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ sent: true }) : reject(new Error(`sendmail exited ${code}: ${err.slice(0, 200)}`))));
    p.stdin.end(msg);
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b0b0d;padding:20px 28px"><img src="${LOGO_SRC}" alt="Korrect Cars" width="142" height="34" style="display:block;width:142px;height:34px;border:0;color:#ffffff;font-weight:bold;font-size:20px"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:22px;margin:0 0 14px">${esc(title)}</h1>
${bodyHtml}
<p style="font-size:13px;color:#71717a;margin:28px 0 0">Korrect Cars, Lagos · ${esc(config.phones.join(' · '))} · <a href="${config.siteUrl}" style="color:#c4161d">korrectcars.com</a><br>We will never ask you to pay into a personal account.</p>
</td></tr></table></td></tr></table></body></html>`;
}
const button = (url, label) => `<p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#d71920;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">${esc(label)}</a></p><p style="font-size:13px;color:#52525b">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>`;

const codeBox = (code) => `<p style="margin:22px 0;font-size:30px;letter-spacing:8px;font-weight:bold;font-family:Consolas,monospace">${esc(code)}</p>`;
const templates = {
  // Dealer sign-up: sent before any account exists, so it proves the inbox is real
  dealerCode: (code) => ({
    subject: `${code} is your Korrect Cars sign-up code`,
    text: `Your Korrect Cars dealer sign-up code is: ${code}\n\nType it on the sign-up page. It works for 15 minutes.\n\nIf you did not ask to join Korrect Cars as a dealer, ignore this email; no account has been made.\n\nKorrect Cars`,
    html: layout('Your sign-up code', `<p>Type this code on the Korrect Cars sign-up page. It works for 15 minutes.</p>${codeBox(code)}<p style="font-size:14px;color:#52525b">If you did not ask to join Korrect Cars as a dealer, ignore this email; no account has been made.</p>`)
  }),
  dealerExists: () => ({
    subject: 'You already have a Korrect Cars account',
    text: `Someone (probably you) asked to join Korrect Cars as a dealer with this email, but it already has an account.\n\nSign in, then open ${config.siteUrl}/dealers/join to add your business:\n${config.siteUrl}/login\n\nForgot your password? Use "Forgot password" on the sign-in page.\n\nKorrect Cars`,
    html: layout('You already have an account', `<p>Someone (probably you) asked to join Korrect Cars as a dealer with this email, but it already has an account. Sign in, then add your business.</p>${button(`${config.siteUrl}/login?next=/dealers/join`, 'Sign in')}<p style="font-size:14px;color:#52525b">Forgot your password? Use “Forgot password” on the sign-in page.</p>`)
  }),
  dealerReceived: (name, business) => ({
    subject: `We received ${business}'s application`,
    text: `Hello ${name},\n\nThanks for applying to sell on Korrect Cars. Our team checks your business papers (CAC) and phone, usually within 2 working days, and emails you the result.\n\nYou can already add your cars: they go live as soon as you are approved.\n${config.siteUrl}/dealer\n\nKorrect Cars`,
    html: layout('Application received', `<p>Hello ${esc(name)},</p><p>Thanks for applying to sell on Korrect Cars as <b>${esc(business)}</b>. Our team checks your business papers (CAC) and phone, usually within 2 working days, and emails you the result.</p><p>You can already add your cars: they go live as soon as you are approved.</p>${button(`${config.siteUrl}/dealer`, 'Open my dealer page')}`)
  }),
  dealerDecision: (name, business, decision, note, kind) => {
    const t = kind === 'personal' ? { approve: ['You are a Verified Seller', 'Your ID is checked: you are now a Verified Seller and can list up to 5 cars.'],
      more_info: ['We need a little more', 'We need a little more before we can check your ID.'],
      reject: ['ID not accepted', 'We could not accept your ID at this time.'],
      suspend: ['Your seller account is paused', 'Your listings are paused while our team looks into something.'] }[decision] : { approve: ['You are approved', `${business} is approved. Your cars are now live on Korrect Cars.`],
      more_info: ['We need a little more', `We need a little more before we can approve ${business}.`],
      reject: ['Application not approved', `We could not approve ${business} at this time.`],
      suspend: ['Your dealer account is paused', `${business}'s listings are paused while our team looks into something.`] }[decision];
    return {
      subject: `${t[0]}: Korrect Cars`,
      text: `Hello ${name},\n\n${t[1]}${note ? `\n\nNote from our team: ${note}` : ''}\n\n${config.siteUrl}/dealer\n\nQuestions? Reply to this email.\n\nKorrect Cars`,
      html: layout(t[0], `<p>Hello ${esc(name)},</p><p>${esc(t[1])}</p>${note ? `<p style="background:#f4f4f5;border-radius:10px;padding:12px 14px"><b>Note from our team:</b> ${esc(note)}</p>` : ''}${button(`${config.siteUrl}/dealer`, 'Open my dealer page')}<p style="font-size:14px;color:#52525b">Questions? Reply to this email.</p>`)
    };
  },
  staffNewDealer: (business, state) => ({
    subject: `New dealer to review: ${business}`,
    text: `${business} (${state || 'state not given'}) applied to sell on Korrect Cars. Open "Dealers to review" in the staff area.`,
    html: layout('New dealer to review', `<p><b>${esc(business)}</b> (${esc(state || 'state not given')}) applied to sell on Korrect Cars. Open “Dealers to review” in the staff area.</p>`)
  }),
  sellerIdReceived: (name) => ({
    subject: 'We received your ID',
    text: `Hello ${name},\n\nThanks for sending your ID. Our team checks it, usually within 2 working days, and emails you the result. Once it is checked you are a Verified Seller and can list up to 5 cars.\n\n${config.siteUrl}/dealer\n\nKorrect Cars`,
    html: layout('ID received', `<p>Hello ${esc(name)},</p><p>Thanks for sending your ID. Our team checks it, usually within 2 working days, and emails you the result. Once it is checked you are a <b>Verified Seller</b> and can list up to 5 cars.</p>${button(`${config.siteUrl}/dealer`, 'Open my seller page')}`)
  }),
  staffNewSeller: (name, state) => ({
    subject: `Seller ID to check: ${name}`,
    text: `${name} (${state || 'state not given'}) sent an ID to become a Verified Seller. Open "Dealers to review" in the staff area.`,
    html: layout('Seller ID to check', `<p><b>${esc(name)}</b> (${esc(state || 'state not given')}) sent an ID to become a Verified Seller. Open “Dealers to review” in the staff area.</p>`)
  }),
  staffCarToCheck: (seller, title) => ({
    subject: `Private seller car to check: ${title}`,
    text: `${seller} (private seller, not verified) added ${title}. It goes live only after a staff check. Open "Cars to check" in the staff area.`,
    html: layout('Private seller car to check', `<p><b>${esc(seller)}</b> (private seller, not verified) added <b>${esc(title)}</b>. It goes live only after a staff check. Open “Cars to check” in the staff area.</p>`)
  }),
  carCheckDecision: (name, title, ok, note) => {
    const t = ok ? ['Your car is live', `${title} passed our check and is now live on Korrect Cars.`] : ['Your car was not approved', `We could not put ${title} live.`];
    return {
      subject: `${t[0]}: Korrect Cars`,
      text: `Hello ${name},\n\n${t[1]}${note ? `\n\nNote from our team: ${note}` : ''}\n\n${config.siteUrl}/dealer\n\nKorrect Cars`,
      html: layout(t[0], `<p>Hello ${esc(name)},</p><p>${esc(t[1])}</p>${note ? `<p style="background:#f4f4f5;border-radius:10px;padding:12px 14px"><b>Note from our team:</b> ${esc(note)}</p>` : ''}${button(`${config.siteUrl}/dealer`, 'Open my seller page')}`)
    };
  },
  loginCode: (name, code, reason) => ({
    subject: `Your Korrect Cars sign-in code: ${code}`,
    text: `Hello ${name},\n\nYour sign-in code is ${code}. It works for 10 minutes.\n\nWe asked for it because of: ${reason}.\n\nIf this was not you, do not share the code. Reset your password straight away: ${config.siteUrl}/forgot-password\n\nKorrect Cars`,
    html: layout('Your sign-in code', `<p>Hello ${esc(name)},</p><p>Type this code to finish signing in. It works for 10 minutes.</p>${codeBox(code)}<p style="font-size:14px;color:#52525b">We asked for it because of: ${esc(reason)}. If this was not you, do not share the code, and <a href="${config.siteUrl}/forgot-password">reset your password</a> straight away.</p>`)
  }),
  newDevice: (name, device) => ({
    subject: 'New sign-in to your Korrect Cars seller account',
    text: `Hello ${name},\n\nYour seller account was just signed in on a new device:\n${device}\n\nIf this was you, there is nothing to do. If not, reset your password now: ${config.siteUrl}/forgot-password\n\nKorrect Cars`,
    html: layout('New sign-in', `<p>Hello ${esc(name)},</p><p>Your seller account was just signed in on a new device:</p><p style="background:#f4f4f5;border-radius:10px;padding:12px 14px;font-size:14px">${esc(device)}</p><p>If this was you, there is nothing to do. If not, <a href="${config.siteUrl}/forgot-password">reset your password</a> now.</p>`)
  }),
  teamInvite: (business, inviter, role, url) => ({
    subject: `${inviter} invited you to ${business} on Korrect Cars`,
    text: `Hello,\n\n${inviter} invited you to join ${business} on Korrect Cars as a ${role}.\n\nAccept within 72 hours (the link works once):\n${url}\n\nIf you were not expecting this, ignore this email.\n\nKorrect Cars`,
    html: layout('You are invited', `<p>Hello,</p><p><b>${esc(inviter)}</b> invited you to join <b>${esc(business)}</b> on Korrect Cars as a <b>${esc(role)}</b>.</p>${button(url, 'Accept the invitation')}<p style="font-size:14px;color:#52525b">The link works once, for 72 hours. If you were not expecting this, ignore this email.</p>`)
  }),
  sellerLead: (name, l) => ({
    subject: `Buyer request: ${l.buyer} ${l.what} your ${l.title}`,
    text: `Hello ${name},\n\n${l.buyer} ${l.what} your ${l.title} on Korrect Cars.\n\nPhone: ${l.phone}${l.email ? `\nEmail: ${l.email}` : ''}${l.details.length ? '\n' + l.details.join('\n') : ''}\n\nReply to them soon: buyers move on quickly. Mark it as replied on your page:\n${config.siteUrl}/dealer\n\nKorrect Cars`,
    html: layout('New buyer request', `<p>Hello ${esc(name)},</p><p><b>${esc(l.buyer)}</b> ${esc(l.what)} your <a href="${config.siteUrl}/cars/${esc(l.slug)}">${esc(l.title)}</a>.</p><p style="background:#f4f4f5;border-radius:10px;padding:12px 14px">Phone: <b>${esc(l.phone)}</b>${l.email ? `<br>Email: ${esc(l.email)}` : ''}${l.details.map((d) => `<br>${esc(d)}`).join('')}</p><p>Reply to them soon: buyers move on quickly.</p>${button(`${config.siteUrl}/dealer`, 'Open buyer requests')}`)
  }),
  staffReport: (title, reason) => ({
    subject: `Listing reported: ${title}`,
    text: `A buyer reported ${title} (${reason}). Open "Reported listings" in the staff area.`,
    html: layout('Listing reported', `<p>A buyer reported <b>${esc(title)}</b> (${esc(reason)}). Open “Reported listings” in the staff area.</p>`)
  }),
  verify: (name, url) => ({
    subject: 'Confirm your email for Korrect Cars',
    text: `Hello ${name},\n\nPlease confirm your email to activate your Korrect Cars account:\n${url}\n\nThe link works for 24 hours. If you did not create an account, ignore this email and nothing will happen.\n\nKorrect Cars`,
    html: layout('Confirm your email', `<p>Hello ${esc(name)},</p><p>Thanks for joining Korrect Cars. Please confirm your email address to activate your account.</p>${button(url, 'Confirm my email')}<p style="font-size:14px;color:#52525b">The link works for 24 hours. If you did not create an account, ignore this email and nothing will happen.</p>`)
  }),
  verified: (name) => ({
    subject: 'Your Korrect Cars account is active',
    text: `Hello ${name},\n\nYour email is confirmed and your Korrect Cars account is now active.\n\nYou can now save cars and searches (we email you when a matching car arrives) and follow your requests from your account:\n${config.siteUrl}/account\n\nIf this was not you, reply to this email straight away.\n\nKorrect Cars`,
    html: layout('Your account is active', `<p>Hello ${esc(name)},</p><p>Your email is confirmed and your Korrect Cars account is now active. You can save cars and searches (we email you when a matching car arrives) and follow your requests from your account.</p>${button(`${config.siteUrl}/account`, 'Go to my account')}<p style="font-size:14px;color:#52525b">If this was not you, reply to this email straight away.</p>`)
  }),
  reset: (name, url) => ({
    subject: 'Reset your Korrect Cars password',
    text: `Hello ${name},\n\nUse this link to choose a new password:\n${url}\n\nThe link works for 1 hour. If you did not ask for this, ignore this email; your password will not change.\n\nKorrect Cars`,
    html: layout('Reset your password', `<p>Hello ${esc(name)},</p><p>We received a request to reset your password.</p>${button(url, 'Choose a new password')}<p style="font-size:14px;color:#52525b">The link works for 1 hour. If you did not ask for this, ignore this email; your password will not change.</p>`)
  }),
  passwordChanged: (name) => ({
    subject: 'Your Korrect Cars password was changed',
    text: `Hello ${name},\n\nYour Korrect Cars password was just changed and all other sessions were signed out.\n\nIf this was not you, contact us immediately on WhatsApp or reply to this email.\n\nKorrect Cars`,
    html: layout('Password changed', `<p>Hello ${esc(name)},</p><p>Your Korrect Cars password was just changed and all other sessions were signed out.</p><p>If this was not you, contact us immediately on WhatsApp or reply to this email.</p>`)
  })
};

module.exports = { send, build, templates, sent, layout, button, hasSendmail: !!SENDMAIL };
