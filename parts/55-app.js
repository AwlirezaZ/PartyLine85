// 55-app.js — App: boot order (§5.5), the frame loop (§5.3), resize, lifecycle, context loss and the governor (§8.3).
const App = (() => {
  const S = CoreS, GV = CFG.GOVERNOR;
  const clock = new FixedStep(CFG.SPRING.SUBSTEP, CFG.SPRING.MAX_SUBSTEPS);
  let env = null, tier = 1, calm = false, canvas = null, raf = 0, lastTs = 0, frameNo = 0, glOK = false, hidden = false, lost = false, errs = 0;
  let ema = 16.7, work = 4, downAcc = 0, upAcc = 0, lastDown = -1e9, lastN = -1e9, lastChange = 0, govT0 = 0;
  let rs = 1, mipsN = 5, halfP = false, misconv = true, sizeTimer = 0, govOn = true;
  // probe-and-revert state: a step that buys no frame time is undone (30 Hz rAF caps, CPU-bound frames).
  // Tuning (literals below): 30 Hz cap target 37 ms, probe 2000 ms, no-gain pause 30 s doubling, touch rs floor 0.45,
  // prebuild 1500 ms after warm-up on hook / after 2000 ms without input in PLAY.
  let jit = 0, downMs = GV.DOWN_MS, probe = null, noGainUntil = 0, noGainEma = 0, noGainMs = 3e4, coolMs = GV.COOLDOWN_MS, trust = false, skip = 0;
  let pbBusy = false, pbNext = 0, warmAt = 0;
  const handlers = {
    onPickUp: () => World.pickUp(-1, false),
    onJustWatch: () => World.pickUp(-1, true),
    onSound: () => World.toggleMute(true),
    onSlow: (down) => { if (down) World.activity(); World.slowSrc(8, !!down); },
    onBack: () => World.zoomTo(World.desk ? 0 : -1),
    onDialKey: (ch) => { Sound.dtmf(ch); World.activity(); },
    onCall: (d) => World.dial(d),
    onCalm: (on) => setCalm(!!on),
    onFullscreen: () => fullscreen(),
    onModal: (open) => { if (open) { Input.releaseAll(); World.hover(0, 0, false); } World.activity(); },
  };
  function boot() {
    try { Object.defineProperty(window, '__pl85', { value: { App, Sound, Wire, UI, Store, CFG }, configurable: true }); } catch (e) { /* ignore */ }
    Store.load();
    env = CFG.detectEnv(); tier = CFG.pickTier(env, Store.data.tier); calm = Store.calm(env);
    // WebKit reports 4 cores and no deviceMemory on every iPhone/iPad, so the core count says nothing there:
    // A12+ GPUs hold MID comfortably and the governor can still shed resolution.
    if (tier === 0 && Store.data.tier == null && env.coarse && isIOS()) tier = 1;
    UI.init(handlers, Object.assign({}, env, { calm }));
    UI.setCalm(calm);
    UI.setStatus(STATUS.ONHOOK, EX.MERIDIAN, 0, 0);
    Sound.init({ tier }); Sound.setExchange(EX.MERIDIAN);
    canvas = document.getElementById('scene');
    if (!canvas) return;
    World.init(tier, calm, env);
    tierParams(tier);
    measure();
    if (!Renderer.initGL(canvas)) { Fallback.draw(canvas); UI.showNoCarrier(); return; }
    glOK = true;
    applySize();
    View.setExchange(EX.MERIDIAN, true); View.update(0, calm, false);
    World.boot(U.now());
    Renderer.firstFrame();
    Input.init(canvas);
    listen();
    start();
    setTimeout(stage2, 0);
  }
  function stage2() {
    Renderer.compileRest();
    try { World.ensureWire(EX.MERIDIAN); } catch (e) { console.warn('[pl85] wire', e); return; }
    try { Sound.prewarm(); } catch (e) { /* optional */ }
    govT0 = U.now();
    // Tide / Long Distance (and any wire a tier change left stale) are built later, one per idle slot: see prebuild().
  }
  function isIOS() {
    try { const n = navigator; return /iP(hone|ad|od)/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1); } catch (e) { return false; }
  }
  // ---------------------------------------------------------------- idle prebuild
  // Wire.build is synchronous (20-50 ms desktop, 70-160 ms phone). Do it while nothing is being played:
  // on the title screen once the overlay has risen, or in PLAY after a quiet spell; never during the
  // handshake or a pull. Next exchange in pull order first. On-demand ensureWire stays as the fallback.
  function pbNeed() {
    const W = World.wds, st = World.stale;
    for (let k = 1; k <= 3; k++) { const e = (World.ex + k) % 3; if (!W[e] || st[e]) return e; }
    return -1;
  }
  function pbOK() {
    if (hidden || lost || !World.warmDone || World.pm !== World.PM.NONE) return false;
    const st = World.state, t = U.now();
    if (st === World.ST.ONHOOK) return t - warmAt > 1500;
    return st === World.ST.PLAY && t - World.lastInput > 2000;
  }
  function prebuild(now) {
    if (pbBusy || now < pbNext || pbNeed() < 0 || !pbOK()) return;
    pbBusy = true;
    const run = () => {
      pbBusy = false; pbNext = U.now() + 300;
      const e = pbNeed();
      if (e < 0 || !pbOK()) return;
      try { World.ensureWire(e); } catch (er) { pbNext = U.now() + 10000; }
    };
    try { if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 50); } catch (e) { pbBusy = false; }
  }
  function tierParams(t) {
    const T = CFG.TIERS[t];
    tier = t; rs = T.rs.start; mipsN = T.bloomMips; halfP = false; misconv = T.misconv;
  }
  function measure() {
    const w = canvas.clientWidth || window.innerWidth || 1, h = canvas.clientHeight || window.innerHeight || 1;
    S.cssW = w; S.cssH = h; S.aspect = w / h;
    S.dpr = Math.min(window.devicePixelRatio || 1, CFG.TIERS[tier].dprCap);
  }
  function applySize() {
    if (!glOK) return;
    S.bw = Math.max(1, Math.round(S.cssW * S.dpr)); S.bh = Math.max(1, Math.round(S.cssH * S.dpr)); S.rs = rs;
    Renderer.resize(S.bw, S.bh, rs, halfP, mipsN);
    View.resize(); World.resized();
  }
  function onResize() {
    if (!canvas) return;
    const w = S.cssW, h = S.cssH;
    measure();
    if (w === S.cssW && h === S.cssH && canvas.width === Math.round(S.cssW * S.dpr)) return;
    View.resize(); World.resized();
    clearTimeout(sizeTimer); sizeTimer = setTimeout(applySize, 100);
  }
  function listen() {
    try { if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas); } catch (e) { /* ignore */ }
    try { window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize); } catch (e) { /* ignore */ }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hidden = true; stop(); Sound.hide(); Store.flush(); Input.releaseAll();
      } else if (hidden) {
        hidden = false; Sound.show(); World.powerOn(U.now()); govT0 = U.now(); start();
      }
    });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; Renderer.setLost(true); stop(); UI.chip('signal', true); });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false; Renderer.restore(World.wds); applySize(); World.powerOn(U.now()); govT0 = U.now(); UI.chip('signal', false); start();
    });
  }
  function start() { if (!raf && !hidden && !lost) { lastTs = 0; clock.reset(); raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    try { frame(ts); } catch (e) { if (errs++ < 3) console.error('[pl85] frame', e); }
  }
  function frame(ts) {
    const w0 = U.now();
    let dt = lastTs ? ts - lastTs : 16.7;
    lastTs = ts;
    const raw = U.clamp(dt, 0, 1000);
    S.dtRaw = Math.min(raw, 250) / 1000;
    dt = U.clamp(dt, 0, GV.DT_CLAMP_MS);
    const now = ts;
    Sound.update(now);
    Sound.pollEvents(now, World.onEvent);
    const n = clock.advance(dt / 1000), h = clock.h, gs = CoreGhosts.springs;
    for (let k = 0; k < n; k++) { View.step(h); World.step(h); for (let j = 0; j < gs.length; j++) gs[j].step(h); }
    View.update(S.rt, calm, World.idle >= 2);
    frameNo++;
    Input.tick(now, frameNo);
    World.update(now, dt);
    S.misconv = misconv && CFG.TIERS[tier].misconv ? 0.6 : 0;
    Renderer.frame();
    if (World.handset) { const xy = Sound.readXY(); if (xy) UI.drawXY(xy.l, xy.r); }
    work += (U.now() - w0 - work) * 0.1;
    if (!warmAt && World.warmDone) warmAt = U.now();
    governor(raw, now);
    prebuild(now);
  }
  // ---------------------------------------------------------------- governor
  // EMA of the real frame interval; holds are measured in wall time. 60 Hz panels never reach 12.5 ms,
  // so a step up also counts frames that hit vsync with < 5 ms of main-thread work.
  // Not run on the title screen (nothing to protect; iOS throttles un-interacted cross-origin iframes to 30 Hz).
  // A steady, low-jitter 33.3 ms with light main-thread work is a 30 Hz rAF cap (iOS Low Power, Chrome Energy
  // Saver), not overload: the target becomes 30 Hz. Every down-step is a probe: if the EMA has not improved by
  // 8% after >= 2 s and 20 frames it is undone and stepping pauses (backing off). Only measured gains are trusted to persist.
  // Audio is never degraded from frame-interval evidence, and touch devices never change N (Wire rebuilds).
  function governor(dt, now) {
    if (World.state === World.ST.ONHOOK) govT0 = now;
    if (!govOn || now - govT0 < 2500 || !World.warmDone) { downAcc = upAcc = 0; if (probe) probe.t = Math.max(probe.t, now - 1000); return; }
    ema += (dt - ema) * GV.EMA;
    jit += (Math.abs(dt - ema) - jit) * GV.EMA;
    if (ema > 30 && ema < 36 && jit < 2.5 && work < 8) downMs = 37;
    else if (downMs !== GV.DOWN_MS && ema < 25) downMs = GV.DOWN_MS;   // cap lifted
    if (probe) {
      downAcc = upAcc = 0;
      if (++probe.n < 20 || now - probe.t < 2000) return;   // >= 1 s and >= 20 frames of fresh EMA
      if (ema > probe.ema * 0.92) {
        restore(probe.s); lastChange = now;
        if (probe.k) skip |= probe.k;   // that lever is useless here; the next one gets its turn
        else { noGainEma = probe.ema; noGainUntil = now + noGainMs; noGainMs = Math.min(noGainMs * 2, 240000); }   // fill rate is not the limit: back off
      } else { coolMs = Math.min(coolMs * 2, 120000); if (probe.s.tier !== tier) trust = true; }
      probe = null; return;
    }
    if (noGainUntil && ema < noGainEma * 0.7) noGainUntil = 0;   // the frame rate jumped: whatever capped it is gone
    if (ema > downMs && now >= noGainUntil) downAcc += dt; else downAcc = 0;
    if (ema < GV.UP_MS || (ema < 17.6 && work < 5)) upAcc += dt; else upAcc = 0;
    if (downAcc > GV.DOWN_HOLD_MS) { downAcc = 0; stepDown(now, ema > downMs * 3); }
    else if (upAcc > GV.UP_HOLD_MS && now - lastDown > coolMs) { upAcc = 0; stepUp(now); }
    if (trust && now - Math.max(lastChange, govT0) > GV.STABLE_WRITE_MS && Store.data.tier !== tier) Store.set('tier', tier);
  }
  // N changes rebuild every wire synchronously: desktop only, never mid-pull or outside PLAY.
  function tierOK() { return !env.coarse && World.pm === World.PM.NONE && World.state === World.ST.PLAY; }
  function stepDown(now, big) {
    const T = CFG.TIERS[tier], s = { rs, mipsN, halfP, misconv, tier }, e0 = ema;
    let k = 0;   // lever: 0 = resolution / tier, 1 = bloom mips, 2 = half-precision RT, 4 = misconvergence
    if (big && tier > 0 && now - lastN > 2500 && tierOK()) { lastN = now; rs = CFG.TIERS[tier - 1].rs.min; setTier(tier - 1); }
    else if (rs > T.rs.min + 0.01) { rs = Math.max(T.rs.min, rs - GV.RS_STEP); applySize(); }
    else if (mipsN > 2 && !(skip & 1)) { k = 1; mipsN--; applySize(); }
    else if (!halfP && !(skip & 2)) { k = 2; halfP = true; applySize(); }
    else if (misconv && !(skip & 4)) { k = 4; misconv = false; }
    else if (env.coarse && rs > 0.45 + 0.01) { rs = Math.max(0.45, rs - GV.RS_STEP); applySize(); }
    else if (tier > 0 && now - lastN > GV.N_CHANGE_MIN_MS && tierOK()) { lastN = now; setTier(tier - 1); }
    else return;
    lastDown = lastChange = now; govT0 = now - 1500;
    probe = { t: now, ema: e0, s, k, n: 0 };
  }
  function restore(s) {
    let sz = s.rs !== rs || s.mipsN !== mipsN || s.halfP !== halfP;
    if (s.tier !== tier) { if (World.pm !== World.PM.NONE) return; tierParams(s.tier); World.setTier(s.tier); measure(); sz = true; }
    rs = s.rs; mipsN = s.mipsN; halfP = s.halfP; misconv = s.misconv;
    if (sz) applySize();
  }
  function stepUp(now) {
    const T = CFG.TIERS[tier];
    lastChange = now;
    if (!misconv && T.misconv) { misconv = true; return; }
    if (halfP) { halfP = false; applySize(); return; }
    if (mipsN < T.bloomMips) { mipsN++; applySize(); return; }
    if (rs < T.rs.max - 0.01) { rs = Math.min(T.rs.max, rs + GV.RS_STEP); applySize(); return; }
    if (tier < 2 && now - lastN > GV.N_CHANGE_MIN_MS && tierOK()) { lastN = now; trust = true; setTier(tier + 1); }
  }
  function setTier(t) {
    const old = rs;
    tierParams(t);
    if (t < 2) rs = Math.min(old, CFG.TIERS[t].rs.max);
    World.setTier(t);   // audio keeps its boot tier: frame intervals say nothing about audio cost
    measure(); applySize();
  }
  function setCalm(on) {
    calm = on; Store.set('calm', on); World.setCalm(on); UI.setCalm(on);
    if (on) { View.parX.to(0); View.parY.to(0); }
  }
  function fullscreen() {
    if (!env || !env.fullscreen) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(U.noop); }
    } catch (e) { /* ignore */ }
  }
  function debug() {
    return {
      state: ['onhook', 'handshake', 'play'][World.state], ex: World.ex, tier, fps: Math.round(1000 / ema), packets: countPk(),
      muted: Sound.muted, zoom: World.zoomT, slow: World.slow, rs, mips: mipsN, halfP, inline: Renderer.inline, floatRT: Renderer.floatRT,
      gl: glOK, warm: World.warmDone, pm: World.pm, idle: World.idle, work: +work.toFixed(2), ready: glOK ? Renderer.ready() : null,
    };
  }
  function countPk() { let n = 0; for (let i = 0; i < CFG.MAX_PACKETS; i++) if (S.pkA[i * 4 + 2] > 0) n++; return n; }
  return { boot, debug, fullscreen, handlers, core: { S, World, View, Renderer, Input }, gov: (on) => { govOn = !!on; }, get tier() { return tier; } };
})();
