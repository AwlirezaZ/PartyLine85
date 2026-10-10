// 22-sound-voice.js — Sound 2/3: Web Audio graph (§6.1), instruments (§6.4), voice pool. Called only by Sound,
// always with an audio time t (seconds) and only after build(). Levels: pluck ≈ −12 dBFS, limiter, then master −1 dB.
const SoundVoice = (() => {
  const hz = U.midiToHz, db = U.dbToGain, DSP = SoundDSP;
  let C = null, G = null, bank = null, poly = 14, saws = 3;
  let padCur = null, choir = null, sea = null, drone = null, pull = null, hum = null, xy = null;
  const pool = [];

  // ---- node helpers
  const gn = (v) => { const g = C.createGain(); g.gain.value = v; return g; };
  function bq(type, f, q, gain) {
    const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    if (gain !== undefined) b.gain.value = gain;
    return b;
  }
  const os = (type, f) => { const o = C.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const bsrc = (b, loop) => { const s = C.createBufferSource(); s.buffer = b; s.loop = !!loop; return s; };
  function pnr(p) {
    if (!C.createStereoPanner) return gn(1);
    const n = C.createStereoPanner(); n.pan.value = U.clamp(+p || 0, -1, 1); return n;
  }
  function lfo(f, depth, param, t) { const o = os('sine', f), g = gn(depth); o.connect(g).connect(param); o.start(t || 0); g.o = o; return g; }
  function fin(s, nodes) {
    s.onended = () => { for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* gone */ } } };
  }
  function hold(p, t) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); at(p, p.value, t); }
  }
  const at = (p, v, t) => p.setValueAtTime(v, t), lin = (p, v, t) => p.linearRampToValueAtTime(v, t);
  const xp = (p, v, t) => p.exponentialRampToValueAtTime(v, t), tgt = (p, v, t, k) => p.setTargetAtTime(v, t, k);
  function env(p, t, peak, att, tau) { at(p, 0, t); lin(p, peak, t + att); tgt(p, 0, t + att, tau); }
  function abuf(ch, arrs, sr) {
    const b = C.createBuffer(ch, arrs[0].length, sr || C.sampleRate);
    for (let c = 0; c < ch; c++) b.getChannelData(c).set(arrs[c]);
    return b;
  }
  const noise = (t, dur, off) => { const s = bsrc(G.white); s.start(t, off === undefined ? Math.random() * 0.6 : off, dur); return s; };

  // ---- voice pool: cap by tier; steal the oldest-quietest with a 15 ms fade
  function voice(t0, peak, tau, end, g, srcs) {
    const ct = C.currentTime;
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].end <= ct) pool.splice(i, 1);
    while (pool.length >= poly) {
      let bi = 0, bs = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const v = pool[i], lv = ct < v.t0 ? v.peak : v.peak * Math.exp((v.t0 - ct) / v.tau), sc = lv - (ct - v.t0) * 1e-3;
        if (sc < bs) { bs = sc; bi = i; }
      }
      const v = pool[bi];
      pool.splice(bi, 1);
      try { hold(v.g.gain, ct); tgt(v.g.gain, 0, ct, 0.005); for (const s of v.srcs) s.stop(ct + 0.03); } catch (e) { /* ended */ }
    }
    pool.push({ t0, peak, tau, end, g, srcs });
  }
  function count() { if (!C) return 0; const ct = C.currentTime; let n = 0; for (const v of pool) if (v.end > ct) n++; return n; }

  // ---- graph (§6.1)
  function build(ctx, tier) {
    C = ctx;
    const sr = C.sampleRate, top = Math.min(20000, sr * 0.45);
    setTier(tier);
    G = { top, revTok: 0, cvOn: [false, false, false], cvHas: [false, false, false], want: 0, cur: -1 };
    const nz = DSP.noiseArrs();
    G.white = abuf(1, [nz.w], DSP.BANK_SR); G.pink = abuf(1, [nz.p], DSP.BANK_SR);
    // master chain
    G.sum = gn(0.62);
    const sat = C.createWaveShaper(), cv = new Float32Array(2049);
    for (let i = 0; i < 2049; i++) cv[i] = Math.tanh(1.6 * (i / 1024 - 1)) / Math.tanh(1.6);
    sat.curve = cv; sat.oversample = '2x';
    G.wow = C.createDelay(1); G.wow.delayTime.value = 0.005;
    lfo(0.45, 0.00025, G.wow.delayTime); lfo(6.3, 0.00004, G.wow.delayTime);
    G.spkLP = bq('lowpass', top, 0.7); G.spkPk = bq('peaking', 2800, 1.2, 0);
    G.hsHP = bq('highpass', 10, 0.7); G.hsLP = bq('lowpass', top, 0.7);
    const lim = C.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.12;
    G.master = gn(0);
    G.sum.connect(sat).connect(G.wow).connect(G.spkLP).connect(G.spkPk).connect(G.hsHP).connect(G.hsLP).connect(lim).connect(G.master);
    G.master.connect(C.destination);
    G.an = C.createAnalyser(); G.an.fftSize = 512; G.an.smoothingTimeConstant = 0.75; G.an.minDecibels = -61; G.an.maxDecibels = -25;   // +5 dB master: same visuals
    G.master.connect(G.an);
    G.fd = new Uint8Array(256); G.bLo = new Int16Array(64); G.bHi = new Int16Array(64); G.bX = new Float32Array(64);
    const bin = sr / 512;
    for (let b = 0; b < 64; b++) {
      const f0 = 60 * Math.pow(8000 / 60, b / 64), f1 = 60 * Math.pow(8000 / 60, (b + 1) / 64);
      G.bLo[b] = Math.floor(f0 / bin); G.bHi[b] = Math.min(255, Math.ceil(f1 / bin)); G.bX[b] = Math.min(254, Math.sqrt(f0 * f1) / bin);
    }
    G.h0 = Math.round(6000 / bin); G.h1 = Math.min(255, Math.round(10000 / bin));
    // buses
    G.side = gn(1); G.side.connect(G.sum);
    G.music = gn(1); G.music.connect(G.side);
    G.padLP = bq('lowpass', 1400, 0.7); G.padBus = gn(1); G.padLP.connect(G.padBus).connect(G.music);
    G.padLfo = lfo(0.07, 400, G.padLP.frequency);
    if (C.createConstantSource) { G.det = C.createConstantSource(); G.det.offset.value = 0; G.det.start(); }
    G.drum = gn(1); G.drum.connect(G.sum);
    G.play = gn(1); G.play.connect(G.sum);
    // phone-speaker translation: saturated upper harmonics of bass + kick (missing-fundamental cue above ~400 Hz)
    const shp = (k) => { const w = C.createWaveShaper(), c = new Float32Array(1025); for (let i = 0; i < 1025; i++) c[i] = Math.tanh(k * (i / 512 - 1)) / Math.tanh(k); w.curve = c; return w; };
    G.bxIn = gn(1); G.bxIn.connect(shp(3)).connect(bq('bandpass', 900, 0.8)).connect(gn(0.25)).connect(G.music);
    G.kxIn = gn(1); G.kxIn.connect(shp(8)).connect(bq('highpass', 400, 0.7)).connect(gn(0.18)).connect(G.drum);
    G.tel = gn(1); const tH = bq('highpass', 300, 0.7), tL = bq('lowpass', 3000, 0.7); G.tel.connect(tH).connect(tL).connect(G.sum);
    G.ghost = gn(1); const gO = bq('lowpass', 2800, 0.7); G.ghost.connect(bq('highpass', 600, 0.7)).connect(gO).connect(G.sum);
    // reverbs: generated-IR convolvers hall / sea / room (short stand-in until the long IRs are in), crossfaded wets;
    // each gets its buffer once, while empty (a buffer swap on a sounding convolver cuts its tail)
    G.rev = gn(1); G.cv = [C.createConvolver(), C.createConvolver(), C.createConvolver()]; G.wet = [gn(0), gn(0), gn(0)];
    for (let c = 0; c < 3; c++) { G.cv[c].normalize = false; G.cv[c].connect(G.wet[c]).connect(G.sum); }
    const send = (a, b, v) => a.connect(gn(v)).connect(b);
    send(G.play, G.rev, 0.28); send(gO, G.rev, 0.53); send(G.padBus, G.rev, 0.34); send(tL, G.rev, 0.12); send(G.drum, G.rev, 0.05);
    // ping-pong: L first, cross-feedback 0.38 through LP 3.2 kHz, hard-panned
    G.pp = gn(1);
    const dL = C.createDelay(1), dR = C.createDelay(1), mg = C.createChannelMerger(2), ppO = gn(1);
    for (const d of [dL, dR]) { d.delayTime.value = CFG.TRANSPORT.DOTTED8; d.channelCount = 1; d.channelCountMode = 'explicit'; }
    G.pp.connect(bq('highpass', 220, 0.6)).connect(dL);
    dL.connect(bq('lowpass', 3200, 0.5)).connect(gn(0.38)).connect(dR);
    dR.connect(bq('lowpass', 3200, 0.5)).connect(gn(0.38)).connect(dL);
    dL.connect(mg, 0, 0); dR.connect(mg, 0, 1); mg.connect(ppO).connect(G.sum);
    send(ppO, G.rev, 0.22); send(G.play, G.pp, 0.22); send(gO, G.pp, 0.3);
    // gated verb
    G.gIn = gn(1); G.gCv = C.createConvolver(); G.gCv.normalize = false; G.gate = gn(0);
    G.gIn.connect(G.gCv).connect(G.gate).connect(G.sum);
    // line hiss
    const h = bsrc(G.pink, true); h.connect(bq('bandpass', 4000, 0.4)).connect(gn(0.009)).connect(G.sum); h.start();
    // handset XY loop path (analysers tap the loop, see CONTRACT NOTES)
    G.xyLP = bq('lowpass', 2400, 0.7); G.xyLP.connect(gn(db(-26))).connect(G.sum);
    const sp = C.createChannelSplitter(2); G.anL = C.createAnalyser(); G.anR = C.createAnalyser();
    G.anL.fftSize = G.anR.fftSize = 2048; G.xyLP.connect(sp); sp.connect(G.anL, 0); sp.connect(G.anR, 1);
    return G;
  }
  function setTier(t) { const T = CFG.TIERS[t] || CFG.TIERS[1]; poly = T.poly; saws = T.padSaws; }
  function setBank(jobs) { bank = jobs.map((j) => ({ m: j.midi, buf: abuf(1, [j.out], j.sr) })); }
  const WL = [1, 1, 0.85];                     // wet level per convolver (the short room is denser early)
  function setIR(slot, L, R, sr) {            // slot 0 hall, 1 sea, 2 gated, 3 room; the caller paces these (main-thread FFT)
    if (!G || sr !== C.sampleRate) return false;
    const b = abuf(2, [L, R]), k = slot === 3 ? 2 : slot;
    if (slot === 2) { G.gCv.buffer = b; return true; }
    G.cv[k].buffer = b; G.cvHas[k] = true;
    if (G.cur >= 0 && pickRev(G.want) !== G.cur) reverb(G.want, C.currentTime + 0.02, 0.3);
    return true;
  }
  function pickRev(w) { const h = G.cvHas; return h[w] ? w : w && h[0] ? 0 : h[2] ? 2 : w; }
  function reverb(kind, t, tau) {             // 0 hall, 1 sea (stand-in until installed: sea → hall → room); idle inputs unplugged
    G.want = kind ? 1 : 0;
    const k = G.cur = pickRev(G.want);
    if (!G.cvOn[k]) { G.rev.connect(G.cv[k]); G.cvOn[k] = true; }
    for (let i = 0; i < 3; i++) { const p = G.wet[i].gain, v = i === k ? WL[i] : 0; hold(p, t); if (tau > 0) tgt(p, v, t, tau); else at(p, v, t); }
    const tok = ++G.revTok;
    setTimeout(() => {
      if (G.revTok !== tok) return;
      for (let i = 0; i < 3; i++) if (i !== k && G.cvOn[i]) { try { G.rev.disconnect(G.cv[i]); } catch (e) { /* ok */ } G.cvOn[i] = false; }
    }, (Math.max(0, t - C.currentTime) + tau * 10 + 6) * 1000);
  }

  // ---- master / lifecycle
  function masterIn(t, dur, first) {
    const p = G.master.gain; hold(p, t);
    if (first) { at(p, db(-9), t); xp(p, db(-1), t + 1.5); }
    else { at(p, 0, t); lin(p, db(-1), t + dur); }
  }
  function masterOut(t, dur) { const p = G.master.gain; hold(p, t); lin(p, 0, t + dur); }
  function tapeStop(t, dur) {                  // quadratic delay growth = a decelerating tape (pitch falls to ~0)
    masterOut(t, dur);
    const c = new Float32Array(16), k = 1 / (2 * dur);
    for (let i = 0; i < 16; i++) { const x = dur * i / 15; c[i] = 0.005 + k * x * x; }
    const p = G.wow.delayTime; hold(p, t);
    try { p.setValueCurveAtTime(c, t + 0.001, dur); } catch (e) { lin(p, c[15], t + dur); }
  }
  function tapeRestore(t) { const p = G.wow.delayTime; hold(p, t); at(p, 0.005, t); }
  function desk(t, e) {
    tgt(G.spkLP.frequency, G.top * Math.pow(1400 / G.top, e), t, 0.15);
    tgt(G.spkPk.gain, 5 * e, t, 0.15);
  }

  // ---- melodic voices
  function ks(t, midi, vel, pan, dest, gm, slow, bright) {
    if (!bank) return false;
    midi = DSP.fold(midi, 31.5, 81.5);
    const b = bank[U.clamp(Math.round((midi - 33) / 3), 0, bank.length - 1)], s = bsrc(b.buf);
    const rate = Math.pow(2, (midi - b.m) / 12) * (slow ? 0.5 : 1), v = U.sat(vel);
    s.playbackRate.value = rate;
    const l = bq('lowpass', 1200 * Math.pow(7.5, v) * (bright || 1), 0.6), amp = 0.9 * Math.pow(v, 1.3) * gm, a = gn(amp), p = pnr(pan);
    s.connect(l).connect(a).connect(p).connect(dest);
    const full = b.buf.duration / rate, end = t + Math.min(3, full);
    if (full > 3) tgt(a.gain, 0, t + 2.7, 0.06);
    s.start(t); s.stop(end); fin(s, [s, l, a, p]);
    voice(t, amp, full / 6, end, a, [s]);
    return true;
  }
  function fm(t, f, amp, ratio, i0, i1, idur, tau, dest, pan, lpHz, reg) {
    const c = os('sine', f), m = os('sine', f * ratio), mg = gn(0), a = gn(0), p = pnr(pan), mf = f * ratio, nodes = [c, m, mg, a, p];
    at(mg.gain, i0 * mf, t); xp(mg.gain, Math.max(0.01, i1 * mf), t + idur);
    m.connect(mg).connect(c.frequency); c.connect(a);
    env(a.gain, t, amp, 0.003, tau);
    let o = a;
    if (lpHz) { o = bq('lowpass', lpHz, 0.5); a.connect(o); nodes.push(o); }
    o.connect(p).connect(dest);
    const end = t + Math.min(3, tau * 7 + 0.05);
    c.start(t); m.start(t); c.stop(end); m.stop(end); fin(c, nodes);
    if (reg !== false) voice(t, amp, tau, end, a, [c, m]);
  }
  function pluck(t, midi, vel, pan, flags, slow, useFm) {
    const gh = flags & (PLUCK.GHOST | PLUCK.JUNE), dest = gh ? G.ghost : G.play;
    const gm = flags & PLUCK.JUNE ? db(-4) : flags & PLUCK.GHOST ? db(-10) : 1;
    if (flags & PLUCK.GHOST) pan = (Math.random() * 2 - 1) * 0.6;
    if (!useFm && ks(t, midi, vel, pan, dest, gm, slow, 1)) return;
    const f = hz(DSP.fold(midi - (slow ? 12 : 0), 24, 96)), v = U.sat(vel);
    fm(t, f, 0.27 * Math.pow(v, 1.3) * gm, 1, 1.2 + v, 0.3, 1.6, 0.5, dest, pan, 5200);
    if (useFm) fm(t, f, 0.07 * v * gm, 3.5, 2.2, 0.1, 1.2, 0.32, dest, pan, 7000, false);
  }
  function chime(t, notes, v, amp, pan) {
    const a = U.clamp(+amp || 0, 0, 1.5) / 1.5, d = G.play;
    if (v === VOICE.BILLBOARD) {
      for (let i = 0; i < notes.length; i++) {
        if (!ks(t + 0.04 * i, notes[i], 0.45 + 0.3 * a, pan, d, 0.4 * a, false, 1.3)) fm(t + 0.04 * i, hz(notes[i]), 0.1 * a, 1, 1.6, 0.3, 1.6, 0.45, d, pan, 6000);
      }
      return;
    }
    const f = hz(notes[0]);
    if (v === VOICE.SUN) fm(t, f, 0.17 * a, 3.5, 5, 0.2, 1.4, 0.6, d, pan, 6500);
    else if (v === VOICE.CLOCK) fm(t, f, 0.14 * a, 3.5, 4, 0.2, 1.4, 0.5, d, pan, 6500);
    else if (v === VOICE.WINDOW) fm(t, f, 0.17 * a, 1, 1.6, 0.3, 1.6, 0.5, d, pan, 5000);
    else fm(t, f, 0.1 * a, 7, 2.5, 0.2, 0.06, 0.02, d, pan, 8000);
  }
  const ping = (t, midi, pan) => fm(t, hz(midi), 0.15, 2, 3, 0.02, 2.5, 0.55, G.play, pan, 4000);
  const box = (t, midi, pan) => { if (!ks(t, midi, 0.55, pan, G.play, 1, false, 1.5)) fm(t, hz(midi), 0.09, 4, 1.4, 0.1, 0.8, 0.4, G.play, pan, 7000); };
  const arp = (t, midi, pan) => fm(t, hz(midi), 0.035, 2, 1.2, 0.1, 0.25, 0.07, G.play, pan, 6000, false);

  // ---- drums + bass (bed). Kick/snare/hats bypass the sidechain.
  function duck(t) { const p = G.side.gain; hold(p, t); tgt(p, 0.55, t, 0.004); tgt(p, 1, t + 0.03, 0.22); }
  function gate(t) { const p = G.gate.gain; hold(p, t); at(p, 0, t); lin(p, 1, t + 0.003); at(p, 1, t + 0.235); lin(p, 0, t + 0.24); }
  function kick(t, vel) {
    const o = os('sine', 120), g = gn(0), c = noise(t, 0.005), cb = bq('bandpass', 3200, 0.8), cg = gn(0), kg = gn(0);
    at(o.frequency, 120, t); xp(o.frequency, 48, t + 0.11);
    env(g.gain, t, db(-10) * vel, 0.002, 0.11); env(cg.gain, t, 0.06 * vel, 0.0004, 0.0012); env(kg.gain, t, vel, 0.002, 0.07);
    o.connect(g).connect(G.drum); c.connect(cb).connect(cg).connect(G.drum); o.connect(kg).connect(G.kxIn);   // + knock for small speakers
    o.start(t); o.stop(t + 0.6); fin(o, [o, g, c, cb, cg, kg]);
    duck(t);
  }
  function snare(t, vel) {
    const n = noise(t, 0.3), bp = bq('bandpass', 1900, 0.8), ng = gn(0), tr = os('triangle', 185), tg = gn(0), o = gn(1);
    n.connect(bp).connect(ng).connect(o); tr.connect(tg).connect(o);
    env(ng.gain, t, 0.4 * vel, 0.001, 0.045); env(tg.gain, t, 0.24 * vel, 0.001, 0.03);
    o.connect(G.drum); o.connect(G.gIn);
    tr.start(t); tr.stop(t + 0.1); fin(n, [n, bp, ng, tr, tg, o]);
    gate(t);
  }
  function hat(t, vel, pan) {
    const n = noise(t, 0.08), hp = bq('highpass', 7500, 0.7), g = gn(0), p = pnr(pan);
    n.connect(hp).connect(g).connect(p).connect(G.drum); env(g.gain, t, 0.17 * vel, 0.0008, 0.011); fin(n, [n, hp, g, p]);
  }
  function shaker(t, vel) {
    const n = noise(t, 0.12), bp = bq('bandpass', 6000, 0.9), g = gn(0), p = pnr(0.25);
    n.connect(bp).connect(g).connect(p).connect(G.drum); env(g.gain, t, 0.1 * vel, 0.005, 0.02); fin(n, [n, bp, g, p]);
  }
  function tom(t, f, vel, pan) {
    const o = os('sine', f), g = gn(0), p = pnr(pan);
    at(o.frequency, f, t); xp(o.frequency, f * 0.7, t + 0.12);
    env(g.gain, t, 0.26 * vel, 0.002, 0.09); o.connect(g).connect(p).connect(G.drum);
    o.start(t); o.stop(t + 0.5); fin(o, [o, g, p]);
  }
  function bass(t, midi, vel) {
    const f = hz(midi), o = os('sawtooth', f), s = os('sine', f / 2), sg = gn(1.5), lp = bq('lowpass', 900, 1.1), g = gn(0), xg = gn(0);
    o.connect(lp); s.connect(sg).connect(lp); lp.connect(g).connect(G.music);
    o.connect(xg).connect(G.bxIn); env(xg.gain, t, 0.9 * vel, 0.004, 0.08);    // driven harmonics: audible on phones
    at(lp.frequency, 900, t); tgt(lp.frequency, 380, t + 0.005, 0.07);
    env(g.gain, t, 0.12 * vel, 0.004, 0.065);
    o.start(t); s.start(t); o.stop(t + 0.32); s.stop(t + 0.32); fin(o, [o, s, sg, lp, g, xg]);
  }
  function sub(t, midi, dur, vel) {
    const f = hz(midi), o = os('sine', f), g = gn(0), o2 = os('sawtooth', f), lp = bq('lowpass', 1100, 0.9), g2 = gn(0);
    at(g.gain, 0, t); lin(g.gain, 0.085 * vel, t + 0.03); tgt(g.gain, 0, t + dur - 0.05, 0.08);
    at(g2.gain, 0, t); lin(g2.gain, 0.099 * vel, t + 0.03); tgt(g2.gain, 0, t + dur - 0.05, 0.08);   // saw body: heard on phones
    at(lp.frequency, 1100, t); tgt(lp.frequency, 820, t + 0.03, 0.6);
    o.connect(g).connect(G.music); o2.connect(lp).connect(g2).connect(G.music);
    o.start(t); o2.start(t); o.stop(t + dur + 0.5); o2.stop(t + dur + 0.5); fin(o, [o, g, o2, lp, g2]);
  }

  // ---- pad (4-note voicings, detuned saws, shared LP + LFO) and exchange beds
  function pad(t, notes, att) {
    padRel(t, 0.55);
    const g = gn(0), oscs = [], dets = saws === 2 ? [-7, 7] : [-9, 0, 9], per = saws === 2 ? 0.05 : 0.041, ps = [];
    for (let j = 0; j < dets.length; j++) { const p = pnr(dets[j] / 15); p.connect(g); ps.push(p); }   // detune layers spread L/C/R
    for (let i = 0; i < notes.length; i++) for (let j = 0; j < dets.length; j++) {
      const o = os('sawtooth', hz(notes[i]));
      o.detune.value = dets[j] + (Math.random() - 0.5) * 4;
      if (G.det) G.det.connect(o.detune);
      o.connect(ps[j]); o.start(t); oscs.push(o);
    }
    at(g.gain, 0, t); lin(g.gain, per, t + att);
    g.connect(G.padLP);
    padCur = { g, oscs, ps };
  }
  function unDet(oscs) { if (G.det) for (const o of oscs) { try { G.det.disconnect(o.detune); } catch (e) { /* ok */ } } }
  function padRel(t, tau) {
    const p = padCur;
    if (!p) return;
    padCur = null;
    hold(p.g.gain, t); tgt(p.g.gain, 0, t, tau);
    for (const o of p.oscs) o.stop(t + tau * 7);
    p.oscs[0].onended = () => { unDet(p.oscs); for (const o of p.oscs.concat(p.ps)) o.disconnect(); p.g.disconnect(); };
  }
  function choirTo(t, notes) {             // Long Distance "choir": 3 saws through vowel formants (800 / 1150 Hz)
    if (!notes) {
      if (choir) { const c = choir; choir = null; hold(c.g.gain, t); tgt(c.g.gain, 0, t, 0.6); for (const o of c.o) o.stop(t + 5); c.v.o.stop(t + 5); c.o[0].onended = () => { unDet(c.o); c.g.disconnect(); }; }
      return;
    }
    if (!choir) {
      const g = gn(0), f1 = bq('peaking', 800, 3, 9), f2 = bq('peaking', 1150, 3, 7), lp = bq('lowpass', 2600, 0.6), o = [];
      lp.connect(f1).connect(f2).connect(g).connect(G.padBus);
      const v = lfo(5.2, 7, g.gain, t);
      v.disconnect();
      for (let i = 0; i < 3; i++) { const s = os('sawtooth', hz(notes[i])); s.detune.value = (i - 1) * 4; v.connect(s.detune); if (G.det) G.det.connect(s.detune); s.connect(lp); s.start(t); o.push(s); }
      at(g.gain, 0, t); tgt(g.gain, 0.02, t, 0.9);
      choir = { g, o, v };
    }
    for (let i = 0; i < 3; i++) tgt(choir.o[i].frequency, hz(notes[i]), t, 0.09);
  }
  function seaTo(t, on) {                    // Tide wash: pink noise LP 600, gain follows the swell
    if (on && !sea) {
      const s = bsrc(G.pink, true), lp = bq('lowpass', 600, 0.5), m = gn(0.08), g = gn(0);
      const l1 = lfo(0.143, 0.036, m.gain, t), l2 = lfo(0.207, 0.02, m.gain, t);
      s.connect(lp).connect(m).connect(g).connect(G.music); s.start(t, Math.random() * 1.5);
      tgt(g.gain, 1, t, 1.2); sea = { s, g, l: [l1.o, l2.o] };
    } else if (!on && sea) { const q = sea; sea = null; hold(q.g.gain, t); tgt(q.g.gain, 0, t, 0.8); q.s.stop(t + 6); for (const o of q.l) o.stop(t + 6); fin(q.s, [q.s, q.g]); }
  }
  function beds(t, ex, ci) { seaTo(t, ex === EX.TIDE); choirTo(t, ex === EX.LONG ? DSP.choirNotes(ex, ci) : null); }

  // ---- slow beam: tape-stop pad (−1200 cents / 0.8 s, LP → 500 Hz) + beating root/fifth drone
  function slow(t, on, root) {
    if (G.det) { const p = G.det.offset; hold(p, t); lin(p, on ? -1200 : 0, t + (on ? 0.8 : 0.4)); }
    tgt(G.padLP.frequency, on ? 500 : 1400, t, on ? 0.25 : 0.12);
    tgt(G.padLfo.gain, on ? 120 : 400, t, 0.2);
    if (on && !drone) {
      const g = gn(0), o = [];
      for (const f of [hz(root), hz(root) + 0.7, hz(root + 7), hz(root + 7) + 0.7]) { const s = os('sine', f); s.connect(g); s.start(t); o.push(s); }
      g.connect(G.music); tgt(g.gain, db(-18) / 3, t, 0.4); drone = { g, o };
    } else if (!on && drone) {
      const d = drone; drone = null; hold(d.g.gain, t); tgt(d.g.gain, 0, t, 0.15);
      for (const s of d.o) s.stop(t + 1.2); fin(d.o[0], d.o.concat([d.g]));
    }
  }

  // ---- telephony (everything through the 300–3000 Hz tel bus)
  const ROW = [697, 770, 852, 941], COLS = [1209, 1336, 1477], KEYS = '123456789*0#';
  function dtmfHz(ch) { const i = KEYS.indexOf(String(ch)); return i < 0 ? null : [ROW[(i / 3) | 0], COLS[i % 3]]; }
  function tone(t0, t1, fs, amp, dest, list) {
    const g = gn(0), o = [];
    at(g.gain, 0, t0); lin(g.gain, amp / fs.length, t0 + 0.004);
    at(g.gain, amp / fs.length, Math.max(t0 + 0.004, t1 - 0.005)); lin(g.gain, 0, t1);
    for (const f of fs) { const s = os('sine', f); s.connect(g); s.start(t0); s.stop(t1 + 0.02); o.push(s); if (list) list.push(s); }
    g.connect(dest); fin(o[0], o.concat([g]));
  }
  const dtmf = (t, ch, dur, dest, list) => { const f = dtmfHz(ch); if (f) tone(t, t + dur, f, db(-22), dest || G.tel, list); };
  function sit(t) { const f = [913.8, 1370.6, 1776.7], d = [0.274, 0.274, 0.38]; let a = t; for (let i = 0; i < 3; i++) { tone(a, a + d[i], [f[i]], db(-24), G.tel); a += d[i]; } }
  function busy(t) { for (let i = 0; i < 4; i++) tone(t + i, t + i + 0.5, [480, 620], db(-24), G.tel); }
  function click(t) {
    const n = noise(t, 0.012), hp = bq('highpass', 2000, 0.7), ng = gn(0), o = os('sine', 120), og = gn(0), lp = bq('lowpass', 3000, 0.7);
    n.connect(hp).connect(ng).connect(lp); o.connect(og).connect(lp); lp.connect(G.sum);
    env(ng.gain, t, 0.22, 0.0005, 0.0018); env(og.gain, t, 0.3, 0.002, 0.012);
    o.start(t); o.stop(t + 0.09); fin(o, [n, hp, ng, o, og, lp]);
  }
  // Handshake record: its own tel + pad sub-buses so a skip can fade everything at once.
  function hsNew() { const h = { tel: gn(1), pad: gn(1), s: [] }; h.tel.connect(G.tel); h.pad.connect(G.padBus); return h; }
  function hsFade(h, t, dur) {
    for (const g of [h.tel, h.pad]) { hold(g.gain, t); lin(g.gain, 0, t + dur); }
    for (const s of h.s) { try { s.stop(t + dur + 0.01); } catch (e) { /* ok */ } }
    setTimeout(() => { try { h.tel.disconnect(); h.pad.disconnect(); } catch (e) { /* ok */ } }, (dur + 0.2 + Math.max(0, t - C.currentTime)) * 1000);
  }
  const dial = (h, t0, t1) => tone(t0, t1, [350, 440], db(-24), h.tel, h.s);
  const answer = (h, t0, t1) => tone(t0, t1, [2100], db(-26), h.tel, h.s);
  function chirp(h, tS, t0, t1) {            // two FM chirps 600→1800 Hz with 18 Hz vibrato (Bell-103-ish warble)
    const d = (t1 - t0) / 2;
    for (let k = 0; k < 2; k++) {
      const a = t0 + k * d, b = a + d - 0.02;
      if (b - Math.max(a, tS) < 0.04) continue;
      const s0 = Math.max(a, tS), o = os('sine', 600), o2 = os('sine', 900), v = os('sine', 18), vg = gn(60), g = gn(0);
      v.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      for (const [x, f0] of [[o, 600], [o2, 900]]) { at(x.frequency, f0 * Math.pow(3, (s0 - a) / (b - a)), s0); xp(x.frequency, f0 * 3, b); }
      o.connect(g); o2.connect(gn(0.4)).connect(g); g.connect(h.tel);
      at(g.gain, 0, s0); lin(g.gain, db(-26), s0 + 0.01); at(g.gain, db(-26), b - 0.012); lin(g.gain, 0, b);
      for (const x of [o, o2, v]) { x.start(s0); x.stop(b + 0.02); h.s.push(x); }
      fin(o, [o, o2, v, vg, g]);
    }
  }
  // Modem carriers (Bell 103 tones) glide exponentially to the target chord, hold, then dissolve into the pad.
  function glide(h, tS, g0, g1, tDb, notes) {
    const from = [1070, 1270, 1650, 2025, 2225], lp = bq('lowpass', 1800, 0.5), g = gn(0), x = U.sat((tS - g0) / Math.max(0.05, g1 - g0));
    lp.connect(g).connect(h.pad);
    at(g.gain, 0, tS); lin(g.gain, 1, tS + 0.12);
    at(g.gain, 1, tDb); tgt(g.gain, 0, tDb + 0.05, 0.5);
    const o = [];
    for (let i = 0; i < notes.length; i++) {
      const to = hz(notes[i]), f0 = from[i % 5], s = os('triangle', f0 * Math.pow(to / f0, x)), sg = gn(0.02);
      s.detune.value = (i - 2) * 3;
      if (tS < g1) xp(s.frequency, to, g1);
      s.connect(sg).connect(lp); s.start(tS); s.stop(tDb + 3.5); h.s.push(s); o.push(s, sg);
    }
    fin(o[0], o.concat([lp, g]));
  }

  // ---- effects
  function degauss(t) {
    const out = gn(db(-12)), lp = bq('lowpass', 260, 4), hg = gn(0), o = [];
    out.connect(G.play); lp.connect(out); hg.connect(lp);
    [[60, 1], [120, 0.5], [180, 0.25], [240, 0.15], [300, 0.15]].forEach(([f, a]) => { const s = os('sine', f), g = gn(a); s.connect(g).connect(hg); s.start(t); s.stop(t + 1.3); o.push(s, g); });
    env(hg.gain, t, 0.9, 0.006, 0.24);
    const n = noise(t, 0.025), nl = bq('lowpass', 180, 0.7), ng = gn(0); n.connect(nl).connect(ng).connect(out); env(ng.gain, t, 1.4, 0.001, 0.008);
    const r = os('sine', 523), m = os('sine', 77), rg = gn(0), rr = gn(0);
    m.connect(rg.gain); r.connect(rg).connect(rr).connect(G.play);
    at(rr.gain, db(-26), t); tgt(rr.gain, 0, t + 0.25, 0.05);
    r.start(t); m.start(t); r.stop(t + 0.45); m.stop(t + 0.45);
    fin(o[0], o.concat([out, lp, hg, n, nl, ng, r, m, rg, rr]));
  }
  function magnet(t, level, root) {           // strong-magnet hum: in-key low fifth, filter + level rise
    if (level > 0.001 && !hum) {
      const g = gn(0), lp = bq('lowpass', 200, 2), o = [os('sawtooth', hz(root)), os('sine', hz(root + 7))];
      for (const s of o) { s.connect(lp); s.start(t); }
      lp.connect(g).connect(G.play); hum = { g, lp, o };
    }
    if (!hum) return;
    if (level <= 0.001) { const q = hum; hum = null; hold(q.g.gain, t); tgt(q.g.gain, 0, t, 0.08); for (const s of q.o) s.stop(t + 0.6); fin(q.o[0], q.o.concat([q.g, q.lp])); return; }
    tgt(hum.g.gain, 0.06 * level, t, 0.08); tgt(hum.lp.frequency, 200 + 1400 * level, t, 0.08);
  }
  function pullStop(t, tau) {
    const d = pull;
    if (!d) return;
    pull = null; hold(d.g.gain, t); tgt(d.g.gain, 0, t, tau);
    for (const s of d.o) s.stop(t + tau * 8 + 0.02);
    fin(d.o[0], d.o.concat([d.lp, d.tr, d.g]));
  }
  function pullStart(t, root) {               // tension drone: 2 saws (root, +7 ct) → resonant LP 300→3200
    pullStop(t, 0.03);
    const f = hz(root), o = [os('sawtooth', f), os('sawtooth', f)], lp = bq('lowpass', 300, 6), tr = gn(1), g = gn(0);
    o[1].detune.value = 7;
    for (const s of o) { s.connect(lp); s.start(t); }
    lp.connect(tr).connect(g).connect(G.play);
    at(g.gain, 0, t); lin(g.gain, db(-27), t + 0.25);
    pull = { o, lp, tr, g, f };
  }
  function pullT(t, x) {
    if (!pull) return;
    x = U.sat(x);
    const f = pull.f * Math.pow(2, x);
    for (const s of pull.o) tgt(s.frequency, f, t, 0.04);
    tgt(pull.lp.frequency, 300 * Math.pow(3200 / 300, x), t, 0.04);
    tgt(pull.g.gain, db(-27 + 10 * x), t, 0.06);
  }
  function unravel(t) {
    if (!pull || pull.u) return;
    pull.u = 1; pull.tr.gain.value = 0.65; pull.o.push(lfo(7, 0.35, pull.tr.gain, t).o);
    for (const k of [4, 6]) { const s = os('sine', pull.f * k), g = gn(0); s.connect(g).connect(pull.tr); tgt(g.gain, 0.012, t, 0.2); s.start(t); pull.o.push(s); }
  }
  function snap(t) {
    pullStop(t, 0.008);
    if (!ks(t, 76, 0.95, 0, G.play, 1, false, 1)) fm(t, hz(76), 0.25, 1, 2.2, 0.3, 1.2, 0.5, G.play, 0, 6000);
    const o = os('sine', 420), g = gn(0);
    at(o.frequency, 420, t); xp(o.frequency, 70, t + 0.16);
    env(g.gain, t, 0.28, 0.002, 0.06); o.connect(g).connect(G.play); o.start(t); o.stop(t + 0.5); fin(o, [o, g]);
    kick(t, 1);
    const n = noise(t, 0.08), bp = bq('bandpass', 1200, 0.7), ng = gn(0);
    n.connect(bp).connect(ng); ng.connect(G.gIn); ng.connect(gn(0.3)).connect(G.drum);
    env(ng.gain, t, 0.35, 0.001, 0.03); fin(n, [n, bp, ng]); gate(t);
  }
  function cancelPull(t) {
    pullStop(t, 0.04);
    const o = os('sine', 90), g = gn(0);
    at(o.frequency, 90, t); xp(o.frequency, 45, t + 0.35);
    env(g.gain, t, 0.32, 0.004, 0.12); o.connect(g).connect(G.play); o.start(t); o.stop(t + 0.9); fin(o, [o, g]);
    if (!ks(t, 40, 0.7, 0, G.play, 1, false, 1)) fm(t, hz(40), 0.2, 1, 1.6, 0.3, 1, 0.5, G.play, 0, 3000);
  }

  // ---- handset (§10.2): 300–3400 band + looping XY picture
  function xyLoad(t, pic) {
    const b = C.createBuffer(2, 1024, C.sampleRate), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < 1024; i++) { L[i] = pic[2 * i]; R[i] = pic[2 * i + 1]; }
    const s = bsrc(b, true), g = gn(0);
    s.connect(g).connect(G.xyLP); s.start(t); tgt(g.gain, 1, t, 0.01);
    xyOff(t);
    xy = { s, g };
  }
  function xyOff(t) { const q = xy; if (!q) return; xy = null; hold(q.g.gain, t); tgt(q.g.gain, 0, t, 0.01); q.s.stop(t + 0.1); fin(q.s, [q.s, q.g]); }
  function handset(t, on, pic) {
    tgt(G.hsHP.frequency, on ? 300 : 10, t, 0.05);
    tgt(G.hsLP.frequency, on ? 3400 : G.top, t, 0.05);
    if (on && pic) xyLoad(t, pic); else if (!on) xyOff(t);
  }
  function readXY(L, R) { if (!xy) return false; G.anL.getFloatTimeDomainData(L); G.anR.getFloatTimeDomainData(R); return true; }
  // 64 log bands 60 Hz–8 kHz (attack kA / release kR, frame-rate corrected by caller); returns the 6–10 kHz level.
  function analyse(bands, kA, kR) {
    const d = G.fd;
    G.an.getByteFrequencyData(d);
    for (let b = 0; b < 64; b++) {
      const lo = G.bLo[b], hi = G.bHi[b];
      let v;
      if (hi - lo <= 1) { const x = G.bX[b], i = x | 0, f = x - i; v = (d[i] * (1 - f) + d[i + 1] * f) / 255; }
      else { v = 0; for (let i = lo; i < hi; i++) if (d[i] > v) v = d[i]; v /= 255; }
      const c = bands[b];
      bands[b] = v > c ? c + (v - c) * kA : v + (c - v) * kR;
    }
    let s = 0;
    for (let i = G.h0; i < G.h1; i++) s += d[i];
    return s / (255 * Math.max(1, G.h1 - G.h0));
  }

  return { build, setTier, setBank, setIR, reverb, masterIn, masterOut, tapeStop, tapeRestore, desk,
    pluck, chime, ping, box, arp, kick, snare, hat, shaker, tom, bass, sub, pad, padRel, beds, choirTo, slow,
    dtmf, sit, busy, click, hsNew, hsFade, dial, answer, chirp, glide, degauss, magnet,
    pullStart, pullT, unravel, snap, cancelPull, handset, xyLoad, readXY, analyse, count,
    get ready() { return !!G && !!C; }, get hasBank() { return !!bank; } };
})();
