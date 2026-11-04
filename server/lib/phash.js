// Photo fingerprints (a 64-bit "difference hash"): two photos of the same car give nearly the same 16 hex
// characters even after resizing or recompressing. Stored per car photo so staff can spot the same photos
// listed by two sellers (flags come in milestone 4). Needs sharp; without it no fingerprint is made.
const path = require('path');
const os = require('os');

let sharp = null;
for (const p of [process.env.SHARP_PATH, 'sharp', path.join(os.homedir(), 'tools', 'node_modules', 'sharp')].filter(Boolean)) {
  try { sharp = require(p); break; } catch (_e) { /* try next */ }
}

async function dhash(input) {
  if (!sharp) return null;
  try {
    const px = await sharp(input, { failOn: 'none' }).rotate().grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
    return BigInt('0b' + bits).toString(16).padStart(16, '0');
  } catch (_e) { return null; }
}
// How many of the 64 bits differ (0 = same picture, under ~10 = very likely the same photo)
function distance(a, b) {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b); let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

module.exports = { dhash, distance, available: () => !!sharp };
