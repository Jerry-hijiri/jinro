// BGMと効果音（すべてWeb Audioでその場で合成。音源ファイルなし）
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.track = null;
    this.want = null;
    let p = {};
    try { p = JSON.parse(localStorage.getItem('mj-audio') || '{}'); } catch {}
    this.bgmOn = p.bgmOn ?? true;
    this.sfxOn = p.sfxOn ?? true;
    this.bgmVol = p.bgmVol ?? 0.6;
    this.sfxVol = p.sfxVol ?? 0.8;
  }
  savePrefs() {
    try { localStorage.setItem('mj-audio', JSON.stringify({ bgmOn: this.bgmOn, sfxOn: this.sfxOn, bgmVol: this.bgmVol, sfxVol: this.sfxVol })); } catch {}
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 4;
    this.master.connect(ctx.destination);
    this.bgm = ctx.createGain(); this.bgm.gain.value = this.bgmOn ? this.bgmVol * 0.5 : 0; this.bgm.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? this.sfxVol : 0; this.sfx.connect(this.master);
    // リバーブ（減衰ノイズのインパルス）
    this.rev = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev.buffer = ir;
    this.revOut = ctx.createGain(); this.revOut.gain.value = 0.55;
    this.rev.connect(this.revOut); this.revOut.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.sched = setInterval(() => this.tick(), 40);
    if (this.want) { const w = this.want; this.want = null; this.play(w); }
  }

  setBgm(on) { this.bgmOn = on; this.savePrefs(); if (this.bgm) this.bgm.gain.setTargetAtTime(on ? this.bgmVol * 0.5 : 0, this.ctx.currentTime, 0.3); }
  setSfx(on) { this.sfxOn = on; this.savePrefs(); if (this.sfx) this.sfx.gain.setTargetAtTime(on ? this.sfxVol : 0, this.ctx.currentTime, 0.05); }
  setBgmVol(v) { this.bgmVol = v; this.savePrefs(); if (this.bgm && this.bgmOn) this.bgm.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1); }
  setSfxVol(v) { this.sfxVol = v; this.savePrefs(); if (this.sfx && this.sfxOn) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /* ---------- 部品 ---------- */
  env(g, t, a, peak, d, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
  }
  tone(freq, t, dur, o = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    this.env(g, t, o.a ?? 0.01, o.gain ?? 0.2, dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q ?? 0.7; osc.connect(f); node = f; }
    node.connect(g);
    const dest = o.dest || this.bgmBus || this.bgm;
    g.connect(dest);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.rev); }
    osc.start(t); osc.stop(t + (o.a ?? 0.01) + dur + 0.05);
    return osc;
  }
  noise(t, dur, o = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f ?? 1000, t); f.Q.value = o.q ?? 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = ctx.createGain(); this.env(g, t, o.a ?? 0.005, o.gain ?? 0.3, dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.rev); }
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  }

  /* ---------- BGM ---------- */
  play(name) {
    if (!this.ctx) { this.want = name; return; }
    if (this.track?.name === name) return;
    this.stopTrack();
    if (!name) return;
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.bgm);
    bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
    const tr = { name, bus, step: 0, next: ctx.currentTime + 0.15, nodes: [], spec: TRACKS[name] };
    this.track = tr;
    this.bgmBus = bus;
    tr.spec.setup?.(this, tr);
  }
  stopTrack() {
    const tr = this.track;
    if (!tr) return;
    const t = this.ctx.currentTime;
    tr.bus.gain.cancelScheduledValues(t);
    tr.bus.gain.setValueAtTime(tr.bus.gain.value, t);
    tr.bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    setTimeout(() => { tr.nodes.forEach((n) => { try { n.stop(); } catch {} }); tr.bus.disconnect(); }, 2200);
    this.track = null;
  }
  tick() {
    const tr = this.track;
    if (!tr || !this.ctx) return;
    const spt = 60 / tr.spec.bpm / 2;
    while (tr.next < this.ctx.currentTime + 0.25) {
      this.bgmBus = tr.bus;
      tr.spec.step(this, tr.step, tr.next, spt, tr);
      tr.step++;
      tr.next += spt;
    }
  }
  drone(tr, freqs, lp = 380, gain = 0.07, type = 'sawtooth') {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = lp * 0.45; lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = gain;
    f.connect(g); g.connect(tr.bus);
    const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(this.rev);
    lfo.start(); tr.nodes.push(lfo);
    for (const fr of freqs) for (const dt of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = dt; o.connect(f); o.start(); tr.nodes.push(o);
    }
  }
  wind(tr, gain = 0.05) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(tr.bus);
    src.start(); lfo.start(); tr.nodes.push(src, lfo);
  }

  /* ---------- 効果音 ---------- */
  sfxPlay(name) {
    if (!this.ctx || !this.sfxOn) return;
    const f = SFX[name];
    if (f) f(this, this.ctx.currentTime + 0.02);
  }
}

