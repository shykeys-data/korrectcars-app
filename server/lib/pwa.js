// Installable site (PWA): the web app manifest, the service worker file and the offline page.
// The service worker itself is client/sw.js (copied into dist with the build version); see it for what is cached.
const path = require('path');
const fs = require('fs');
const config = require('../config');

const isStaging = () => /staging/.test(config.siteUrl);

function manifest() {
  const icon = (src, size, purpose) => ({ src: `/img/icons/${src}`, sizes: `${size}x${size}`, type: 'image/png', purpose });
  return {
    id: '/',
    name: isStaging() ? 'Korrect Cars (staging)' : 'Korrect Cars',
    short_name: 'Korrect Cars',
    description: 'Inspected, VIN-verified tokunbo cars in Lagos. Buy outright or pay small small.',
    lang: 'en-NG',
    start_url: '/?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#16181D',
    categories: ['shopping', 'lifestyle'],
    // Lets Chrome tell the site "this phone already has the app" (navigator.getInstalledRelatedApps), so we stop offering it
    related_applications: [{ platform: 'webapp', url: config.siteUrl.replace(/\/$/, '') + '/manifest.webmanifest' }],
    prefer_related_applications: false,
    icons: [icon('icon-192.png', 192, 'any'), icon('icon-512.png', 512, 'any'), icon('maskable-192.png', 192, 'maskable'), icon('maskable-512.png', 512, 'maskable')],
    shortcuts: [
      { name: 'Cars for sale', url: '/cars?source=app', icons: [icon('icon-192.png', 192)] },
      { name: 'Saved cars', url: '/account?tab=saved&source=app', icons: [icon('icon-192.png', 192)] },
      { name: 'VIN check', url: '/vin-check?source=app', icons: [icon('icon-192.png', 192)] }
    ]
  };
}

function routes(app) {
  app.get('/manifest.webmanifest', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=86400').type('application/manifest+json').send(JSON.stringify(manifest()));
  });
  // The worker must always be fresh, or a fix to it would wait for the browser's cache to expire
  app.get('/sw.js', (_req, res, next) => {
    const file = path.join(config.distDir, 'sw.js');
    if (!fs.existsSync(file)) return next();
    res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).type('application/javascript').sendFile(file);
  });
  app.get('/offline.html', (_req, res, next) => {
    const file = path.join(config.distDir, 'offline.html');
    if (!fs.existsSync(file)) return next();
    res.set('Cache-Control', 'no-cache').type('html').sendFile(file);
  });
}

module.exports = { routes, manifest };
