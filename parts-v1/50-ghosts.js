// 50-ghosts.js — CoreGhosts: crosshairs (June + party-line callers), the silent pre-gesture demo, June's call and
// call-and-response detection, the operator circle, and the Tide lighthouse's self-playing harp (§3.1, §3.4, §10).
const CoreGhosts = (() => {
  const S = CoreS, TR = CFG.TRANSPORT, ID = CFG.IDLE, V = CFG.VIS, XS = CFG.EXCHANGES;
  const gx = [new Spring(0, 7), new Spring(0, 7), new Spring(0, 7)], gy = [new Spring(0, 7), new Spring(0, 7), new Spring(0, 7)];
  const fade = Spring.omegaForSettle(V.GHOST_FADE_MS / 1000);
  const ga = [new Spring(0, fade), new Spring(0, fade), new Spring(0, fade)];
  const springs = [gx[0], gx[1], gx[2], gy[0], gy[1], gy[2], ga[0], ga[1], ga[2]];
  const G = [0, 1, 2].map((i) => ({ on: false, sid: -1, pend: false, pendT: 0, lastT: 0, left: 0, rest: 0, deg: 9, flash: 0 }));
  const tabs = [null, null, null], o2 = new Float32Array(3), o3 = new Float32Array(3);
  let demoNext = -1, demoPluck = -1, demoHide = -1, callers = 0, party = false;
  let callNext = -1, answerFrom = 0, answerUntil = 0, prog = 0, circleUntil = 0, lhLast = 0;
  const JQ = 12, jqSid = new Int32Array(JQ), jqT = new Float64Array(JQ), callSid = new Int32Array(5);
  let jqN = 0, juneLast = 0, tv = -1;
  // Per-exchange lookup tables (built once per Wire.build).
  function tables(e, w) {
    const n = w.str.count, mid = new Int32Array(n), byPc = [];
    for (let p = 0; p < 12; p++) byPc.push([]);
    for (let s = 0; s < n; s++) {
      mid[s] = (w.str.i0[s] + w.str.i1[s] - 1) >> 1;
      byPc[U.pc(CFG.degreeToMidi(e, w.str.degree[s]))].push(s);
    }
    const sea = [], se = w.el.sea;
    if (se) for (let s = 0; s < n; s++) if (w.str.sA[s] >= se.sA && w.str.sB[s] <= se.sB) sea.push(s);
    const r = w.el.window || w.el.billboard, win = new Float32Array(3);
    if (r) {
      let k = 0;
      for (let i = r.i0; i < r.i1; i += Math.max(1, ((r.i1 - r.i0) / 48) | 0)) { win[0] += w.f32[i * 6]; win[1] += w.f32[i * 6 + 1]; win[2] += w.f32[i * 6 + 2]; k++; }
      if (k) { win[0] /= k; win[1] /= k; win[2] /= k; }
    }
    tabs[e] = { mid, byPc: byPc.map((a) => Int32Array.from(a)), sea: Int32Array.from(sea), win };
  }
  function midPos(sid, out) {
    const w = World.wd, t = tabs[World.ex];
    return !!(w && t && sid >= 0 && sid < t.mid.length && View.projPoint(w, t.mid[sid], out));
  }
  function visible(sid) { return midPos(sid, o2) && o2[0] > 40 && o2[1] > 40 && o2[0] < S.cssW - 40 && o2[1] < S.cssH - 40; }
  function show(k, x, y, a) {
    if (ga[k].x < 0.03) { gx[k].set(x + (k === 0 ? -70 : 60)); gy[k].set(y - 50); }
    gx[k].to(x); gy[k].to(y); ga[k].to(a);
  }
  // ---------------------------------------------------------------- demo (on hook, silent)
  function warmDone(now) { demoNext = now + Math.max(0, V.GHOST_DEMO_FIRST_MS - 1400 - 600); }
  function stopDemo() { demoNext = demoPluck = demoHide = -1; if (!jqN) ga[0].to(0); }
  function demo(now) {
    const w = World.wd;
    if (!w || World.state !== World.ST.ONHOOK) return;
    if (demoNext > 0 && now >= demoNext && demoPluck < 0) { demoPluck = now + 600; demoNext = -1; }
    if (demoPluck > 0) {
      if (View.projPoint(w, w.homePoint, o2)) show(0, o2[0], o2[1], 0.55);
      if (now >= demoPluck) {
        World.spawn(w.f32[w.homePoint * 6 + 4], 0.85, 0, 1); World.ring(w.demoString, 0.8);
        G[0].flash = 1; demoPluck = -1; demoHide = now + 650;
      }
    }
    if (demoHide > 0 && now >= demoHide) { ga[0].to(0); demoHide = -1; demoNext = now + V.GHOST_DEMO_EVERY_MS - 1250; }
  }
  // ---------------------------------------------------------------- June
  function juneTo(sid, at) {
    if (jqN >= JQ) return;
    jqSid[jqN] = sid; jqT[jqN] = at; jqN++;
  }
  function june(now) {
    let k = 0;
    while (k < jqN && jqT[k] < now - 250) k++;
    if (k) { for (let i = k; i < jqN; i++) { jqSid[i - k] = jqSid[i]; jqT[i - k] = jqT[i]; } jqN -= k; }
    if (now < circleUntil) {
      const t = tabs[World.ex];
      if (t && View.proj(t.win[0], t.win[1], t.win[2], o2)) {
        const a = S.rt * U.TAU / 1.4;
        show(0, o2[0] + 28 * Math.cos(a), o2[1] + 20 * Math.sin(a), 0.7);
      }
      juneLast = now; return;
    }
    if (jqN && midPos(jqSid[0], o2)) { show(0, o2[0], o2[1], 0.7); juneLast = now; }
    else if (!G[0].on && demoPluck < 0 && now - juneLast > 900) ga[0].to(0);
  }
  function circleWindow() { circleUntil = U.now() + 6500; }
  function startCall(now) {
    const w = World.wd, t = tabs[World.ex], ex = World.ex, call = XS[ex].call;
    if (!w || !t) return;
    const t0 = Sound.transport.nextGrid(now, 4, 400);
    let px = S.cssW / 2, py = S.cssH / 2;
    for (let k = 0; k < 5; k++) {
      const list = t.byPc[call[k]];
      let best = -1, bd = 1e18;
      for (let j = 0; j < list.length; j++) {
        if (!midPos(list[j], o2)) continue;
        if (o2[0] < 30 || o2[1] < 30 || o2[0] > S.cssW - 30 || o2[1] > S.cssH - 30) continue;
        const d = (o2[0] - px) * (o2[0] - px) + (o2[1] - py) * (o2[1] - py);
        if (d < bd) { bd = d; best = list[j]; o3[0] = o2[0]; o3[1] = o2[1]; }
      }
      if (best < 0 && list.length) best = list[0];
      callSid[k] = best;
      if (best < 0) continue;
      px = o3[0]; py = o3[1];
      const at = t0 + k * TR.BEAT_MS;
      Sound.pluck(CFG.degreeToMidi(ex, w.str.degree[best]), 0.72, World.panX(px), PLUCK.JUNE, at, best, SRC.JUNE);
      juneTo(best, at);
    }
    answerFrom = t0 + 4 * TR.BEAT_MS; answerUntil = t0 + 5 * TR.BEAT_MS + ID.ANSWER_WINDOW_MS; prog = 0;
  }
  // A user pluck (MIDI) for call-and-response.
  function heard(midi) {
    const now = U.now();
    if (now < answerFrom || now > answerUntil) return;
    const call = XS[World.ex].call, pc = U.pc(midi);
    prog = pc === call[prog] ? prog + 1 : pc === call[0] ? 1 : 0;
    if (prog < 5) return;
    answerUntil = 0; prog = 0;
    World.juneAnswered();
    const w = World.wd, ex = World.ex, t0 = Sound.transport.nextGrid(now, 4, 500) + TR.BEAT_MS;
    for (let k = 0; k < 5; k++) {
      const sid = callSid[4 - k];
      if (!w || sid < 0 || sid >= w.str.count) continue;
      Sound.pluck(CFG.degreeToMidi(ex, w.str.degree[sid]), 0.78, midPos(sid, o2) ? World.panX(o2[0]) : 0, PLUCK.JUNE, t0 + k * TR.BEAT_MS, sid, SRC.JUNE);
      juneTo(sid, t0 + k * TR.BEAT_MS);
    }
  }
  // ---------------------------------------------------------------- party line
  function setParty(on) {
    party = on;
    if (on) {
      callers = 1 + Math.floor(Math.random() * 3);
      for (let k = 1; k <= 2; k++) { G[k].on = k <= callers; G[k].pend = false; G[k].rest = U.now() + 600 * k; G[k].left = 3 + (Math.random() * 4 | 0); }
      G[0].on = callers >= 3; G[0].pend = false; G[0].rest = U.now() + 1500; G[0].left = 4;
    } else { callers = 0; for (let k = 0; k < 3; k++) { G[k].on = false; ga[k].to(0); } }
  }
  function pick(g) {
    const w = World.wd, ex = World.ex;
    if (!w) return -1;
    const ch = XS[ex].progression[U.mod(Sound.chord() | 0, 4)].safe, n = w.str.count;
    let fb = -1;
    for (let tries = 0; tries < 48; tries++) {
      const sid = g.sid >= 0 && tries < 20 ? U.clamp(g.sid + ((Math.random() * 7) | 0) - 3, 0, n - 1) : (Math.random() * n) | 0;
      if (!visible(sid)) continue;
      const deg = w.str.degree[sid];
      if (fb < 0) fb = sid;
      if (ch.indexOf(U.pc(CFG.degreeToMidi(ex, deg))) >= 0 && deg !== g.deg && Math.abs(deg - g.deg) <= 4) return sid;
    }
    return fb;
  }
  function partyStep(now) {
    const w = World.wd;
    for (let k = 0; k < 3; k++) {
      const g = G[k];
      if (!g.on || !w) continue;
      if (g.pend && now > g.pendT + 1500) g.pend = false;
      if (g.sid >= 0 && midPos(g.sid, o2)) show(k, o2[0], o2[1], k === 0 ? 0.6 : 0.35);
      if (g.pend || now < g.rest || (k === 0 && (jqN || now < circleUntil))) continue;
      const t = Sound.transport.nextGrid(now, 8, 150) + (Math.random() < 0.25 ? TR.E8_MS : 0);
      if (t <= g.lastT + 10) continue;
      const sid = pick(g);
      if (sid < 0) { g.rest = now + 400; continue; }
      g.sid = sid; g.deg = w.str.degree[sid]; g.pend = true; g.pendT = t; g.lastT = t;
      midPos(sid, o2);
      Sound.pluck(CFG.degreeToMidi(World.ex, g.deg), 0.45 + Math.random() * 0.3, World.panX(o2[0]),
        k === 0 ? PLUCK.JUNE : PLUCK.GHOST, t, sid, k === 0 ? SRC.JUNE : SRC.GHOST0 + k);
    }
  }
  function onPluck(sid, src) {
    const w = World.wd;
    if (!w || sid < 0 || sid >= w.str.count) return;
    const t = tabs[World.ex], i = t ? t.mid[sid] : w.str.i0[sid];
    const amp = src === SRC.JUNE ? 0.85 : src === SRC.LIGHTHOUSE ? 0.45 : 0.55;
    World.spawn(w.f32[i * 6 + 4], amp, 0, 0.8); World.ring(sid, amp * 0.8);
    const k = src === SRC.JUNE ? 0 : src >= SRC.GHOST0 && src <= SRC.GHOST2 ? src : -1;
    if (k < 0) return;
    const g = G[k];
    g.flash = 1;
    if (g.on && g.pend) {
      g.pend = false;
      if (--g.left <= 0) { g.left = 3 + (Math.random() * 5 | 0); g.rest = U.now() + TR.BAR_MS * (1 + Math.random() * 2); }
    }
  }
  // ---------------------------------------------------------------- lighthouse (Tide)
  function lighthouse(now) {
    const t = tabs[World.ex];
    if (World.ex !== EX.TIDE || !t || !t.sea.length || World.state !== World.ST.PLAY || World.pm !== World.PM.NONE) return;
    const at = Sound.transport.nextGrid(now, 8, 150);
    if (at <= lhLast + 10) return;
    lhLast = at;
    const a = U.TAU * Sound.transport.bar(at) / 8, sn = Math.sin(a);
    if (sn < 0.2 || Math.random() > 0.72) return;
    const sid = t.sea[Math.round(U.sat((sn - 0.2) / 0.8) * (t.sea.length - 1))], w = World.wd;
    Sound.pluck(CFG.degreeToMidi(EX.TIDE, w.str.degree[sid]), 0.35 + Math.random() * 0.25, U.clamp(Math.cos(a), -1, 1) * 0.6, PLUCK.LIGHTHOUSE, at, sid, SRC.LIGHTHOUSE);
  }
  // ---------------------------------------------------------------- per frame
  function update(now) {
    if (Sound.transport.version !== tv) { tv = Sound.transport.version; lhLast = 0; for (let k = 0; k < 3; k++) { G[k].lastT = 0; G[k].pend = false; } }
    demo(now);
    if (World.state === World.ST.PLAY) {
      if (callNext < 0) callNext = now + ID.CALL_FIRST_MS;
      if (now >= callNext && now - World.lastInput >= ID.CALL_IDLE_MIN_MS && World.pm === World.PM.NONE && !World.retrace) { callNext = now + ID.CALL_EVERY_MS; startCall(now); }
      if (party) partyStep(now);
      lighthouse(now);
    }
    june(now);
    for (let k = 0; k < 3; k++) {
      G[k].flash *= 0.9;
      S.gh[k * 4] = gx[k].x; S.gh[k * 4 + 1] = gy[k].x; S.gh[k * 4 + 2] = ga[k].x > 0.01 ? ga[k].x * (1 + G[k].flash) : 0;
      S.gh[k * 4 + 3] = k === 0 ? 1 : 0;
    }
  }
  function exchanged() { for (let k = 0; k < 3; k++) G[k].sid = -1; jqN = 0; answerUntil = 0; }
  return {
    tables, warmDone, stopDemo, juneTo, circleWindow, heard, onPluck, update, exchanged, springs,
    party: setParty, count: () => (party ? callers : 0),
  };
})();
