// Cleans guide HTML before it is saved, so nothing written in the staff area (or pasted in from a draft)
// can run scripts on the public site. Allowlist approach: every tag is rebuilt from scratch, keeping only
// the tags and attributes below. Anything else is dropped; text is escaped.
// Images may only point at our own files (/uploads/, /img/, /r/): pictures copied from other sites are
// removed, because they are someone else's copyright and count against us with AdSense.

const KEEP = new Set(['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'img', 'hr', 'code', 'pre', 'span', 'div']);
const VOID = new Set(['br', 'img', 'hr']);
// Removed together with everything inside them
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form',
  'textarea', 'select', 'button', 'title', 'head', 'frame', 'frameset', 'applet', 'video', 'audio', 'canvas', 'link', 'meta', 'base']);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
// Text keeps entities that are already valid, escapes everything else
const escText = (s) => String(s).replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);?/g, (_m, d) => String.fromCodePoint(Number(d) || 32))
    .replace(/&(colon|tab|newline|quot|apos|lt|gt|amp);/gi, (_m, n) => ({ colon: ':', tab: '\t', newline: '\n', quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[n.toLowerCase()]);
}

// Links: web, email, phone, same-site paths and in-page anchors only
function safeHref(v) {
  const raw = decode(v).replace(/[\u0000- \u007f-\u009f]/g, '');
  const low = raw.toLowerCase();
  if (/^https?:\/\//.test(low) || /^mailto:/.test(low) || /^tel:/.test(low) || /^#[\w-]*$/.test(raw)) return raw;
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
  return null;
}
// Images: our own files only
const safeSrc = (v) => { const s = decode(v).trim(); return /^\/(uploads|img|r)\/[A-Za-z0-9/._-]+$/.test(s) && !s.includes('..') ? s : null; };

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrs(tag, rest) {
  const a = {};
  for (const m of rest.matchAll(ATTR_RE)) { const k = m[1].toLowerCase(); if (!(k in a)) a[k] = m[2] ?? m[3] ?? m[4] ?? ''; }
  const out = [];
  if (tag === 'a') {
    const href = a.href !== undefined ? safeHref(a.href) : null;
    if (!href) return null; // a link we cannot trust becomes plain text
    out.push(`href="${escAttr(href)}"`);
    if (/^https?:\/\//i.test(href)) out.push('rel="noopener nofollow"');
  } else if (tag === 'img') {
    const src = a.src !== undefined ? safeSrc(a.src) : null;
    if (!src) return null;
    out.push(`src="${escAttr(src)}"`, `alt="${escAttr(decode(a.alt || '').slice(0, 200))}"`, 'loading="lazy"');
  } else if (tag === 'th' || tag === 'td') {
    for (const k of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(a[k] || '')) out.push(`${k}="${a[k]}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

function sanitize(html) {
  const s = String(html || '').replace(/\u0000/g, '');
  const out = [];
  const stack = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0; let m;
  while ((m = re.exec(s))) {
    out.push(escText(s.slice(last, m.index)));
    last = re.lastIndex;
    if (!m[2]) continue; // comment, doctype, CDATA, processing instruction: dropped
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (DROP.has(tag)) {
      if (!closing && !VOID.has(tag) && !/\/\s*$/.test(m[3])) { // skip to the matching end tag
        const end = new RegExp(`</${tag}\\s*>`, 'i'); end.lastIndex = 0;
        const rest = s.slice(last); const e = rest.search(end);
        if (e === -1) { last = s.length; re.lastIndex = s.length; break; }
        last += e + rest.slice(e).match(end)[0].length; re.lastIndex = last;
      }
      continue;
    }
    if (!KEEP.has(tag)) continue; // unknown tag: drop the tag, keep its text
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i === -1) continue; // never opened (or dropped): ignore
      while (stack.length > i) out.push(`</${stack.pop()}>`);
      continue;
    }
    const at = attrs(tag, m[3] || '');
    if (at === null) continue; // unsafe link or outside image: dropped, its text stays
    if (VOID.has(tag)) { out.push(`<${tag}${at}>`); continue; }
    out.push(`<${tag}${at}>`); stack.push(tag);
  }
  out.push(escText(s.slice(last)));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}

// Plain text (for excerpts and search descriptions)
const toText = (html) => decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

module.exports = { sanitize, toText, safeHref };
