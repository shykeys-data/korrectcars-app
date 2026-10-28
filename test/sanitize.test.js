// Run all tests with: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const { sanitize, toText } = require('../server/lib/sanitize');

const bad = [
  '<script>alert(1)</script>', '<SCRIPT SRC=//x.y/z.js></SCRIPT>', '<img src=x onerror=alert(1)>', '<img src="/uploads/a.jpg" onerror="alert(1)">',
  '<a href="javascript:alert(1)">x</a>', '<a href="JaVaScRiPt:alert(1)">x</a>', '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href="java&#115;cript:alert(1)">x</a>', '<a href="&#106;avascript:alert(1)">x</a>', '<a href=" javascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>', '<a href="vbscript:x">x</a>', '<a href="//evil.example">x</a>',
  '<svg onload=alert(1)>', '<svg><script>alert(1)</script></svg>', '<iframe src="https://evil.example"></iframe>', '<style>*{x:expression(alert(1))}</style>',
  '<p style="background:url(javascript:alert(1))">x</p>', '<div onclick="alert(1)">x</div>', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<<script>alert(1)//<</script>', '<img src="https://other-site.example/photo.jpg">', '<a href="/x" onmouseover="alert(1)">x</a>',
  '<!--<script>alert(1)</script>-->', '<object data="x"></object>', '<form action="https://evil"><input></form>', '<img src="/uploads/../../etc/passwd">',
  '<p title="x" onfocus=alert(1) autofocus>x</p>', '<scr<script>ipt>alert(1)</script>', '<a href="&#0000106&#0000097vascript:alert(1)">x</a>'
];
test('removes every script vector', () => {
  for (const b of bad) {
    const out = sanitize(b);
    assert.ok(!/<script|javascript:|onerror|onload|onclick|onmouseover|onfocus|<iframe|<svg|<style|<object|<form|style=|vbscript|data:text|xlink|other-site|\.\.\//i.test(out), `${b}  =>  ${out}`);
  }
});
test('keeps normal article formatting', () => {
  const html = '<h2>Title</h2><p>Hello <strong>you</strong> &amp; <em>me</em></p><ul><li>One</li></ul><a href="https://example.com/a?b=1&amp;c=2">src</a><a href="/cars">cars</a><img src="/uploads/blog/x.webp" alt="A car">';
  const out = sanitize(html);
  assert.match(out, /<h2>Title<\/h2>/);
  assert.match(out, /<strong>you<\/strong> &amp; <em>me<\/em>/);
  assert.match(out, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" rel="noopener nofollow">src<\/a>/);
  assert.match(out, /<a href="\/cars">cars<\/a>/);
  assert.match(out, /<img src="\/uploads\/blog\/x.webp" alt="A car" loading="lazy">/);
});
test('closes unclosed tags and escapes stray brackets', () => {
  assert.strictEqual(sanitize('<p>a < b'), '<p>a &lt; b</p>');
  assert.strictEqual(sanitize('<p><strong>x</p>'), '<p><strong>x</strong></p>');
});
test('text for excerpts', () => { assert.strictEqual(toText('<p>Hi <b>there</b> &amp; you</p>'), 'Hi there & you'); });

const drafts = require('../server/lib/drafts');
test('draft import: headings, lists, links, sources; HTML and pictures removed', () => {
  const d = drafts.parse('Title: A good test title here\nCategory: ev\nExcerpt: Short summary\nSources:\n- Name | https://example.com/a\n- https://example.org/b\n---\n## Heading\nText with **bold** and [a link](https://example.com).\n\n- one\n- two\n\n<script>alert(1)</script><img src="https://x.example/p.jpg">');
  assert.deepStrictEqual(d.errors, []);
  assert.strictEqual(d.category, 'EV');
  assert.strictEqual(d.sources.length, 2);
  assert.match(d.content, /<h2>Heading<\/h2>/);
  assert.match(d.content, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.ok(!/script|alert|x\.example|&lt;/.test(d.content), d.content);
});
test('draft import: missing title or body is refused', () => {
  assert.ok(drafts.parse('Category: News\n---\nbody').errors.length);
  assert.ok(drafts.parse('Title: A good test title here').errors.length);
});