// 音階（Dナチュラルマイナー）
const DMIN = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81];
const PENTA = [60, 62, 65, 67, 69, 72, 74, 77, 79, 81];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

const TRACKS = {
  title: {
    bpm: 66,
    setup(s, tr) { s.drone(tr, [NOTE(38), NOTE(45)], 320, 0.05); s.wind(tr, 0.025); },
    step(s, i, t, spt) {
      // オルゴールの主題（Dマイナー）
      const motif = [74, null, 77, 76, 74, null, 69, null, 70, null, 69, 67, 65, null, 62, null, 74, null, 77, 79, 81, null, 77, null, 76, 74, 73, null, 74, null, null, null];
      const m = motif[i % motif.length];
      if (m) s.tone(NOTE(m + 12), t, 1.6, { type: 'sine', gain: 0.06, a: 0.004, rev: 0.6 });
      if (m && i % 4 === 0) s.tone(NOTE(m), t, 1.8, { type: 'triangle', gain: 0.03, rev: 0.5 });
      if (i % 16 === 0) s.tone(NOTE(38), t, 4, { type: 'sine', gain: 0.12, a: 0.3 });
    },
  },
  night: {
    bpm: 56,
    setup(s, tr) { s.drone(tr, [NOTE(38), NOTE(45), NOTE(50)], 300, 0.055); s.wind(tr, 0.04); tr.pos = 4; },
    step(s, i, t, spt, tr) {
      if (i % 2 === 0 && Math.random() < 0.55) {
        tr.pos = Math.max(0, Math.min(DMIN.length - 1, tr.pos + rnd([-2, -1, -1, 1, 1, 2])));
        s.tone(NOTE(DMIN[tr.pos]), t, 2.4, { type: 'triangle', gain: 0.05, a: 0.02, rev: 0.8, lp: 2200 });
      }
      if (i % 32 === 0) s.tone(NOTE(26), t, 6, { type: 'sine', gain: 0.16, a: 1.2 });
      if (i % 32 === 16 && Math.random() < 0.6) s.tone(NOTE(rnd([86, 89, 93])), t, 3, { type: 'sine', gain: 0.02, a: 0.5, rev: 1 });
      if (i % 16 === 8) { s.noise(t, 0.25, { ft: 'lowpass', f: 120, gain: 0.05, dest: s.bgmBus }); }
    },
  },
  day: {
    bpm: 84,
    setup(s, tr) { tr.pos = 4; },
    step(s, i, t, spt, tr) {
      const chords = [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]];
      const ch = chords[Math.floor(i / 16) % chords.length];
      if (i % 16 === 0) ch.forEach((n) => s.tone(NOTE(n), t, spt * 15, { type: 'triangle', gain: 0.035, a: 0.6, lp: 1400, rev: 0.4 }));
      if (i % 16 === 0) s.tone(NOTE(ch[0] - 12), t, spt * 7, { type: 'sine', gain: 0.1, a: 0.05 });
      if (i % 16 === 8) s.tone(NOTE(ch[0] - 12), t, spt * 6, { type: 'sine', gain: 0.07, a: 0.05 });
      if (Math.random() < (i % 2 === 0 ? 0.6 : 0.2)) {
        tr.pos = Math.max(0, Math.min(PENTA.length - 1, tr.pos + rnd([-1, -1, 1, 1, 2, -2])));
        s.tone(NOTE(PENTA[tr.pos] + 12), t, 0.6, { type: 'triangle', gain: 0.04, a: 0.004, rev: 0.35 });
      }
      if (i % 4 === 2) s.noise(t, 0.04, { ft: 'highpass', f: 7000, gain: 0.015, dest: s.bgmBus });
    },
  },
  vote: {
    bpm: 104,
    setup(s, tr) { s.drone(tr, [NOTE(38)], 260, 0.05); },
    step(s, i, t, spt) {
      if (i % 2 === 0) s.tone(NOTE(38), t, 0.25, { type: 'sine', gain: 0.22, glide: NOTE(31) });
      s.noise(t, 0.03, { ft: 'highpass', f: i % 2 ? 5000 : 8000, gain: i % 2 ? 0.02 : 0.04, dest: s.bgmBus });
      const ost = [62, 65, 64, 62, 61, 62, 65, 69];
      if (i % 2 === 0) s.tone(NOTE(ost[(i / 2) % 8] - 12), t, spt * 1.8, { type: 'sawtooth', gain: 0.03, lp: 900, a: 0.02 });
      if (i % 32 === 0) s.tone(NOTE(74), t, spt * 30, { type: 'sawtooth', gain: 0.015, lp: 1800, a: 2, rev: 0.6 });
      if (i % 32 === 16) s.tone(NOTE(75), t, spt * 14, { type: 'sawtooth', gain: 0.015, lp: 1800, a: 1, rev: 0.6 });
    },
  },
  endVillage: {
    bpm: 72,
    setup() {},
    step(s, i, t, spt) {
      const seq = [[62, 66, 69], [67, 71, 74], [64, 67, 71], [69, 73, 76]];
      const ch = seq[Math.floor(i / 8) % 4];
      if (i % 8 === 0) ch.forEach((n) => s.tone(NOTE(n), t, spt * 8, { type: 'triangle', gain: 0.045, a: 0.3, rev: 0.6 }));
      if (i % 2 === 0) s.tone(NOTE(ch[(i / 2) % 3] + 12), t, 0.9, { type: 'sine', gain: 0.05, rev: 0.6 });
      if (i % 8 === 0) s.tone(NOTE(ch[0] - 24), t, spt * 7, { type: 'sine', gain: 0.12 });
    },
  },
  endWolf: {
    bpm: 60,
    setup(s, tr) { s.drone(tr, [NOTE(38), NOTE(44)], 420, 0.06); s.wind(tr, 0.05); },
    step(s, i, t, spt) {
      const ch = [[50, 53, 56], [49, 52, 56]][Math.floor(i / 16) % 2];
      if (i % 16 === 0) ch.forEach((n) => s.tone(NOTE(n), t, spt * 15, { type: 'sawtooth', gain: 0.025, lp: 900, a: 1, rev: 0.8 }));
      if (i % 8 === 0) s.tone(NOTE(26), t, 2, { type: 'sine', gain: 0.18, a: 0.01, glide: NOTE(22) });
      if (i % 32 === 24) SFX.howl(s, t, true);
    },
  },
};

