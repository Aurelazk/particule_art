'use strict';
/* VOIE LACTÉE — worker : décodage, échantillonnage, relief, génération buffers.
   Tout le travail pixel ici. Objets transférables. Pas d'accès DOM. */
const STRIDE = 13;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mulberry32 = a => { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }; };
const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
const sample = (a, w, h, u, v) => { const x = clamp(u * w, 0, w - 1), y = clamp(v * h, 0, h - 1), x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0; return lerp(lerp(a[y0 * w + x0], a[y0 * w + x1], fx), lerp(a[y1 * w + x0], a[y1 * w + x1], fx), fy); };
function blurF(a, w, h, r) { const t = new Float32Array(a.length), o = new Float32Array(a.length); for (let y = 0; y < h; y++) { let s = 0, c = 0, b = y * w; for (let x = -r; x < w; x++) { let i = x + r; if (i < w) { s += a[b + i]; c++ } let j = x - r - 1; if (j >= 0) { s -= a[b + j]; c-- } if (x >= 0) t[b + x] = s / Math.max(1, c) } } for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h; y++) { let i = y + r; if (i < h) { s += t[i * w + x]; c++ } let j = y - r - 1; if (j >= 0) { s -= t[j * w + x]; c-- } if (y >= 0) o[y * w + x] = s / Math.max(1, c) } } return o; }
function rgb2hsl(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60 } const l = (mx + mn) / 2; return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l]; }

function prep(imgBM, maxDim) {
  const iw = imgBM.width, ih = imgBM.height;
  const k = Math.min(1, maxDim / Math.max(iw, ih)), w = Math.max(16, Math.round(iw * k)), h = Math.max(16, Math.round(ih * k)), M = w * h;
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'low'; x.drawImage(imgBM, 0, 0, w, h);
  let d; try { d = x.getImageData(0, 0, w, h).data } catch (e) { d = new Uint8ClampedArray(M * 4) }
  const ch = [new Float32Array(M), new Float32Array(M), new Float32Array(M)], L = new Float32Array(M);
  for (let i = 0; i < M; i++) { ch[0][i] = d[i * 4] / 255; ch[1][i] = d[i * 4 + 1] / 255; ch[2][i] = d[i * 4 + 2] / 255 }
  for (let q = 0; q < 3; q++) { const b = blurF(ch[q], w, h, 3), a = ch[q]; for (let i = 0; i < M; i++) a[i] = clamp(a[i] + (a[i] - b[i]) * 1.4, 0, 1) }
  for (let i = 0; i < M; i++) L[i] = 0.299 * ch[0][i] + 0.587 * ch[1][i] + 0.114 * ch[2][i];
  const b6 = blurF(L, w, h, 5), b18 = blurF(L, w, h, 15), H = new Float32Array(M), NX = new Float32Array(M), NY = new Float32Array(M);
  for (let i = 0; i < M; i++) H[i] = clamp(0.5 + (L[i] - b6[i]) * 3.6 + (L[i] - b18[i]) * 1.7, 0, 1);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const p = y * w + i; NX[p] = (H[y * w + Math.min(w - 1, i + 1)] - H[y * w + Math.max(0, i - 1)]) * 6; NY[p] = (H[Math.min(h - 1, y + 1) * w + i] - H[Math.max(0, y - 1) * w + i]) * 6 }
  let sr = 0, sg = 0, sb = 0, sl = 0, n = 0; const step = Math.max(1, (M / 4000) | 0);
  for (let i = 0; i < M; i += step) { sr += ch[0][i]; sg += ch[1][i]; sb += ch[2][i]; sl += L[i]; n++ }
  const hsl = rgb2hsl(sr / n, sg / n, sb / n);
  let er = 0, eg = 0, eb = 0, ew = 0; for (let i = 0; i < M; i++) { const pr = 0.55 + 0.45 * L[i], g = 0.78 / pr; er += ch[0][i] * pr * g; eg += ch[1][i] * pr * g; eb += ch[2][i] * pr * g; ew += pr }
  const cg = [(sr / n) / (er / ew), (sg / n) / (eg / ew), (sb / n) / (eb / ew)].map(v => clamp(v, 0.45, 2.2));
  let ec = [0, 0, 0]; for (const [px, py] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = ((clamp(py + dy, 0, h - 1) * w) + clamp(px + dx, 0, w - 1)) * 4; for (let z = 0; z < 3; z++) ec[z] += d[q + z] / 36 }
  let x0 = w - 1, y0 = h - 1, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const p = y * w + i, q = p * 4, diff = Math.abs(ch[0][p] - ec[0]) + Math.abs(ch[1][p] - ec[1]) + Math.abs(ch[2][p] - ec[2]); if (diff > 0.12) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y } }
  if (x1 - x0 < w * 0.25 || y1 - y0 < h * 0.25) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1 }
  const mask = new Uint8Array(M), rad = Math.max(2, Math.min(x1 - x0, y1 - y0) * 0.012);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const dx = Math.max(x0 - i, 0, i - x1), dy = Math.max(y0 - y, 0, y - y1); mask[y * w + i] = (dx === 0 && dy === 0) || ((dx - rad) ** 2 + (dy - rad) ** 2 <= rad * rad) ? 1 : 0 }
  return { w, h, aspect: w / h, L, H, NX, NY, mask, ch, colorGain: cg, cropBox: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h], srcMean: [sr / n, sg / n, sb / n], hue: hsl[0], lum: sl / n };
}
function makeBuilder(px, target, salt) {
  const rnd = mulberry32(salt), ow = px.w, oh = px.h, order = shuffle(new Int32Array(ow * oh).map((_, i) => i), rnd);
  const arr = new Float32Array(target * STRIDE); let n = 0, idx = 0;
  function step(budgetMs) {
    const start = performance.now();
    while (idx < order.length && n < target) {
      if (performance.now() - start > budgetMs) return false;
      const p = order[idx++]; if (px.mask && !px.mask[p]) continue;
      const iy = (p / ow) | 0, ix = p - iy * ow, u = (ix + rnd()) / ow, v = (iy + rnd()) / oh;
      const lu = sample(px.L, px.w, px.h, u, v); if (lu < 0.012) continue;
      const prob = 0.55 + 0.45 * lu; if (rnd() > prob) continue;
      const f = n * STRIDE, gain = clamp(0.78 / prob, 0.6, 1.3), cg = px.colorGain || [1, 1, 1];
      arr[f] = (u - 0.5) * px.aspect * 2 + (rnd() - 0.5) * 0.0012 / px.aspect;
      arr[f + 1] = (0.5 - v) * 2 + (rnd() - 0.5) * 0.0012;
      arr[f + 2] = (sample(px.H, px.w, px.h, u, v) - 0.5) * 0.78 + (lu - 0.5) * 0.14;
      arr[f + 3] = clamp(sample(px.ch[0], px.w, px.h, u, v) * gain * cg[0], 0, 1.1);
      arr[f + 4] = clamp(sample(px.ch[1], px.w, px.h, u, v) * gain * cg[1], 0, 1.1);
      arr[f + 5] = clamp(sample(px.ch[2], px.w, px.h, u, v) * gain * cg[2], 0, 1.1);
      arr[f + 6] = rnd(); arr[f + 7] = rnd(); arr[f + 8] = rnd(); arr[f + 9] = rnd();
      arr[f + 10] = sample(px.NX, px.w, px.h, u, v); arr[f + 11] = sample(px.NY, px.w, px.h, u, v); arr[f + 12] = lu; n++;
    }
    if (n < target && n > 0) {
      const src = Math.max(1, n);
      while (n < target) { const f = n * STRIDE, s = ((rnd() * src) | 0) * STRIDE; for (let k = 0; k < STRIDE; k++) arr[f + k] = arr[s + k]; arr[f] += (rnd() - 0.5) * 0.002; arr[f + 1] += (rnd() - 0.5) * 0.002; n++ }
    }
    return n >= target;
  }
  return { step, arr, done: false };
}

