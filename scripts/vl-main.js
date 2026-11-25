'use strict';
/* VOIE LACTÉE — point d'entrée */
import { App } from './vl-app.js';
import { UI } from './vl-ui.js';
import { ExportKit } from './vl-export.js';
import { buildStations, ordered, createWork } from './vl-core.js';

const $ = id => document.getElementById(id);
const $text = (id, v) => { const e = $(id); if (e) e.textContent = v };
const cv = $('gl'), hud = $('hud');
const app = new App(cv, hud);
window.app = app;
const ui = new UI(app, (action, ...args) => {
  if (action === 'mode') app.setMode(args[0]);
  else if (action === 'layout') app.cycleLayout();
  else if (action === 'panel') app.togglePanel(args[0]);
  else if (action === 'quality') app.toggleQuality();
  else if (action === 'rot') app.rotateActive(args[0]);
  else if (action === 'spin') { app.spin = !app.spin; const bs = $('btnSpin'); if (bs) { bs.setAttribute('aria-pressed', app.spin ? 'true' : 'false'); bs.textContent = 'Auto ↻ : ' + (app.spin ? 'on' : 'off') } }
  else if (action === 'audio') { app.audio.toggle() }
  else if (action === 'del') { const w = args[0]; const i = app.works.indexOf(w); if (w.objectUrl) URL.revokeObjectURL(w.objectUrl); if (w.hiBuf) app.gl.gl?.deleteBuffer(w.hiBuf); if (w.loBuf) app.gl.gl?.deleteBuffer(w.loBuf); app.works.splice(i, 1); if (app.selected === w) app.selected = null; app.stations = buildStations(app.works, app.layout); app.gl.stations = app.stations; ui.renderUI() }
  else if (action === 'order') { const [w, dir] = args; const i = app.works.indexOf(w), j = Math.max(0, Math.min(app.works.length - 1, i + (dir === 'up' ? -1 : 1))); app.works.splice(i, 1); app.works.splice(j, 0, w); app.stations = buildStations(app.works, app.layout); app.gl.stations = app.stations; ui.renderUI() }
  else if (action === 'start') { enterGallery() }
  else if (action === 'link') { importLink() }
  else if (action === 'png') exportKit.png()
  else if (action === 'save') exportKit.save()
  else if (action === 'html') exportKit.html()
});

const exportKit = new ExportKit(app, ui, app.load);
ui.setAppRefs($('fps'), $('pcount'), $('chap'));

app.onRedraw = (kind, data) => {
  if (kind === 'frame') {
    ui.drawMarkers(app.curVP(), app.cam);
    const w = app.activeWork();
    ui.updateNarrative(w, w ? w.focus : 0);
    if (ui.fpsEl) ui.fpsEl.textContent = Math.round(app.fps);
    if (ui.pcountEl) ui.pcountEl.textContent = Math.round(data.drawn).toLocaleString('fr-FR');
    ui.drawHud({ fps: app.fps, p95: app.p95, tier: app.tierResolved, visible: data.visible, drawn: data.drawn, chapter: app.chapter });
  } else if (kind === 'chapter') { ui.renderChapters(); ui.actTitle(ordered(app.works)[data]) }
  else if (kind === 'panel') ui.togglePanel(data)
  else if (kind === 'tier') { $text('btnQuality', 'Qualité : ' + { T0: 'essentiel', T1: 'léger', T2: 'équilibré', T3: 'haute' }[data] + ' · ' + data); localStorage.setItem('vl-tier', data) }
  else if (kind === 'mode') { $text('btnMode', data === 'free' ? 'Visite guidée' : 'Mode libre'); const bm = $('btnMode'); if (bm) bm.setAttribute('aria-pressed', data === 'free' ? 'true' : 'false') }
  else if (kind === 'select') { ui.renderEditor(); ui.renderWorksList() }
  else if (kind === 'fly') { ui.toast('Vol vers ' + data.title) }
  else if (kind === 'resize') { ui.drawMap() }
};

