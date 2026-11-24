'use strict';
/* VOIE LACTÉE — core : math, état, parcours, caméra (sans WebGL) */
export const STRIDE = 13;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const fin = (v, d, a, b) => Number.isFinite(+v) ? clamp(+v, a, b) : d;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const r3 = v => Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000;
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function mPerspective(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), d = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * d, -1, 0, 0, 2 * f * n * d, 0]); }
export function mLookAt(eye, ctr, up) { const z = norm(sub(eye, ctr)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
export function mMul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o; }
export function mPoint(m, p) { const x = p[0], y = p[1], z = p[2], w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; }
export function catmull(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
export function catmull3(a, b, c, d, t) { return [catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t), catmull(a[2], b[2], c[2], d[2], t)]; }
export function hsl2rgb(h, s, l) { h = (h % 360) / 360; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
export function rgb2hsl(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60 } const l = (mx + mn) / 2; return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l]; }

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || innerWidth < 720;

export const DEF = {
  title: 'Sans titre', artist: 'Artiste inconnu', year: '', museum: '', movement: '',
  rights: 'Domaine public à vérifier', source: '', narrative: '', license: ''
};
export function seedOf(str) { let a = 7; for (let i = 0; i < str.length; i++) a = (a * 31 + str.charCodeAt(i)) | 0; return a >>> 0; }

export function yearOf(w) { const m = String(w.year || '').match(/\d{3,4}/); return m ? +m[0] : 2000; }
export function groupKey(w, kind) { return kind === 'artist' ? w.artist : kind === 'movement' ? (w.movement || 'Autres') : '—'; }

export function safeFrame() {
  const narrow = innerWidth < 760;
  const left = narrow ? 12 : 20, right = narrow ? 12 : 56;
  const top = narrow ? 68 : 80, bottom = narrow ? 150 : 190;
  const w = Math.max(120, innerWidth - left - right), h = Math.max(120, innerHeight - top - bottom);
  return { w, h, cx: left + w / 2, cy: top + h / 2, left, top, right, bottom };
}
export function frameDist(w) {
  const sf = safeFrame();
  const tan = Math.tan(0.85 / 2), sa = Math.max(0.4, sf.w / Math.max(1, sf.h));
  const a = fin(w.aspect, 1.35, 0.2, 30), sc = fin(w.scale, 1.36, 0.05, 20);
  return Math.max(sc / (tan * 0.78), a * sc / (tan * sa * 0.78));
}
export function faceRotation(n) {
  n = norm(n);
  return [Math.asin(clamp(n[0], -1, 1)), Math.atan2(-n[1], n[2])];
}

export function createWork(meta, img, file) {
  const id = meta.id || 'w';
  const seed = seedOf(id);
  const w = { ...DEF, ...meta, id, img, file, seed, thumb: '', prev: '', prevBytes: 0,
    loBuf: null, hiBuf: null, loCount: 0, hiCount: 0, loBuilt: false, hiBuilt: false,
    loPending: false, hiPending: false, builder: null, focus: 0, alpha: 1,
    pos: [0, 0, 0], rot: [0, 0], scale: 1.3, radius: 2, rotUser: [0, 0], userScale: 1, roll: 0,
    visible: true, hue: 210, lum: 0.5, aspect: 1.35, depthMode: 'luma', px: null, objectUrl: null, audioUrl: null };
  if (!img && meta.width && meta.height) {
    const ar = meta.width / meta.height;
    w.aspect = ar; w.scale = 1.36 / Math.pow(Math.max(0.6, ar), 0.3); w.radius = w.scale * Math.max(1, ar) * 1.05;
  }
  return w;
}

export function ordered(works) { return works.filter(w => w.visible); }

