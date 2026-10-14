const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const PUBLIC_DIR = path.join(config.uploadsDir, 'public');
const PRIVATE_DIR = path.join(config.uploadsDir, 'private');
for (const d of [PUBLIC_DIR, PRIVATE_DIR, path.join(PUBLIC_DIR, 'cars'), path.join(PUBLIC_DIR, 'swap'), path.join(PUBLIC_DIR, 'blog')]) fs.mkdirSync(d, { recursive: true });

// Files are held in memory, checked by their real bytes (not the name), then written
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 12, fields: 40 }
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

function save(file, { folder, privateFile = false, allowPdf = false }) {
  const kind = sniff(file.buffer);
  if (!kind || (kind === 'pdf' && !allowPdf)) {
    const err = new Error(allowPdf ? 'Only JPG, PNG, WEBP or PDF files are allowed.' : 'Only JPG, PNG or WEBP images are allowed.');
    err.status = 400; throw err;
  }
  const name = crypto.randomBytes(16).toString('hex') + '.' + kind;
  const buf = kind === 'jpg' ? stripJpegMeta(file.buffer) : file.buffer;
  if (privateFile) {
    fs.writeFileSync(path.join(PRIVATE_DIR, name), buf, { mode: 0o600 });
    return name;
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, folder, name), buf);
  return `/uploads/${folder}/${name}`;
}

module.exports = { memory, save, PUBLIC_DIR, PRIVATE_DIR };