function enterGallery() { const wl = $('welcome'); if (wl) wl.style.display = 'none'; document.body.classList.remove('welcome'); app.booed = true; app.stations = buildStations(app.works, app.layout); app.gl.stations = app.stations; ui.renderUI(); ui.toast('Visite guidée · défilez pour avancer') }

async function boot() {
  try {
    if (window.__VL_EMBED__) {
      const e = window.__VL_EMBED__;
      app.works = (e.works || []).map(w => createWork(w, null, null));
      app.load.setWorks(app.works);
      app.stations = buildStations(app.works, e.layout || 'free');
      app.gl.stations = app.stations;
      app.layout = e.layout || 'free';
      app.mode = e.mode || 'tour';
      app.chapter = Math.max(0, Math.min(app.works.length - 1, e.chapter || 0));
      document.body.classList.remove('free');
      $text('btnLayout', 'Disposition : ' + { emotion: 'émotions', free: 'libre', chrono: 'chronologique', artist: 'par artiste', movement: 'par mouvement' }[app.layout] || 'libre');
      await app.gl.init();
      $('wStart')?.removeAttribute('disabled');
      ui.initFilters();
      enterGallery();
      window.scrollTo(0, chapterProgress(app.chapter, app.works.length) * Math.max(1, document.documentElement.scrollHeight - innerHeight));
      ui.toast(app.works.length + ' œuvres · galerie autonome');
      return;
    }
    await app.boot();
    $('wStart')?.removeAttribute('disabled');
    ui.initFilters();
    if (app.tierResolved === 'T0') { showT0(); return }
    if (!app.gl || !app.gl.gl) { showT0(); return }
    const first = ordered(app.works)[0]; if (first) app.load.ensureLow(first);
    addEventListener('pointerdown', () => app.audio.arm(), { once: true });
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js', { scope: '/' }).catch(() => {}) }
    ui.toast(app.works.length + ' œuvres · défilez pour visiter');
  } catch (e) { console.error(e); ui.toast('Erreur de démarrage') }
}
boot();

function showT0() {
  document.body.classList.add('t0'); cv.style.display = 'none'; hud.style.display = 'none';
  const list = $('workList'); if (!list) return;
  list.innerHTML = '<p class="note">WebGL indisponible — galerie 2D de secours.</p>';
  app.works.forEach(w => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<img src="' + esc(w.thumb || '') + '"><div class="info"><b>' + esc(w.title) + '</b><span>' + esc(w.artist) + '</span></div>'; d.onclick = () => { app.selectWork(w); ui.actTitle(w) }; list.appendChild(d) })
  ui.toast('Mode essentiel (WebGL indisponible)')
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

async function importLink() {
  const url = prompt('URL directe d’image (CORS requis) :'); if (!url) return;
  try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob(); if (!b.type.startsWith('image/')) throw new Error('ce n’est pas une image'); const f = new File([b], decodeURIComponent(url.split('/').pop() || 'image.jpg'), { type: b.type }); await addImages([f]) } catch (err) { ui.toast('CORS refusé ou image indisponible') }
}
async function addImages(files) {
  const list = [...files].filter(f => f && f.type.startsWith('image/')).slice(0, Math.max(0, 150 - app.works.length));
  if (!list.length) { ui.toast('Aucune image valide'); return }
  ui.loading(true, 0);
  await Promise.all(list.map(f => new Promise(res => { const url = URL.createObjectURL(f), img = new Image(); img.onload = () => { const w = createWork({ title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), source: f.name }, img, f); w.objectUrl = url; app.works.push(w); res(w) }; img.onerror = () => { URL.revokeObjectURL(url); ui.toast('Image illisible : ' + f.name); res(null) }; img.src = url })));
  app.stations = buildStations(app.works, app.layout); app.gl.stations = app.stations;
  ui.loading(false); ui.renderUI(); ui.toast(list.length + ' œuvre(s) ajoutée(s)')
}
const fi = $('fileInput'); if (fi) fi.onchange = e => { addImages(e.target.files); e.target.value = '' }
const pi = $('projectInput'); if (pi) pi.onchange = e => exportKit.loadProject(e)