self.onmessage = async e => {
  const d = e.data;
  if (d.type === 'prep') {
    try {
      const img = await createImageBitmap(new Blob([d.imageBytes], { type: 'image/jpeg' }));
      const px = prep(img, d.maxDim);
      img.close();
      const transfer = [px.L.buffer, px.H.buffer, px.NX.buffer, px.NY.buffer];
      if (px.mask) transfer.push(px.mask.buffer);
      for (const c of px.ch) transfer.push(c.buffer);
      self.postMessage({ type: 'prepDone', id: d.id, w: px.w, h: px.h, aspect: px.aspect, colorGain: px.colorGain, hue: px.hue, lum: px.lum, cropBox: px.cropBox, srcMean: px.srcMean, L: px.L, H: px.H, NX: px.NX, NY: px.NY, mask: px.mask, ch: px.ch }, transfer);
    } catch (err) { self.postMessage({ type: 'prepError', id: d.id, message: String(err) }) }
    return;
  }
  if (d.type === 'build') {
    try {
      const px = { seed: d.seed, w: d.px.w, h: d.px.h, aspect: d.px.aspect, L: d.px.L, H: d.px.H, NX: d.px.NX, NY: d.px.NY, mask: d.px.mask, ch: d.px.ch, colorGain: d.px.colorGain };
      const b = makeBuilder(px, d.target, d.salt);
      while (!b.step(4)) { /* slice 4ms */ }
      self.postMessage({ type: 'buildDone', id: d.id, kind: d.kind, target: d.target, arr: b.arr }, [b.arr.buffer]);
    } catch (err) { self.postMessage({ type: 'buildError', id: d.id, message: String(err) }) }
    return;
  }
};
