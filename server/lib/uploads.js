// Receives uploaded photos and documents (multer, kept in memory), checks the real file type from its content,
// re-encodes photos, and saves them: public photos to uploads/public, swap papers and IDs to uploads/private.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const PUBLIC_DIR = path.join(config.uploadsDir, 'public');
const PRIVATE_DIR = config.privateDir;
fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
// One-off move: private files saved before Oct 2026 lived in uploads/private inside the app folder
(function moveOldPrivateFiles() {
  const old = path.join(config.uploadsDir, 'private');
  let names = []; try { names = fs.readdirSync(old); } catch (_e) { return; }
  let moved = 0;
  for (const n of names) {
    const from = path.join(old, n); const to = path.join(PRIVATE_DIR, n);
    try { if (fs.statSync(from).isFile() && !fs.existsSync(to)) { fs.copyFileSync(from, to); fs.chmodSync(to, 0o600); fs.unlinkSync(from); moved++; } } catch (e) { console.warn('Private file not moved:', n, e.message); }
  }
  if (moved) console.log(`Moved ${moved} private file(s) out of the app folder`);
})();
for (const d of [PUBLIC_DIR, path.join(PUBLIC_DIR, 'cars'), path.join(PUBLIC_DIR, 'swap'), path.join(PUBLIC_DIR, 'blog')]) fs.mkdirSync(d, { recursive: true });

// Files are held in memory, checked by their real bytes (not the name), then written
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 25, fields: 60 } // up to 20 car photos per save; swap: 10 photos + 3 papers
});

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'pdf';
  return null;
}

// Strip JPEG metadata (EXIF can include GPS location of the owner's home)
function stripJpegMeta(buf) {
  try {
    const out = [buf.slice(0, 2)];
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return buf;
      const marker = buf[i + 1];
      if (marker === 0xda) { out.push(buf.slice(i)); break; }
      const len = buf.readUInt16BE(i + 2);
      const isApp = marker >= 0xe1 && marker <= 0xef; // keep APP0 (JFIF), drop APP1..APP15 (EXIF/XMP)
      if (!isApp) out.push(buf.slice(i, i + 2 + len));
      i += 2 + len;
    }
    return Buffer.concat(out);
  } catch (_e) { return buf; }
}

// name: optional readable start of the file name, e.g. '2016-lexus-es-350-1' (good for Google Images)
function save(file, { folder, privateFile = false, allowPdf = false, name: base }) {
  const kind = sniff(file.buffer);
  if (!kind || (kind === 'pdf' && !allowPdf)) {
    const err = new Error(allowPdf ? 'Only JPG, PNG, WEBP or PDF files are allowed.' : 'Only JPG, PNG or WEBP images are allowed.');
    err.status = 400; throw err;
  }
  const clean = String(base || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  const name = (clean && !privateFile ? `${clean}-${crypto.randomBytes(3).toString('hex')}` : crypto.randomBytes(16).toString('hex')) + '.' + kind;
  const buf = kind === 'jpg' ? stripJpegMeta(file.buffer) : file.buffer;
  if (privateFile) {
    fs.writeFileSync(path.join(PRIVATE_DIR, name), buf, { mode: 0o600 });
    return name;
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, folder, name), buf);
  return `/uploads/${folder}/${name}`;
}

// Removes files saved for a car whose save was then refused (e.g. the VIN was taken a moment earlier)
function discard(names = []) {
  for (const n of names.filter(Boolean)) {
    const file = n.startsWith('/uploads/') ? path.join(PUBLIC_DIR, n.slice('/uploads/'.length)) : path.join(PRIVATE_DIR, path.basename(n));
    if (file.startsWith(PUBLIC_DIR + path.sep) || file.startsWith(PRIVATE_DIR + path.sep)) fs.rm(file, { force: true }, () => {});
  }
}

module.exports = { memory, save, discard, PUBLIC_DIR, PRIVATE_DIR };
