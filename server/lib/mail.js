// Sends email through the server's own sendmail (Exim on DirectAdmin), so no SMTP password
// is needed. In development (or when sendmail is missing) messages are written to the log.
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const config = require('../config');

const SENDMAIL = ['/usr/sbin/sendmail', '/usr/lib/sendmail'].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (_e) { return false; } });
const sent = []; // last messages, for tests

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\n');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

function send({ to, subject, text, html }) {
  to = clean(to);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return Promise.reject(new Error('Bad recipient'));
  const from = clean(config.mailFrom);
  const boundary = 'kc' + crypto.randomBytes(12).toString('hex');
  const domain = (from.match(/@([^>\s]+)/) || [, 'korrectcars.com'])[1];
  const msg = [
    `From: ${encHeader('Korrect Cars')} <${from}>`,
    `To: <${to}>`,
    `Reply-To: <${clean(config.email)}>`,
    `Subject: ${encHeader(clean(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
    `--${boundary}--`, ''
  ].join('\n'); // sendmail expects local (LF) line endings
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
<tr><td style="background:#0b0b0d;padding:20px 28px"><img src="${config.siteUrl}/img/logo.png" alt="Korrect Cars" height="34" style="display:block;height:34px"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:22px;margin:0 0 14px">${esc(title)}</h1>
${bodyHtml}
<p style="font-size:13px;color:#71717a;margin:28px 0 0">Korrect Cars, Lagos · ${esc(config.phones.join(' · '))} · <a href="${config.siteUrl}" style="color:#c4161d">korrectcars.com</a><br>We will never ask you to pay into a personal account.</p>
</td></tr></table></td></tr></table></body></html>`;
}
const button = (url, label) => `<p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#d71920;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">${esc(label)}</a></p><p style="font-size:13px;color:#52525b">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>`;

const templates = {
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

module.exports = { send, templates, sent, layout, button, hasSendmail: !!SENDMAIL };
