'use strict';
/* VOIE LACTÉE — chargement : manifest, file prioritaire, worker, uploads découpés */
import { createWork, ordered, seedOf, STRIDE } from './vl-core.js';

const WORKER_URL = 'scripts/vl-worker.js';
let worker = null;
function getWorker() { if (!worker) worker = new Worker(WORKER_URL); return worker; }

export class AssetLoader {
  constructor(glRenderer, onProgress = () => {}) {
    this.gl = glRenderer;
    this.works = [];
    this.byId = new Map();
    this.px = new Map(); // work -> px
    this.buildQueue = [];
    this.building = new Set();
    this.uploadQueue = []; // {work, arr, count, kind}
    this.uploading = false;
    this.inflight = new Map(); // id -> promise/abort
    this.onProgress = onProgress;
    this.manifestLoaded = false;
    this.avif = false;
  }
  setAvifSupport(v){ this.avif = !!v; }
  static supportsAVIF(){
    try{ const c=document.createElement('canvas');c.width=1;c.height=1;return c.toDataURL('image/avif').indexOf('image/avif')===0 }catch(e){return false}
  }
  setWorks(works) { this.works = works; works.forEach(w => this.byId.set(w.id, w)); }
  async loadManifest(url = 'artworks/manifest.json') {
    const r = await fetch(url, { cache: 'force-cache' });
    if (!r.ok) throw new Error('manifest ' + r.status);
    const m = await r.json();
    if (m.acts) window.__VL_ACTS__ = m.acts;
    const works = (m.artworks || []).map(a => {
      const w = createWork({ id: a.id, title: a.title, artist: a.artist, year: a.year, museum: a.museum, act: a.act, actTitle: a.actTitle, emotion: a.emotion, color: a.color, era: a.era, order: a.order, narrative: a.narrative, story: a.story, rights: a.rights, license: a.license, source: a.source, credit: a.credit, width: a.width, height: a.height }, null, null);
      w.prev = a.prev; w.prevBytes = a.prevBytes || 0; w.thumb = a.thumb || '';
      w.filename = a.filename; w.detailFocus = a.detailFocus; w.verified = a.verified;
      if (a.width && a.height) { w.aspect = a.width / a.height; w.scale = 1.36 / Math.pow(Math.max(0.6, w.aspect), 0.3); w.radius = w.scale * Math.max(1, w.aspect) * 1.05 }
      return w;
    });
    this.setWorks(works);
    this.manifestLoaded = true;
    this.onProgress(0, 'manifest', works.length);
    return works;
  }
  abort(id) { const c = this.inflight.get(id); if (c) { c.abort(); this.inflight.delete(id) } }
  abortAll() { this.inflight.forEach(c => c.abort()); this.inflight.clear() }
  async fetchImage(work) {
    if (work.img || this.inflight.has(work.id)) return;
    const ctrl = new AbortController(); this.inflight.set(work.id, ctrl);
    const tryUrl = async (url) => { const r = await fetch(url, { signal: ctrl.signal, cache: 'force-cache' }); if (!r.ok) throw new Error('prev ' + r.status); return r.arrayBuffer(); };
    try {
      const primary = this.avif && work.prevAvif ? work.prevAvif : work.prev;
      const fallback = this.avif && work.prevAvif ? work.prev : null;
      let ab;
      try { ab = await tryUrl(primary) } catch (e) { if (!fallback) throw e; ab = await tryUrl(fallback) }
      ctrl.abort(); this.inflight.delete(work.id);
      work.imgBytes = ab;
      return ab;
    } catch (e) { if (e.name !== 'AbortError') throw e; return null }
  }
  async prepWork(work, maxDim = 620) {
    if (this.px.has(work)) return this.px.get(work);
    if (!work.imgBytes) await this.fetchImage(work);
    if (!work.imgBytes) return null;
    const wk = getWorker();
    const transfer = [work.imgBytes];
    const res = await new Promise((ok, rej) => {
      const h = e => { if (e.data.id !== work.id) return; if (e.data.type === 'prepDone') ok(e.data); else if (e.data.type === 'prepError') rej(new Error(e.data.message)); wk.removeEventListener('message', h) };
      wk.addEventListener('message', h);
      wk.postMessage({ type: 'prep', id: work.id, imageBytes: work.imgBytes, maxDim }, transfer);
      setTimeout(() => rej(new Error('prep timeout')), 30000);
    });
    work.imgBytes = null;
    const px = { w: res.w, h: res.h, aspect: res.aspect, L: res.L, H: res.H, NX: res.NX, NY: res.NY, mask: res.mask, ch: res.ch, colorGain: res.colorGain, hue: res.hue, lum: res.lum, cropBox: res.cropBox };
    work.px = px; work.aspect = res.aspect; work.hue = res.hue; work.lum = res.lum; work.cropBox = res.cropBox;
    this.px.set(work, px);
    this.onProgress(work.id, 'prep', work);
    return px;
  }
  enqueueBuild(work, kind, maxDim, target) {
    const job = { work, kind, maxDim, target };
    this.buildQueue.push(job);
    this.tickBuild();
    return job;
  }
  tickBuild() {
    if (this.building.size >= 2) return;
    const job = this.buildQueue.find(j => !this.building.has(j.work.id));
    if (!job) return;
    this.building.add(job.work.id);
    this.buildQueue = this.buildQueue.filter(j => j !== job);
    const px = job.work.px;
    if (!px) { this.building.delete(job.work.id); this.tickBuild(); return }
    const wk = getWorker();
    const transfer = [px.L.buffer, px.H.buffer, px.NX.buffer, px.NY.buffer];
    if (px.mask) transfer.push(px.mask.buffer);
    for (const c of px.ch) transfer.push(c.buffer);
    const h = e => { if (e.data.id !== job.work.id) return; if (e.data.type === 'buildDone') { this.onBuildDone(job, e.data); } else if (e.data.type === 'buildError') { this.onBuildError(job, e.data.message); } wk.removeEventListener('message', h) };
    wk.addEventListener('message', h);
    wk.postMessage({ type: 'build', id: job.work.id, kind: job.kind, target: job.target, salt: 0x9e37, px: { w: px.w, h: px.h, aspect: px.aspect, L: px.L, H: px.H, NX: px.NX, NY: px.NY, mask: px.mask, ch: px.ch, colorGain: px.colorGain, seed: job.work.seed } }, transfer);
    setTimeout(() => { if (this.building.has(job.work.id)) { this.onBuildError(job, 'build timeout') } }, 60000);
  }
  onBuildDone(job, data) {
    this.building.delete(job.work.id);
    const w = job.work, arr = data.arr, count = Math.min(data.target, arr.length / STRIDE | 0);
    if (job.kind === 'lo') { w.loArr = arr; w.loCount = count; w.loBuilt = true; } else { w.hiArr = arr; w.hiCount = count; w.hiBuilt = true; }
    this.enqueueUpload(w, arr, count, job.kind);
    w.loPending = w.hiPending = false;
    this.tickBuild();
  }
  onBuildError(job, msg) { this.building.delete(job.work.id); job.work[job.kind === 'lo' ? 'loPending' : 'hiPending'] = false; this.tickBuild() }
  enqueueUpload(work, arr, count, kind) { this.uploadQueue.push({ work, arr, count, kind, off: 0 }); if (!this.uploading) this.flushUploads() }
  flushUploads() {
    if (this.uploading || !this.uploadQueue.length) { this.uploading = false; return }
    this.uploading = true;
    const job = this.uploadQueue[0];
    const gl = this.gl.gl;
    if (!gl) { this.uploading = false; return }
    const work = job.work;
    let v = this.gl.workVao.get(work);
    const needLo = job.kind === 'lo' ? job.count : 0;
    const needHi = job.kind === 'hi' ? job.count : 0;
    if (!v) {
      v = this.gl.ensureWork(work, needLo, needHi);
    } else if (needLo * STRIDE * 4 > v.loBytes || needHi * STRIDE * 4 > v.hiBytes) {
      const hadLo = v.loReady && work.loArr;
      const hadHi = v.hiReady && work.hiArr;
      const loCnt = v.loCount, hiCnt = v.hiCount;
      v = this.gl.ensureWork(work, needLo, needHi);
      gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
      if (hadLo) gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(work.loArr.buffer, work.loArr.byteOffset, loCnt * STRIDE * 4));
      if (hadHi) gl.bufferSubData(gl.ARRAY_BUFFER, v.loBytes, new Uint8Array(work.hiArr.buffer, work.hiArr.byteOffset, hiCnt * STRIDE * 4));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
    const bytes = job.count * STRIDE * 4;
    const offset = job.kind === 'lo' ? 0 : v.loBytes;
    if (offset + bytes > (v.loBytes + v.hiBytes)) { this.uploadQueue.shift(); this.uploading = false; return }
    gl.bufferSubData(gl.ARRAY_BUFFER, offset, new Uint8Array(job.arr.buffer, job.arr.byteOffset, bytes));
    if (job.kind === 'lo') { v.loCount = job.count; v.loReady = true; } else { v.hiCount = job.count; v.hiReady = true; }
    this.gl.buildVAO(job.work, this.gl.pProg);
    this.uploadQueue.shift();
    if (this.uploadQueue.length) { requestAnimationFrame(() => this.flushUploads()) } else { this.uploading = false }
  }
  ensureLow(work) { if (work.loBuilt || work.loPending || !this.manifestLoaded) return; work.loPending = true; this.prepWork(work, 620).then(() => this.enqueueBuild(work, 'lo', 620, MOBILE ? 15000 : 2800)).catch(() => { work.loPending = false }) }
  ensureHigh(work) { if (work.hiBuilt || work.hiPending || !work.px) return; work.hiPending = true; this.enqueueBuild(work, 'hi', 1000, MOBILE ? 220000 : 520000) }
}
const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || innerWidth < 720;
