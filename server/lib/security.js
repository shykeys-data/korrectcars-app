const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { one, q } = require('../db');

const COOKIE = 'kc_session';

const STAFF_ROLES = ['admin', 'sales', 'editor', 'moderator'];
const isStaff = (u) => !!u && STAFF_ROLES.includes(u.role);

// Staff sessions are shorter (12 hours) and carry mfa: true only after the two-step code was entered
function issueSession(res, user, { mfa = false } = {}) {
  const staff = isStaff(user);
  const ttl = staff ? 12 * 3600 : 7 * 24 * 3600;
  const token = jwt.sign({ sub: user.id, v: user.token_version, mfa: mfa ? 1 : 0 }, config.jwtSecret, { expiresIn: ttl });
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: config.isProd, sameSite: 'lax', maxAge: ttl * 1000, path: '/'
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

async function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next();
  try {
    const p = jwt.verify(token, config.jwtSecret);
    const user = await one('SELECT id, name, email, phone, role, verified, token_version, disabled, totp_enabled FROM users WHERE id = ?', [p.sub]);
    if (user && !user.disabled && user.token_version === p.v) { req.user = user; req.mfa = p.mfa === 1; }
  } catch (_e) { /* invalid or expired token: treat as signed out */ }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Please sign in.', signIn: true });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'Please sign in.', signIn: true });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed.' });
    next();
  };
}

// Staff areas: right role AND two-step login set up AND the code entered for this session.
// 'moderator' is the old name for the sales role.
function requireStaff(...roles) {
  const allowed = roles.flatMap((r) => (r === 'sales' ? ['sales', 'moderator'] : [r]));
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'Please sign in.', signIn: true });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Your role does not have access to this.' });
    if (!req.user.totp_enabled) return res.status(403).json({ error: 'Set up two-step login to use the staff area.', needs2fa: 'setup' });
    if (!req.mfa) return res.status(403).json({ error: 'Enter your two-step login code to continue.', needs2fa: 'verify' });
    next();
  };
}

// CSRF defence: state-changing API calls must carry our custom header (a cross-site
// form cannot set it) and, when present, an Origin that matches this site.
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'korrect') return res.status(403).json({ error: 'Bad request origin.' });
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Bad request origin.' }); } catch (_e) { return res.status(403).json({ error: 'Bad request origin.' }); }
  }
  next();
}

// All SQL uses placeholders (no string building), so input is never executed as SQL.
function scrub(obj) { // prototype-pollution style keys are dropped
  if (!obj || typeof obj !== 'object') return obj;
  for (const k of Object.keys(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') delete obj[k];
    else if (typeof obj[k] === 'object') scrub(obj[k]);
  }
  return obj;
}
function sanitizeInput(req, _res, next) { scrub(req.body); scrub(req.params); next(); }

const limiter = (windowMin, max, message) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: message || 'Too many requests. Please wait a few minutes and try again.' }
});

async function audit(req, action, target) {
  try {
    await q('INSERT INTO audit (user_id, user_name, action, target, ip) VALUES (?, ?, ?, ?, ?)', [req.user ? req.user.id : null, req.user ? req.user.name : 'System', String(action).slice(0, 160), String(target || '').slice(0, 300), req.ip]);
  } catch (_e) { /* never block the request on audit failure */ }
}

// Hide phone numbers, emails and links in swap chat until an offer is accepted
function maskContacts(text) {
  let masked = false;
  const out = String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { masked = true; return '[email hidden]'; })
    .replace(/(\+?\d[\d\s-]{6,}\d)/g, () => { masked = true; return '[number hidden]'; })
    .replace(/https?:\/\/\S+|www\.\S+/gi, () => { masked = true; return '[link hidden]'; });
  return { text: out, masked };
}

module.exports = { STAFF_ROLES, isStaff, requireStaff, issueSession, clearSession, loadUser, requireAuth, requireRole, csrfGuard, sanitizeInput, limiter, audit, maskContacts, COOKIE };
