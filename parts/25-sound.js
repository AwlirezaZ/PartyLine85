// 25-sound.js — Sound 3/3: public API (contracts §3). The transport lives on the perf clock (mode A) until audio
// runs, then on the audio clock (mode B: anchor = anchorSec·1000 + slewed offset). Steps are perf-ms heard times;
// audio plays at (ts − off)/1000, which is exactly anchorSec + k·S16 in mode B, so the groove never jitters.
const Sound = (() => {
  const T = CFG.TRANSPORT, HS = CFG.HANDSHAKE, EN = CFG.ENERGY, V = SoundVoice, D = SoundDSP;
  const BAR = T.BAR_MS, S16 = T.S16_MS, NE = T.EVENT_RING, NA = 48, STALE = T.STALE_EVENT_MS;
  const PROT = (1 << EV.DOWNBEAT) | (1 << EV.KNIT_LAND) | (1 << EV.HS_DIGIT) | (1 << EV.HS_GLIDE);
  const SW8 = (T.SWING - 0.5) * T.BEAT_MS, SW16 = SW8 / 2;
  const A_PLUCK = 1, A_DIAL = 2, A_DTMF = 3, A_ANS = 4, A_CHIRP = 5, A_GLIDE = 6;
  const SILENT = 'data:audio/wav;base64,UklGRoQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWAAAAC' + 'AgIC'.repeat(31) + 'AgIA=';
  const SRCN = ['pluck', 'strum', 'ghost', 'june', 'lighthouse', 'chime', 'ping', 'bed', 'box', 'arp', 'snap', 'release'];
  const RES_EV = ['pointerup', 'touchend', 'click', 'keydown'];
  const THR = [EN.BASS, EN.HATS, EN.KICK4, EN.FILL, EN.SNARE];    // layers: bass, hats, kick4 (Tide: kick on 3), fill, snare

  let inited = false, tier = 1, lastTick = -1e9, lastUpd = 0, lastErr = '';
  let ctx = null, failed = false, muted = false, hidden = false, resumeAt = -1e9, quietTok = 0, listening = false, silentTried = false;
  let off = 0, offOK = false, nOff = 0, wasLive = false, modeB = false, anchorPerf = 0, anchorSec = 0, version = 0, kNext = 0, joinK = 0;
  let arrOn = false, sEx = EX.MERIDIAN, sBar0 = 0, hEx0 = EX.MERIDIAN, hBar00 = 0, hSwitch = -Infinity;
  let lastChord = -1, padCi = -1, padEx = -1, floorEnd = -1, knitKick = -1e9;
  let eVal = 0, eT = 0, idle = 0, retrace = false, slowOn = false, audioSlow = false, slowFrom = Infinity, slowTo = Infinity;
  let hs = null, hsRec = null, knit = null, hsOn = false, xyHave = false, deskE = 0, pullX = -1;
  let bankJobs = null, bankLeft = 0, irJobs = null, irSr = 0, irQ = 0, irNext = 0, irWait = false, irSince = 0, lastAct = -1e9;
  const lay = [false, false, false, false, false];
  const xyPic = new Float32Array(2048), xyOut = { l: new Float32Array(2048), r: new Float32Array(2048) };
  const bands = new Float32Array(64);
  let hats = 0, energyNow = 0;
  const RL = new Float64Array(24).fill(-1e9);
  const eTm = new Float64Array(NE), eTy = new Uint8Array(NE), eV0 = new Float64Array(NE), eV1 = new Float64Array(NE);
  const aOn = new Uint8Array(NA), aK = new Uint8Array(NA), aT = new Float64Array(NA), aT1 = new Float64Array(NA);
  const aA = new Float64Array(NA), aB = new Float64Array(NA), aC = new Float64Array(NA), aD = new Float64Array(NA);
  const nT = new Float64Array(256), nM = new Float32Array(256), nS = new Uint8Array(256);
  let nI = 0, nN = 0;
  const cache = {};

  const note = (e) => { lastErr = String((e && e.stack) || e); };
  const safe = (fn, d) => function () { try { return fn.apply(null, arguments); } catch (e) { note(e); return d; } };
  const anchor = () => (modeB ? anchorSec * 1000 + off : anchorPerf);
  const toA = (ms) => (ms - off) / 1000;
  const hx = (now) => (now >= hSwitch ? sEx : hEx0);
  const revKind = (ex) => (CFG.EXCHANGES[ex].reverb === 'sea' ? 1 : 0);
  const has = () => !!ctx && V.ready;
  function live() { return has() && !muted && !hidden && offOK && ctx.state === 'running'; }
  function canPlay() {
    if (!has() || muted || hidden) return false;
    const s = ctx.state;
    return s === 'running' || (s !== 'closed' && U.now() - resumeAt < 3000);
  }
  function log(t, midi, s) { nT[nI] = t; nM[nI] = midi; nS[nI] = s; nI = (nI + 1) & 255; if (nN < 256) nN++; }
  function rate(i, t) {                      // ≤ 3 triggers per instrument per 40 ms
    let o = i * 3;
    for (let j = i * 3 + 1; j < i * 3 + 3; j++) if (RL[j] < RL[o]) o = j;
    if (t - RL[o] < 0.04) return false;
    RL[o] = t; return true;
  }

  // ---- energy (§6.3)
  const energyAt = (t) => eVal * Math.exp(-Math.max(0, t - eT) / (idle === 1 ? 8000 : 18000));
  function effE(t, bar) {
    if (idle >= 2) return 0;
    const e = energyAt(t);
    return floorEnd >= 0 && bar < floorEnd ? Math.max(e, EN.FLOOR) : e;
  }
  function addE(x, now) { if (idle < 2) { eVal = Math.min(1, energyAt(now) + x); eT = now; } }

  // ---- event ring (time-ordered delivery; DOWNBEAT / KNIT_LAND / HS_* never go stale)
  function pushEv(type, t, v0, v1) {
    let i = -1;
    for (let k = 0; k < NE; k++) if (!eTy[k]) { i = k; break; }
    if (i < 0) {
      let b = Infinity, bp = Infinity, ip = 0;
      for (let k = 0; k < NE; k++) {
        if (!((PROT >> eTy[k]) & 1) && eTm[k] < b) { b = eTm[k]; i = k; }
        if (eTm[k] < bp) { bp = eTm[k]; ip = k; }
      }
      if (i < 0) i = ip;
    }
    eTy[i] = type; eTm[i] = (PROT >> type) & 1 ? t - 1e-3 : t; eV0[i] = v0; eV1[i] = v1;   // protected first on ties
  }
  function pollEvents(now, fn) {
    for (let g = 0; g < NE; g++) {
      let i = -1, tb = Infinity;
      for (let k = 0; k < NE; k++) if (eTy[k] && eTm[k] <= now && eTm[k] < tb) { tb = eTm[k]; i = k; }
      if (i < 0) return;
      const ty = eTy[i];
      eTy[i] = 0;
      if (now - tb > STALE && !((PROT >> ty) & 1)) continue;
      if (fn) fn(ty, tb, eV0[i], eV1[i]);
    }
  }
  function addAct(kind, t, t1, a, b, c, d) {
    let i = 0;
    while (i < NA && aOn[i]) i++;
    if (i === NA) { i = 0; for (let k = 1; k < NA; k++) if (aT[k] < aT[i]) i = k; }
    aOn[i] = 1; aK[i] = kind; aT[i] = t; aT1[i] = t1; aA[i] = a || 0; aB[i] = b || 0; aC[i] = c || 0; aD[i] = d || 0;
  }

  // ---- transport
  function toModeA() { if (modeB) { anchorPerf = anchorSec * 1000 + off; modeB = false; } offOK = false; nOff = 0; }
  function setAnchor(ms) {
    if (modeB) anchorSec = (ms - off) / 1000; else anchorPerf = ms;
    version++;
    kNext = Math.ceil((U.now() - ms) / S16 - 1e-7);
  }
  const transport = {
    bar(now) { return (now - anchor()) / BAR; },
    barPhase(now) { const b = (now - anchor()) / BAR; return b - Math.floor(b); },
    nextDownbeat(now, minAhead) { return D.gridAt(anchor(), BAR, now + (minAhead || 0)); },
    nextGrid(now, perBar, minAhead) { return D.gridAt(anchor(), BAR / (perBar > 0 ? perBar : 16), now + (minAhead || 0)); },
    get version() { return version; },
    get anchorMs() { return anchor(); },
  };
  function sampleOff(now) {                  // EMA of the perf↔audio offset (heard time = ctxTime·1000 + off)
    if (!has()) return;
    if (ctx.state !== 'running') { if (offOK) toModeA(); return; }
    const ct = ctx.currentTime;
    if (!(ct > 0)) return;
    let raw = now - (ct - (ctx.outputLatency || ctx.baseLatency || 0.02)) * 1000;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) { const r = ts.performanceTime - ts.contextTime * 1000; if (Math.abs(r - raw) < 150) raw = r; }
    }
    if (!offOK) { off = raw; offOK = true; nOff = 0; }
    else if (!modeB) {                         // settle: 8 consecutive consistent samples, then move to the audio clock
      if (Math.abs(raw - off) > 15) { off = raw; nOff = 0; } else { nOff++; off += (raw - off) / (nOff + 1); }
      if (nOff >= 8) { anchorSec = (anchorPerf - off) / 1000; modeB = true; }
    } else if (Math.abs(raw - off) > 80) { const a = anchor(); off = raw; anchorSec = (a - off) / 1000; }
    else off += 0.1 * (raw - off);
  }

  // ---- scheduler (25 ms tick, 120 ms lookahead, 16th resolution)
  function tick() {
    if (!inited) return;
    try {
      const now = U.now();
      lastTick = now;
      sampleOff(now);
      const L = live();
      if (L !== wasLive) { wasLive = L; if (L) onLive(now); }
      const horizon = L ? (ctx.currentTime + T.LOOKAHEAD) * 1000 + off : now + T.LOOKAHEAD * 1000;
      const a = anchor();
      if (a + kNext * S16 < now - STALE) kNext = Math.ceil((now - STALE - a) / S16);
      actions(now, horizon, L);
      for (let g = 0; g < 64; g++) {
        const ts = anchor() + kNext * S16;
        if (knit && knit.t <= ts + 0.5 && knit.t <= horizon) runKnit(L);
        if (ts > horizon) break;
        step(kNext, ts, now, L);
        kNext++;
      }
      if (knit && knit.t <= horizon) runKnit(L);
    } catch (e) { note(e); }
  }
  function onLive(now) {                      // audio (re)joins: bed re-aligns at the next downbeat, pad swells now
    const ct = ctx.currentTime;
    V.reverb(revKind(hx(now)), ct, 0);
    joinK = Math.ceil(kNext / 16) * 16;
    padCi = padEx = -1;
    if (arrOn && now >= anchor()) { const ci = D.chordOf(Math.floor((now - anchor()) / BAR), sBar0); padTo(ci, ct, 1.2); V.beds(ct, sEx, ci); }
    if (audioSlow !== slowOn) { audioSlow = slowOn; V.slow(ct, slowOn, CFG.EXCHANGES[hx(now)].root); }
    V.desk(ct, deskE);
  }
  function glideNotes() {
    if (sEx === EX.MERIDIAN) return HS.GLIDE_MIDI;
    const c = CFG.EXCHANGES[sEx].progression[0];
    return [c.bass].concat(c.pad);
  }
  function actions(now, horizon, L) {
    for (let i = 0; i < NA; i++) {
      if (!aOn[i] || aT[i] > horizon) continue;
      const k = aK[i];
      if (k === A_PLUCK) {
        if (aT[i] < now - 40) { aOn[i] = 0; continue; }
        if (!L) continue;
        aOn[i] = 0;
        const t = Math.max(toA(aT[i]), ctx.currentTime), fmv = CFG.EXCHANGES[hx(aT[i])].pluckVoice === 'fm';
        if (rate(fmv ? 1 : 0, t)) V.pluck(t, aA[i], aB[i], aC[i], aD[i], slowOn, fmv);
        continue;
      }
      if (aT1[i] < now) { aOn[i] = 0; continue; }
      if (!L) continue;
      aOn[i] = 0;
      const t0 = toA(aT[i]), t1 = toA(aT1[i]), tS = Math.max(t0, ctx.currentTime + 0.005);
      if (!hsRec) hsRec = V.hsNew();
      if (k === A_GLIDE) { V.glide(hsRec, tS, t0, toA(aA[i]), t1, glideNotes()); continue; }
      if (t1 - tS < 0.025) continue;
      if (k === A_DIAL) V.dial(hsRec, tS, t1);
      else if (k === A_DTMF) V.dtmf(tS, String.fromCharCode(aA[i]), t1 - tS, hsRec.tel, hsRec.s);
      else if (k === A_ANS) V.answer(hsRec, tS, t1);
      else V.chirp(hsRec, tS, t0, t1);
    }
  }
  function runKnit(L) {
    const k = knit;
    knit = null;
    const landBar = Math.round((k.t - anchor()) / BAR), g = anchor() + landBar * BAR, on = Math.abs(g - k.t) < S16 / 2, tl = on ? g : k.t;
    hEx0 = sEx; hBar00 = sBar0; hSwitch = tl;
    sEx = k.ex; sBar0 = landBar; lastChord = 0; knitKick = on ? landBar * 16 : -1e9;   // snap to the heard bar line
    pushEv(EV.KNIT_LAND, tl, k.ex, 0); pushEv(EV.CHORD, tl, 0, k.ex); pushEv(EV.KICK, tl, 1, 0);
    if (L) {
      const tA = Math.max(ctx.currentTime, toA(tl));
      V.kick(tA, 1); padEx = -1; padTo(0, tA, 0.4); V.beds(tA, sEx, 0); V.reverb(revKind(sEx), tA, 0.5);
    }
  }
  function padTo(ci, tA, att) {
    if (padCi === ci && padEx === sEx) return;
    V.pad(tA, CFG.EXCHANGES[sEx].progression[ci].pad, att);
    if (sEx === EX.LONG) V.choirTo(tA, D.choirNotes(sEx, ci));
    padCi = ci; padEx = sEx;
  }
  function barStart(bar, ts, tA) {
    if (floorEnd >= 0 && bar >= floorEnd) { eVal = Math.max(energyAt(ts), EN.FLOOR); eT = ts; floorEnd = -1; }
    const E = effE(ts, bar), ci = D.chordOf(bar, sBar0);
    for (let i = 0; i < 5; i++) {
      if (!lay[i] && E >= THR[i] + EN.HYST - 1e-9) lay[i] = true;
      else if (lay[i] && E < THR[i] - EN.HYST) lay[i] = false;
    }
    if (ci !== lastChord) { lastChord = ci; pushEv(EV.CHORD, ts, ci, sEx); }
    pushEv(EV.BAR, ts, bar, ci);
    if (bar === 0 && hs && hs.down) {
      hs.down = false;
      for (let k = 0; k < NE; k++) if (eTy[k] === EV.DOWNBEAT && Math.abs(eTm[k] - ts) < 60) eTm[k] = ts - 1e-3;
      if (tA >= 0) { padCi = -1; padTo(ci, tA, hs.skipped ? 0.35 : 1.2); V.beds(tA, sEx, ci); }
    } else if (tA >= 0) padTo(ci, tA, 1.2);
  }
  function memo(key, fn) { return cache[key] || (cache[key] = fn()); }
  function hitKick(ts, tA, v) { pushEv(EV.KICK, ts, v, 0); if (tA >= 0) V.kick(tA, v); }
  function hitSnare(ts, tA, v) { pushEv(EV.SNARE, ts, v, 0); if (tA >= 0) V.snare(tA, v); }
  function hitHat(ts, tA, v, sw, shk) { pushEv(EV.HAT, ts + sw, v, 0); if (tA >= 0) { if (shk) V.shaker(tA + sw / 1000, v); else V.hat(tA + sw / 1000, v, 0.2); } }
  function step(k, ts, now, L) {
    if (!arrOn || k < 0) return;
    const bar = Math.floor(k / 16), s = k - bar * 16;
    let tA = -1;
    if (L && k >= joinK) { const ct = ctx.currentTime; tA = toA(ts); if (tA < ct - T.RESYNC) tA = -1; else if (tA < ct) tA = ct; }
    if (s === 0) barStart(bar, ts, tA);
    const ex = sEx, E = CFG.EXCHANGES[ex], ci = D.chordOf(bar, sBar0), ch = E.progression[ci];
    if (retrace) {                           // pad only + music box: call + resolve every 2 bars
      const idx = s === 12 ? 5 : s % 2 === 0 && s <= 8 ? s / 2 : -1;
      if (idx < 0 || U.mod(bar - sBar0, 2)) return;
      const m = memo('b' + ex, () => D.melody(E.call.concat([E.callResolve]), E.root + 24, E.root + 24, 81))[idx];
      log(ts, m, 8);
      if (tA >= 0) V.box(tA, m, (idx - 2.5) * 0.15);
      return;
    }
    if (k >= slowFrom && k < slowTo) return;  // slow beam: drums + bass rest until the next downbeat
    const kick = idle < 2 && k !== knitKick, soft = idle === 1, bass = lay[0] && idle < 2 && tA >= 0;
    if (E.drums === 'full') {
      const fill = lay[3] && !soft && bar % 8 === 7 && s >= 12;
      if (kick && (s % 8 === 0 || (lay[2] && !soft && s % 4 === 0 && !(fill && s === 12)))) hitKick(ts, tA, s % 8 === 0 ? (soft ? 0.55 : 0.9) : 0.75);
      if (!soft && lay[4] && (s === 4 || (s === 12 && !fill))) hitSnare(ts, tA, 0.8);
      if (!soft && lay[1] && s % 2 === 0) hitHat(ts, tA, T.HAT_VEL[(s >> 1) & 1], s % 4 === 2 ? SW8 : 0, false);
      if (bass && s % 2 === 0) V.bass(tA, ch.bass + (s % 4 === 2 ? 12 : 0), s % 4 === 0 ? 0.9 : 0.7);
      if (fill && (s === 12 || s === 14 || s === 15)) {
        pushEv(EV.TOM, ts, 0.85, 0);
        if (tA >= 0) V.tom(tA, s === 12 ? 160 : s === 14 ? 130 : 100, 0.85, s === 12 ? -0.4 : s === 14 ? 0 : 0.4);
      }
    } else if (E.drums === 'half') {
      if (kick && (s === 0 || (s === 8 && lay[2] && !soft))) hitKick(ts, tA, s === 0 ? (soft ? 0.55 : 0.9) : 0.7);
      if (!soft && lay[4] && s === 8) hitSnare(ts, tA, 0.75);
      if (!soft && lay[1]) hitHat(ts, tA, s % 4 === 0 ? 0.5 : s % 2 === 0 ? 0.3 : 0.2, s % 2 ? SW16 : 0, true);
      if (bass && s === 0) V.sub(tA, ch.bass, T.BAR, 1);
      if (bass && s === 8) V.sub(tA, ch.bass + 7, T.BAR / 2, 0.7);
    } else if (bass) {                        // Long Distance: no drums; probe arpeggio 16ths pp + soft sub
      const arr = memo('a' + ex + ci, () => D.arpNotes(ex, ci)), n = arr.length, i = s % (2 * n - 2), m = arr[i < n ? i : 2 * n - 2 - i];
      log(ts, m, 9);
      V.arp(tA, m, s % 2 ? 0.35 : -0.35);
      if (s === 0) V.sub(tA, ch.bass, T.BAR, 0.45);
    }
  }

  // ---- handshake (§3.2)
  function dropHS() {
    for (let i = 0; i < NA; i++) if (aOn[i] && aK[i] !== A_PLUCK) aOn[i] = 0;
    for (let k = 0; k < NE; k++) { const t = eTy[k]; if (t === EV.HS_DIGIT || t === EV.HS_GLIDE || t === EV.DOWNBEAT) eTy[k] = 0; }
    if (hsRec && has()) V.hsFade(hsRec, ctx.currentTime, HS.SKIP_FADE_MS / 1000);
    hsRec = null;
  }
  // atMs (optional): perf-ms of the gesture, so the timeline is measured from the touch even when unlock() was slow.
  function startHandshake(first, atMs) {
    const t = U.now(), now = atMs > 0 && atMs <= t && t - atMs < 1000 ? atMs : t, P = first ? HS.FIRST : HS.RETURN, db = now + P.downbeat;
    try {
      if (hs && now < hs.db) dropHS();
      setAnchor(db);
      arrOn = true; sBar0 = hBar00 = 0; hEx0 = sEx; hSwitch = -Infinity; lastChord = padCi = -1; knitKick = -1e9;
      floorEnd = EN.FLOOR_BARS; lay.fill(false);
      hs = { first: !!first, db, down: true, skipped: false };
      for (let i = 0; i < P.digits.length; i++) {
        const t = now + P.dtmfStart + i * (P.dtmfOn + P.dtmfOff);
        pushEv(EV.HS_DIGIT, t, i, +P.digits[i]); addAct(A_DTMF, t, t + P.dtmfOn, P.digits.charCodeAt(i));
      }
      pushEv(EV.HS_GLIDE, now + P.glide[0], P.downbeat - P.glide[0], 0);
      pushEv(EV.DOWNBEAT, db, first ? 1 : 0, 0);
      addAct(A_DIAL, now + P.dial[0], now + P.dial[1]);
      if (P.answer) addAct(A_ANS, now + P.answer[0], now + P.answer[1]);
      if (P.chirp) addAct(A_CHIRP, now + P.chirp[0], now + P.chirp[1]);
      addAct(A_GLIDE, now + P.glide[0], db, now + P.glide[1]);
      if (canPlay()) V.click(ctx.currentTime);
      tick();
    } catch (e) { note(e); }
    return db;
  }
  function skipHandshake() {
    const now = U.now();
    if (!hs || now >= hs.db) return -1;
    const c = D.gridAt(anchor(), S16, now + HS.SKIP_MIN_MS);
    if (c >= hs.db) return hs.db;
    dropHS();
    hs.db = c; hs.skipped = true;
    setAnchor(c);
    pushEv(EV.DOWNBEAT, c, hs.first ? 1 : 0, 0);
    return c;
  }

  // ---- context lifecycle (§6.7, §9)
  const quiet = (p) => { if (p && p.catch) p.catch(U.noop); };
  function resume() { quietTok++; resumeAt = U.now(); quiet(ctx.resume()); }
  function onGesture() {
    if (has() && !muted && !hidden && ctx.state !== 'running') resume();
    if (!ctx || ctx.state === 'running') listen(false);
  }
  function listen(on) {
    if (on === listening) return;
    listening = on;
    for (const ev of RES_EV) window[on ? 'addEventListener' : 'removeEventListener'](ev, gesture, true);
  }
  function onState() { if (ctx.state === 'running') listen(false); else if (!muted && !hidden) listen(true); }
  // iOS routes Web Audio through the ringer switch. iOS 17+: navigator.audioSession = 'playback'. Older iOS: a silent
  // <audio> play moves the session to playback. Other platforms skip the data-URI (a strict host CSP would log an error).
  function silent() {
    let ios = false;
    try {
      const n = navigator;
      if (n.audioSession && 'type' in n.audioSession) { n.audioSession.type = 'playback'; return; }
      ios = /iP(hone|ad|od)/.test(n.userAgent || '') || (/Mac/.test(n.platform || '') && n.maxTouchPoints > 1);
    } catch (e) { return; }
    if (!ios) return;
    try { const a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.src = SILENT; quiet(a.play()); } catch (e) { /* CSP */ }
  }
  function startBank() {
    if (bankJobs) return;
    bankJobs = []; bankLeft = D.BANK.length;
    for (let i = 0; i < D.BANK.length; i++) { const j = D.ksJob(i); bankJobs.push(j); D.run(j, () => { if (--bankLeft === 0) bankSet(); }); }
  }
  function bankSet() { if (has() && bankJobs && bankJobs.length && !bankLeft) { V.setBank(bankJobs); bankJobs = []; } }
  // Convolver .buffer = … is a synchronous FFT setup on the main thread (≈20 ms per IR second on desktop, 3–5× that on
  // phones). So: shorter IRs on touch devices; the 0.9 s room goes in first as the handshake's stand-in reverb, then
  // hall, gated, sea — each in an idle slot ≥ 0.7 s apart, never before a handshake's downbeat (+0.7 s), and while
  // the player is touching lines only once it has waited 12 s.
  const IRQ = [[2, 3], [0, 0], [2, 2], [1, 1]];          // [irJobs index, SoundVoice.setIR slot]
  const coarse = () => { try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; } };
  function startIR(sr) {
    if (irJobs && irSr === sr) return;
    irSr = sr; irQ = 0;
    const TT = CFG.TIERS[tier], c = coarse();
    const my = [D.irJob(0, c ? Math.min(TT.irHall, 2) : TT.irHall, sr, 101), D.irJob(1, c ? Math.min(TT.irSea, 2.6) : TT.irSea, sr, 202), D.irJob(2, 0.9, sr, 303)];
    irJobs = my;
    for (const i of [2, 0, 1]) D.run(my[i], () => { if (my === irJobs) irPump(); });
  }
  function irPump() {
    if (irWait || !has() || !irJobs || irQ >= IRQ.length || !irJobs[IRQ[irQ][0]].done) return;
    const now = U.now(), hsEnd = irQ && hs ? hs.db + 700 : 0, W = window;
    irWait = true;
    setTimeout(safe(() => {
      const go = safe(() => { irWait = false; irInstall(); });
      if (W.requestIdleCallback) W.requestIdleCallback(go, { timeout: irQ ? 1500 : 250 }); else go();
    }), Math.max(0, irNext - now, hsEnd - now));
  }
  function irInstall() {
    if (!has() || !irJobs || irQ >= IRQ.length) return;
    const now = U.now();
    if (irQ && ((hs && now < hs.db + 700) || (now - lastAct < 1200 && now - irSince < 12000))) { irNext = Math.max(irNext, now + 400); irPump(); return; }
    const ji = IRQ[irQ][0], j = irJobs[ji];
    if (j.L) V.setIR(IRQ[irQ][1], j.L, j.R, j.sr);
    irQ++; irSince = U.now();
    if (!IRQ.slice(irQ).some((q) => q[0] === ji)) j.L = j.R = null;
    irNext = U.now() + 700;
    irPump();
  }
  function unlock() {
    if (!ctx && !failed) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { failed = true; note(e2); return false; } }
      try { V.build(ctx, tier); } catch (e) { note(e); failed = true; try { ctx.close(); } catch (e3) { /* ok */ } ctx = null; return false; }
      ctx.onstatechange = gstate;
      const ct = ctx.currentTime;
      if (!muted && !hidden) V.masterIn(ct, 1.5, true);
      V.reverb(revKind(sEx), ct, 0);
      startBank(); bankSet();
      // Convolver installs are main-thread FFT work: never inside the gesture handler, paced by irPump().
      irNext = irSince = U.now() + 90;
      if (irSr !== ctx.sampleRate) startIR(ctx.sampleRate); else irPump();
      D.setUrgent(true);
    }
    if (!ctx) return false;
    if (!silentTried) { silentTried = true; silent(); }
    if (!muted && !hidden && ctx.state !== 'running') resume();
    if (ctx.state !== 'running') listen(true);
    return true;
  }
  function goQuiet(tape) {                    // mute / hide: fade, then suspend; transport falls back to the perf clock
    toModeA();
    if (!has()) return;
    const t = ctx.currentTime, tok = ++quietTok;
    if (tape) V.tapeStop(t, 0.12); else V.masterOut(t, 0.06);
    setTimeout(safe(() => { if (tok === quietTok && (muted || hidden) && ctx.state === 'running') quiet(ctx.suspend()); }), tape ? 130 : 200);
  }
  function setMuted(m) {
    m = !!m;
    if (m === muted) { if (!m) unlock(); return; }
    muted = m;
    if (m) return goQuiet(false);
    unlock();
    if (has()) V.masterIn(ctx.currentTime, 0.4);
  }
  function hide() { if (!hidden) { hidden = true; goQuiet(true); } }
  function show() {
    if (!hidden) return;
    hidden = false; version++;
    kNext = Math.max(kNext, Math.ceil((U.now() - anchor()) / S16 - 1e-7));
    if (has() && !muted) { const t = ctx.currentTime; V.tapeRestore(t); V.masterIn(t, 0.3); unlock(); }
  }
  function status() {
    if (failed) return 'failed';
    if (!ctx) return 'none';
    const s = ctx.state;
    return s === 'running' ? 'running' : s === 'closed' ? 'failed' : 'suspended';
  }
  function init(o) {
    if (inited) return;
    inited = true;
    const t = o && o.tier;
    tier = t === 0 || t === 1 || t === 2 ? t : 1;
    anchorPerf = lastUpd = U.now(); kNext = 0;
    setInterval(tick, T.TICK_MS);
  }
  function update(now) {                      // ⚡
    if (!inited) return;
    try {
      if (now - lastTick > 80) tick();
      const dt = U.clamp((now - lastUpd) / 1000, 0, 0.1), kR = Math.pow(0.92, dt * 60);
      lastUpd = now;
      energyNow = effE(now, (now - anchor()) / BAR);
      if (wasLive && live()) {
        const kA = 1 - Math.pow(0.5, dt * 60), h = V.analyse(bands, kA, kR);
        hats = h > hats ? hats + (h - hats) * kA : h + (hats - h) * kR;
      } else { for (let i = 0; i < 64; i++) bands[i] *= kR; hats *= kR; }
    } catch (e) { note(e); }
  }
  function chord() {
    const now = U.now(), b = Math.floor((now - anchor()) / BAR);
    return !arrOn || b < 0 ? 0 : D.chordOf(b, now >= hSwitch ? sBar0 : hBar00);
  }

  // ---- playing (§3.5)
  function pluck(midi, vel, pan, flags = 0, atMs = 0, tagA = -1, tagB = -1) {
    midi = +midi; vel = U.sat(+vel || 0); pan = U.clamp(+pan || 0, -1, 1); flags |= 0;
    if (!Number.isFinite(midi)) return;
    const now = U.now(), src = flags & PLUCK.JUNE ? 3 : flags & PLUCK.GHOST ? 2 : flags & PLUCK.LIGHTHOUSE ? 4 : flags & PLUCK.STRUM ? 1 : 0;
    if (!(flags & (PLUCK.GHOST | PLUCK.JUNE | PLUCK.LIGHTHOUSE))) lastAct = now;
    if (!(flags & (PLUCK.GHOST | PLUCK.JUNE | PLUCK.NO_ENERGY | PLUCK.LIGHTHOUSE))) addE(flags & PLUCK.STRUM ? EN.PER_STRUM : EN.PER_PLUCK * vel, now);
    if (atMs > now + 1) {
      pushEv(EV.GHOST_PLUCK, atMs, tagA, tagB); addAct(A_PLUCK, atMs, atMs, midi, vel, pan, flags); log(atMs, midi, src);
      if (atMs - now < 160) tick();
      return;
    }
    log(now, midi, src);
    if (!canPlay()) return;
    const t = ctx.currentTime, fmv = CFG.EXCHANGES[hx(now)].pluckVoice === 'fm';
    if (rate(fmv ? 1 : 0, t)) V.pluck(t, midi, vel, pan, flags, slowOn, fmv);
  }
  function chime(voice, amp, pan) {
    const now = U.now(), v = voice | 0, notes = D.chimeNotes(hx(now), chord(), v);
    for (const m of notes) log(now, m, 5);
    if (canPlay() && rate(2, ctx.currentTime)) V.chime(ctx.currentTime, notes, v, amp, U.clamp(+pan || 0, -1, 1));
  }
  const rootPc = (ex) => CFG.chimePc(ex, chord(), 0);
  function ping(pan) {
    const now = lastAct = U.now(), ex = hx(now), m = CFG.midiAtOrAbove(rootPc(ex), CFG.EXCHANGES[ex].root + 12);   // octave up: carries on phone speakers
    log(now, m, 6);
    if (canPlay() && rate(3, ctx.currentTime)) V.ping(ctx.currentTime, m, U.clamp(+pan || 0, -1, 1));
  }
  const fx = (fn) => safe((a) => { if (canPlay()) fn(ctx.currentTime, a); });
  const root = () => CFG.EXCHANGES[hx(U.now())].root;
  function pullUpdate(x) { x = U.sat(+x || 0); lastAct = U.now(); if (Math.abs(x - pullX) > 0.003 && canPlay()) { pullX = x; V.pullT(ctx.currentTime, x); } }
  function magnetHum(level) { if (has()) V.magnet(ctx.currentTime, canPlay() ? U.sat(+level || 0) : 0, CFG.midiAtOrAbove(rootPc(hx(U.now())), 33)); }
  function scheduleKnit(ex, landMs) { ex |= 0; if (ex >= 0 && ex < EX.COUNT && Number.isFinite(landMs)) { knit = { ex, t: landMs }; tick(); } }
  function setExchange(ex) {
    ex |= 0;
    if (!(ex >= 0 && ex < EX.COUNT)) return;
    sEx = hEx0 = ex; hSwitch = -Infinity; padEx = -1;
    if (live()) { const t = ctx.currentTime; V.reverb(revKind(ex), t, 0); V.beds(t, ex, chord()); }
  }

  // ---- modes (§3.6)
  function setSlow(on) {
    on = !!on;
    if (on === slowOn) return;
    const hk = Math.floor((U.now() - anchor()) / S16);
    slowOn = on;
    if (on) { if (!(kNext >= slowFrom && kNext < slowTo)) slowFrom = Math.max(kNext, Math.ceil((hk + 1) / 4) * 4); slowTo = Infinity; }
    else slowTo = Math.max(kNext, Math.ceil((hk + 1) / 16) * 16);
    if (canPlay()) { audioSlow = on; V.slow(ctx.currentTime, on, root()); }
  }
  function setDesk(e) { deskE = U.sat(+e || 0); if (has()) V.desk(ctx.currentTime, deskE); }
  function setIdle(level) { level |= 0; if (level !== idle) { const now = U.now(); eVal = level >= 2 ? 0 : energyAt(now); eT = now; idle = level; } }
  function setTier(t) { if (t === 0 || t === 1 || t === 2) { tier = t; if (has()) V.setTier(t); } }
  function setHandset(on) { hsOn = !!on; if (has()) V.handset(ctx.currentTime, hsOn, xyHave ? xyPic : null); }
  function setHandsetPicture(xy) {
    if (!xy || !(xy.length >= 2)) return;
    for (let i = 0; i < 2048; i++) xyPic[i] = i < xy.length ? U.clamp(+xy[i] || 0, -1, 1) : 0;
    xyHave = true;
    if (hsOn && has()) V.xyLoad(ctx.currentTime, xyPic);
  }
  function readXY() {                         // ⚡ same object every call
    try { if (hsOn && wasLive && live() && V.readXY(xyOut.l, xyOut.r)) return xyOut; } catch (e) { note(e); }
    if (!xyHave) return null;
    for (let i = 0; i < 2048; i++) { const j = (i & 1023) << 1; xyOut.l[i] = xyPic[j]; xyOut.r[i] = xyPic[j + 1]; }
    return xyOut;
  }
  function debugNotes() {
    const out = [];
    for (let i = 0; i < nN; i++) { const j = (nI - nN + i + 256) & 255; out.push({ tMs: nT[j], midi: nM[j], src: SRCN[nS[j]] }); }
    return out;
  }
  const gesture = safe(onGesture), gstate = safe(onState);

  return {
    init: safe(init), prewarm: safe(() => { D.run({ step: () => !!D.noiseArrs() }, U.noop); startBank(); startIR(D.BANK_SR); }),
    unlock() { try { return unlock(); } catch (e) { note(e); return !!ctx; } }, status, setMuted: safe(setMuted), get muted() { return muted; }, hide: safe(hide), show: safe(show),
    setTier: safe(setTier), update, transport, chord, startHandshake, skipHandshake: safe(skipHandshake, -1),
    perfToAudio: (ms) => (offOK && has() ? toA(ms) : -1), audioToPerf: (sec) => (offOK && has() ? sec * 1000 + off : -1),
    get inHandshake() { return !!hs && U.now() < hs.db; },
    pollEvents, pluck: safe(pluck), chime: safe(chime), ping: safe(ping), magnetHum: safe(magnetHum), pullUpdate: safe(pullUpdate),
    degauss: fx((t) => V.degauss(t)), dtmf: fx((t, ch) => { if (rate(4, t)) V.dtmf(t, String(ch), 0.12); }),
    sit: fx((t) => V.sit(t)), busy: fx((t) => V.busy(t)), pullStart: fx((t) => { pullX = 0; V.pullStart(t, root()); }),
    pullUnravel: fx((t) => V.unravel(t)), pullSnap: fx((t) => { pullX = -1; log(U.now(), 76, 10); V.snap(t); }),
    pullCancel: fx((t) => { pullX = -1; log(U.now(), 40, 11); V.cancelPull(t); }),
    scheduleKnit: safe(scheduleKnit), setExchange: safe(setExchange), setSlow: safe(setSlow), setDesk: safe(setDesk),
    setIdle: safe(setIdle), setRetrace(on) { retrace = !!on; }, setHandset: safe(setHandset), setHandsetPicture: safe(setHandsetPicture),
    readXY, bands, get hats() { return hats; }, get energy() { return energyNow; },
    debugNotes, debugErr: () => lastErr, debugVoices: () => V.count(), debugClock: () => [off, nOff, modeB, anchorSec, anchor()],
  };
})();
