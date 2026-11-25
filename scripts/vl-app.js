'use strict';
/* VOIE LACTÉE — application : boucle unique, état, entrées, culling, LOD, tiers */
import { TAU, clamp, fin, lerp, smoothstep, sub, add, mul, norm, dot, cross, mPerspective, mLookAt, mMul, mPoint, ordered, safeFrame, frameDist, faceRotation, createWork, yearOf, groupKey, REDUCED, MOBILE, buildStations, stationAt, chapterProgress, seedOf, STRIDE } from './vl-core.js';
import { GLRenderer } from './vl-gl.js';
import { AssetLoader } from './vl-load.js';
import { AudioEngine } from './vl-audio.js';

export class App {
  constructor(canvas, hud) {
    this.canvas = canvas; this.hud = hud;
    this.gl = new GLRenderer(canvas);
    this.load = new AssetLoader(this.gl);
    this.audio = new AudioEngine();
    this.works = []; this.mode = 'tour'; this.layout = 'emotion';
    this.progress = 0; this.targetProgress = 0; this.chapter = -1; this.selected = null;
    this.cam = [0, 0, 16]; this.target = [0, 0, 0];
    this.freeCam = [0, 0, 16]; this.freeTarget = [0, 0, 0];
    this.fly = null; this.keys = new Set();
    this.hidden = false; this.paused = false;
    this.tier = 'auto'; this.tierResolved = 'T1'; this.dpr = 1;
    this.fps = 60; this.p95 = 16; this.lastFrame = 0; this.time = 0;
    this.fpsHist = [];
    this.pointer = null; this.dragged = 0; this.lastX = 0; this.lastY = 0;
    this.dragWork = null; this.snapIdle = 0; this.snapTarget = null;
    this.scrollReturn = 0; this.lastScroll = 0;
    this.debug = 0; this.spin = false; this.pointScale = 1;
    this.qualityLock = null;
    this.stations = [];
    this.rafId = null;
    this.onRedraw = null;
    this._af = this._af.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onScroll = this._onScroll.bind(this);
  }
  async boot() {
    await this.gl.init();
    await this.load.loadManifest();
    this.works = this.load.works;
    this.stations = buildStations(this.works, this.layout);
    this.gl.stations = this.stations;
    this.updateLines();
    this._installEvents();
    try{ this.load.setAvifSupport(AssetLoader.supportsAVIF()) }catch(e){}
    this._detectTier();
    this.lastFrame = performance.now();
    requestAnimationFrame(this._af);
  }
  async _detectTier() {
    const raw = this.gl ? this.gl.gl : null;
    const dm = navigator.deviceMemory || 4;
    const hc = navigator.hardwareConcurrency || 4;
    const ct = navigator.connection; const eff = ct ? ct.effectiveType : '4g'; const save = ct ? ct.saveData : false;
    const sw = screen.width;
    let glRenderer = '', swGL = false;
    try { if (raw) { const c = document.createElement('canvas'); const g = c.getContext('webgl') || c.getContext('experimental-webgl'); if (g) { const ri = g.getExtension('WEBGL_debug_renderer_info'); glRenderer = ri ? g.getParameter(ri.UNMASKED_RENDERER_WEBGL) : ''; swGL = /swiftshader|llvmpipe|software|raster/i.test(glRenderer) } } } catch (e) { swGL = true }
    const lowRam = dm <= 2 || hc <= 2;
    const slowNet = eff === 'slow-2g' || eff === '2g' || eff === '3g' || save;
    const bench = await this._microBench();
    let tier = 'T1';
    if (!raw || swGL || (lowRam && slowNet) || dm < 2) tier = 'T0';
    else if (bench > 1500 || save || dm <= 3 || hc <= 2) tier = 'T1';
    else if (bench > 800 || dm <= 6 || hc <= 4) tier = 'T2';
    else tier = 'T3';
    const saved = localStorage.getItem('vl-tier');
    if (saved && /^T[0-3]$/.test(saved)) tier = saved;
    this.setTier(tier, true);
    return { tier, dm, hc, eff, save, swGL, bench };
  }
  async _microBench() {
    // Travail CPU fractionné : jamais de longue tâche > 8 ms sur le fil principal.
    const targetWorkMs = 400;
    const chunkMs = 6;
    let accMs = 0;
    const start = performance.now();
    while (accMs < targetWorkMs) {
      const c0 = performance.now();
      let s = 0;
      for (let i = 0; i < 20000; i++) s += Math.sin(i) * Math.cos(i);
      accMs += performance.now() - c0;
      const elapsed = performance.now() - c0;
      if (elapsed < chunkMs) {
        await new Promise(r => setTimeout(r, chunkMs - elapsed));
      }
    }
    return performance.now() - start; // ms réels écoulés ; plus grand = CPU plus lent
  }
  setTier(tier, initial = false) {
    this.tierResolved = tier;
    let dpr = 1, ps = 1;
    if (tier === 'T0') { dpr = 1; ps = 1 }
    else if (tier === 'T1') { dpr = 1; ps = 1 }
    else if (tier === 'T2') { dpr = 1.25; ps = 1 }
    else { dpr = 2; ps = 0.82 }
    this.gl.setPixelRatio(dpr);
    this.pointScale = ps;
    if (!initial && this.onRedraw) this.onRedraw('tier', tier);
  }
  regulateTier(frameMs) {
    if (this.qualityLock || this.tierResolved === 'T0') return;
    let next = this.tierResolved;
    if (frameMs > 24) { if (next === 'T3') next = 'T2'; else if (next === 'T2') next = 'T1'; else if (next === 'T1') next = 'T0' }
    else if (frameMs < 10 && next !== 'T3') { if (next === 'T0') next = 'T1'; else if (next === 'T1') next = 'T2'; else if (next === 'T2') next = 'T3' }
    if (next !== this.tierResolved) this.setTier(next);
  }
  _installEvents() {
    const cv = this.canvas;
    addEventListener('resize', this._onResize);
    addEventListener('scroll', this._onScroll, { passive: true });
    addEventListener('visibilitychange', () => { this.hidden = document.hidden; this.gl.setHidden(this.hidden); this.paused = this.hidden; if (!this.hidden) this.lastFrame = performance.now() });
    cv.addEventListener('pointerdown', e => { this.pointer = e.pointerId; this.dragged = 0; this.lastX = e.clientX; this.lastY = e.clientY; cv.setPointerCapture(e.pointerId); document.body.classList.add('dragging'); this.fly = null; if (this.mode === 'free') { e.preventDefault(); this.dragWork = null } else { this.dragWork = this.hitWork(e.clientX, e.clientY) || ordered(this.works)[this.chapter] || null } }, { passive: false });
    cv.addEventListener('pointermove', e => { if (this.pointer !== e.pointerId) return; const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; this.dragged += Math.abs(dx) + Math.abs(dy); if (this.mode === 'tour') { const w = this.dragWork; if (!w || this.fly) return; w.rotUser = w.rotUser || [0, 0]; w.userScale = w.userScale || 1; if (e.buttons & 2 || e.shiftKey) { w.userScale = clamp(w.userScale * (1 - dy * 0.003), 0.72, 1.3); w.rotUser[0] = clamp(w.rotUser[0] + dx * 0.002, -0.9, 0.9) } else { w.rotUser[0] = clamp(w.rotUser[0] + dx * 0.004, -0.9, 0.9); w.rotUser[1] = clamp(w.rotUser[1] - dy * 0.003, -0.6, 0.6) } return } if (this.mode !== 'free' || this.fly) return; if (e.buttons & 2 || e.shiftKey) { const fw = norm(sub(this.freeTarget, this.freeCam)), rt = norm(cross(fw, [0, 1, 0])); const mv = add(mul(rt, -dx * 0.012), [0, dy * 0.012, 0]); this.freeCam = add(this.freeCam, mv); this.freeTarget = add(this.freeTarget, mv) } else { const d = sub(this.freeTarget, this.freeCam), len = Math.hypot(...d) || 1, az = Math.atan2(d[0], d[2]) + dx * 0.005, el = clamp(Math.asin(d[1] / len) - dy * 0.005, -1.42, 1.42); this.freeTarget = add(this.freeCam, [Math.sin(az) * Math.cos(el) * len, Math.sin(el) * len, Math.cos(az) * Math.cos(el) * len]) } });
    const endPtr = e => { if (this.pointer !== e.pointerId) return; cv.releasePointerCapture?.(e.pointerId); this.pointer = null; document.body.classList.remove('dragging'); if (this.dragged < 7) { const w = this.hitWork(e.clientX, e.clientY); if (w) this.flyTo(w); else this.selectWork(null) } this.dragWork = null };
    cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', () => { this.pointer = null; document.body.classList.remove('dragging'); this.dragWork = null });
    cv.addEventListener('dblclick', e => { const w = this.hitWork(e.clientX, e.clientY) || ordered(this.works)[this.chapter]; if (!w) return; w.rotUser = [0, 0]; w.userScale = 1; w.roll = 0 });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      if (this.mode === 'free') { e.preventDefault(); const d = sub(this.freeCam, this.freeTarget), len = Math.hypot(...d) || 1, nl = clamp(len * (e.deltaY > 0 ? 1.1 : 0.9), 1.2, 90); this.freeCam = add(this.freeTarget, mul(norm(d), nl)); return }
      if (this.mode === 'tour' && (e.ctrlKey || e.altKey)) { e.preventDefault(); const w = ordered(this.works)[this.chapter]; if (!w) return; w.userScale = clamp((w.userScale || 1) * (e.deltaY > 0 ? 0.94 : 1.06), 0.72, 1.3) }
    }, { passive: false });
    addEventListener('keydown', e => { const tag = e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; const k = e.key.toLowerCase(); if (!this.keys.has(k)) this.keys.add(k); if (k === 'h') { document.body.classList.toggle('hide'); return } if (k === 'm') { if (this.onRedraw) this.onRedraw('panel', 'map'); return } if (k === 'g') { if (this.onRedraw) this.onRedraw('panel', 'panel'); return } if (k === 'c' && this.mode !== 'free') { if (this.onRedraw) this.onRedraw('panel', 'credits'); return } if (k === 'f') { this.setMode(this.mode === 'tour' ? 'free' : 'tour'); return } if (k === 's') { this.audio.toggle(); return } if (e.key === 'F2') { this.debug = (this.debug + 1) % 4; return } if (k === 'l') { this.cycleLayout(); return } if (k === ',' || k === '<') { this.rotateActive(-Math.PI / 12); return } if (k === '.' || k === '>') { this.rotateActive(Math.PI / 12); return } if (k === 't') { this.spin = !this.spin; } if (k === 'v') { this.toggleQuality(); return } if (k === 'escape') { if (this.onRedraw) this.onRedraw('panel', ''); return } if (k === 'arrowright' || k === 'arrowleft') { e.preventDefault(); const n = ordered(this.works).length; if (!n) return; const i = clamp(this.chapter + (k === 'arrowright' ? 1 : -1), 0, n - 1); this.scrollToChapter(i) } if (k === 'arrowup' || k === 'arrowdown') { this.keys.add(k) } });
    addEventListener('keyup', e => { this.keys.delete(e.key.toLowerCase()) });
    addEventListener('blur', () => this.keys.clear());
  }
  _onResize() { this.gl.resize(); if (this.onRedraw) this.onRedraw('resize') }
  _onScroll() { if (this.mode !== 'tour') return; const now = performance.now(); if (this.lastScroll !== scrollY) { this.lastScroll = scrollY; this.snapIdle = 0; this.snapTarget = null } else this.snapIdle += (now - this.lastFrame) / 1000; this.targetProgress = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1) }
  setMode(m) {
    if (m === this.mode || !ordered(this.works).length) return;
    if (m === 'free') { this.scrollReturn = scrollY; this.mode = 'free'; this.freeCam = [...this.cam]; this.freeTarget = [...this.target]; this.fly = null } else { this.mode = 'tour'; this.fly = null; window.scrollTo(0, this.scrollReturn); const max = Math.max(1, document.documentElement.scrollHeight - innerHeight); this.progress = this.targetProgress = clamp(scrollY / max, 0, 1) }
    document.body.classList.toggle('free', m === 'free');
    if (this.onRedraw) this.onRedraw('mode', m)
  }
  togglePanel(cls) { if (this.onRedraw) this.onRedraw('panel', cls) }
  cycleLayout() { const ks = ['emotion', 'chrono', 'artist', 'movement', 'free']; const i = ks.indexOf(this.layout); this.layout = ks[(i + 1) % ks.length]; this.stations = buildStations(this.works, this.layout); this.gl.stations = this.stations; this.updateLines(); if (this.onRedraw) this.onRedraw('layout', this.layout) }
  toggleQuality() { const order = ['auto', 'T0', 'T1', 'T2', 'T3']; let i = order.indexOf(this.qualityLock ?? 'auto'); i = (i + 1) % order.length; const nxt = order[i]; this.qualityLock = nxt === 'auto' ? null : nxt; this.setTier(nxt === 'auto' ? this.tierResolved : nxt); if (this.onRedraw) this.onRedraw('quality', nxt) }
  rotateActive(d) { const w = this.activeWork(); if (!w) return; w.roll = (((w.roll || 0) + d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI }
  activeWork() { return this.selected || ordered(this.works)[this.chapter] || ordered(this.works)[0] || null }
  selectWork(w) { this.selected = w; if (this.onRedraw) this.onRedraw('select', w) }
  scrollToChapter(i) { if (this.mode === 'free') this.setMode('tour'); window.scrollTo({ top: chapterProgress(i, ordered(this.works).length) * Math.max(1, document.documentElement.scrollHeight - innerHeight), behavior: REDUCED ? 'instant' : 'smooth' }) }
  flyTo(w) { if (!w) return; if (this.mode === 'tour') this.setMode('free'); const n = norm(mul(w.pos, -1)), dist = fin(w.scale, 1.36, 0.05, 20) * 3.1 + 2.6; this.fly = { from: [...this.freeCam], to: add(w.pos, mul(n, dist)), fromT: [...this.freeTarget], toT: [...w.pos], t: 0, dur: REDUCED ? 0.01 : 1.5 }; this.selected = w; if (this.onRedraw) this.onRedraw('fly', w) }
  hitWork(cx, cy) { const x = cx * this.gl.DPR, y = cy * this.gl.DPR; let best = null, bd = 1e9; const VP = this.curVP(); ordered(this.works).forEach(w => { const p = mPoint(VP, w.pos); if (p[3] <= 0) return; const sx = (p[0] * 0.5 + 0.5) * this.gl.W, sy = (-p[1] * 0.5 + 0.5) * this.gl.H; const r = Math.max(24 * this.gl.DPR, w.radius * this.gl.W / (Math.max(3, Math.hypot(...sub(w.pos, this.cam))) * 1.15)); const d = Math.hypot(sx - x, sy - y); if (d < r && d < bd) { bd = d; best = w } }); return best }
  curVP() { return mMul(mPerspective(0.85, Math.max(0.2, this.gl.W / this.gl.H), 0.08, 320), mLookAt(this.cam, this.target, [0, 1, 0])) }
  _af(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    if (!this.hidden && !this.paused) { this.time += dt; this.fps = this.fps * 0.94 + (1 / dt) * 0.06; this.fpsHist.push(1000 * dt); if (this.fpsHist.length > 120) this.fpsHist.shift(); const hs = this.fpsHist.slice().sort((a, b) => a - b); this.p95 = hs[Math.floor(hs.length * 0.95)] || 16; this.regulateTier(this.p95) }
    if (this.mode === 'tour') { const max = Math.max(1, document.documentElement.scrollHeight - innerHeight), n = ordered(this.works).length; if (this.snapIdle > 0.32 && this.snapTarget === null) { const i = clamp(Math.round(this.targetProgress * n - 0.5), 0, n - 1), cp = chapterProgress(i, n); if (Math.abs(this.targetProgress - cp) > 1e-5 && Math.abs(this.targetProgress - cp) < 0.14 / n) { this.snapTarget = cp; window.scrollTo(0, cp * max) } } if (this.snapTarget !== null) { this.targetProgress = clamp(scrollY / max, 0, 1); if (Math.abs(this.targetProgress - this.snapTarget) < 1e-4) this.snapTarget = null } this.progress += (this.targetProgress - this.progress) * (REDUCED ? 1 : 1 - Math.pow(0.0015, dt)) }
    if (this.fly) { const f = this.fly; f.t = Math.min(1, f.t + dt / f.dur); const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2; this.freeCam = f.from.map((v, i) => lerp(v, f.to[i], e)); this.freeTarget = f.fromT.map((v, i) => lerp(v, f.toT[i], e)); if (f.t >= 1) this.fly = null }
    else if (this.mode === 'free') { const k = this.keys, spd = (k.has('shift') ? 16 : 7) * dt, fw = norm(sub(this.freeTarget, this.freeCam)), rt = norm(cross(fw, [0, 1, 0])); let mv = [0, 0, 0]; if (k.has('z') || k.has('w')) mv = add(mv, fw); if (k.has('s')) mv = sub(mv, fw); if (k.has('q') || k.has('a')) mv = sub(mv, rt); if (k.has('d')) mv = add(mv, rt); if (k.has('e') || k.has(' ')) mv = add(mv, [0, 1, 0]); if (k.has('c')) mv = sub(mv, [0, 1, 0]); if (mv.some(Boolean)) { this.freeCam = add(this.freeCam, mul(norm(mv), spd)); this.freeTarget = add(this.freeTarget, mul(norm(mv), spd)) } }
    if (this.mode === 'tour') { const st = stationAt(this.stations, this.progress); this.cam = st.p; this.target = st.t; const idx = ordered(this.works).indexOf(st.w); if (idx !== -1 && idx !== this.chapter) { this.chapter = idx; if (this.onRedraw) this.onRedraw('chapter', idx) } }
    else { this.cam = this.freeCam; this.target = this.freeTarget }
    const VP = this.curVP();
    this._updateFocus(dt);
    this._manageLoads();
    const visible = this._cull(VP);
    const drawn = this.gl.drawFrame({ VP, CAM: this.cam, time: this.time, visibleWorks: visible, dpr: this.gl.DPR, pointScale: this.pointScale, reduced: REDUCED, debug: this.debug });
    if (this.onRedraw) this.onRedraw('frame', { drawn, visible: visible.length, cam: this.cam, target: this.target, chapter: this.chapter, fps: this.fps, p95: this.p95, tier: this.tierResolved })
    if (!this.hidden && !this.paused) this.rafId = requestAnimationFrame(this._af)
  }
  _updateFocus(dt) { const list = ordered(this.works); list.forEach(w => { const d = Math.hypot(...sub(w.pos, this.cam)), near = frameDist(w) * 1.02, far = near * 2.6, target = 1 - smoothstep(near, far, d); w.focus += (target - w.focus) * (1 - Math.pow(0.00005, dt)) }) }
  _manageLoads() { const list = ordered(this.works); const idx = this.chapter >= 0 ? this.chapter : 0; for (let o = -2; o <= 2; o++) { const w = list[clamp(idx + o, 0, list.length - 1)]; if (w) this.load.ensureLow(w) } const close = list.slice().sort((a, b) => Math.hypot(...sub(a.pos, this.cam)) - Math.hypot(...sub(b.pos, this.cam))).slice(0, MOBILE ? 2 : 3); close.forEach(w => this.load.ensureHigh(w)) }
  _cull(VP) { const list = ordered(this.works); const maxD = this.tierResolved === 'T0' ? 0 : (this.tierResolved === 'T1' ? 45 : 70); const visible = []; for (const w of list) { const d = Math.hypot(w.pos[0] - this.cam[0], w.pos[1] - this.cam[1], w.pos[2] - this.cam[2]); if (d > maxD) continue; const p = mPoint(VP, w.pos); if (p[3] <= 0 || p[0] < -1.3 || p[0] > 1.3 || p[1] < -1.3 || p[1] > 1.3) continue; visible.push(w) } return visible }
  updateLines() { const list = ordered(this.works); const pts = []; const seen = new Set(); for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j]; if (a.artist !== b.artist && (!a.movement || a.movement !== b.movement)) continue; const k = a.id + '/' + b.id; if (seen.has(k)) continue; seen.add(k); if (Math.hypot(...sub(a.pos, b.pos)) > 30) continue; pts.push(...a.pos, ...b.pos) } this.linesData = new Float32Array(pts); this.linesLen = pts.length / 3; this.gl.setLines(this.gl.bLines, this.linesData) }
  stop() { if (this.rafId) cancelAnimationFrame(this.rafId) }
}
