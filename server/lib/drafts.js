// Turns a pasted draft (from the morning research task) into a guide draft. The format is plain text:
//
//   Title: What this week's petrol price means for car buyers
//   Category: Market update
//   Excerpt: One or two sentences for the guides page and Google.
//   Own input: what only Korrect Cars can add (optional; staff must fill it before publishing)
//   Sources:
//   - NNPC price announcement | https://example.com/page
//   - https://example.com/other-page
//   ---
//   The article, written with ## headings, ### subheadings, - bullets, 1. numbered lines,
//   **bold**, *italic* and [link text](https://address). Blank lines separate paragraphs.
//
// Pictures are never imported. The result still goes through lib/sanitize.js before it is saved.
const { CATEGORIES } = require('./covers');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function inline(text) {
  return esc(text)
    .replace(/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]{1,500}|\/[^\s)]{0,300})\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]{1,300})\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]{0,300})\*/g, '$1<em>$2</em>');
}

// The small Markdown subset above, to HTML
function toHtml(md) {
  const out = []; let para = []; let list = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.+)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^[-*•]\s+(.+)$/)) || (m = line.match(/^\d{1,2}[.)]\s+(.+)$/))) {
      const tag = /^\d/.test(line) ? 'ol' : 'ul';
      flushPara(); if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^>\s?(.+)$/))) { flushPara(); flushList(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('\n');
}

function parse(text) {
  const src = String(text || '').replace(/\r/g, '').replace(/^```[a-z]*\n|\n```\s*$/g, '');
  const cut = src.search(/^-{3,}\s*$/m);
  const head = cut === -1 ? src : src.slice(0, cut);
  // Drafts are plain text: any HTML pasted in (scripts, pictures from other sites) is removed, not shown
  const body = (cut === -1 ? '' : src.slice(cut).replace(/^-{3,}\s*\n?/, '')).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '');
  const field = (name) => { const m = head.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'im')); return m ? m[1].trim() : ''; };
  const sources = [];
  const sm = head.match(/^\s*Sources\s*:\s*\n([\s\S]*)$/im);
  if (sm) {
    for (const l of sm[1].split('\n')) {
      const m = l.trim().match(/^[-*•]\s*(?:(.+?)\s*[|–—-]\s*)?(https?:\/\/\S+)\s*$/);
      if (m) sources.push({ title: (m[1] || '').trim().slice(0, 200), url: m[2].slice(0, 500) });
      else if (l.trim() && !/^[-*•]/.test(l.trim())) break;
    }
  }
  const cat = field('Category');
  const errors = [];
  const title = field('Title');
  if (title.length < 8) errors.push('The draft needs a "Title:" line.');
  if (!body.trim()) errors.push('The article must come after a line with three dashes (---).');
  return {
    errors,
    title: title.slice(0, 160),
    category: CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase()) || 'Buying guide',
    excerpt: field('Excerpt').slice(0, 300),
    ownInput: field('Own input').slice(0, 2000),
    sources: sources.slice(0, 20),
    content: toHtml(body)
  };
}

module.exports = { parse, toHtml };
