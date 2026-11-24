'use strict';
/* VOIE LACTÉE — Service Worker : cache application, aperçus, manifest, hors ligne */
const APP = 'vl-app-v1';
const ASSETS = [
  '/index.html', '/scripts/vl-core.js', '/scripts/vl-gl.js', '/scripts/vl-load.js',
  '/scripts/vl-worker.js', '/scripts/vl-audio.js', '/scripts/vl-ui.js', '/scripts/vl-export.js',
  '/scripts/vl-main.js', '/artworks/manifest.json', '/perf-budget.json'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(ASSETS).catch(() => {}))) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP).map(k => caches.delete(k))))) });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) { return }
  const p = url.pathname;
  if (p.startsWith('/artworks/previews/') || p === '/artworks/manifest.json') {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request).then(resp => { const c = resp.clone(); caches.open(APP).then(ca => ca.put(e.request, c)); return resp }).catch(() => caches.match('./index.html'))));
    return
  }
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
