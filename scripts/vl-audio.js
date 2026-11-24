'use strict';
/* VOIE LACTÉE — son génératif Web Audio */
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.gain = null; this.filter = null;
    this.osc = []; this.noiseGain = null; this.media = null; this.mediaGain = null;
    this.lastChapter = -1; this.lastBreath = 0; this.noiseSrc = null;
    this.ready = false; this.enabled = false;
  }
  arm() {
    if (this.ctx) { this.ctx.resume?.(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
      this.gain = c.createGain(); this.gain.gain.value = 0.5;
      this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 900; this.filter.Q.value = 0.6;
      this.filter.connect(this.gain); this.gain.connect(this.master);
      [0, 1, 2].forEach(i => { const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = 110 * (i + 1); const g = c.createGain(); g.gain.value = [0.5, 0.25, 0.12][i]; o.connect(g); g.connect(this.filter); o.start(); this.osc.push(o) });
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.4;
      this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0.012; src.connect(nf); nf.connect(this.noiseGain); this.noiseGain.connect(this.master); src.start(); this.noiseSrc = src;
      this.media = new Audio(); this.media.loop = true; this.media.crossOrigin = 'anonymous';
      try { this.mediaGain = c.createMediaElementSource(this.media); this.mediaGain.connect(this.master) } catch (e) { this.media = null }
      this.ready = true;
    } catch (e) { console.warn('Audio indisponible', e) }
  }
  toggle() { if (!this.ready) this.arm(); if (!this.ctx) return; this.enabled = !this.enabled; this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0, this.ctx.currentTime, 0.35); if (!this.enabled) this.media?.pause(); else this.media?.play?.().catch(() => {}) }
  chapter(w) { if (!this.ctx || !w) return; const hue = (w.hue ?? 210), lum = (w.lum ?? 0.5); const scale = [0, 2, 3, 5, 7, 8, 10, 12], deg = scale[Math.round(hue / 360 * 7) % 8], oct = lum > 0.58 ? 2 : lum > 0.34 ? 1 : 0; const base = 82.4 * Math.pow(2, (deg + oct * 12) / 12), t = this.ctx.currentTime; this.osc.forEach((o, i) => o.frequency.setTargetAtTime(base * [1, 1.5, 2.01][i], t, 1.6)); this.filter.frequency.setTargetAtTime(500 + lum * 2600, t, 1.2); if (t - this.lastBreath > 1.2) this.breath() }
  breath() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, len = (c.sampleRate * 0.6) | 0, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = 2400; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.6); this.lastBreath = t }
  update(list, cam) { if (!this.ctx || !this.enabled) return; let near = null, nd = 1e9; for (const w of list) { const d = Math.hypot(w.pos[0] - cam[0], w.pos[1] - cam[1], w.pos[2] - cam[2]); if (d < nd) { nd = d; near = w } } if (near) this.chapter(near); const prox = 1 - smooth(4, 30, nd), t = this.ctx.currentTime; this.gain.gain.setTargetAtTime(0.10 + prox * 0.48, t, 0.5); this.noiseGain.gain.setTargetAtTime(0.004 + (1 - prox) * 0.02, t, 0.7) }
  setMediaUrl(url) { if (!this.media) return; if (url && url !== this.media._src) { this.media._src = url; this.media.src = url; if (this.enabled) this.media.play().catch(() => {}) } else if (!url && this.media._src) { this.media._src = ''; this.media.pause(); this.media.removeAttribute('src') } }
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t) }
