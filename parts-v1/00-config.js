// 00-config.js — shared constants + utilities (owner: architect). See contracts.md.
// Pure: no DOM/window access at evaluation time. Every browser API is guarded so this file
// also loads in Node. Top-level names exported to the shared scope:
//   U, M4, Spring, FixedStep, CFG, EX, KIND, FLAG, EV, VOICE, PLUCK, SRC, STATUS, Store

// ---------------------------------------------------------------- utilities
const U = (() => {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = lerp;
  const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
  const remap = (x, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, x));
  const smoothstep = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const fract = (x) => x - Math.floor(x);
  const mod = (x, m) => ((x % m) + m) % m;
  // Frame-rate independent exponential approach: rate lambda (1/s), dt in seconds.
  const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  // Easing (input clamped to [0,1]).
  const ease = {
    linear: (x) => sat(x),
    smooth: (x) => { x = sat(x); return x * x * (3 - 2 * x); },
    inQuad: (x) => { x = sat(x); return x * x; },
    outQuad: (x) => { x = sat(x); return 1 - (1 - x) * (1 - x); },
    inOutQuad: (x) => { x = sat(x); return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x); },
    outCubic: (x) => { x = 1 - sat(x); return 1 - x * x * x; },
    inOutCubic: (x) => { x = sat(x); return x < 0.5 ? 4 * x * x * x : 1 - 4 * (1 - x) * (1 - x) * (1 - x); },
    inOutSine: (x) => 0.5 - 0.5 * Math.cos(Math.PI * sat(x)),
    outBack: (x) => { x = sat(x) - 1; const c = 1.70158; return 1 + (c + 1) * x * x * x + c * x * x; },
    // Spec §5.4 knit curve: 1 − 2^(−9x)·cos(7.5x). ~7% overshoot near x≈0.42; exactly 1 at x ≥ 1.
    elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(2, -9 * x) * Math.cos(7.5 * x)),
  };

  // Seeded PRNG (mulberry32). rng(seed)() -> [0,1)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Integer hash (lowbias32) -> uint32; hash01 -> [0,1)
  function hash32(x) {
    x = x >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }
  const hash01 = (x) => hash32(x) / 4294967296;
  const hash2 = (a, b) => hash32((a >>> 0) ^ hash32((b >>> 0) + 0x9e3779b9));
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Colour: '#RGB' | '#RRGGBB' | '#RRGGBBAA' -> [r,g,b,a] in sRGB 0..1
  function hex(h) {
    let s = String(h).replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = (i) => parseInt(s.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), s.length >= 8 ? n(6) : 1];
  }
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function hexLin(h) { const c = hex(h); return [toLin(c[0]), toLin(c[1]), toLin(c[2])]; }
  // Flatten a hex list into a Float32Array of rgb triples (linear if lin=true, else sRGB).
  function palette(list, lin, size) {
    const n = size || list.length;
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = hex(list[Math.min(i, list.length - 1)]);
      out[i * 3] = lin ? toLin(c[0]) : c[0];
      out[i * 3 + 1] = lin ? toLin(c[1]) : c[1];
      out[i * 3 + 2] = lin ? toLin(c[2]) : c[2];
    }
    return out;
  }

  // Audio helpers
  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const dbToGain = (db) => Math.pow(10, db / 20);
  const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
  const pc = (midi) => mod(Math.round(midi), 12);

  // performance clock (ms). Falls back to Date in exotic hosts.
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const noop = () => {};

  return {
    clamp, sat, lerp, mix, invLerp, remap, smoothstep, fract, mod, damp, TAU, DEG, ease,
    rng, hash32, hash01, hash2, fnv1a, hex, toLin, toSrgb, hexLin, palette,
    midiToHz, dbToGain, gainToDb, pc, now, noop,
  };
})();

