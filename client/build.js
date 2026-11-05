// Builds the React client into ../dist (bundled and minified with esbuild).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// The shared server limits how many threads one account may start; esbuild needs only a few
if (!process.env.GOMAXPROCS) process.env.GOMAXPROCS = '2';
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');

const root = __dirname;
const out = process.env.OUT_DIR || path.join(root, '..', 'dist');
// Built into a side folder first and moved into place only when the build succeeded, so a failed build
// never leaves the site without its pages. Images already in dist/img (hero, favicon, etc.) are kept.
const assets = path.join(out, 'assets');
const next = path.join(out, 'assets-next');
fs.rmSync(next, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
function moveInto(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name); const b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); moveInto(a, b); } else fs.renameSync(a, b);
  }
}

esbuild.build({
  entryPoints: { app: path.join(root, 'src', 'main.jsx') },
  bundle: true, minify: true, format: 'esm', target: 'es2020',
  // The staff area is a separate file that only staff download
  splitting: true, chunkNames: 'chunks/[name]-[hash]',
  outdir: next, jsx: 'automatic', loader: { '.jsx': 'jsx' }, external: ['/fonts/*', '/img/*'], // served as they are from client/public
  define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none', logLevel: 'info',
  nodePaths: [path.join(root, 'node_modules')], metafile: true
}).then((result) => {
  // metafile paths point at the side folder; the same names end up in dist/assets
  for (const k of Object.keys(result.metafile.outputs)) { const o = result.metafile.outputs[k]; delete result.metafile.outputs[k]; result.metafile.outputs[k.split('assets-next').join('assets')] = o; for (const i of o.imports || []) i.path = i.path.split('assets-next').join('assets'); }
  moveInto(next, assets);
  fs.rmSync(next, { recursive: true, force: true });
  const js = fs.readFileSync(path.join(out, 'assets', 'app.js'));
  const v = crypto.createHash('sha1').update(js).update(fs.readFileSync(path.join(out, 'assets', 'app.css'))).digest('hex').slice(0, 10);
  // Start downloading the shared code at the same time as app.js (no waiting chain)
  const appOut = Object.entries(result.metafile.outputs).find(([k, o]) => o.entryPoint && /app\.js$/.test(k));
  const preload = ((appOut && appOut[1].imports) || []).filter((i) => i.kind === 'import-statement')
    .map((i) => `<link rel="modulepreload" href="/assets/${path.relative(path.join(out, 'assets'), path.resolve(i.path)).split(path.sep).join('/')}">`).join('\n');
  fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/__BUILD__/g, v).replace('<!--PRELOAD-->', preload));
  fs.cpSync(path.join(root, 'public'), out, { recursive: true });
  // Our own copies of the two web fonts (Latin), from the @fontsource packages (open font licence)
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  for (const [pkg, weights] of [['barlow-condensed', [600, 700, 800]], ['source-sans-3', [400, 600, 700]]]) {
    for (const w of weights) fs.copyFileSync(path.join(root, 'node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${w}-normal.woff2`), path.join(out, 'fonts', `${pkg}-latin-${w}-normal.woff2`));
  }
  console.log('Built dist with version', v);
}).catch((e) => { console.error(e); process.exit(1); });
