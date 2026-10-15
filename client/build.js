// Builds the React client into ../dist (bundled and minified with esbuild).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');

const root = __dirname;
const out = process.env.OUT_DIR || path.join(root, '..', 'dist');
// Only the built assets are replaced; images already in dist/img (hero, favicon, etc.) are kept
fs.rmSync(path.join(out, 'assets', 'app.js'), { force: true });
fs.rmSync(path.join(out, 'assets', 'app.css'), { force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

esbuild.build({
  entryPoints: { app: path.join(root, 'src', 'main.jsx') },
  bundle: true, minify: true, format: 'esm', target: 'es2020',
  outdir: path.join(out, 'assets'), jsx: 'automatic', loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none', logLevel: 'info',
  nodePaths: [path.join(root, 'node_modules')]
}).then(() => {
  const js = fs.readFileSync(path.join(out, 'assets', 'app.js'));
  const v = crypto.createHash('sha1').update(js).update(fs.readFileSync(path.join(out, 'assets', 'app.css'))).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/__BUILD__/g, v));
  fs.cpSync(path.join(root, 'public'), out, { recursive: true });
  console.log('Built dist with version', v);
}).catch((e) => { console.error(e); process.exit(1); });
