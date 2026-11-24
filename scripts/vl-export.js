'use strict';
/* VOIE LACTÉE — export / import / sauvegarde */
import { createWork } from './vl-core.js';

const $ = id => document.getElementById(id);
const $text = (id, v) => { const e = $(id); if (e) e.textContent = v };
const dl = (b, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) };

export class ExportKit {
  constructor(app, ui, load) {
    this.app = app; this.ui = ui; this.load = load
  }
  imgData(w, max = 1400, q = 0.8) {
    if (!w.img) return ''
    const iw = w.img.naturalWidth || w.img.width, ih = w.img.naturalHeight || w.img.height, k = Math.min(1, max / Math.max(iw, ih))
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k))
    c.getContext('2d').drawImage(w.img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', q)
  }
  png() { this.app.gl.canvas.toBlob(b => { if (b) dl(b, 'voie-lactee-vue.png'); else this.ui.toast('Export PNG indisponible') }, 'image/png') }  save() { this.ui.loading(true, 0); const ws = []; for (let i = 0; i < this.app.works.length; i++) { const w = this.app.works[i]; ws.push({ ...metaOf(w), dataUrl: this.imgData(w), audioUrl: w.audioUrl || '' }); this.ui.loading(true, Math.round(i / this.app.works.length * 100)) } dl(new Blob([JSON.stringify({ app: 'voie-lactee', version: 1, mode: this.app.mode, layout: this.app.layout, chapter: this.app.chapter, works: ws })], { type: 'application/json' }), 'voie-lactee-projet.json'); this.ui.loading(false); this.ui.toast('Projet sauvegardé') }
  loadProject(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { doLoadProject(JSON.parse(r.result)) } catch (err) { console.warn(err); this.ui.toast('Projet illisible') } }; r.readAsText(f); e.target.value = '' }
  doLoadProject(o) {
    const list = (o.works || o.layers || []); if (!list.length) { this.ui.toast('Projet vide'); return }
    this.app.works.slice().forEach(w => { if (w.hiBuf) this.app.gl.gl?.deleteBuffer(w.hiBuf); if (w.loBuf) this.app.gl.gl?.deleteBuffer(w.loBuf) })
    this.app.works = []; this.app.selected = null; this.load.buildQueue.length = 0
    this.ui.loading(true, 0); let i = 0
    Promise.all(list.map(p => new Promise(res => { const img = new Image(); img.onload = () => { const w = createWork(p, img, null); w.audioUrl = p.audioUrl || null; w.depthMode = p.depthMode || 'luma'; res(w) }; img.onerror = () => res(null); img.src = p.dataUrl || p.src }))).then(ws => { this.app.works = ws; this.app.load.setWorks(ws); this.app.stations = buildStations(ws, this.app.layout); this.app.gl.stations = this.app.stations;     this.app.layout = o.layout || 'free'; this.app.mode = 'tour'; document.body.classList.remove('free'); $text('btnLayout', 'Disposition : ' + ({ emotion: 'émotions', free: 'libre', chrono: 'chronologique', artist: 'par artiste', movement: 'par mouvement' }[this.app.layout] || 'libre')); this.ui.loading(false); this.ui.renderUI(); this.app.chapter = clamp(o.chapter || 0, 0, this.app.works.length - 1); window.scrollTo(0, chapterProgress(this.app.chapter, this.app.works.length) * Math.max(1, document.documentElement.scrollHeight - innerHeight)); this.ui.toast('Projet chargé · ' + this.app.works.length + ' œuvre(s)') })
  }
  html() {
    this.ui.toast('Préparation du fichier autonome…'); this.ui.loading(true, 0)
    const ws = []; for (let i = 0; i < this.app.works.length; i++) { const w = this.app.works[i]; ws.push({ ...metaOf(w), dataUrl: this.imgData(w, 1400, 0.78), audioUrl: w.audioUrl || '' }); this.ui.loading(true, Math.round(i / Math.max(1, this.app.works.length) * 100)) }
    const embed = { works: ws, mode: this.app.mode, layout: this.app.layout, chapter: this.app.chapter }
    let html = '<!doctype html>\n' + document.documentElement.outerHTML
    html = html.replace('<script>', '<script>window.__VL_EMBED__=' + JSON.stringify(embed) + ';</script>')
    html = html.replace('<title>', '<title>Galerie autonome · ')
    dl(new Blob([html], { type: 'text/html;charset=utf-8' }), 'voie-lactee-galerie-autonome.html')
    this.ui.loading(false); this.ui.toast('HTML autonome téléchargé')
  }
}
function metaOf(w) { const keys = ['id', 'title', 'artist', 'year', 'museum', 'movement', 'rights', 'license', 'source', 'narrative', 'depthMode']; const o = {}; keys.forEach(k => o[k] = w[k]); return o }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
function buildStations(ws, layout) { return [] } // stub; app rebuilds
