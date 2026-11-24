'use strict';
/* VOIE LACTÉE — interface : DOM, panneaux, liste virtualisée, HUD, UX */
import { esc, chapterProgress } from './vl-core.js';

const $ = id => document.getElementById(id);
const $on = (id, fn) => { const e = $(id); if (e) e.onclick = fn };
const $text = (id, v) => { const e = $(id); if (e) e.textContent = v };
const acts = () => window.__VL_ACTS__ || [];

export class UI {
  constructor(app, onAction) {
    this.app = app; this.onAction = onAction;
    this.hudEl = app.hud; this.hctx = this.hudEl.getContext('2d');
    this.hudVisible = false; this.hudReq = null;
    this.listEl = $('workList'); this.works = app.works;
    this.filter = { q: '', artist: '', emotion: '', era: '' };
    this.listItems = []; this.scrollTop = 0; this.vStart = 0; this.vEnd = 0;
    this.rowHeight = 48;
    this.onboardingShown = false;
    this._bind();
  }
  _bind() {
    const a = this.onAction;
    $on('btnMode', () => a('mode', this.app.mode === 'tour' ? 'free' : 'tour'));
    $on('btnLayout', () => a('layout'));
    $on('btnMap', () => a('panel', 'map'));
    $on('btnWorks', () => a('panel', 'panel'));
    $on('btnCredits', () => a('panel', 'credits'));
    $on('closeOver', () => a('panel', ''));
    $on('btnQuality', () => a('quality'));
    $on('btnRotL', () => a('rot', -Math.PI / 12));
    $on('btnRotR', () => a('rot', Math.PI / 12));
    $on('btnSpin', () => { a('spin') });
    $on('btnAudio', () => a('audio'));
    $on('pAdd', () => $('fileInput')?.click());
    $on('pFolder', () => $('folderInput')?.click());
    $on('wImport', () => $('fileInput')?.click());
    $on('wFolder', () => $('folderInput')?.click());
    $on('wLink', () => a('link'));
    $on('wStart', () => a('start'));
    $on('exPng', () => a('png'));
    $on('exSave', () => a('save'));
    $on('exLoad', () => $('projectInput')?.click());
    $on('exHtml', () => a('html'));
    addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'P') { e.preventDefault(); this.toggleHud() } });
    this._bindSearch();
    this._bindList();
  }
  _bindSearch() {
    const q = $('searchQ'); const fArtist = $('filterArtist'); const fEmotion = $('filterEmotion'); const fEra = $('filterEra');
    const run = () => { this.filter = { q: (q ? q.value : ''), artist: (fArtist ? fArtist.value : ''), emotion: (fEmotion ? fEmotion.value : ''), era: (fEra ? fEra.value : '') }; this.renderList() };
    [q, fArtist, fEmotion, fEra].forEach(el => { if (el) { el.addEventListener('input', run); el.addEventListener('change', run) } })
  }
  _bindList() {
    this.listEl?.addEventListener('scroll', () => { this.scrollTop = this.listEl.scrollTop });
    this.listEl?.addEventListener('click', e => {
      const row = e.target.closest('.row'); if (!row) return; const w = this.app.works.find(x => x.id === row.dataset.id); if (!w) return; const act = e.target.dataset.a; if (act === 'select') { this.app.selectWork(w) } else if (act === 'del') { this.onAction('del', w) } else if (act === 'up' || act === 'down') { this.onAction('order', w, act) } else { this.app.flyTo(w) }
    });
  }
  setAppRefs(fpsEl, pcountEl, chapEl) { this.fpsEl = fpsEl; this.pcountEl = pcountEl; this.chapEl = chapEl }
  initFilters() {
    const ws = this.app.works;
    const artists = [...new Set(ws.map(w => w.artist))].sort();
    const emotions = [...new Set(ws.map(w => w.emotion))].sort();
    const eras = [...new Set(ws.map(w => w.era))].sort();
    const fill = (id, items) => { const el = $(id); if (!el) return; el.innerHTML = items.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('') };
    fill('filterArtist', artists); fill('filterEmotion', emotions); fill('filterEra', eras);
  }
  toast(msg, ms = 2400) { const e = $('toast'); if (!e) return; e.textContent = msg; e.style.opacity = 1; clearTimeout(e._t); e._t = setTimeout(() => e.style.opacity = 0, ms) }
  loading(on, pct) { const e = $('loading'); if (!e) return; e.style.display = on ? 'block' : 'none'; document.body.setAttribute('aria-busy', on ? 'true' : 'false'); if (on) e.firstElementChild.style.width = Math.max(0, Math.min(100, pct | 0)) + '%' }
  progressBar(pct) { const b = $('bar'); if (b) b.style.width = Math.max(0, Math.min(100, pct)) + '%' }
  actTitle(w) { const ov = $('actTitle'); if (!ov) return; const act = acts().find(x => x.id === (w && w.act)); if (!w || !act) { ov.style.opacity = '0'; ov._key = null; return } if (ov._key !== act.id) { ov._key = act.id; ov.innerHTML = '<div class="num">' + esc(act.title) + '</div><div class="title">' + esc(act.emotion) + '</div><div class="emotion">' + esc(act.description) + '</div>'; ov.style.color = act.color; ov.style.opacity = '1';     document.documentElement.style.setProperty('--acc', act.color); clearTimeout(ov._t); ov._t = setTimeout(() => ov.style.opacity = '0', 2800) } else { ov.style.opacity = '1' } const nar = $('narrative'); if (!nar) return; const key = w ? w.id + '/' + w.title : null; if (nar._key !== key) { nar._key = key; $text('narMeta', [act ? act.title : '', w ? w.year : '', w ? w.movement : '', w ? w.era : ''].filter(Boolean).join(' · ')); $text('narTitle', w ? esc(w.title) : ''); $text('narBy', w ? esc(w.artist) + (w.museum ? ' — ' + esc(w.museum) : '') : ''); $text('narText', w ? (w.story || w.narrative || 'Aucun texte narratif saisi pour cette œuvre.') : '') } nar.style.opacity = w ? '1' : '0' }
  renderChapters() {
    const box = $('progress'); if (!box) return;
    const list = ordered(this.app.works); let html = '';
    if (this.app.layout === 'emotion') {
      const ac = acts(); let last = null;
      list.forEach((w, i) => {
        if (w.act !== last) { last = w.act; const a = ac.find(x => x.id === last); if (a) html += '<div class="actSep" style="color:var(--acc)">' + esc(a.title) + '</div>' }
        html += '<button data-ch="' + i + '" class="' + (i === this.app.chapter ? 'on' : '') + '" title="' + esc(w.title) + '">[' + String(i + 1).padStart(2, '0') + ']</button>'
      })
    } else {
      html = list.map((w, i) => '<button data-ch="' + i + '" class="' + (i === this.app.chapter ? 'on' : '') + '" title="' + esc(w.title) + '">[' + String(i + 1).padStart(2, '0') + ']</button>').join('')
    }
    box.innerHTML = html;
    box.querySelectorAll('button').forEach(b => {
      b.onclick = () => { const i = +b.dataset.ch; if (this.app.mode === 'free') this.app.setMode('tour'); window.scrollTo({ top: chapterProgress(i, list.length) * Math.max(1, document.documentElement.scrollHeight - innerHeight), behavior: REDUCED ? 'instant' : 'smooth' }) }
    });
    $text('chap', String(Math.max(0, this.app.chapter) + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0'))
  }
  renderMarkers() { const box = $('markers'); if (!box) return; const list = ordered(this.app.works); box.innerHTML = list.map((w, i) => { w.markerId = 'mk' + i; return '<div class="marker" id="' + w.markerId + '"><i>[' + String(i + 1).padStart(2, '0') + ']</i> ' + esc(w.title) + ' · ' + esc(w.artist) + '</div>' }).join('') }
  drawMarkers(VP, cam) { const list = ordered(this.app.works); for (let i = 0; i < list.length; i++) { const w = list[i], e = $(w.markerId); if (!e) continue; const p = mPoint(VP, w.pos), d = Math.hypot(...sub(w.pos, cam)); if (p[3] <= 0 || p[0] < -1.2 || p[0] > 1.2 || p[1] < -1.2 || p[1] > 1.2 || d > 60) { e.style.opacity = 0; continue } const x = (p[0] * 0.5 + 0.5) * innerWidth, y = (-p[1] * 0.5 + 0.5) * innerHeight; e.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; e.style.opacity = String(clamp(1 - smoothstep(18, 42, d), 0, 1) * 0.82) } }
  updateNarrative(w, alpha) { const nar = $('narrative'); if (!nar) return; if (!w) { nar.style.opacity = 0; return } const key = w.id + '/' + w.title; if (nar._key !== key) { nar._key = key; const ac = acts(), act = ac.find(x => x.id === w.act); $text('narMeta', [act ? act.title : '', w.year, w.movement, w.era].filter(Boolean).join(' · ')); $text('narTitle', esc(w.title)); $text('narBy', esc(w.artist) + (w.museum ? ' — ' + esc(w.museum) : '')); $text('narText', w.story || w.narrative || 'Aucun texte narratif saisi pour cette œuvre.') } nar.style.opacity = String(clamp(alpha, 0, 1)) }
  renderWorksList() { const list = this.listEl; if (!list) return; const ws = this.app.works; let data = ws.filter(w => { if (this.filter.q && !w.title.toLowerCase().includes(this.filter.q.toLowerCase()) && !w.artist.toLowerCase().includes(this.filter.q.toLowerCase())) return false; if (this.filter.artist && w.artist !== this.filter.artist) return false; if (this.filter.emotion && w.emotion !== this.filter.emotion) return false; if (this.filter.era && w.era !== this.filter.era) return false; return true }); this.listItems = data; this.renderVirtual() }
  renderVirtual() { const list = this.listEl; if (!list) return; const data = this.listItems; list.innerHTML = data.map((w, i) => '<div class="row" data-id="' + esc(w.id) + '"><img src="' + (w.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=') + '" alt="Miniature"><div class="info"><b>' + String(this.app.works.indexOf(w) + 1).padStart(2, '0') + ' · ' + esc(w.title) + '</b><span>' + esc(w.artist) + (w.year ? ' · ' + esc(w.year) : '') + '</span></div><div class="ctrl"><button data-a="fly">▶</button><button data-a="select">↗</button></div></div>').join('') }
  renderEditor() {
    const w = this.app.selected, box = $('editor'); if (!box) return;
    if (!w) { box.innerHTML = '<p class="note">Sélectionnez une œuvre dans la liste.</p>'; return }
    box.innerHTML = '<label class="field"><span>Titre</span><input id="ed_title" value="' + esc(w.title) + '"></label><label class="field"><span>Artiste</span><input id="ed_artist" value="' + esc(w.artist) + '"></label><label class="field"><span>Année</span><input id="ed_year" value="' + esc(w.year) + '"></label><label class="field"><span>Musée</span><input id="ed_museum" value="' + esc(w.museum) + '"></label><label class="field"><span>Texte narratif</span><textarea id="ed_narrative">' + esc(w.narrative) + '</textarea></label><label class="field"><span>Droits</span><input id="ed_rights" value="' + esc(w.rights) + '"></label><label class="field"><span>Licence</span><input id="ed_license" value="' + esc(w.license) + '"></label><label class="field"><span>Source</span><input id="ed_source" value="' + esc(w.source) + '"></label><div style="margin:14px 0"><button id="edPreview">Vol vers l’œuvre</button><button id="edRelief">' + (w.depthMode === 'ai' ? 'Désactiver relief IA' : 'Relief IA') + '</button></div>';
    ['title', 'artist', 'year', 'museum', 'narrative', 'rights', 'license', 'source'].forEach(k => {
      const e = $('ed_' + k); if (e) e.oninput = () => { w[k] = e.target.value; this.renderWorksList(); this.renderMarkers() }
    });
    $on('edPreview', () => this.app.flyTo(w));
    $on('edRelief', () => this.onAction('relief', w))
  }
  renderCredits() { const ws = this.app.works; const cl = $('creditList'); if (!cl) return; cl.innerHTML = ws.map(w => '<div class="credit"><div><b>' + esc(w.title) + '</b><br><span>' + esc(w.artist) + ' · ' + esc(w.year) + (w.museum ? ' · ' + esc(w.museum) : '') + '</span></div><div>' + (w.source && /^https?:/.test(w.source) ? '<a href="' + esc(w.source) + '" target="_blank" rel="noopener">Source ↗</a><br>' : '') + '<span>' + esc(w.license || w.rights || '') + '</span></div></div>').join('') || '<p class="note">Aucune œuvre importée.</p>' }
  renderUI() { this.renderWorksList(); this.renderEditor(); this.renderCredits(); this.renderMarkers(); this.renderChapters() }
  drawMap() { const c = $('map'); if (!c) return; const dpr = Math.min(devicePixelRatio || 1, 2); const w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) } const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); const ws = ordered(this.app.works); if (!ws.length) return; const cam = this.app.cam; const xs = ws.map(p => p.pos[0]).concat(cam[0]), zs = ws.map(p => p.pos[2]).concat(cam[2]); const mnX = Math.min(...xs) - 4, mxX = Math.max(...xs) + 4, mnZ = Math.min(...zs) - 4, mxZ = Math.max(...zs) + 4; const sc = Math.min(w / (mxX - mnX), h / (mxZ - mnZ)), ox = w / 2 - (mnX + mxX) / 2 * sc, oy = h / 2 - (mnZ + mxZ) / 2 * sc; const P = p => [p[0] * sc + ox, p[2] * sc + oy]; x.strokeStyle = 'rgba(185,200,255,.16)'; x.lineWidth = 1; const seen = new Set(); ws.forEach((a, i) => { ws.slice(i + 1).forEach(b => { if (a.artist !== b.artist && (!a.movement || a.movement !== b.movement)) return; const A = P(a.pos), B = P(b.pos); x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke }) }); ws.forEach((w2, i) => { const p = P(w2.pos), r = Math.max(4, Math.min(13, w2.radius * sc * 0.3)); x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.strokeStyle = w2 === this.app.selected ? '#b9c8ff' : 'rgba(238,238,242,.55)'; x.lineWidth = 1.2; x.stroke(); x.fillStyle = 'rgba(185,200,255,.7)'; x.font = '9px ui-monospace,Menlo,monospace'; x.fillText('[' + String(i + 1).padStart(2, '0') + ']', p[0] + r + 3, p[1] - r) }); const cp = P(cam), tp = P(this.app.target); x.strokeStyle = '#fff'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cp[0], cp[1]); x.lineTo(tp[0], tp[1]); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cp[0], cp[1], 3, 0, Math.PI * 2); x.fill() }
  toggleHud() { this.hudVisible = !this.hudVisible; this.hudEl.style.display = this.hudVisible ? 'block' : 'none' }
  togglePanel(cls) {
    const b = document.body; const next = cls ? !b.classList.contains(cls) : false;
    ['panel', 'map', 'credits'].forEach(c => b.classList.remove(c));
    if (cls) b.classList.toggle(cls, next);
    ['btnWorks', 'btnMap', 'btnCredits'].forEach(id => { const el = $(id); if (el) el.setAttribute('aria-pressed', 'false') });
    if (cls) { const el = $(cls === 'panel' ? 'btnWorks' : cls === 'map' ? 'btnMap' : 'btnCredits'); if (el) el.setAttribute('aria-pressed', next ? 'true' : 'false') }
    $('panel')?.setAttribute('aria-hidden', b.classList.contains('panel') ? 'false' : 'true');
    $('mapWrap')?.setAttribute('aria-hidden', b.classList.contains('map') ? 'false' : 'true');
    $('credits')?.setAttribute('aria-hidden', b.classList.contains('credits') ? 'false' : 'true');
    const co = $('closeOver'); if (co) co.hidden = !next;
    if (cls === 'map' && next) requestAnimationFrame(() => this.drawMap())
  }
  drawHud(stats) { if (!this.hudVisible) return; const c = this.hudEl, dpr = Math.min(devicePixelRatio || 1, 2); c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, innerWidth, innerHeight); x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(10, 10, 300, 210); x.fillStyle = '#b9c8ff'; x.font = '11px ui-monospace'; const lines = [ 'FPS ' + Math.round(stats.fps), 'p95 ' + Math.round(stats.p95) + ' ms', 'tier ' + stats.tier, 'œuvres visibles ' + stats.visible, 'dessinés ' + Math.round(stats.drawn), 'DPR ' + this.app.gl.DPR.toFixed(2), 'long tasks ' + (stats.longTasks ?? 0), 'mémoire JS ' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' Mo' : '?') ]; lines.forEach((t, i) => x.fillText(t, 20, 26 + i * 20)) }
}

function mPoint(m, p) { const x = p[0], y = p[1], z = p[2], w2 = m[3] * x + m[7] * y + m[11] * z + m[15] || 1; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w2, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w2, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w2, w2] }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t) }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function ordered(ws) { return ws.filter(w => w.visible) }