export function buildStations(works, layout) {
  const list = ordered(works);
  if (!list.length) return [];
  const n = list.length;
  let seq = list.slice();
  const actColors = {};
  if (layout === 'emotion') {
    const acts = [...new Set(seq.map(w => w.act || '—'))];
    seq.sort((a, b) => acts.indexOf(a.act || '—') - acts.indexOf(b.act || '—') || (a.order || 0) - (b.order || 0));
    acts.forEach((id, i) => { actColors[id] = { hue: i / acts.length * 360, idx: i }; });
  } else if (layout === 'chrono') seq.sort((a, b) => yearOf(a) - yearOf(b));
  else if (layout === 'artist' || layout === 'movement') {
    const groups = new Map();
    seq.forEach(w => { const k = groupKey(w, layout); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
    seq = [...groups.values()].flat();
  }
  seq.forEach(w => {
    const ar = fin(w.aspect, 1.35, 0.2, 30);
    w.scale = 1.36 / Math.pow(Math.max(0.6, ar), 0.3);
    w.radius = w.scale * Math.max(1, ar) * 1.05;
  });
  const clusters = layout === 'artist' || layout === 'movement' || layout === 'emotion';
  const maxR = Math.max(2, ...seq.map(w => fin(w.radius, 2, 0.2, 12)));
  const need = maxR * 2 * 1.32 + 3.2;
  const spacing = Math.sqrt(4 * Math.PI / Math.max(1, n));
  const R = Math.max(24, need / (spacing * 0.86));
  const ga = Math.PI * (3 - Math.sqrt(5));
  const groupIndex = new Map();
  seq.forEach(w => { const k = groupKey(w, layout); if (!groupIndex.has(k)) groupIndex.set(k, groupIndex.size); });
  const dirs = seq.map((w, i) => {
    let p;
    if (layout === 'emotion') {
      const acts = [...new Set(seq.map(x => x.act || '—'))], ai = Math.max(0, acts.indexOf(w.act || '—')), ac = Math.max(1, acts.length), a = ai / ac * TAU - 0.6;
      const center = [Math.cos(a) * 0.78, Math.sin(a * 1.3) * 0.26, Math.sin(a) * 0.78];
      const inAct = seq.slice(0, i).filter(x => (x.act || '—') === (w.act || '—')).length;
      const count = seq.filter(x => (x.act || '—') === (w.act || '—')).length;
      const localA = inAct / Math.max(1, count) * TAU, tight = 0.09 + 0.11 * Math.min(1, count / 14);
      p = norm(add(mul(center, 0.84), [Math.cos(localA) * tight, (count > 1 ? (inAct / (count - 1) - 0.5) : 0) * 0.14, Math.sin(localA) * tight]));
    } else if (clusters) {
      const g = groupIndex.get(groupKey(w, layout)), gc = Math.max(1, groupIndex.size), a = g / gc * TAU + 0.5;
      const center = [Math.cos(a) * 0.72, Math.sin(a * 1.7) * 0.35, Math.sin(a) * 0.72];
      p = norm(add(mul(center, 0.7), [Math.cos(i * ga) * 0.5, (i % 7 - 3) * 0.06, Math.sin(i * ga) * 0.5]));
    } else if (layout === 'chrono') {
      const y = n === 1 ? 0 : lerp(-0.78, 0.78, i / (n - 1)), rr = Math.sqrt(Math.max(0, 1 - y * y));
      p = norm([Math.cos(i * ga) * rr, y, Math.sin(i * ga) * rr]);
    } else {
      const y = n === 1 ? 0 : 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(Math.max(0, 1 - y * y));
      p = norm([Math.cos(i * ga) * rr, y, Math.sin(i * ga) * rr]);
    }
    return p;
  });
  const minDot = Math.cos(2 * Math.asin(clamp(need / (2 * R), 0, 0.98)));
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = dot(dirs[i], dirs[j]); if (d <= minDot) continue;
      let push = sub(dirs[i], dirs[j]);
      if (Math.hypot(...push) < 1e-6) push = [Math.sin(i * 12.9898), Math.cos(j * 78.233), Math.sin((i + j) * 4.1415)];
      const k = (d - minDot) * 0.48;
      dirs[i] = norm(add(dirs[i], mul(push, k)));
      dirs[j] = norm(sub(dirs[j], mul(push, k)));
    }
  }
  const stations = [];
  seq.forEach((w, i) => {
    const pos = mul(dirs[i], R);
    w.pos = pos; w.rot = faceRotation(mul(pos, -1)); w.rotUser = [0, 0]; w.userScale = 1;
    const view = norm(mul(w.pos, -1)), right = norm(cross(view, [0, 1, 0])), up = norm(cross(right, view));
    const fd = frameDist(w);
    const spanY = 2 * fd * Math.tan(0.85 / 2), spanX = spanY * innerWidth / Math.max(1, innerHeight);
    const sf = safeFrame();
    const dx = (sf.cx - innerWidth / 2) / innerWidth * spanX, dy = (sf.cy - innerHeight / 2) / innerHeight * spanY;
    stations.push({ k: 'approach', p: add(w.pos, mul(view, fd * 2.35)), t: add(w.pos, mul(right, dx * 0.25)), w });
    stations.push({ k: 'hold', p: add(w.pos, mul(view, fd)), t: add(add(w.pos, mul(right, dx)), mul(up, dy)), w });
    stations.push({ k: 'depart', p: add(add(w.pos, mul(view, fd * 1.5)), mul(right, fd * 0.14)), t: add(add(w.pos, mul(view, fd)), mul(right, fd * 0.04)), w });
  });
  return stations;
}

export function stationAt(stations, prog) {
  const n = stations.length; if (!n) return { p: [0, 0, 18], t: [0, 0, 0], w: null, k: '' };
  const u = clamp(prog, 0, 1) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i, a = stations[i], b = stations[Math.min(n - 1, i + 1)];
  if (f < 0.46 || i === n - 1 || a === b) return { p: a.p, t: a.t, w: a.w, k: 'hold' };
  const t = smoothstep(0.46, 1, f), d = Math.hypot(...sub(b.p, a.p)), dir = norm(sub(b.p, a.p));
  const bend = norm(cross(dir, [0, 1, 0])), arc = mul(bend, (i % 2 ? 1 : -1) * Math.min(3, d * 0.08));
  const c1 = add(add(a.p, mul(dir, d * 0.3)), arc), c2 = add(sub(b.p, mul(dir, d * 0.3)), arc);
  const bez = (p0, p1, p2, p3) => add(add(mul(p0, (1 - t) ** 3), mul(p1, 3 * (1 - t) ** 2 * t)), add(mul(p2, 3 * (1 - t) * t * t), mul(p3, t ** 3)));
  const tp = [lerp(a.t[0], b.t[0], t), lerp(a.t[1], b.t[1], t), lerp(a.t[2], b.t[2], t)];
  return { p: bez(a.p, c1, c2, b.p), t: tp, w: t < 0.48 ? a.w : b.w, k: t < 0.48 ? 'depart' : 'approach' };
}
export function chapterProgress(i, n) { return n ? clamp((i * 3 + 1.4) / Math.max(1, n * 3), 0, 1) : 0; }

export class Spring {
  constructor(v = 0, { stiffness = 0.18, damping = 0.82 } = {}) { this.v = v; this.target = v; this.stiffness = stiffness; this.damping = damping; }
  step(v) { const d = (this.target - v) * this.stiffness; this.v = this.v * this.damping + d; return v + this.v; }
  set(t) { this.target = t; }
}
