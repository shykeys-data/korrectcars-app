// Branded guide covers, made on our own server so every cover is original (AdSense counts copied photos
// as unoriginal content). One SVG template matches the existing guide covers: dark charcoal, a red diagonal
// on the right edge, a red category pill, a bold white headline with a red bar under it, a white line icon
// and the Korrect Cars footer. It is rendered with sharp in three sizes:
//   site  1200x630  WebP (guide page, link previews)   square 1080x1080 PNG (Instagram)   story 1080x1920 PNG (TikTok, Reels)
// "Replace image" puts one of our own photos behind the same frame (darkened so the headline stays readable).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// Use the brand font shipped in server/assets/fonts (Barlow Condensed, SIL Open Font License) so covers look the
// same on every server. Must be set before the first text is drawn; the system fonts stay available as fallbacks.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FC_FILE = path.join(require('os').tmpdir(), 'kc-fonts.conf');
try {
  fs.writeFileSync(FC_FILE, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${FONT_DIR}</dir><cachedir>${path.join(require('os').tmpdir(), 'kc-fontcache')}</cachedir><include ignore_missing="yes">/etc/fonts/fonts.conf</include></fontconfig>`);
  if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = FC_FILE;
} catch (e) { console.warn('[covers] font setup skipped:', e.message); }

let sharp = null;
for (const p of [process.env.SHARP_PATH, 'sharp', path.join(require('os').homedir(), 'tools', 'node_modules', 'sharp')].filter(Boolean)) {
  try { sharp = require(p); break; } catch (_e) { /* try next */ }
}

const DIR = path.join(config.uploadsDir, 'public', 'blog', 'covers');
const CATEGORIES = ['Buying guide', 'Car review', 'Market update', 'News', 'EV', 'Pay Small Small'];
const SIZES = {
  site: { w: 1200, h: 630, pad: 72, font: 74, top: 196, maxW: 800, pill: 26, foot: 22 },
  square: { w: 1080, h: 1080, pad: 80, font: 96, top: 300, maxW: 780, pill: 30, foot: 26 },
  story: { w: 1080, h: 1920, pad: 90, font: 120, top: 640, maxW: 720, pill: 34, foot: 30 }
};
const FONT = "'Barlow Condensed','DejaVu Sans Condensed','Liberation Sans Narrow','Arial Narrow',sans-serif";

// White line icons (24x24 grid), one per category
const ICONS = {
  'Buying guide': '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>', // shield
  'Car review': '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><path d="M6 16h1M17 16h1M12 8v1"/>', // speedometer
  'Market update': '<path d="M7 20V4l10 16V4"/><path d="M4 10h16M4 14h16"/>', // naira
  'Pay Small Small': '<path d="M7 20V4l10 16V4"/><path d="M4 10h16M4 14h16"/>',
  News: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13M6 8h7"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>', // fuel pump
  EV: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>' // plug
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Splits the headline into at most 3 lines that fit; shrinks the font if it would need more
function wrap(text, size, maxW) {
  const words = String(text || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  for (let font = size; font >= Math.round(size * 0.6); font -= 4) {
    const perLine = Math.floor(maxW / (font * 0.5));
    const lines = []; let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (next.length <= perLine) line = next; else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length <= 3) return { font, lines };
  }
  const font = Math.round(size * 0.6); const perLine = Math.floor(maxW / (font * 0.5));
  const all = words.join(' '); const lines = [];
  for (let i = 0; i < 3; i++) lines.push(all.slice(i * perLine, (i + 1) * perLine));
  lines[2] = lines[2].replace(/\s*\S*$/, '') + '…';
  return { font, lines };
}

function svg(kind, { title, category, photo }) {
  const S = SIZES[kind]; const { w, h, pad } = S;
  const cat = CATEGORIES.includes(category) ? category : 'Buying guide';
  const { font, lines } = wrap(title, S.font, S.maxW);
  const lh = Math.round(font * 1.02);
  const pillW = Math.round(cat.length * S.pill * 0.52 + S.pill * 1.4);
  const pillH = Math.round(S.pill * 1.7);
  const textTop = S.top + font * 0.8;
  const barY = S.top + lh * lines.length + font * 0.25;
  const diag = kind === 'site' ? `${w - 210},0 ${w},0 ${w},${h} ${w - 330},${h}` : (kind === 'story' ? `${w - 120},0 ${w},0 ${w},${h} ${w - 250},${h}` : `${w - 170},0 ${w},0 ${w},${h} ${w - 300},${h}`);
  const icon = ICONS[cat] || ICONS['Buying guide'];
  const iconSize = kind === 'site' ? 120 : 150;
  const iconX = w - (kind === 'site' ? 190 : kind === 'story' ? 150 : 175); const iconY = kind === 'story' ? h - 560 : h / 2 - iconSize / 2;
  const ground = photo
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0.9" y2="0"><stop offset="0" stop-color="#16181D" stop-opacity="0.92"/><stop offset="0.7" stop-color="#16181D" stop-opacity="0.7"/><stop offset="1" stop-color="#16181D" stop-opacity="0.45"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`
    : `<rect width="${w}" height="${h}" fill="#1C1E23"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${ground}
<polygon points="${diag}" fill="#DF0106"/>
<rect x="${pad}" y="${pad}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#DF0106"/>
<text x="${pad + pillW / 2}" y="${pad + pillH * 0.68}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${S.pill}" fill="#FFFFFF">${esc(cat.toUpperCase())}</text>
${lines.map((l, i) => `<text x="${pad}" y="${textTop + i * lh}" font-family="${FONT}" font-weight="700" font-size="${font}" fill="#FFFFFF">${esc(l)}</text>`).join('\n')}
<rect x="${pad}" y="${barY}" width="${Math.round(font * 1.4)}" height="${Math.max(6, Math.round(font / 10))}" fill="#DF0106"/>
<g transform="translate(${iconX} ${iconY}) scale(${iconSize / 24})" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
<text x="${pad}" y="${h - pad - S.foot * 1.5}" font-family="${FONT}" font-weight="700" font-size="${S.foot * 1.6}" fill="#FFFFFF">KORRECT <tspan fill="#FF3B41">CARS</tspan></text>
<text x="${pad}" y="${h - pad}" font-family="${FONT}" font-weight="700" font-size="${S.foot * 1.1}" letter-spacing="0.5" fill="#C9CDD4">korrectcars.com · Buy Tokunbo &amp; Foreign-Used Cars in Lagos</text>
</svg>`;
}

// photoFile: absolute path of one of our own uploaded photos (optional). Returns { site, square, story, mode }.
async function make({ slug, title, category, photoFile }) {
  fs.mkdirSync(DIR, { recursive: true });
  const base = `${String(slug || 'guide').replace(/[^a-z0-9-]/g, '').slice(0, 80)}-${crypto.randomBytes(3).toString('hex')}`;
  const out = { mode: photoFile ? 'photo' : 'template' };
  if (!sharp) { // no image tool on this server: keep a vector cover for the site only
    const f = `${base}-1200x630.svg`;
    fs.writeFileSync(path.join(DIR, f), svg('site', { title, category, photo: false }));
    out.site = `/uploads/blog/covers/${f}`;
    return out;
  }
  for (const kind of Object.keys(SIZES)) {
    const { w, h } = SIZES[kind];
    const overlay = Buffer.from(svg(kind, { title, category, photo: !!photoFile }));
    const img = photoFile
      ? sharp(photoFile, { failOn: 'none' }).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).composite([{ input: overlay }])
      : sharp(overlay);
    const ext = kind === 'site' ? 'webp' : 'png';
    const f = `${base}-${w}x${h}.${ext}`;
    await (kind === 'site' ? img.webp({ quality: 82 }) : img.png({ compressionLevel: 9 })).toFile(path.join(DIR, f));
    out[kind] = `/uploads/blog/covers/${f}`;
  }
  return out;
}

module.exports = { make, svg, CATEGORIES, available: () => !!sharp };