// ---------------------------------------------------------------- 4x4 matrices (column-major, GL convention)
const M4 = (() => {
  const create = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }
  // eye/target/up: arrays [x,y,z]. Produces a view matrix.
  function lookAt(out, eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    const ux = up ? up[0] : 0, uy = up ? up[1] : 1, uz = up ? up[2] : 0;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }
  // out = a * b  (out may alias a or b)
  const _t = new Float32Array(16);
  function mul(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      _t[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      _t[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      _t[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      _t[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    out.set(_t);
    return out;
  }
  function invert(out, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }
  // Project world (x,y,z) by a view-projection matrix. Writes out[0]=ndcX, out[1]=ndcY, out[2]=clip w
  // (= view depth for a perspective matrix). Returns w; w <= 0 means behind the camera (ndc invalid).
  function project(m, x, y, z, out) {
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    out[2] = cw;
    if (cw > 1e-6) { out[0] = cx / cw; out[1] = cy / cw; } else { out[0] = 0; out[1] = 0; }
    return cw;
  }
  return { create, perspective, lookAt, mul, invert, project };
})();

// ---------------------------------------------------------------- springs + fixed-step clock
// x'' = ω²(T − x) − 2ζω x'. Integrated ANALYTICALLY per substep (exact, unconditionally stable).
// zeta = 1 critically damped (default), < 1 underdamped wobble, > 1 overdamped.
class Spring {
  constructor(x = 0, omega = 4, zeta = 1) {
    this.x = x; this.v = 0; this.target = x; this.omega = omega; this.zeta = zeta; this._acc = 0;
  }
  set(x) { this.x = x; this.target = x; this.v = 0; return this; }   // snap, no motion
  to(target) { this.target = target; return this; }                  // retarget, keeps velocity
  kick(dv) { this.v += dv; return this; }
  step(h) {                                                           // advance exactly h seconds
    const w = this.omega, z = this.zeta, T = this.target;
    if (!(w > 0) || !(h > 0)) return this;
    const x0 = this.x - T, v0 = this.v;
    if (z === 1) {
      const e = Math.exp(-w * h), c2 = v0 + w * x0;
      this.x = T + (x0 + c2 * h) * e;
      this.v = (c2 - w * (x0 + c2 * h)) * e;
    } else if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * h);
      const c = Math.cos(wd * h), s = Math.sin(wd * h), c2 = (v0 + z * w * x0) / wd;
      this.x = T + e * (x0 * c + c2 * s);
      this.v = e * ((-z * w * x0 + wd * c2) * c + (-z * w * c2 - wd * x0) * s);
    } else {
      const r = w * Math.sqrt(z * z - 1), r1 = -z * w + r, r2 = -z * w - r;
      const A = (v0 - r2 * x0) / (r1 - r2), B = x0 - A, e1 = Math.exp(r1 * h), e2 = Math.exp(r2 * h);
      this.x = T + A * e1 + B * e2;
      this.v = r1 * A * e1 + r2 * B * e2;
    }
    if (!Number.isFinite(this.x) || !Number.isFinite(this.v)) { this.x = T; this.v = 0; }
    return this;
  }
  // Convenience for code not on the shared 120 Hz clock: internal fixed substeps (max 6/frame).
  update(dt) {
    this._acc += dt;
    let n = Math.floor(this._acc / CFG.SPRING.SUBSTEP);
    if (n > CFG.SPRING.MAX_SUBSTEPS) { n = CFG.SPRING.MAX_SUBSTEPS; this._acc = 0; } else this._acc -= n * CFG.SPRING.SUBSTEP;
    for (let i = 0; i < n; i++) this.step(CFG.SPRING.SUBSTEP);
    return this;
  }
  settled(eps = 1e-3) { return Math.abs(this.x - this.target) < eps && Math.abs(this.v) < eps * 10; }
  // ω so a critically damped spring settles to ~1% in `sec` seconds ((1+ωt)e^−ωt = 0.01 → ωt ≈ 6.64).
  static omegaForSettle(sec) { return 6.64 / Math.max(1e-3, sec); }
}

// Shared fixed-step accumulator: n = clock.advance(dtSeconds); then call spring.step(clock.h) n times.
class FixedStep {
  constructor(h, max) { this.h = h || 1 / 120; this.max = max || 6; this.acc = 0; }
  advance(dt) {
    this.acc += Math.max(0, dt);
    let n = Math.floor(this.acc / this.h);
    if (n > this.max) { n = this.max; this.acc = 0; } else this.acc -= n * this.h;
    return n;
  }
  reset() { this.acc = 0; }
}

// ---------------------------------------------------------------- enums
const EX = Object.freeze({ MERIDIAN: 0, TIDE: 1, LONG: 2, COUNT: 3 });

// a_info.y — per-point kind (selects the shader's kind transform).
const KIND = Object.freeze({
  STATIC: 0, FLOOR_H: 1, FLOOR_V: 2, MTN_BACK: 3, SUN: 4, CLOCK_H: 5, CLOCK_M: 6, STAR: 7,
  SEA: 8, LH_BEAM: 9, PLANET: 10, GALAXY: 11, PROBE: 12, WINDOW: 13,
});

// a_info.z — per-point flag bits.
const FLAG = Object.freeze({
  BLANK: 1, ANCHOR: 2, DWELL: 4, SECRET: 8, RESONATOR: 16, BILLBOARD: 32, BLINK: 64, RESERVED: 128,
});

// Event-bus types (Sound.pollEvents). v0/v1 meanings in contracts.md §3.4.
const EV = Object.freeze({
  KICK: 1, SNARE: 2, HAT: 3, BAR: 4, CHORD: 5, KNIT_LAND: 6, GHOST_PLUCK: 7,
  DOWNBEAT: 8, HS_DIGIT: 9, HS_GLIDE: 10, TOM: 11,
});

// Resonator chime voices (wire.res.voice[r] -> Sound.chime(voice, …)).
const VOICE = Object.freeze({ SUN: 0, CLOCK: 1, BILLBOARD: 2, WINDOW: 3, MAST: 4 });

// Sound.pluck flags.
const PLUCK = Object.freeze({ STRUM: 1, GHOST: 2, JUNE: 4, NO_ENERGY: 8, LIGHTHOUSE: 16 });

// GHOST_PLUCK event v1 (source tag) conventions.
const SRC = Object.freeze({ GHOST0: 0, GHOST1: 1, GHOST2: 2, JUNE: 3, LIGHTHOUSE: 4, OTHER: 5 });

// UI.setStatus modes.
const STATUS = Object.freeze({
  ONHOOK: 'onhook', HANDSHAKE: 'handshake', PLAY: 'play', MUTED: 'muted', SLOW: 'slow',
  PARTY: 'party', DESK: 'desk', RETRACE: 'retrace',
});

// ---------------------------------------------------------------- configuration
const CFG = (() => {
  const D = U.DEG;

  // ---- UI / composite colours (non-world). hex + linear rgb.
  const COL_HEX = {
    void: '#05030A', glass: '#0B0718', wall: '#07060C', bezel: '#14111C', panel: '#0D0A1FC7',
    uiText: '#D8FBFF', uiDim: '#8A86B8', focus: '#3DF5FF', accent: '#FF3D9A', warn: '#FFC861',
    ghost: '#BFEFFF', june: '#FFC861', reticle: '#3DF5FF',
    konamiTop: '#FF4FD8', konamiMid: '#3DF5FF', konamiBot: '#FFD15C',
    slowHead: '#FF5FB0', slowTail: '#19C8B4',
  };
  const COL = { hex: COL_HEX, lin: {}, srgb: {} };
  for (const k in COL_HEX) { COL.lin[k] = U.hexLin(COL_HEX[k]); COL.srgb[k] = U.hex(COL_HEX[k]).slice(0, 3); }

  // ---- Exchanges. Palette slots are per exchange (16 max); slot meaning via `col` names.
  // Shader colour rule (all exchanges): rgb = mix(pal[c], pal[min(c+1,15)], g) where c = a_info.x and
  // g = a_nrm.w*0.5+0.5 (gradient factor; 0 for solid colours). So ramps use ADJACENT slots.
  function makeExchange(o) {
    const n = 16;
    o.palHex = o.palHex.slice();
    while (o.palHex.length < n) o.palHex.push(o.palHex[o.palHex.length - 1]);
    o.pal = U.palette(o.palHex, false, n);       // sRGB 0..1, Float32Array(48) — for Canvas2D / CSS-ish use
    o.palLin = U.palette(o.palHex, true, n);     // linear, Float32Array(48) — upload as uniform vec3[16]
    o.heat = U.hexLin(o.heatHex);                // linear rgb, heat flash colour
    o.core = U.hexLin(o.coreHex);                // linear rgb, white-hot core (heat > 0.7)
    o.decayVec = new Float32Array(o.decay);      // per-60Hz-frame persistence decay
    // chord safe-tone lists (chord tones ∩ scale, in role order) — never empty
    const scalePcs = o.scale.map((s) => (o.rootPc + s) % 12);
    o.scalePcs = scalePcs;
    for (const ch of o.progression) {
      ch.safe = ch.tones.filter((t) => scalePcs.indexOf(t) >= 0);
      if (!ch.safe.length) ch.safe = [o.rootPc];
    }
    return Object.freeze(o);
  }

  const MERIDIAN = makeExchange({
    id: EX.MERIDIAN, key: 'meridian', name: 'MERIDIAN', title: 'Meridian', number: '555-0185',
    digits: '5550185', altDigits: ['15550185'], foundKey: null,
    // A minor hexatonic A B C D E G; degree d -> root + 12*floor(d/6) + scale[d%6]
    scale: [0, 2, 3, 5, 7, 10], root: 45, rootPc: 9, mode: 'A minor',
    progression: [
      { name: 'Am9', rootPc: 9, tones: [9, 0, 4, 7, 11], pad: [57, 60, 64, 71], bass: 45 },
      { name: 'Fmaj7', rootPc: 5, tones: [5, 9, 0, 4], pad: [53, 57, 60, 64], bass: 41 },
      { name: 'Cmaj7', rootPc: 0, tones: [0, 4, 7, 11], pad: [55, 59, 60, 64], bass: 48 },
      { name: 'G6', rootPc: 7, tones: [7, 11, 2, 4], pad: [55, 59, 62, 64], bass: 43 },
    ],
    call: [4, 7, 9, 0, 11],          // THE CALL pitch classes: E G A C B
    callResolve: 9,                  // music-box resolution pc (A)
    reverb: 'hall', pluckVoice: 'ks', drums: 'full',
    palHex: [
      '#E62CFF', '#FF3D9A',            // 0 floorNear, 1 floorFar   (ramp 0->1 by depth)
      '#FFD15C', '#FF7A3D', '#FF2E88', // 2 sunTop, 3 sunMid, 4 sunBottom (ramps 2->3, 3->4 by y)
      '#7B4DFF', '#3DF5FF',            // 5 mtnBack, 6 mtnFront
      '#5B3DFF', '#3DF5FF', '#FF3D9A', // 7 skyFar, 8 skyMid, 9 skyNear
      '#FFF2FA', '#FFC861', '#CFE9FF', // 10 text, 11 window, 12 star
      '#3DF5FF', '#FF3D9A', '#FFF2FA', // 13 mast, 14 payphone, 15 clock
    ],
    col: { FLOOR_NEAR: 0, FLOOR_FAR: 1, SUN_TOP: 2, SUN_MID: 3, SUN_BOTTOM: 4, MTN_BACK: 5, MTN_FRONT: 6,
      SKY_FAR: 7, SKY_MID: 8, SKY_NEAR: 9, TEXT: 10, WINDOW: 11, STAR: 12, MAST: 13, PAYPHONE: 14, CLOCK: 15 },
    heatHex: '#FF5FB0', coreHex: '#FFF4FB',
    decay: [0.78, 0.935, 0.885], afterglowHex: '#19C8B4',
    camera: { eye: [0, 1.6, 6], target: [0, 5.5, -60], horizon: true, swayAmp: 0, swayPeriod: 0 },
    sign: ['MERIDIAN', '555-0185'],
    seed: 0x0185,
  });

  const TIDE = makeExchange({
    id: EX.TIDE, key: 'tide', name: 'TIDE LINE', title: 'Tide Line', number: '555-0127',
    digits: '5550127', altDigits: ['15550127'], foundKey: 'tide',
    // D Dorian hexatonic D E F G A C
    scale: [0, 2, 3, 5, 7, 10], root: 38, rootPc: 2, mode: 'D Dorian',
    progression: [
      { name: 'Dm9', rootPc: 2, tones: [2, 5, 9, 0, 4], pad: [53, 57, 60, 64], bass: 38 },
      { name: 'G9', rootPc: 7, tones: [7, 11, 2, 5, 9], pad: [53, 57, 59, 62], bass: 43 },
      { name: 'Am7', rootPc: 9, tones: [9, 0, 4, 7], pad: [55, 60, 64, 69], bass: 45 },
      { name: 'Cmaj7', rootPc: 0, tones: [0, 4, 7, 11], pad: [52, 55, 59, 60], bass: 48 },
    ],
    call: [9, 0, 2, 5, 4],           // A C D F E
    callResolve: 2,
    reverb: 'sea', pluckVoice: 'ks', drums: 'half',
    palHex: [
      '#FFB347', '#FFE3A3',            // 0 sea, 1 crest   (ramp 0->1: far->near / crest highlight)
      '#FFF0C9', '#FF8A1F', '#FFF7E0', // 2 moon, 3 lighthouse, 4 beam
      '#B34A00', '#FFE3A3', '#FFF0C9', // 5 cliff/rocks (trail tone), 6 text, 7 star
      '#FFB347',                       // 8 ship
    ],
    col: { SEA: 0, CREST: 1, MOON: 2, LIGHTHOUSE: 3, BEAM: 4, CLIFF: 5, TEXT: 6, STAR: 7, SHIP: 8 },
    heatHex: '#FFE3A3', coreHex: '#FFF7E0',
    decay: [0.94, 0.87, 0.70], afterglowHex: '#B34A00',
    camera: { eye: [0, 3.2, 8], target: [0, 4, -60], horizon: true, swayAmp: 0, swayPeriod: 0 },
    sign: ['TIDE LINE · 555-0127', 'SWELL 4FT · ALL CALLERS WELCOME'],
    seed: 0x0127,
  });

  const LONG = makeExchange({
    id: EX.LONG, key: 'long', name: 'LONG DISTANCE', title: 'Long Distance', number: '1-555-0199',
    digits: '15550199', altDigits: ['5550199'], foundKey: 'orbit',
    // E Lydian hexatonic E F# G# A# B C#
    scale: [0, 2, 4, 6, 7, 9], root: 40, rootPc: 4, mode: 'E Lydian',
    progression: [
      { name: 'Emaj9', rootPc: 4, tones: [4, 8, 11, 3, 6], pad: [56, 63, 66, 71], bass: 40 },
      { name: 'F#6/E', rootPc: 6, tones: [6, 10, 1, 3, 4], pad: [58, 61, 63, 66], bass: 40 },
      { name: 'G#m7', rootPc: 8, tones: [8, 11, 3, 6], pad: [56, 59, 63, 66], bass: 44 },
      { name: 'Bsus2', rootPc: 11, tones: [11, 1, 6], pad: [59, 61, 66, 71], bass: 47 },
    ],
    call: [11, 1, 4, 6, 8],          // B C# E F# G#
    callResolve: 4,
    reverb: 'sea', pluckVoice: 'fm', drums: 'none',
    palHex: [
      '#9D7BFF', '#3DF5FF',            // 0 planet, 1 rings
      '#C77DFF', '#FFE6FF',            // 2 galaxy arm, 3 galaxy core (ramp 2->3 toward centre)
      '#FFF2FA', '#FFF2FA', '#FFE6FF', // 4 probe, 5 text, 6 star
      '#4B2BFF',                       // 7 dim (night side / trail tone)
    ],
    col: { PLANET: 0, RINGS: 1, GALAXY: 2, GALAXY_CORE: 3, PROBE: 4, TEXT: 5, STAR: 6, DIM: 7 },
    heatHex: '#FFE6FF', coreHex: '#FFF2FA',
    decay: [0.86, 0.80, 0.945], afterglowHex: '#4B2BFF',
    camera: { eye: [0, 8, -10], target: [0, 6, -40], horizon: false, swayAmp: 25 * D, swayPeriod: 60 },
    sign: ['LONG DISTANCE', 'PLEASE HOLD'],
    seed: 0x0199,
  });

  const EXCHANGES = Object.freeze([MERIDIAN, TIDE, LONG]);

  // ---- Tiers (§8.2). Index 0 LOW, 1 MID, 2 HIGH.
  const TIERS = Object.freeze([
    Object.freeze({ id: 0, name: 'LOW', N: 12000, packets: 16, strings: 4, stars: 90,
      rs: { start: 0.7, min: 0.5, max: 0.85 }, bloomMips: 3, misconv: false, grain: true,
      padSaws: 2, poly: 10, irHall: 1.8, irSea: 3.0, hashStride: 1, dprCap: 1.25 }),
    Object.freeze({ id: 1, name: 'MID', N: 24000, packets: 24, strings: 6, stars: 140,
      rs: { start: 0.85, min: 0.6, max: 1.0 }, bloomMips: 4, misconv: true, grain: true,
      padSaws: 3, poly: 14, irHall: 2.6, irSea: 4.2, hashStride: 1, dprCap: 1.5 }),
    Object.freeze({ id: 2, name: 'HIGH', N: 48000, packets: 32, strings: 8, stars: 200,
      rs: { start: 1.0, min: 0.7, max: 1.0 }, bloomMips: 5, misconv: true, grain: true,
      padSaws: 3, poly: 20, irHall: 2.6, irSea: 4.2, hashStride: 2, dprCap: 2.0 }),
  ]);
  const MAX_PACKETS = 32, MAX_STRINGS = 8;   // shader array sizes (use tier counts at runtime)

  // ---- Transport (§6.2). Seconds unless suffixed _MS.
  const BPM = 96;
  const TRANSPORT = Object.freeze({
    BPM, BEAT: 60 / BPM, BAR: 240 / BPM, S16: 15 / BPM, E8: 30 / BPM, DOTTED8: 45 / BPM,
    BEAT_MS: 60000 / BPM, BAR_MS: 240000 / BPM, S16_MS: 15000 / BPM, E8_MS: 30000 / BPM, DOTTED8_MS: 45000 / BPM,
    STEPS_PER_BAR: 16, BEATS_PER_BAR: 4, BARS_PER_CHORD: 2, CHORDS: 4, CYCLE_BARS: 8,
    LOOKAHEAD: 0.12, TICK_MS: 25, RESYNC: 0.05, SWING: 0.54,
    OFFSET_ALPHA: 0.05, EVENT_RING: 64, STALE_EVENT_MS: 1000,
    HAT_VEL: [0.6, 0.35],
  });

  // ---- Energy & arrangement (§6.3)
  const ENERGY = Object.freeze({
    PER_PLUCK: 0.06, PER_STRUM: 0.03, TAU: 18, HYST: 0.05, FLOOR: 0.35, FLOOR_BARS: 8,
    // thresholds (E) per layer; exchange arrangement decides which layers exist
    BASS: 0.3, HATS: 0.5, KICK4: 0.6, FILL: 0.6, SNARE: 0.75, KICK3_TIDE: 0.6,
  });

  // ---- Handshake (§3.2). ms from the gesture (performance clock).
  const HANDSHAKE = Object.freeze({
    FIRST: Object.freeze({ digits: '5550185', dial: [0, 350], dtmfStart: 350, dtmfOn: 70, dtmfOff: 30,
      answer: [1050, 1250], chirp: [1250, 1650], glide: [1650, 2150], downbeat: 2400 }),
    RETURN: Object.freeze({ digits: '85', dial: [0, 200], dtmfStart: 200, dtmfOn: 70, dtmfOff: 30,
      answer: null, chirp: null, glide: [400, 1000], downbeat: 1250 }),
    GLIDE_MIDI: [45, 52, 55, 59, 60],     // Am9 tones A2 E3 G3 B3 C4
    SKIP_MIN_MS: 250, SKIP_FADE_MS: 40,
    DIGIT_S0: 0.12, DIGIT_DS: 0.11,       // HS_DIGIT i launches a packet at s = 0.12 + 0.11*i
    EXPOSURE: [0.6, 0.85, 1.0],           // on hook, after last digit, at downbeat
    JUNE_PLUCK_BEATS: 2,                  // June's audible sun pluck at downbeat + 2 beats (t≈3650 first call)
    HINT_MS: 6000,                        // breathing ring + hint 1 if no pluck by downbeat + 6 s (UI handles hint)
    TYPE_MS_PER_CHAR: 28,
    NODIAL_CHECK_MS: 600,
  });

  // ---- Input recognizer (§4.1, §4.2). CSS px and ms.
  const INPUT = Object.freeze({
    TAP_MS: 250, TAP_PX: 10, DTAP_MS: 300, DTAP_PX: 32,
    DRAG_PX: 10, DRAG_BEFORE_MS: 450, LONG_MS: 450, LONG_PX: 8,
    SNAP_COARSE: 44, SNAP_FINE: 28, SNAP_LONG: 56,
    TWO_WITHIN_MS: 200, TWO_STILL_PX: 10, PINCH_RATIO: 0.08, PINCH_CENTROID_PX: 16, PINCH_WINDOW_MS: 250,
    SLOW_AFTER_MS: 250, MAX_POINTERS: 3,
    STRUM_DEBOUNCE_MS: 120, STRUM_MIN_INTERVAL_MS: 30, STRUM_VEL_BASE: 0.35, STRUM_VEL_PER_SPEED: 0.25,
    VEL_DEFAULT: 0.75, HITSTOP_VEL: 0.85, HITSTOP_MS: 50, CAM_KICK: 0.08,
    MAGNET_RADIUS: 110, MAGNET_PUSH: 14, MAGNET_FRINGE: 3, HOVER_HEAT: 0.25,
    STRONG_PUSH: 40, STRONG_RAMP_MS: 1500, PING_SPEED: 900, PING_RING_PX: 30,
    PULL_FRACTION: 0.33, PULL_HOLD_MS: 500,
    KEY_STEP: 24, KEY_STEP_MAX: 60, KEY_SNAP: 40,
    WHEEL_PER_100: 0.12, CTRL_WHEEL_MULT: 2.5, LINE_HEIGHT_PX: 16, PAGE_PX: 800,
    HASH_CELL: 32, PAYPHONE_PAD: 12,
    ZOOM_MIN: -1, ZOOM_MAX: 1,
    KONAMI: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
  });

  // ---- Springs (§5.5). ω in rad/s.
  const SPRING = Object.freeze({
    SUBSTEP: 1 / 120, MAX_SUBSTEPS: 6,
    PARALLAX: 4, ZOOM: 5, CAMERA: 3, PULL_VIEW: 3, SUN_RISE: 6, MAGNET: 12,
    WOBBLE_OMEGA: 14, WOBBLE_ZETA: 0.35, SLOW_SEC: 0.6,
  });

  // ---- Camera (§5.5)
  const CAMERA = Object.freeze({
    NEAR: 0.1, FAR: 200, FOV_LANDSCAPE: 50 * D, FOV_MAX: 78 * D,
    PORTRAIT_TAN_H: 0.33,       // portrait: tan(hFov/2) held at 0.33 -> sun ≥ 52% of width at 380×800
    PULLBACK: 8,                // portrait: eye.z += 8·(1 − aspect)
    HORIZON_FROM_TOP: 0.46,     // portrait: horizon placed 46% from the top (exchanges with horizon)
    PARALLAX_X: 0.6, PARALLAX_Y: 0.3,
    ZOOM_EYE_Z_IN: -22, ZOOM_LATERAL: 6,
    DRIFT: [0.35, 0.15, 0], DRIFT_HZ: [0.07, 0.05, 0],
    SCREENSAVER_AMP: 3, SCREENSAVER_PERIOD: 90,
  });

  // Rest camera for an exchange at an aspect (w/h). Allocation-free when `out` is passed.
  // Returns { eye:[3], target:[3], up:[0,1,0], fov (rad, vertical), swayAmp (rad), swayPeriod (s) }.
  // Core adds parallax, zoom dolly, drift, sway, kicks on top of this.
  function cameraRest(ex, aspect, out) {
    const c = EXCHANGES[ex].camera;
    out = out || { eye: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 0, swayAmp: 0, swayPeriod: 0 };
    out.eye[0] = c.eye[0]; out.eye[1] = c.eye[1]; out.eye[2] = c.eye[2];
    out.target[0] = c.target[0]; out.target[1] = c.target[1]; out.target[2] = c.target[2];
    out.up[0] = 0; out.up[1] = 1; out.up[2] = 0;
    let fov = CAMERA.FOV_LANDSCAPE;
    if (aspect > 0 && aspect < 1) {
      fov = U.clamp(2 * Math.atan(CAMERA.PORTRAIT_TAN_H / aspect), CAMERA.FOV_LANDSCAPE, CAMERA.FOV_MAX);
      out.eye[2] += CAMERA.PULLBACK * (1 - aspect);
      if (c.horizon) {
        // horizon NDC y = −tanθ / tan(fov/2); want NDC y = 1 − 2·HORIZON_FROM_TOP
        const tanTheta = -(1 - 2 * CAMERA.HORIZON_FROM_TOP) * Math.tan(fov / 2);
        const dz = out.eye[2] - out.target[2];
        out.target[1] = out.eye[1] + tanTheta * dz;
      }
    }
    out.fov = fov;
    out.swayAmp = c.swayAmp; out.swayPeriod = c.swayPeriod;
    return out;
  }

  // ---- Visual constants (§3, §5.4, §6.6). Core owns the behaviour; values live here.
  const VIS = Object.freeze({
    PACKET_WIDTH: 0.0035, PACKET_SPEED: 0.18,          // s-units, s-units per (scaled) second
    ECHOES: 3, ECHO_AMP: 0.38, AMP_MAX: 1.5, DISP_MAX: 3,
    LINE_NOISE_MS: 3500, LINE_NOISE_AMP: 0.25,
    GHOST_DEMO_FIRST_MS: 1600, GHOST_DEMO_EVERY_MS: 7000,
    STRING_FV: (degree) => 4 + 0.4 * degree,           // Hz, perceptual ring frequency
    BEAD_WIDTH: 220, BEAD_HEAT: 0.35, BEAD_CALM: 0.4,
    BLANK_ALPHA: 0.012, PING_BLANK_ALPHA: 0.22, PING_BLANK_DECAY_S: 1.2,
    RETRACE_SECRET: 1.0, RETRACE_BLANK: 0.35, RETRACE_VISIBLE: 0.12, RETRACE_DIM_S: 0.8, RETRACE_BARS: 16,
    EXPOSURE_ONHOOK: 0.6, KICK_EXPOSURE: 0.08, KICK_SIGMA: 0.06, KICK_DECAY_MS: 220,
    BLOOM: 0.9, BLOOM_SWELL: 0.3, BLOOM_SWELL_MS: 600, SNARE_BLOOM: 0.1,
    BEAM_SIGMA_CSS: 0.75, BEAM_CORE_MIN: 1.4,
    BARREL_K_DESKTOP: 0.06, BARREL_K_PHONE: 0.045, GRAIN: 0.015, VIGNETTE: 0.35,
    FOG_NEAR: 20, FOG_FAR: 80, FOG_MIN: 0.25, NEAR_FADE: 1.5,
    SCROLL_SPEED: 0.6, SUN_RISE_SUNK: 0, SUN_RISE_UP: 6,          // uSunRise: y += uSunRise − 6
    DEGAUSS_S: 0.9, DEGAUSS_CALM_S: 0.4, POWER_ON_MS: 600, POWER_CALM_MS: 300,
    SLOW_PERIOD_S: 4, SLOW_TIMESCALE: 0.2, SLOW_DECAY: [0.97, 0.99, 0.985],
    EPS_RGBA8: 1.5 / 255, EPS_FLOAT: 0.002,
    CHIME_MIN_AMP: 0.3, CHIME_COOLDOWN_MS: 400, CHIME_PER_PACKET: 2,
    FLASH_WINDOW_MS: 333, FLASH_WINDOW_CALM_MS: 500,
    WINDOW_FLARE_HEAT: 3, WINDOW_FLARE_MS: 4000, WINDOW_FLICKER: 0.06,
    CALM_DISP: 0.5, CALM_PULL: 0.4,
    CHORD_HUE_DEG: [0, 8, -8, 4],                                  // palette hue shift per chord index
    PULL_SIGMA: [0.01, 0.5],
    UNRAVEL_MS: 800, KNIT_MIN_MS: 1200, GHOST_FADE_MS: 400,
  });

  // ---- Idle / party line / June (§3.4, §3.5, §10)
  const IDLE = Object.freeze({
    PARTY_MS: 45000, SCREENSAVER_MS: 180000, AUTO_SLOW_EVERY_MS: 240000,
    CALL_FIRST_MS: 45000, CALL_EVERY_MS: 48000, CALL_IDLE_MIN_MS: 6000, ANSWER_WINDOW_MS: 10000,
    GHOSTS_MIN: 1, GHOSTS_MAX: 3,
  });

  // ---- Governor (§8.3)
  const GOVERNOR = Object.freeze({
    EMA: 0.1, DOWN_MS: 18.5, DOWN_HOLD_MS: 1200, UP_MS: 12.5, UP_HOLD_MS: 5000,
    COOLDOWN_MS: 10000, N_CHANGE_MIN_MS: 20000, STABLE_WRITE_MS: 60000, DT_CLAMP_MS: 50,
    RS_STEP: 0.1,
  });

  // ---- Sign (billboard) layout capacity. NOTE: spec copy needs up to 38 chars per line.
  const SIGN = Object.freeze({ LINES: 2, COLS: 40 });

  // ---- Copy shared between Core and UI (UI owns overlay/help/directory/hint copy).
  const TEXT = Object.freeze({
    status: Object.freeze({
      onhook: '○ ON HOOK',
      handshake: '◔ DIALING 555-0185',
      play: (ex) => '● LINE OPEN · ' + EXCHANGES[ex].number + ' · ' + EXCHANGES[ex].name,
      muted: '● LINE OPEN · MUTED',
      slow: '◌ BEAM SLOWED',
      party: (n) => '● PARTY LINE · ' + n + (n === 1 ? ' CALLER' : ' CALLERS'),
      desk: 'LINEA · HALCYON BELL · 1985',
      retrace: '◍ RETRACE · 555-0001',
      line2: (calls) => (calls > 0 ? 'CALL #' + calls : ''),
    }),
    announce: Object.freeze({
      connected: ['Connected to Meridian.', 'Connected to Tide Line.', 'Connected to Long Distance.'],
      unravel: 'Unravelling.', slowOn: 'Beam slowed.', slowOff: 'Beam restored.',
      deskOn: 'Stepped back from the screen.', deskOff: 'Back on the line.',
      muted: 'Muted.', soundOn: 'Sound on.',
      found: (label) => 'Secret found: ' + label + '.',
    }),
    chip: Object.freeze({
      nodial: 'NO DIAL TONE: sound is blocked. Check the silent switch, then tap SOUND.',
      signal: 'SIGNAL LOST · reconnecting',
    }),
    toast: Object.freeze({
      overlay: 'OVERLAY INSERTED',
      found: (name) => '► FOUND: ' + name,
    }),
    // found key -> [toast name, announce label]
    found: Object.freeze({
      tide: ['TIDE LINE', 'Tide Line'], orbit: ['LONG DISTANCE', 'Long Distance'],
      operator: ['OPERATOR', 'Operator'], june: ["JUNE'S LINE", "June's line"],
      handset: ['THE HANDSET', 'the handset'], konami: ['THE OVERLAY', 'the overlay'],
    }),
    caption: Object.freeze({ desk: 'THE RECEIVER IS STILL OFF THE HOOK.' }),
    sign: Object.freeze({
      welcome: (calls) => ['WELCOME BACK TO MERIDIAN', 'SUBSCRIBERS ONLINE: 1 · CALL #' + calls],
      june: ['HELLO? I HEAR YOU.', 'DIAL 555-0001'],
      sit: ['THE NUMBER YOU HAVE DIALED', 'IS NOT IN SERVICE'],
      busy: ['LINE BUSY', 'SINCE 1981'],
      operator: ['OPERATOR SEVEN.', "LINES CLOSED 12-31-86. I'M STILL HERE."],
    }),
    secretSky: 'I KNEW SOMEONE WOULD PICK UP',
    clockDate: '31 DEC 86',
    badge: 'HALCYON BELL · LINEA',
  });

  // ---- Dialling. digits: string of 0-9*# (any other chars are stripped).
  // -> null (empty) | {type:'exchange', ex} | {type:'operator'} | {type:'retrace'} | {type:'busy'} | {type:'sit'}
  const NUMBERS = Object.freeze({ OPERATOR: '0', RETRACE: '5550001', BUSY: '8675309' });
  function dial(raw) {
    const d = String(raw == null ? '' : raw).replace(/[^0-9*#]/g, '');
    if (!d) return null;
    for (const e of EXCHANGES) if (d === e.digits || e.altDigits.indexOf(d) >= 0) return { type: 'exchange', ex: e.id, digits: d };
    if (d === NUMBERS.OPERATOR) return { type: 'operator', digits: d };
    if (d === NUMBERS.RETRACE || d === '1' + NUMBERS.RETRACE) return { type: 'retrace', digits: d };
    if (d === NUMBERS.BUSY || d === '1' + NUMBERS.BUSY) return { type: 'busy', digits: d };
    return { type: 'sit', digits: d };
  }

  // ---- Music helpers
  const DEGREES = 19;                    // degree 0..18 (3 octaves of the hexatonic scale + top root)
  function degreeToMidi(ex, degree) {
    const e = EXCHANGES[ex];
    const d = U.clamp(degree | 0, 0, DEGREES - 1);
    return e.root + 12 * Math.floor(d / 6) + e.scale[d % 6];
  }
  // §6.3 pitch rule for a string of world length L (longer -> lower). Floor/sea overrides are Wire's.
  function degreeForLength(L) {
    const a = Math.log2(40), b = Math.log2(0.3);
    const t = U.clamp((a - Math.log2(Math.max(1e-6, L))) / (a - b), 0, 1);
    return Math.round(18 * t);
  }
  // Pitch class for a chime role (0 root, 1 third, 2 fifth, 3 seventh/sixth, 4 extension) from chord
  // `ci` of exchange `ex`, always in scale ∩ chord (falls back to the first safe tone).
  function chimePc(ex, ci, role) {
    const ch = EXCHANGES[ex].progression[U.mod(ci | 0, 4)];
    const t = ch.tones[role];
    return t !== undefined && ch.safe.indexOf(t) >= 0 ? t : ch.safe[0];
  }
  // Nearest MIDI note with pitch class pc at or above `floorMidi`.
  function midiAtOrAbove(pc, floorMidi) { return floorMidi + U.mod(pc - floorMidi, 12); }

  // ---- Environment probe (guarded; Node-safe).
  function detectEnv() {
    const env = { hasDOM: false, coarse: false, fine: true, cores: 4, mem: 4, reducedMotion: false,
      fullscreen: false, vibrate: false, dpr: 1, phone: false };
    try {
      if (typeof window === 'undefined') return env;
      env.hasDOM = typeof document !== 'undefined';
      const mm = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
      env.coarse = mm('(pointer: coarse)');
      env.fine = mm('(pointer: fine)');
      env.reducedMotion = mm('(prefers-reduced-motion: reduce)');
      const nav = window.navigator || {};
      env.cores = nav.hardwareConcurrency || 4;
      env.mem = nav.deviceMemory || 4;
      env.dpr = window.devicePixelRatio || 1;
      try { env.fullscreen = !!(env.hasDOM && document.fullscreenEnabled); } catch (e) { env.fullscreen = false; }
      env.vibrate = typeof nav.vibrate === 'function';
      env.phone = (window.innerWidth || 1024) < 700;
    } catch (e) { /* defaults */ }
    return env;
  }
  // §8.2 initial tier; a valid stored tier (0..2) overrides.
  function pickTier(env, stored) {
    if (stored === 0 || stored === 1 || stored === 2) return stored;
    if (env.fine && !env.coarse && env.cores >= 8) return 2;
    if (env.coarse && (env.cores <= 4 || env.mem <= 3)) return 0;
    return 1;
  }

  return Object.freeze({
    COL, EXCHANGES, TIERS, MAX_PACKETS, MAX_STRINGS, TRANSPORT, ENERGY, HANDSHAKE, INPUT, SPRING,
    CAMERA, VIS, IDLE, GOVERNOR, SIGN, TEXT, NUMBERS, DEGREES,
    cameraRest, dial, degreeToMidi, degreeForLength, chimePc, midiAtOrAbove, detectEnv, pickTier,
    STORE_KEY: 'pl85.v1', VERSION: '1.0',
  });
})();

// ---------------------------------------------------------------- Store (single key 'pl85.v1')
// Read/written only inside try/catch; in-memory defaults when storage is unavailable or throws.
// Writes are debounced 1 s. Call Store.load() once at boot (App.boot).
const Store = (() => {
  const FOUND_KEYS = ['tide', 'orbit', 'operator', 'june', 'handset', 'konami'];
  function defaults() {
    return {
      calls: 0,               // completed pick-ups (incremented by Core at pick-up)
      muted: false,           // last explicit mute choice (M / SOUND / just watch)
      calm: null,             // null = follow prefers-reduced-motion; true/false = CALM override
      tier: null,             // null or 0..2 (last stable tier)
      found: { tide: false, orbit: false, operator: false, june: false, handset: false, konami: false },
      hints: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
      lastExchange: 0,
    };
  }
  let data = defaults();
  let timer = 0;
  let available = false;
  let listening = false;

  function storage() {
    try { return typeof localStorage !== 'undefined' && localStorage ? localStorage : null; } catch (e) { return null; }
  }
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (Number.isFinite(raw.calls) && raw.calls >= 0) d.calls = Math.floor(raw.calls);
    if (typeof raw.muted === 'boolean') d.muted = raw.muted;
    if (raw.calm === null || typeof raw.calm === 'boolean') d.calm = raw.calm;
    if (raw.tier === 0 || raw.tier === 1 || raw.tier === 2) d.tier = raw.tier;
    if (raw.found && typeof raw.found === 'object') for (const k of FOUND_KEYS) d.found[k] = raw.found[k] === true;
    if (raw.hints && typeof raw.hints === 'object') for (let i = 1; i <= 6; i++) d.hints[i] = raw.hints[i] === true;
    if (raw.lastExchange === 0 || raw.lastExchange === 1 || raw.lastExchange === 2) d.lastExchange = raw.lastExchange;
    return d;
  }
  function load() {
    try {
      const ls = storage();
      if (ls) {
        const s = ls.getItem(CFG.STORE_KEY);
        data = sanitize(s ? JSON.parse(s) : null);
        available = true;
      }
    } catch (e) { data = defaults(); available = false; }
    if (!listening) {
      listening = true;
      try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', flush); } catch (e) { /* ignore */ }
    }
    return data;
  }
  function flush() {
    if (timer) { try { clearTimeout(timer); } catch (e) { /* ignore */ } timer = 0; }
    try {
      const ls = storage();
      if (ls) { ls.setItem(CFG.STORE_KEY, JSON.stringify(data)); available = true; }
    } catch (e) { available = false; }
  }
  function save() {                      // debounced 1 s
    if (timer) return;
    try { timer = setTimeout(() => { timer = 0; flush(); }, 1000); } catch (e) { timer = 0; }
  }
  function set(key, value) {
    if (!(key in data) || key === 'found' || key === 'hints') return false;
    if (data[key] === value) return false;
    data[key] = value; save(); return true;
  }
  function setFound(name) {               // returns true only when newly found
    if (FOUND_KEYS.indexOf(name) < 0 || data.found[name]) return false;
    data.found[name] = true; save(); return true;
  }
  const isFound = (name) => !!data.found[name];
  function setHint(n) { if (!(n >= 1 && n <= 6) || data.hints[n]) return false; data.hints[n] = true; save(); return true; }
  const hintShown = (n) => !!data.hints[n];
  // Resolved CALM (reduced motion): explicit override, else the media query from detectEnv().
  const calm = (env) => (data.calm === null ? !!(env && env.reducedMotion) : data.calm);
  function reset() { data = defaults(); save(); }

  return {
    get data() { return data; },
    get available() { return available; },
    FOUND_KEYS, load, save, flush, set, setFound, isFound, setHint, hintShown, calm, reset, defaults,
  };
})();
