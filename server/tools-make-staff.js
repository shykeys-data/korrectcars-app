// Gives an existing account a staff role, or takes it away. Run on the server only:
//   node server/tools-make-staff.js <email> <admin|sales|editor|user> [htaccess]
// The person must first register on the site and confirm their email. They then set up two-step login
// the first time they open the staff address (the staff area refuses to work without it).
// "user" turns a staff account back into a normal customer account and signs it out everywhere.
// Nobody can become staff from the website itself.
const fs = require('fs');
const [emailIn, role, ht] = process.argv.slice(2);
if (ht && fs.existsSync(ht)) for (const m of fs.readFileSync(ht, 'utf8').matchAll(/^\s*SetEnv\s+(\w+)\s+(.*)$/gm)) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
const ROLES = ['admin', 'sales', 'editor', 'user'];
if (!emailIn || !ROLES.includes(role)) {
  console.error(`Usage: node server/tools-make-staff.js <email> <${ROLES.join('|')}> [htaccess]`);
  process.exit(1);
}
const db = require('./db');

(async () => {
  await db.init();
  const email = emailIn.trim().toLowerCase();
  const u = await db.one('SELECT id, name, role, email_verified, disabled FROM users WHERE email = ?', [email]);
  if (!u) throw new Error('No account with that email. Ask them to register on the site first.');
  if (!u.email_verified) throw new Error('That account has not confirmed its email yet.');
  if (u.disabled) throw new Error('That account is disabled. Enable it in the staff area first.');
  // Raising token_version signs the account out everywhere, so the new role applies at the next sign-in
  await db.q('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?', [role, u.id]);
  await db.q('INSERT INTO audit (user_id, user_name, action, target, ip) VALUES (?, ?, ?, ?, ?)', [null, 'Server command', `Role changed from ${u.role} to ${role}`, `user ${u.id}`, 'server']).catch(() => {});
  console.log(`${u.name}: ${u.role} -> ${role}. They need to sign in again.`);
  process.exit(0);
})().catch((e) => { console.error('Not changed:', e.message); process.exit(1); });
