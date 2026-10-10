// 48-world.js — World: state machine (§3), warm-up, handshake, packets/echoes/rings/chimes, pull/unravel/knit,
// slow beam, desk view, retrace, handset, Konami, flash limiter and every per-frame uniform value.
const World = (() => {
  const S = CoreS, V = CFG.VIS, TR = CFG.TRANSPORT, HS = CFG.HANDSHAKE, IN = CFG.INPUT, SPR = CFG.SPRING, XS = CFG.EXCHANGES, TX = CFG.TEXT;
  const ST = { ONHOOK: 0, HANDSHAKE: 1, PLAY: 2 }, PM = { NONE: 0, PULL: 1, UNRAVEL: 2, HELD: 3, KNIT: 4 };
  const piv = { clock: new Float32Array(3), lighthouse: new Float32Array(3), planet: new Float32Array(3), galaxy: new Float32Array(3), sun: new Float32Array(3), hasSun: false, moonX: 0 };
  let tier = 1, T = CFG.TIERS[1], calm = false, phone = false, vibrate = false;
  const wds = [null, null, null], stale = [false, false, false], signRev = [2, 2, 2];
  let wd = null, ex = 0, exB = 0, state = ST.ONHOOK, calls = 0, buildMs = 0;
  // warm-up / power
  let bootT = -1, lineT = -1, knitWT = -1, warmDone = false, overlayDone = false, powT0 = -1;
  // handshake
  let pickT = 0, hsDigits = '', digitPos = [], rising = false, downT = -1, firstPluck = false, nodialAt = 0, nodialOn = false;
  // springs
  const sp = (x, w, z) => new Spring(x, w, z || 1);
  const sun = sp(0, SPR.SUN_RISE), expo = sp(V.EXPOSURE_ONHOOK, 8), slowS = sp(0, Spring.omegaForSettle(SPR.SLOW_SEC));
  const magS = sp(0, SPR.MAGNET), dotL = sp(0, 15, 0.38), konS = sp(0, 6), flashS = sp(1, 5), ringA = sp(0, 4);
  const dec = [sp(0.78, 2), sp(0.935, 2), sp(0.885, 2)];
  const pullS = [sp(0, 26), sp(0, 26), sp(0, 26)], pullT = sp(0, 10), lp = [sp(0, 22), sp(0, 22), sp(0, 22)];
  const ra = Spring.omegaForSettle(V.RETRACE_DIM_S), al = [sp(V.BLANK_ALPHA, ra), sp(V.BLANK_ALPHA * 0.35, ra), sp(1, ra)];
  const retX = sp(0, 28), retY = sp(0, 28), retA = sp(0, 14), strongS = sp(0, 1.2);
  const springs = [sun, expo, slowS, magS, dotL, konS, flashS, ringA, dec[0], dec[1], dec[2], pullS[0], pullS[1], pullS[2], pullT,
    lp[0], lp[1], lp[2], al[0], al[1], al[2], retX, retY, retA, strongS];
  // packets / echoes / rings
  const MP = CFG.MAX_PACKETS, pkC = new Uint8Array(MP), pkL = new Float32Array(MP), pkR = new Float32Array(MP), pkBorn = new Uint8Array(MP);
  const EQ = 24, eqT = new Float64Array(EQ), eqS = new Float32Array(EQ), eqA = new Float32Array(EQ), eqK = new Float32Array(EQ);
  const resLast = new Float64Array(16);
  // misc state
  let hitstop = 0, kick = 0, swell = 0, snare = 0, flashLast = -1e9, pingT0 = -1e9, degT0 = -1e9, lineNoiseT = 0;
  let hue = 0, hueFrom = 0, hueTo = 0, hueT0 = -1e9, palHue = 1e9, palA = -1, palB = -1;
  let slowBits = 0, slowOn = false, zoomT = 0, deskOn = false, lastDeskE = -1, retraceUntil = 0, retrace = false;
  let handset = false, handsetT = 0, konami = false, lastInput = 0, idle = 0, autoSlowT = 0, autoSlowUntil = 0;
  let hoverOn = false, mx = -1e4, my = -1e4, hovSid = -1, strong = false, lastHum = 0;
  let pm = PM.NONE, gS = 0.5, gX = 0, gY = 0, gD = 10, fX = 0, fY = 0, dX = 0, dY = 0, overT = -1, unT0 = 0, knT0 = 0, land = 0;
  let autoTo = -1, autoT0 = 0, flareT0 = -1e9, tzMs = 0, clockT = -1e9, signTimer = 0;
  let typEx = -1, typT0 = 0, typN = 0;
  const o3 = new Float32Array(3), o3b = new Float32Array(3), xyPic = new Float32Array(2048), picRest = { eye: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 0, swayAmp: 0, swayPeriod: 0 };
  const picV = M4.create(), picP = M4.create(), picM = M4.create();

  function init(t, c, env) {
    tier = t; T = CFG.TIERS[t]; calm = c; phone = !!env.phone; vibrate = !!env.vibrate;
    S.calm = calm ? 1 : 0; S.nPk = T.packets; S.nStr = T.strings;
    calls = Store.data.calls;
    try { tzMs = -new Date().getTimezoneOffset() * 60000; } catch (e) { tzMs = 0; }
  }
  function setCalm(c) { calm = c; S.calm = c ? 1 : 0; }
  // ---------------------------------------------------------------- wires
  function ensureWire(e) {
    if (wds[e] && !stale[e]) return wds[e];
    const t0 = U.now();
    let w = null;
    try { w = Wire.build(e, tier); } catch (er) { w = null; }
    if (!w || !w.N) return wds[e];
    buildMs = U.now() - t0;
    wds[e] = w; stale[e] = false; signRev[e] = 2;
    Renderer.uploadWire(e, w);
    if (e === ex) { wd = w; View.setWire(w, T.hashStride); pivots(); }
    CoreGhosts.tables(e, w);
    return w;
  }
  function setTier(t) {
    if (t === tier) return;
    tier = t; T = CFG.TIERS[t]; S.nPk = T.packets; S.nStr = T.strings;
    for (let i = T.packets; i < MP; i++) S.pkA[i * 4 + 2] = 0;
    for (let i = T.strings; i < 8; i++) S.str[i * 4 + 3] = 0;
    for (let e = 0; e < 3; e++) if (wds[e]) stale[e] = true;
    const keep = wds[ex] && wds[ex].sign ? wds[ex].sign.lines : null;
    ensureWire(ex);
    if (keep && state === ST.PLAY) setSign(ex, keep, false);
    else if (ex === 0 && state !== ST.PLAY) signRev[0] = wd.sign.charS[state === ST.ONHOOK ? 0 : wd.sign.len1];
    if (exB !== ex && pm !== PM.NONE) ensureWire(exB);   // otherwise App rebuilds stale wires in idle time
  }
  function pivots() {
    const a = wds[S.exA], b = wds[S.exB];
    const pick = (k, out) => { const v = (a && a.pivots[k]) || (b && b.pivots[k]); if (v) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; } return !!v; };
    pick('clock', piv.clock); pick('lighthouse', piv.lighthouse); pick('planet', piv.planet); pick('galaxy', piv.galaxy);
    piv.hasSun = pick('sun', piv.sun);
    const mA = a && a.pivots.moonX, mB = b && b.pivots.moonX;
    piv.moonX = mA != null ? mA : mB != null ? mB : 0;
  }
  function setSign(e, lines, typed) {
    const w = wds[e];
    if (!w) return;
    const r = Wire.setSignText(w, lines[0] || '', lines[1] || '');
    Renderer.uploadSign(e, w, r);
    if (typed) { typEx = e; typT0 = U.now(); typN = w.sign.nChars; signRev[e] = w.sign.charS[0]; } else signRev[e] = 2;
  }
  function message(lines, holdMs) { setSign(ex, lines, true); signTimer = holdMs ? U.now() + holdMs : 0; }
  // ---------------------------------------------------------------- packets
  function spawn(s, amp, tint, ds) {
    amp = U.clamp(amp, 0, V.AMP_MAX);
    if (!(amp > 0) || !(s >= 0 && s <= 1)) return -1;
    let slot = -1, old = 1e30;
    for (let i = 0; i < T.packets; i++) {
      if (S.pkA[i * 4 + 2] <= 0) { slot = i; break; }
      if (S.pkA[i * 4 + 1] < old) { old = S.pkA[i * 4 + 1]; slot = i; }
    }
    const b = slot * 4;
    S.pkA[b] = s; S.pkA[b + 1] = S.t; S.pkA[b + 2] = amp; S.pkA[b + 3] = V.PACKET_WIDTH;
    S.pkB[b] = V.PACKET_SPEED; S.pkB[b + 1] = tint; S.pkB[b + 2] = ds; S.pkB[b + 3] = 0;
    pkC[slot] = 0; pkL[slot] = pkR[slot] = s; pkBorn[slot] = 1;
    return slot;
  }
  function echoes(s, amp, t) {
    for (let n = 1; n <= V.ECHOES; n++) {
      let k = 0;
      while (k < EQ && eqT[k] > 0) k++;
      if (k >= EQ) return;
      eqT[k] = t + n * TR.DOTTED8_MS; eqS[k] = s; eqA[k] = amp * Math.pow(V.ECHO_AMP, n); eqK[k] = n & 1 ? 1 : -1;
    }
  }
  function ring(sid, amp) {
    if (!wd || sid < 0 || sid >= wd.str.count) return;
    let slot = 0, old = 1e30;
    for (let i = 0; i < T.strings; i++) {
      if (S.str[i * 4 + 3] <= 0) { slot = i; break; }
      if (S.str[i * 4 + 2] < old) { old = S.str[i * 4 + 2]; slot = i; }
    }
    S.str[slot * 4] = wd.str.sA[sid]; S.str[slot * 4 + 1] = wd.str.sB[sid]; S.str[slot * 4 + 2] = S.t;
    S.str[slot * 4 + 3] = Math.min(1.5, amp); S.strF[slot] = V.STRING_FV(wd.str.degree[sid]);
  }
  function panX(x) { return U.clamp((x / S.cssW) * 2 - 1, -1, 1) * 0.85; }
  function panW(c, k) { return View.proj(c[k * 3], c[k * 3 + 1], c[k * 3 + 2], o3) ? panX(o3[0]) : 0; }
  function stepPackets(now) {
    const live = state !== ST.ONHOOK, res = wd ? wd.res : null;
    for (let i = 0; i < T.packets; i++) {
      const b = i * 4, amp = S.pkA[b + 2];
      if (amp <= 0) continue;
      const age = S.t - S.pkA[b + 1], f = S.pkB[b] * age, rem = amp * Math.exp(-f / 1.2) * Math.exp(-0.25 * age);
      if (age > 14 || (rem < 0.006 && f > 0.4)) { S.pkA[b + 2] = 0; continue; }
      if (!live || !res || pkC[i] >= V.CHIME_PER_PACKET || rem <= V.CHIME_MIN_AMP || pm !== PM.NONE) { pkBorn[i] = 0; pkL[i] = S.pkA[b] - f; pkR[i] = S.pkA[b] + f; continue; }
      const s0 = S.pkA[b], fl = s0 - f, fr = s0 + f, pl = pkL[i], pr = pkR[i];
      for (let r = 0; r < res.count && pkC[i] < V.CHIME_PER_PACKET; r++) {
        const a = res.sA[r], z = res.sB[r];
        const enter = (pkBorn[i] && s0 >= a && s0 <= z) || (fl <= z && pl > z) || (fr >= a && pr < a);
        if (enter && now - resLast[r] >= V.CHIME_COOLDOWN_MS) {
          resLast[r] = now; pkC[i]++;
          Sound.chime(res.voice[r], rem, panW(res.centre, r));
        }
      }
      pkBorn[i] = 0; pkL[i] = fl; pkR[i] = fr;
    }
    for (let k = 0; k < EQ; k++) if (eqT[k] > 0 && now >= eqT[k]) { spawn(eqS[k], eqA[k], eqK[k], 0.6); eqT[k] = 0; }
    for (let i = 0; i < T.strings; i++) if (S.str[i * 4 + 3] > 0 && S.t - S.str[i * 4 + 2] > 3.2) S.str[i * 4 + 3] = 0;
  }
  // Flash limiter: at most one large flash per window; the excess is attenuated.
  function flashOK(m) {
    if (m < 0.15) return m;
    const now = U.now();
    if (now - flashLast < (calm ? V.FLASH_WINDOW_CALM_MS : V.FLASH_WINDOW_MS)) { flashS.x = Math.min(flashS.x, 0.75); return 0.1; }
    flashLast = now; return m;
  }
  // ---------------------------------------------------------------- verbs
  function activity() {
    const now = U.now();
    if (now - lastInput > 250 || idle) UI.notify('input');
    lastInput = now;
    if (idle) { idle = 0; Sound.setIdle(0); CoreGhosts.party(false); }
    if (autoSlowUntil) { autoSlowUntil = 0; slowSrc(16, false); }
  }
  function canPluck() { return state !== ST.ONHOOK && pm === PM.NONE && !deskOn && wd && S.U === 0 && S.K === 0; }
  function pluck(i, x, vel, strum) {
    if (!wd) return;
    const sid = wd.pointString[i];
    if (sid === 0xFFFF) return;
    const midi = CFG.degreeToMidi(ex, wd.str.degree[sid]), now = U.now();
    Sound.pluck(midi, vel, panX(x), strum ? PLUCK.STRUM : 0);
    const s = wd.f32[i * 6 + 4];
    spawn(s, vel, 0, strum ? 0.6 : 1);
    if (!strum) echoes(s, vel, now);
    ring(sid, strum ? vel * 0.75 : vel);
    if (!strum && vel > IN.HITSTOP_VEL && !calm) { hitstop = now + IN.HITSTOP_MS; View.kick.kick(-IN.CAM_KICK * 60); flashOK(0.4); }
    firstPluck = true;
    CoreGhosts.heard(midi);
    UI.notify(strum ? 'strum' : 'pluck');
    activity();
  }
  // Drop queued echo packets of plucks made at or after `since` (a two-finger touch that became a pinch / slow hold).
  function cancelEchoes(since) { for (let k = 0; k < EQ; k++) if (eqT[k] > 0 && eqT[k] >= since + TR.DOTTED8_MS - 1) eqT[k] = 0; }
  function ringOnly(i, amp) { if (wd && wd.pointString[i] !== 0xFFFF) ring(wd.pointString[i], amp); }
  function ping(x, y) {
    Sound.ping(panX(x));
    pingT0 = U.now(); S.ping[0] = x; S.ping[1] = y;
    activity();
  }
  function degauss() {
    degT0 = U.now(); S.clearTrails = 2;
    magS.set(0); strongS.set(0);
    Sound.degauss(); UI.notify('degauss'); activity();
  }
  function hover(x, y, on) { if (on) { mx = x; my = y; } hoverOn = on; }
  function parallax(nx, ny) { View.parX.to(calm ? 0 : U.clamp(nx, -1, 1)); View.parY.to(calm ? 0 : U.clamp(-ny, -1, 1)); }
  function setHover(sid) { hovSid = sid; }
  function reticle(x, y, a) {
    if (a > 0) { if (retA.x < 0.02) { retX.set(x); retY.set(y); } retX.to(x); retY.to(y); }
    retA.to(a);
  }
  function strongMag(on, x, y) {
    if (on) { strong = true; strongS.set(0); strongS.to(1); hoverOn = true; mx = x; my = y; return; }
    if (!strong) return;
    strong = false; strongS.set(0); lastHum = 0; Sound.magnetHum(0);
    ping(x, y);
  }
  function slowSrc(bit, on) {
    slowBits = on ? slowBits | bit : slowBits & ~bit;
    const want = slowBits !== 0;
    if (want === slowOn || state === ST.ONHOOK) { if (!want) slowOn = false; return; }
    slowOn = want;
    Sound.setSlow(want); UI.setSlow(want);
    UI.announce(want ? TX.announce.slowOn : TX.announce.slowOff);
    if (want && bit !== 16) UI.notify('slow');
  }
  function zoomTo(z, fx, fy) {
    if (state === ST.ONHOOK) return;
    zoomT = U.clamp(z, IN.ZOOM_MIN, IN.ZOOM_MAX);
    View.zoom.to(zoomT);
    if (fx !== undefined) { View.zfx.to(U.clamp(fx / S.cssW * 2 - 1, -1, 1)); View.zfy.to(U.clamp(1 - fy / S.cssH * 2, -1, 1)); }
    const d = zoomT < 0;
    if (d !== deskOn) {
      deskOn = d; UI.setBack(d); UI.announce(d ? TX.announce.deskOn : TX.announce.deskOff);
      if (d) UI.notify('desk');
    }
    activity();
  }
  function zoomBy(dz, fx, fy) { zoomTo(zoomT + dz, fx, fy); }
  // ---------------------------------------------------------------- pick-up + handshake
  function pickUp(i, watch, ts) {
    if (state !== ST.ONHOOK) return false;
    const t0 = ts > 0 ? Math.min(ts, U.now()) : U.now();   // gesture time, taken before the (slow) AudioContext unlock
    const first = Store.data.calls === 0;
    calls = Store.data.calls + 1; Store.set('calls', calls);
    if (!watch) { Sound.unlock(); Sound.setMuted(false); Store.set('muted', false); }
    else { Sound.setMuted(true); Store.set('muted', true); }
    Sound.startHandshake(first, t0);
    pickT = t0; state = ST.HANDSHAKE; rising = false;
    hsDigits = first ? HS.FIRST.digits : HS.RETURN.digits;
    if (typeof i === 'function') i = i();   // touch-point lookup runs after the sound has started
    if (wd) {
      const p = i >= 0 ? i : wd.homePoint;
      spawn(wd.f32[p * 6 + 4], 0.85, 0, 1); ringOnly(p, 0.8);
      const l2 = wd.sign.lines[1] || ''; digitPos = [];
      for (let k = 0; k < l2.length; k++) if (l2[k] >= '0' && l2[k] <= '9') digitPos.push(k);
      if (!first && ex === 0) signRev[0] = wd.sign.charS[Math.min(wd.sign.nChars, wd.sign.len1 + 6)];
    }
    CoreGhosts.stopDemo();
    UI.hideOverlay(); UI.setSound(!watch);
    nodialAt = watch ? 0 : pickT + HS.NODIAL_CHECK_MS;
    lastInput = pickT;
    return true;
  }
  function skip() {
    if (state !== ST.HANDSHAKE) return;
    const d = Sound.skipHandshake();
    if (d > 0) riseTo(d);
  }
  function riseTo(t) {
    rising = true;
    sun.omega = Spring.omegaForSettle(Math.max(0.25, (t - U.now()) / 1000));
    sun.to(V.SUN_RISE_UP);
  }
  function digit(i) {
    if (!wd || state !== ST.HANDSHAKE) return;
    spawn(HS.DIGIT_S0 + HS.DIGIT_DS * i, 0.7, 0, 1);
    const gi = 7 - hsDigits.length + i, pos = digitPos[gi];
    if (ex === 0 && pos !== undefined) signRev[0] = wd.sign.charS[Math.min(wd.sign.nChars, wd.sign.len1 + pos + 1)];
    expo.to(V.EXPOSURE_ONHOOK + (HS.EXPOSURE[1] - V.EXPOSURE_ONHOOK) * Math.min(1, (gi + 1) / 7));
  }
  function downbeat(t) {
    if (state !== ST.HANDSHAKE) return;
    state = ST.PLAY; downT = t; lastInput = U.now();
    expo.to(1); swell = Math.max(swell, flashOK(V.BLOOM_SWELL) / V.BLOOM_SWELL);
    if (!rising) riseTo(U.now() + 300);
    if (ex === 0) setSign(0, TX.sign.welcome(calls), true);
    UI.announce(TX.announce.connected[ex]); UI.notify('downbeat');
    if (wd) {
      const demo = wd.demoString, at = t + HS.JUNE_PLUCK_BEATS * TR.BEAT_MS;
      const m = wd.homePoint;
      Sound.pluck(CFG.degreeToMidi(ex, wd.str.degree[demo]), 0.8, View.projPoint(wd, m, o3) ? panX(o3[0]) : 0, PLUCK.JUNE, at, demo, SRC.JUNE);
      CoreGhosts.juneTo(demo, at);
    }
  }
  function onEvent(type, t, v0, v1) {
    switch (type) {
      case EV.KICK: if (!calm) kick = Math.max(kick, v0 > 0 ? 0.6 + 0.4 * v0 : 1); break;
      case EV.SNARE: snare = flashOK(V.SNARE_BLOOM) > 0 ? 1 : 0; break;
      case EV.CHORD: hueFrom = hue; hueTo = V.CHORD_HUE_DEG[v0 & 3] || 0; hueT0 = t; break;
      case EV.KNIT_LAND: swell = Math.max(swell, flashOK(0.2) / V.BLOOM_SWELL * 0.6); break;
      case EV.GHOST_PLUCK: CoreGhosts.onPluck(v0, v1); break;
      case EV.DOWNBEAT: downbeat(t); break;
      case EV.HS_DIGIT: digit(v0); break;
      case EV.HS_GLIDE: if (state === ST.HANDSHAKE) riseTo(U.now() + v0); break;
      case EV.BAR:
        if (idle >= 2 && !slowOn && U.now() - autoSlowT > CFG.IDLE.AUTO_SLOW_EVERY_MS) { autoSlowT = U.now(); autoSlowUntil = t + TR.BAR_MS; slowSrc(16, true); }
        break;
      default: break;
    }
  }
  // ---------------------------------------------------------------- pull / unravel / knit
  function pullBegin(i, x, y) {
    if (pm !== PM.NONE || autoTo >= 0 || !canPluck()) return false;
    exB = (ex + 1) % 3;
    if (!ensureWire(exB)) return false;
    gS = wd.f32[i * 6 + 4]; S.G = gS;
    if (!View.xf(wd, i, o3)) return false;
    gD = Math.max(1, M4.project(S.vp, o3[0], o3[1], o3[2], o3b));
    gX = (o3b[0] * 0.5 + 0.5) * S.cssW; gY = (0.5 - o3b[1] * 0.5) * S.cssH;
    dX = fX = x; dY = fY = y; overT = -1;
    for (let k = 0; k < 3; k++) { pullS[k].omega = 26; pullS[k].zeta = 1; }
    pm = PM.PULL; pullT.set(0);
    Sound.pullStart(); UI.notify('pullStart'); activity();
    return true;
  }
  function pullMove(x, y) { fX = x; fY = y; lastInput = U.now(); }
  function pullEnd() {
    if (pm === PM.PULL) {
      Sound.pullCancel();
      for (let k = 0; k < 3; k++) { pullS[k].omega = SPR.WOBBLE_OMEGA; pullS[k].zeta = SPR.WOBBLE_ZETA; pullS[k].to(0); }
      pullT.to(0); pm = PM.NONE;
      return;
    }
    if (pm === PM.UNRAVEL || pm === PM.HELD) snapKnit(exB);
  }
  function snapKnit(to) {
    const now = U.now();
    Sound.pullSnap();
    land = Sound.transport.nextDownbeat(now, V.KNIT_MIN_MS);
    Sound.scheduleKnit(to, land);
    exB = to; ensureWire(to); S.exB = to; pivots();
    knT0 = now; pm = PM.KNIT; autoTo = -1;
    for (let k = 0; k < 3; k++) { lp[k].omega = SPR.WOBBLE_OMEGA; lp[k].zeta = SPR.WOBBLE_ZETA; lp[k].to(0); pullS[k].to(0); }
    pullT.to(0);
    View.setExchange(to, false);
    if (!calm) { hitstop = now + IN.HITSTOP_MS; View.kick.kick(-IN.CAM_KICK * 70); }
    if (vibrate) try { navigator.vibrate(8); } catch (e) { /* ignore */ }
    if (handset) sendPicture(to);
  }
  function unravel(now) {
    pm = PM.UNRAVEL; unT0 = now;
    Sound.pullUnravel(); UI.announce(TX.announce.unravel);
    const D = U.clamp(gD, 6, 30);
    View.unproject(S.cssW * 0.04, gY, D, S.lineA); View.unproject(S.cssW * 0.96, gY, D, S.lineB);
    for (let k = 0; k < 3; k++) { lp[k].omega = 22; lp[k].zeta = 1; lp[k].set(0); }
    S.lineCol[0] = S.heatA[0] * 1.4; S.lineCol[1] = S.heatA[1] * 1.4; S.lineCol[2] = S.heatA[2] * 1.4;
    lineHum(D, 1.3);
  }
  function lineHum(D, px) { const k = px * D / S.focal; S.lineUp[0] = S.camU[0] * k; S.lineUp[1] = S.camU[1] * k; S.lineUp[2] = S.camU[2] * k; }
  function finishKnit() {
    ex = exB; S.exA = ex; S.exB = ex; S.U = 0; S.K = 0; pm = PM.NONE;
    for (let k = 0; k < 3; k++) { pullS[k].set(0); lp[k].set(0); S.linePull[k] = 0; }
    wd = wds[ex]; View.setWire(wd, T.hashStride); pivots(); hovSid = -1;
    Store.set('lastExchange', ex);
    const fk = XS[ex].foundKey;
    if (fk) Store.setFound(fk);
    setSign(ex, ex === 0 ? TX.sign.welcome(calls) : XS[ex].sign, true);
    UI.announce(TX.announce.connected[ex]); UI.notify('knit');
    CoreGhosts.exchanged();
  }
  function autoKnit(to) {
    if (pm !== PM.NONE || autoTo >= 0 || state === ST.ONHOOK || !wd) return false;
    if (!ensureWire(to)) return false;
    if (retrace) retraceEnd();
    autoTo = to; autoT0 = U.now(); exB = to;
    const i = wd.homePoint;
    gS = wd.f32[i * 6 + 4]; S.G = gS;
    View.xf(wd, i, o3); gD = Math.max(1, M4.project(S.vp, o3[0], o3[1], o3[2], o3b));
    gX = (o3b[0] * 0.5 + 0.5) * S.cssW; gY = (0.5 - o3b[1] * 0.5) * S.cssH; dX = fX = gX; dY = fY = gY;
    for (let k = 0; k < 3; k++) { pullS[k].omega = 26; pullS[k].zeta = 1; }
    pm = PM.PULL; overT = -1; Sound.pullStart();
    return true;
  }
  function stepPull(now) {
    if (autoTo >= 0 && pm !== PM.KNIT) {
      const el = now - autoT0, m = Math.min(S.cssW, S.cssH) * IN.PULL_FRACTION;
      fX = gX; fY = gY - m * 1.05 * U.ease.inOutSine(el / 700);
      if (pm === PM.PULL && el >= 700) unravel(now);
      if (el >= 700 + V.UNRAVEL_MS + 150) { snapKnit(autoTo); return; }
    }
    if (pm === PM.PULL || pm === PM.UNRAVEL || pm === PM.HELD) {
      const thr = Math.min(S.cssW, S.cssH) * IN.PULL_FRACTION, t = Math.hypot(fX - dX, fY - dY) / thr;
      pullT.to(U.sat(t));
      Sound.pullUpdate(U.sat(t));
      const k = (calm ? V.CALM_PULL : 1) * gD / S.focal, ox = (fX - gX) * k, oy = (fY - gY) * k;
      for (let j = 0; j < 3; j++) pullS[j].to(S.camR[j] * ox - S.camU[j] * oy);
      if (pm === PM.PULL && autoTo < 0) {
        if (t >= 1) { if (overT < 0) overT = now; else if (now - overT >= IN.PULL_HOLD_MS) unravel(now); } else overT = -1;
      }
      if (pm === PM.UNRAVEL || pm === PM.HELD) {
        const e = U.sat((now - unT0) / V.UNRAVEL_MS);
        S.U = e; if (e >= 1) pm = PM.HELD;
        const D = U.clamp(gD, 6, 30);
        View.unproject(fX, fY, D, o3);
        for (let j = 0; j < 3; j++) lp[j].to((o3[j] - (S.lineA[j] + (S.lineB[j] - S.lineA[j]) * gS)) * (calm ? V.CALM_PULL : 1));
      }
    }
    if (pm === PM.KNIT) {
      S.K = U.sat((now - knT0) / Math.max(1, land - knT0));
      if (now >= land) finishKnit();
    }
    for (let j = 0; j < 3; j++) { S.pull[j] = pullS[j].x; S.linePull[j] = lp[j].x; }
    S.pull[3] = pullT.x;
  }
  // ---------------------------------------------------------------- secrets
  function dial(digits) {
    const d = CFG.dial(digits);
    if (!d || state === ST.ONHOOK) return;
    activity();
    if (d.type === 'exchange') autoKnit(d.ex);
    else if (d.type === 'operator') { CoreGhosts.circleWindow(); message(TX.sign.operator, 14000); found('operator'); }
    else if (d.type === 'retrace') retraceStart();
    else if (d.type === 'busy') { Sound.busy(); message(TX.sign.busy, 9000); }
    else { Sound.sit(); message(TX.sign.sit, 9000); }
  }
  function found(k) {
    if (Store.setFound(k)) { UI.toast(TX.toast.found(TX.found[k][0])); UI.announce(TX.announce.found(TX.found[k][1])); }
  }
  function retraceStart() {
    retrace = true; retraceUntil = U.now() + V.RETRACE_BARS * TR.BAR_MS;
    Sound.setRetrace(true); found('june');
  }
  function retraceEnd() { if (!retrace) return; retrace = false; Sound.setRetrace(false); }
  function juneAnswered() {
    flareT0 = U.now(); message(TX.sign.june, 20000); found('june');
  }
  function handsetToggle() {
    handset = !handset;
    Sound.setHandset(handset); UI.setXYVisible(handset);
    if (handset) { sendPicture(ex); found('handset'); }
    activity();
  }
  function sendPicture(e) {
    const w = wds[e];
    if (!w) return;
    handsetT = U.now();
    CFG.cameraRest(e, 1, picRest);
    M4.perspective(picP, picRest.fov, 1, 0.1, 200); M4.lookAt(picV, picRest.eye, picRest.target, picRest.up); M4.mul(picM, picP, picV);
    let lx = 0, ly = 0;
    for (let k = 0; k < 1024; k++) {
      const i = Math.floor(k * w.N / 1024), b = i * 6;
      if (M4.project(picM, w.f32[b], w.f32[b + 1], w.f32[b + 2], o3) > 0.05) { lx = U.clamp(o3[0], -1, 1); ly = U.clamp(o3[1], -1, 1); }
      xyPic[k * 2] = lx; xyPic[k * 2 + 1] = ly;
    }
    Sound.setHandsetPicture(xyPic);
  }
  function konamiToggle() {
    konami = !konami; konS.to(konami ? 1 : 0);
    UI.toast(TX.toast.overlay);
    if (Store.setFound('konami')) UI.announce(TX.announce.found(TX.found.konami[1]));
  }
  function esc() {
    if (handset) { handsetToggle(); return; }
    if (konami) { konamiToggle(); return; }
    if (retrace) { retraceEnd(); return; }
    if (deskOn || zoomT < 0) { zoomTo(0); return; }
    if (state === ST.PLAY && ex !== 0) autoKnit(0);
  }
  function toggleMute(retry) {
    if (state === ST.ONHOOK) return;
    if (retry && !Sound.muted && Sound.status() !== 'running') { Sound.unlock(); Sound.setMuted(false); nodialAt = U.now() + HS.NODIAL_CHECK_MS; return; }
    const m = !Sound.muted;
    if (!m) Sound.unlock();
    Sound.setMuted(m); Store.set('muted', m); UI.setSound(!m);
    UI.announce(m ? TX.announce.muted : TX.announce.soundOn);
    if (!m) nodialAt = U.now() + HS.NODIAL_CHECK_MS;
  }
  // ---------------------------------------------------------------- boot / power
  function boot(now) {
    bootT = now; S.dot[0] = S.cssW / 2; S.dot[1] = S.cssH / 2; S.dot[3] = 1; S.power[0] = S.power[1] = 1;
    S.coreA.set(XS[0].core); S.heatA.set(XS[0].heat);
  }
  function powerOn(now) { powT0 = now; eqT.fill(0); }
  function warm(now) {
    const el = now - bootT, cx = S.cssW / 2, cy = S.cssH / 2;
    if (!overlayDone && el >= 900) { overlayDone = true; if (state === ST.ONHOOK) UI.showOverlay(); }
    if (warmDone) return;
    const j = lineT < 0 ? 1 : U.sat(1 - (now - lineT) / 200);
    S.dot[0] = cx + 1.5 * j * Math.sin(S.rt * 56.5) * Math.cos(S.rt * 13.1);
    S.dot[1] = cy + 1.5 * j * Math.cos(S.rt * 61.3 + 1.7);
    if (lineT < 0) {
      if (el >= 250 && wd) { lineT = now; dotL.to(S.cssW * 0.46); }
      S.dot[2] = dotL.x; return;
    }
    S.dot[2] = Math.max(0, dotL.x);
    const D = 10, L = dotL.x;
    View.unproject(cx - L, cy, D, S.lineA); View.unproject(cx + L, cy, D, S.lineB);
    if (knitWT < 0 && now - lineT >= 350) {
      knitWT = now; S.wireReady = true; S.exA = S.exB = ex; S.U = 1; S.K = 0; S.G = 0.5;
      S.lineCol[0] = S.coreA[0] * 1.6; S.lineCol[1] = S.coreA[1] * 1.6; S.lineCol[2] = S.coreA[2] * 1.6;
      lineHum(D, 0.35);
      if (ex === 0 && wd) signRev[0] = state === ST.ONHOOK ? wd.sign.charS[0] : signRev[0];   // blank on hook: the sign types itself at pick-up
    }
    if (knitWT >= 0) {
      S.dot[3] = U.sat(1 - (now - knitWT) / 140);
      S.K = U.sat((now - knitWT) / 800);
      if (S.K >= 1) { S.U = 0; S.K = 0; warmDone = true; S.dot[3] = 0; CoreGhosts.warmDone(now); lineT = now; }
    }
  }
  function power(now) {
    if (powT0 < 0) return;
    const el = now - powT0;
    if (calm) { S.power[0] = S.power[1] = 1; S.power[2] = 0; S.power[3] = U.sat(el / V.POWER_CALM_MS); if (el >= V.POWER_CALM_MS) powT0 = -1; return; }
    S.power[0] = U.ease.outCubic(el / 200); S.power[1] = el < 200 ? 0.004 : 0.004 + 0.996 * U.ease.outCubic((el - 200) / 400);
    S.power[2] = (1 - S.power[1]) * 1.5; S.power[3] = 1;
    if (warmDone) { S.dot[0] = S.cssW / 2; S.dot[1] = S.cssH / 2; S.dot[2] = S.power[0] * S.cssW * 0.46; S.dot[3] = U.sat(1 - el / 450) * 0.8; }
    if (el >= V.POWER_ON_MS) { powT0 = -1; S.power[0] = S.power[1] = 1; S.power[2] = 0; if (warmDone) S.dot[3] = 0; }
  }
  // ---------------------------------------------------------------- per frame
  function step(h) { for (let i = 0; i < springs.length; i++) springs[i].step(h); }
  function update(now, dtMs) {
    const dt = dtMs / 1000;
    S.now = now; S.dt = dt; S.rt = (now - bootT) / 1000;
    S.ts = (now < hitstop ? 0 : 1) * (1 - (1 - V.SLOW_TIMESCALE) * slowS.x);
    S.t += dt * S.ts;
    warm(now); power(now);
    if (nodialAt && now >= nodialAt) {
      nodialAt = 0;
      if (!Sound.muted && Sound.status() !== 'running') { nodialOn = true; UI.chip('nodial', true); }
    }
    if (nodialOn && (Sound.status() === 'running' || Sound.muted)) { nodialOn = false; UI.chip('nodial', false); }
    stepPull(now);
    stepPackets(now);
    if (signTimer && now >= signTimer) { signTimer = 0; setSign(ex, ex === 0 ? TX.sign.welcome(calls) : XS[ex].sign, true); }
    if (retrace && now >= retraceUntil) retraceEnd();
    // idle
    if (state === ST.PLAY) {
      const quiet = now - lastInput;
      if (idle === 0 && quiet >= CFG.IDLE.PARTY_MS && pm === PM.NONE) { idle = 1; Sound.setIdle(1); CoreGhosts.party(true); }
      if (idle === 1 && quiet >= CFG.IDLE.SCREENSAVER_MS) { idle = 2; Sound.setIdle(2); autoSlowT = now - CFG.IDLE.AUTO_SLOW_EVERY_MS + 20000; }
      if (autoSlowUntil && now >= autoSlowUntil) { autoSlowUntil = 0; slowSrc(16, false); }
      if (handset && now - handsetT > 2000) sendPicture(ex);
    }
    CoreGhosts.update(now, dt);
    if (strong) {
      const lvl = Math.round(strongS.x * 20) / 20;
      if (lvl !== lastHum) { lastHum = lvl; Sound.magnetHum(lvl); }
    }
    fill(now, dt);
    status();
  }
  function fill(now, dt) {
    // kinds
    S.scroll = (S.scroll + dt * S.ts * V.SCROLL_SPEED) % 1000;
    S.sunRise = sun.x;
    S.floorQ = S.aspect < 1 ? CFG.CAMERA.PULLBACK * 1.15 * (1 - S.aspect) / (S.exA === 1 ? 68 : 74) : 0;
    if (now - clockT > 1000) {
      clockT = now;
      const ms = Date.now() + tzMs, mins = (ms / 60000) % 60, hrs = (ms / 3600000) % 12;
      S.clock[0] = U.TAU * hrs / 12; S.clock[1] = U.TAU * mins / 60;
    }
    const bar = Sound.transport.bar(now);
    S.lhAng = U.TAU * bar / 8;
    S.planetAng = (S.planetAng + dt * S.ts * U.TAU / 48) % U.TAU;
    S.galaxyAng = (S.galaxyAng + dt * S.ts * U.TAU / 300) % U.TAU;
    S.probe[0] = 0.9 * Math.sin(S.t * 0.21); S.probe[1] = 0.5 * Math.sin(S.t * 0.17 + 1); S.probe[2] = 0.7 * Math.sin(S.t * 0.13 + 2);
    S.hats = Sound.hats || 0;
    if (Sound.bands && Sound.bands.length === 64) S.bands.set(Sound.bands);
    // palettes (chord hue lerped over one bar)
    hue = hueFrom + (hueTo - hueFrom) * U.ease.inOutSine((now - hueT0) / TR.BAR_MS);
    if (Math.abs(hue - palHue) > 0.05 || palA !== S.exA || palB !== S.exB) {
      palHue = hue; palA = S.exA; palB = S.exB;
      rotPal(XS[palA].palLin, S.palA, hue); rotPal(XS[palB].palLin, S.palB, hue);
      S.heatA.set(XS[palA].heat); S.heatB.set(XS[palB].heat); S.coreA.set(XS[palA].core); S.coreB.set(XS[palB].core);
    }
    // decay (per exchange, slowed, calm)
    const dv = XS[S.K > 0.5 ? S.exB : S.exA].decayVec;
    for (let i = 0; i < 3; i++) {
      dec[i].to(dv[i]);
      let d = dec[i].x;
      d = d + (V.SLOW_DECAY[i] - d) * slowS.x;
      if (calm) d = Math.pow(d, 1.6);
      S.dec[i] = Math.pow(U.clamp(d, 0, 0.999), S.dtRaw * 60);
    }
    if (S.clearTrails > 0) S.clearTrails--;
    // slow beam
    slowS.to(slowOn ? 1 : 0);
    S.slow[0] = slowS.x; S.slow[1] = (S.slow[1] + dt / V.SLOW_PERIOD_S) % 1; S.slow[2] = calm ? 0.5 : 1; S.slow[3] = calm ? 3 : 1;
    // morph line hum keeps facing the camera
    // magnet + fringe
    magS.to(hoverOn ? IN.MAGNET_PUSH + (strong ? strongS.x * (IN.STRONG_PUSH - IN.MAGNET_PUSH) : 0) : 0);
    S.mag[0] = mx; S.mag[1] = my; S.mag[2] = magS.x; S.mag[3] = IN.MAGNET_RADIUS * 0.4;
    S.fringe[0] = mx; S.fringe[1] = my; S.fringe[2] = Math.min(8, IN.MAGNET_FRINGE * magS.x / IN.MAGNET_PUSH + (strong ? strongS.x * 4 : 0)); S.fringe[3] = IN.MAGNET_RADIUS;
    const pa = (now - pingT0) / 1000;
    S.ping[2] = pa; S.ping[3] = pa < 1.6 ? 18 : 0;
    // hover string + bead + flare
    if (hovSid >= 0 && wd && hovSid < wd.str.count && pm === PM.NONE) { S.hov[0] = wd.str.sA[hovSid]; S.hov[1] = wd.str.sB[hovSid]; } else { S.hov[0] = 2; S.hov[1] = -1; }
    S.hov[2] = Sound.transport.barPhase(now);
    S.bead = V.BEAD_HEAT * (calm ? V.BEAD_CALM : 1);
    const fa = now - flareT0;
    S.hov[3] = fa < V.WINDOW_FLARE_MS ? V.WINDOW_FLARE_HEAT * (1 - U.smoothstep(V.WINDOW_FLARE_MS * 0.6, V.WINDOW_FLARE_MS, fa)) : 0;
    // alphas (ping flash, retrace)
    al[0].to(retrace ? V.RETRACE_BLANK : V.BLANK_ALPHA); al[1].to(retrace ? V.RETRACE_SECRET : V.BLANK_ALPHA * 0.35); al[2].to(retrace ? V.RETRACE_VISIBLE : 1);
    const pf = pa < V.PING_BLANK_DECAY_S ? (V.PING_BLANK_ALPHA - V.BLANK_ALPHA) * Math.pow(1 - pa / V.PING_BLANK_DECAY_S, 2) : 0;
    S.alpha[0] = Math.max(al[0].x, V.BLANK_ALPHA + pf); S.alpha[1] = Math.max(al[1].x, V.BLANK_ALPHA * 0.35 + pf * 0.2); S.alpha[2] = al[2].x;
    flashS.to(1); S.alpha[3] = flashS.x;
    // signs (typing at 28 ms/char)
    if (typEx >= 0) {
      const w = wds[typEx], k = Math.floor((now - typT0) / HS.TYPE_MS_PER_CHAR);
      if (!w || k >= typN) { signRev[typEx] = 2; typEx = -1; } else signRev[typEx] = w.sign.charS[k];
    }
    S.sign[0] = signRev[S.exA]; S.sign[1] = signRev[S.exB];
    // envelopes
    kick = calm ? 0 : kick * Math.exp(-dt * 1000 / V.KICK_DECAY_MS);
    swell *= Math.exp(-dt * 1000 / V.BLOOM_SWELL_MS); snare *= Math.exp(-dt * 8);
    S.kickEnv = kick;
    S.bloom = V.BLOOM * (1 + V.BLOOM_SWELL * swell + V.SNARE_BLOOM * snare) * flashS.x;
    S.fin[0] = expo.x * (1 - V.KICK_EXPOSURE * kick); S.fin[1] = kick; S.fin[2] = T.grain ? V.GRAIN : 0; S.fin[3] = V.VIGNETTE;
    S.konami = konS.x;
    S.barrel = phone ? V.BARREL_K_PHONE : V.BARREL_K_DESKTOP;
    // portrait: smaller, higher TV so the badge, desk edge and handset clear the bottom controls row
    S.deskScale = S.aspect < 1 ? 0.66 : 0.6; S.deskCY = S.aspect < 1 ? 0.6 : 0.56;
    const de = S.deskE;
    if (Math.abs(de - lastDeskE) > 0.01) { lastDeskE = de; Sound.setDesk(de); }
    // degauss
    const tD = (now - degT0) / 1000, dur = calm ? V.DEGAUSS_CALM_S : V.DEGAUSS_S;
    S.deg[0] = tD; S.deg[1] = tD < dur ? 1 : 0; S.deg[2] = calm ? 1 : 0;
    // reticle + breathing ring over the sun
    S.ret[0] = retX.x; S.ret[1] = retY.x; S.ret[2] = retA.x > 0.01 ? retA.x : 0;
    const showRing = state === ST.PLAY && !firstPluck && downT > 0 && now - downT >= HS.HINT_MS && piv.hasSun && ex === 0 && pm === PM.NONE && autoTo < 0;
    ringA.to(showRing ? 0.75 : 0);
    if (ringA.x > 0.005 && View.proj(piv.sun[0], piv.sun[1] + S.sunRise - 6, piv.sun[2], o3)) {
      S.ring[0] = o3[0]; S.ring[1] = o3[1]; S.ring[2] = 30 + 5 * Math.sin(S.rt * U.TAU / 1.8); S.ring[3] = ringA.x * (0.75 + 0.25 * Math.sin(S.rt * U.TAU / 1.8));
    } else S.ring[3] = 0;
    // line noise (on hook and party line)
    if (wd && warmDone && (state === ST.ONHOOK || idle) && now - lineNoiseT > V.LINE_NOISE_MS) {
      lineNoiseT = now; spawn(0.02 + 0.96 * Math.random(), V.LINE_NOISE_AMP, 0, 0.5);
    }
  }
  function rotPal(src, dst, deg) {
    const a = deg * U.DEG, c = Math.cos(a), s = Math.sin(a) * 0.57735, t = (1 - c) / 3;
    for (let i = 0; i < 48; i += 3) {
      const r = src[i], g = src[i + 1], b = src[i + 2], m = (r + g + b) * t;
      dst[i] = Math.max(0, r * c + s * (b - g) + m); dst[i + 1] = Math.max(0, g * c + s * (r - b) + m); dst[i + 2] = Math.max(0, b * c + s * (g - r) + m);
    }
  }
  let stMode = '', stEx = -1, stCalls = -1, stCallers = -1;
  function status() {
    let m;
    if (state === ST.ONHOOK) m = STATUS.ONHOOK;
    else if (state === ST.HANDSHAKE) m = STATUS.HANDSHAKE;
    else if (retrace) m = STATUS.RETRACE;
    else if (deskOn) m = STATUS.DESK;
    else if (slowOn) m = STATUS.SLOW;
    else if (idle) m = STATUS.PARTY;
    else if (Sound.muted) m = STATUS.MUTED;
    else m = STATUS.PLAY;
    const c = state === ST.ONHOOK ? 0 : calls, n = CoreGhosts.count();
    if (m !== stMode || ex !== stEx || c !== stCalls || n !== stCallers) { stMode = m; stEx = ex; stCalls = c; stCallers = n; UI.setStatus(m, ex, c, n); }
  }
  function resized() {
    View.setExchange(pm === PM.KNIT ? exB : ex, true);
    if (!warmDone && lineT >= 0) dotL.set(S.cssW * 0.46);
  }
  return {
    ST, PM, piv, init, setCalm, ensureWire, setTier, setSign, boot, powerOn, step, update, onEvent, canPluck, pluck, cancelEchoes, ringOnly, ping, degauss, hover, setHover, parallax,
    reticle, strongMag, slowSrc, zoomTo, zoomBy, pickUp, skip, pullBegin, pullMove, pullEnd, autoKnit, dial, juneAnswered, handsetToggle,
    konamiToggle, esc, toggleMute, activity, retraceEnd, resized, spawn, ring, panX,
    get wd() { return wd; }, get ex() { return ex; }, get state() { return state; }, get pm() { return pm; }, get retrace() { return retrace; },
    get handset() { return handset; }, get desk() { return deskOn; }, get zoomT() { return zoomT; }, get slow() { return slowOn; },
    get idle() { return idle; }, get warmDone() { return warmDone; }, get calls() { return calls; }, get buildMs() { return buildMs; },
    get tier() { return tier; }, get calm() { return calm; }, get wds() { return wds; }, get stale() { return stale; }, get lastInput() { return lastInput; },
  };
})();