const SFX = {
  growl(s, t) {
    const ctx = s.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + 0.6); o.frequency.linearRampToValueAtTime(60, t + 1.4);
    const am = ctx.createOscillator(); am.frequency.value = 23; const ag = ctx.createGain(); ag.gain.value = 0.5; am.connect(ag);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); ag.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    o.connect(f); f.connect(g); g.connect(s.sfx);
    o.start(t); am.start(t); o.stop(t + 1.6); am.stop(t + 1.6);
    s.noise(t, 1.3, { ft: 'bandpass', f: 300, q: 2, gain: 0.12 });
  },
  gore(s, t) {
    for (let i = 0; i < 4; i++) s.noise(t + i * 0.07 + Math.random() * 0.05, 0.18, { ft: 'lowpass', f: 900 - i * 120, f2: 200, gain: 0.35 });
    s.noise(t + 0.25, 0.8, { ft: 'bandpass', f: 1800, f2: 600, q: 0.8, gain: 0.08 });
  },
  blade(s, t) {
    s.noise(t, 0.24, { ft: 'bandpass', f: 2500, f2: 8000, q: 2, gain: 0.35 });
    s.tone(1800, t, 0.22, { type: 'sawtooth', gain: 0.04, dest: s.sfx, glide: 400, lp: 4000 });
  },
  thud(s, t) {
    s.tone(85, t, 0.9, { type: 'sine', gain: 0.85, dest: s.sfx, glide: 28 });
    s.noise(t, 0.4, { ft: 'lowpass', f: 1600, f2: 120, gain: 0.7, rev: 0.7 });
    s.tone(320, t, 0.5, { type: 'square', gain: 0.05, dest: s.sfx, glide: 90, lp: 1200 });
  },
  crowd(s, t) {
    for (let i = 0; i < 5; i++) s.noise(t + i * 0.15, 2.2, { ft: 'bandpass', f: 500 + i * 140, q: 1.5, gain: 0.05, a: 0.4 });
  },
  click(s, t) { s.tone(1400, t, 0.05, { type: 'square', gain: 0.03, dest: s.sfx, lp: 3000 }); },
  select(s, t) { s.tone(880, t, 0.12, { type: 'triangle', gain: 0.08, dest: s.sfx }); s.tone(1320, t + 0.05, 0.15, { type: 'triangle', gain: 0.06, dest: s.sfx }); },
  confirm(s, t) { [660, 880, 1320].forEach((f, i) => s.tone(f, t + i * 0.07, 0.4, { type: 'sine', gain: 0.08, dest: s.sfx, rev: 0.3 })); },
  join(s, t) { [523, 784].forEach((f, i) => s.tone(f, t + i * 0.09, 0.5, { type: 'triangle', gain: 0.07, dest: s.sfx, rev: 0.3 })); },
  reveal(s, t) {
    for (let i = 0; i < 7; i++) s.tone(NOTE(74 + i * 3), t + i * 0.05, 0.9, { type: 'sine', gain: 0.04, dest: s.sfx, rev: 0.7 });
    s.noise(t, 0.6, { ft: 'highpass', f: 4000, f2: 9000, gain: 0.05, rev: 0.5 });
  },
  howl(s, t, quiet = false) {
    const ctx = s.ctx;
    const g0 = quiet ? 0.05 : 0.16;
    for (const [off, base, pan] of [[0, 1, -0.3], [0.6, 1.19, 0.35]]) {
      const tt = t + off;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'sine';
      const fr = [[0, 320], [0.35, 600], [1.6, 560], [2.6, 380]];
      for (const osc of [o, o2]) {
        osc.frequency.setValueAtTime(fr[0][1] * base, tt);
        fr.slice(1).forEach(([d, f]) => osc.frequency.linearRampToValueAtTime(f * base, tt + d));
      }
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5;
      const vg = ctx.createGain(); vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(g0, tt + 0.3);
      g.gain.setValueAtTime(g0, tt + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.8);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(bp); o2.connect(g); bp.connect(g);
      const dest = quiet ? s.bgmBus || s.bgm : s.sfx;
      if (p) { p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
      const sg = ctx.createGain(); sg.gain.value = 0.8; g.connect(sg); sg.connect(s.rev);
      [o, o2, vib].forEach((x) => { x.start(tt); x.stop(tt + 3); });
    }
  },
  slash(s, t) {
    for (let i = 0; i < 3; i++) {
      s.noise(t + i * 0.16, 0.22, { ft: 'bandpass', f: 7000, f2: 1200, q: 1.2, gain: 0.45 });
      s.tone(180, t + i * 0.16, 0.18, { type: 'sawtooth', gain: 0.12, dest: s.sfx, glide: 60, lp: 600 });
    }
  },
  impact(s, t) {
    s.tone(110, t, 0.7, { type: 'sine', gain: 0.6, dest: s.sfx, glide: 35 });
    s.noise(t, 0.5, { ft: 'lowpass', f: 900, f2: 100, gain: 0.5, rev: 0.6 });
  },
  heartbeat(s, t) {
    for (let k = 0; k < 4; k++) {
      const tt = t + k * 0.85;
      s.tone(62, tt, 0.18, { type: 'sine', gain: 0.5, dest: s.sfx, glide: 40 });
      s.tone(58, tt + 0.22, 0.2, { type: 'sine', gain: 0.38, dest: s.sfx, glide: 38 });
    }
  },
  drumroll(s, t) {
    let tt = t;
    for (let i = 0; i < 34; i++) {
      const gap = 0.09 - i * 0.0012;
      s.noise(tt, 0.06, { ft: 'bandpass', f: 220 + i * 6, q: 0.8, gain: 0.08 + i * 0.008 });
      tt += gap;
    }
  },
  stamp(s, t) {
    s.tone(90, t, 0.9, { type: 'sine', gain: 0.7, dest: s.sfx, glide: 30 });
    s.noise(t, 0.35, { ft: 'lowpass', f: 2500, f2: 200, gain: 0.6, rev: 0.8 });
    s.tone(NOTE(38), t, 2.5, { type: 'sawtooth', gain: 0.08, dest: s.sfx, lp: 500, rev: 0.8 });
    s.tone(NOTE(44), t, 2.5, { type: 'sawtooth', gain: 0.06, dest: s.sfx, lp: 500, rev: 0.8 });
  },
  bell(s, t) {
    for (const [k, f] of [[0, 523], [1.3, 659]]) {
      [1, 2.76, 5.4, 8.93].forEach((m, i) => s.tone(f * m, t + k, 3.5 / (i + 1), { type: 'sine', gain: 0.1 / (i + 1), dest: s.sfx, rev: 0.7, a: 0.003 }));
    }
    for (let i = 0; i < 6; i++) {
      const tt = t + 0.6 + Math.random() * 2.5;
      s.tone(3200 + Math.random() * 1500, tt, 0.08, { type: 'sine', gain: 0.025, dest: s.sfx, glide: 2400 + Math.random() * 800 });
    }
  },
  night(s, t) {
    s.tone(NOTE(50), t, 3, { type: 'sine', gain: 0.12, dest: s.sfx, rev: 0.9, a: 0.4 });
    s.tone(NOTE(57), t + 0.3, 3, { type: 'sine', gain: 0.08, dest: s.sfx, rev: 0.9, a: 0.4 });
    s.tone(NOTE(65), t + 0.6, 3, { type: 'sine', gain: 0.06, dest: s.sfx, rev: 0.9, a: 0.4 });
  },
  fanfare(s, t) {
    [[62, 0], [66, 0.18], [69, 0.36], [74, 0.6]].forEach(([n, d]) => {
      s.tone(NOTE(n), t + d, 1.4, { type: 'sawtooth', gain: 0.06, dest: s.sfx, lp: 2400, rev: 0.5 });
      s.tone(NOTE(n + 12), t + d, 1.2, { type: 'triangle', gain: 0.05, dest: s.sfx, rev: 0.5 });
    });
  },
  doom(s, t) {
    [38, 41, 44].forEach((n, i) => s.tone(NOTE(n), t + i * 0.25, 3, { type: 'sawtooth', gain: 0.07, dest: s.sfx, lp: 700, rev: 0.9, a: 0.1 }));
    s.tone(55, t, 2, { type: 'sine', gain: 0.5, dest: s.sfx, glide: 30 });
  },
  fox(s, t) {
    for (let i = 0; i < 9; i++) s.tone(NOTE(rnd([74, 77, 81, 84, 86])), t + i * 0.11, 0.8, { type: 'sine', gain: 0.05, dest: s.sfx, rev: 0.8 });
  },
};

export const sound = new Sound();
