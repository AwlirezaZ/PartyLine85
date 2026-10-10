// 20-sound-dsp.js — Sound 1/3: pure DSP, music + clock math (no Web Audio, Node-testable).
// CONTRACT NOTES (Sound):
// - MIDI outside the KS bank is octave-folded into [31.5, 81.5] (not clamped), so pitch class and scale survive.
// - Slow beam: KS plucks use playbackRate ×0.5 on the original bank (= midi−12, tape-like); FM plucks use midi−12.
// - Handset analyserL/R tap the XY loop itself (after its 2.4 kHz LP), not the master, so the picture stays legible
//   under the music. readXY() falls back to the stored picture while audio is off; null only before any picture.
// - Offset fallback is now − (currentTime − outputLatency)·1000 (spec §6.2 flips the latency sign).
// - KS buffers get an extra exponential decay so every buffer ends ≤ −45 dB (spec ρ alone rings past the end).
// - Kick, snare, hats bypass the sidechain (a kick ducking itself loses its body); pad, bass, choir, wash duck.
// - getOutputTimestamp() is sampled in the 25 ms scheduler tick (it allocates), not in the ⚡ update().
// - Integration: startHandshake(first, atMs?) takes the gesture's perf time (ignored unless within the last second).
//   unlock() defers the convolver IR assignments (~35 ms each) to timers, out of the gesture handler. The silent
//   data-URI <audio> runs only on iOS < 17 (iOS 17+ uses navigator.audioSession.type = 'playback').
const SoundDSP = (() => {
  const T = CFG.TRANSPORT;
  const BANK = [];
  for (let m = 33; m <= 78; m += 3) BANK.push(m);
  const BANK_SR = 48000;

  // ---- clock math (perf ms)
  const gridAt = (anchor, step, t) => anchor + Math.ceil((t - anchor) / step - 1e-7) * step;
  const chordOf = (bar, bar0) => U.mod(Math.floor((bar - bar0) / T.BARS_PER_CHORD), T.CHORDS);

  // ---- music
  const inScale = (ex, midi) => CFG.EXCHANGES[ex].scalePcs.indexOf(U.pc(midi)) >= 0;
  function fold(m, lo, hi) { while (m < lo) m += 12; while (m > hi) m -= 12; return m; }
  // Chime pitches (MIDI) for a VOICE at chord ci — always in scale ∩ chord (CFG.chimePc).
  function chimeNotes(ex, ci, v) {
    const r = CFG.EXCHANGES[ex].root, at = (role, base) => CFG.midiAtOrAbove(CFG.chimePc(ex, ci, role), base);
    if (v === VOICE.SUN) return [at(0, r + 24)];
    if (v === VOICE.CLOCK) return [at(2, r + 12)];
    if (v === VOICE.BILLBOARD) return [fold(at(4, r + 24), 31.5, 81), fold(at(0, r + 24), 31.5, 81), fold(at(2, r + 24), 31.5, 81)];
    if (v === VOICE.WINDOW) return [at(1, r + 12)];
    return [at(0, r + 36)];
  }
  // Voice a pc phrase as a smooth melody (each note nearest the previous), folded into [lo, hi].
  function melody(pcs, start, lo, hi) {
    const out = [];
    let p = start;
    for (let i = 0; i < pcs.length; i++) {
      let m = p + U.mod(pcs[i] - p, 12);
      if (m - p > 6) m -= 12;
      p = fold(m, lo, hi); out.push(p);
    }
    return out;
  }
  // Probe arpeggio (Long Distance): chord safe tones over two octaves from root+24, ascending.
  function arpNotes(ex, ci) {
    const E = CFG.EXCHANGES[ex], safe = E.progression[ci].safe, out = [];
    for (let o = 0; o < 2; o++) for (let i = 0; i < safe.length; i++) out.push(CFG.midiAtOrAbove(safe[i], E.root + 24) + 12 * o);
    return out.sort((a, b) => a - b);
  }
  // Choir voicing (3 chord tones, two octaves above the bass).
  function choirNotes(ex, ci) {
    const ch = CFG.EXCHANGES[ex].progression[ci];
    return [0, 1, 2].map((k) => CFG.midiAtOrAbove(ch.tones[k], ch.bass + 24)).sort((a, b) => a - b);
  }

  // ---- Karplus-Strong bank job (resumable). §6.4 recipe; deterministic per bank index.
  function ksJob(i, sr) {
    sr = sr || BANK_SR;
    const midi = BANK[i], f = U.midiToHz(midi), P = sr / f;
    const len = Math.round(sr * (f < 110 ? 1.8 : f < 330 ? 1.3 : 0.9));
    let N = Math.floor(P - 0.5), Dl = P - 0.5 - N;
    if (Dl < 0.1) { N--; Dl += 1; }
    const C = (1 - Dl) / (1 + Dl), rho = 0.9965 - 0.003 * i / (BANK.length - 1);
    const out = new Float32Array(len), E = Math.round(P), exc = new Float32Array(E), r = U.rng(0x9e37 + i * 7919);
    let lp = 0, mean = 0;
    for (let k = 0; k < E; k++) { lp = 0.45 * (2 * r() - 1) + 0.55 * lp; exc[k] = lp; }
    const M = Math.max(1, Math.round(0.13 * P));
    for (let k = E - 1; k >= M; k--) exc[k] -= exc[k - M];
    for (let k = 0; k < E; k++) mean += exc[k];
    mean /= E;
    for (let k = 0; k < E; k++) exc[k] -= mean;
    let n = 0, uP = 0, wP = 0;
    const job = { midi, sr, out, P, done: false, step(budget) {
      const end = Math.min(len, n + budget);
      for (; n < end; n++) {
        const a = n - N;
        const u = a > 0 ? rho * 0.5 * (out[a] + out[a - 1]) : a === 0 ? rho * 0.5 * out[0] : 0;
        const w = C * u + uP - C * wP;
        uP = u; wP = w;
        out[n] = n < E ? w + exc[n] : w;
      }
      if (n >= len && !job.done) { ksFinish(out, sr); job.done = true; }
      return job.done;
    } };
    return job;
  }
  function ksFinish(o, sr) {
    const len = o.length, w = Math.round(0.05 * sr), a0 = Math.round(0.01 * sr);
    const rms = (s, e) => { let q = 0; for (let k = s; k < e; k++) q += o[k] * o[k]; return Math.sqrt(q / Math.max(1, e - s)) || 1e-9; };
    const need = 20 * Math.log10(rms(len - w, len) / rms(a0, a0 + w)) + 45;
    if (need > 0) { const k = Math.exp(-need / 20 * Math.LN10 / len); let g = 1; for (let n = 0; n < len; n++) { o[n] *= g; g *= k; } }
    let pk = 0;
    for (let n = 0; n < len; n++) { const v = Math.abs(o[n]); if (v > pk) pk = v; }
    const s = pk > 0 ? 0.8 / pk : 0, fi = Math.round(0.0008 * sr), fo = Math.round(0.004 * sr);
    for (let n = 0; n < len; n++) o[n] *= n < fi ? s * n / fi : n >= len - fo ? s * (len - 1 - n) / fo : s;
  }

  // ---- reverb IR job: kind 0 hall, 1 sea, 2 gated. Stereo noise × exp(−t/τ) through a one-pole LP that
  // darkens over time (≈0.3 average), 18 ms pre-delay, early taps (hall), unit energy per channel.
  function irJob(kind, sec, sr, seed) {
    const pre = Math.round(0.018 * sr), body = Math.round(sec * sr), len = pre + body;
    const L = new Float32Array(len), R = new Float32Array(len), r = U.rng(seed);
    const tau = kind === 2 ? 0.32 : sec / (kind ? 5.2 : 6);
    const a0 = kind === 1 ? 0.3 : kind === 2 ? 0.55 : 0.45, a1 = kind === 1 ? 0.08 : kind === 2 ? 0.35 : 0.16;
    const dk = Math.exp(-1 / (tau * sr));
    let n = pre, l = 0, rr = 0, env = 1;
    const job = { kind, sr, L, R, done: false, step(budget) {
      const end = Math.min(len, n + budget);
      for (; n < end; n++) {
        const x = (n - pre) / body, a = a0 + (a1 - a0) * x;
        let g = env * (x > 0.93 ? (1 - x) / 0.07 : 1);
        if (kind === 1) g *= 1 + 0.2 * Math.sin((n - pre) / sr * 4.4);
        l += a * (2 * r() - 1 - l); rr += a * (2 * r() - 1 - rr);
        L[n] = l * g; R[n] = rr * g; env *= dk;
      }
      if (n >= len && !job.done) {
        if (kind === 0) for (let k = 0; k < 8; k++) {
          const t = pre + Math.round(sr * (0.005 + 0.009 * k + 0.004 * r())), amp = 0.5 * (1 - k / 9);
          L[t] += amp * (r() < 0.5 ? -1 : 1); R[t + Math.round(sr * 0.0021 * (k % 3))] += amp * (r() < 0.5 ? -1 : 1);
        }
        let el = 0, er = 0;
        for (let k = 0; k < len; k++) { el += L[k] * L[k]; er += R[k] * R[k]; }
        const s = 1 / Math.sqrt(Math.max(1e-12, (el + er) / 2));
        for (let k = 0; k < len; k++) { L[k] *= s; R[k] *= s; }
        job.done = true;
      }
      return job.done;
    } };
    return job;
  }

  // ---- noise
  function white(n, seed) { const o = new Float32Array(n), r = U.rng(seed); for (let k = 0; k < n; k++) o[k] = 2 * r() - 1; return o; }
  function pink(n, seed) {         // Kellet economy filter; seamless loop (20 ms crossfaded seam)
    const F = Math.min(n >> 2, 960), raw = new Float32Array(n + F), r = U.rng(seed);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let k = 0; k < n + F; k++) {
      const w = 2 * r() - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      raw[k] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    const o = raw.subarray(F);
    let pk = 1e-9;
    for (let k = 0; k < F; k++) o[n - F + k] = o[n - F + k] * (1 - k / F) + raw[k] * (k / F);
    for (let k = 0; k < n; k++) pk = Math.max(pk, Math.abs(o[k]));
    for (let k = 0; k < n; k++) o[k] *= 0.9 / pk;
    return o;
  }

  let nz = null;                              // shared noise (48 kHz; buffer sources resample)
  const noiseArrs = () => nz || (nz = { w: white(BANK_SR, 7), p: pink(BANK_SR * 2, 11) });

  // ---- cooperative job runner: ≤ 4 ms slices; idle callbacks until urgent (after unlock).
  const jobs = [];
  let pumping = false, urgent = false;
  function run(job, done) { jobs.push(job, done); kick(); }
  function setUrgent(v) { urgent = !!v; kick(); }
  function kick() {
    if (pumping || !jobs.length) return;
    pumping = true;
    try {
      const W = typeof window !== 'undefined' ? window : null;
      if (!urgent && W && W.requestIdleCallback) W.requestIdleCallback(pump, { timeout: 400 });
      else setTimeout(pump, urgent ? 0 : 16);
    } catch (e) { pumping = false; }
  }
  function pump() {
    pumping = false;
    const t0 = U.now();
    while (jobs.length && U.now() - t0 < 4) {
      if (jobs[0].step(2048)) { jobs.shift(); const cb = jobs.shift(); try { cb(); } catch (e) { /* ignore */ } }
    }
    kick();
  }
  const busy = () => jobs.length > 0;

  return { BANK, BANK_SR, gridAt, chordOf, inScale, fold, chimeNotes, melody, arpNotes, choirNotes,
    ksJob, irJob, white, pink, noiseArrs, run, setUrgent, busy };
})();
