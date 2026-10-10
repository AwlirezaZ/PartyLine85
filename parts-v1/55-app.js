// 55-app.js — App: boot order (§5.5), the frame loop (§5.3), resize, lifecycle, context loss and the governor (§8.3).
const App = (() => {
  const S = CoreS, GV = CFG.GOVERNOR;
  const clock = new FixedStep(CFG.SPRING.SUBSTEP, CFG.SPRING.MAX_SUBSTEPS);
  let env = null, tier = 1, calm = false, canvas = null, raf = 0, lastTs = 0, frameNo = 0, glOK = false, hidden = false, lost = false, errs = 0;
  let ema = 16.7, work = 4, downAcc = 0, upAcc = 0, lastDown = -1e9, lastN = -1e9, lastChange = 0, govT0 = 0;
  let rs = 1, mipsN = 5, halfP = false, misconv = true, audioTier = 1, sizeTimer = 0, govOn = true;
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
    const t0 = U.now();
    Renderer.compileRest();
    try { World.ensureWire(EX.MERIDIAN); } catch (e) { console.warn('[pl85] wire', e); return; }
    try { Sound.prewarm(); } catch (e) { /* optional */ }
    govT0 = U.now();
    const slow = U.now() - t0 > 120;
    if (!slow) setTimeout(() => { try { if (U.now() - t0 < 220) { World.ensureWire(EX.TIDE); setTimeout(() => { try { if (U.now() - t0 < 300) World.ensureWire(EX.LONG); } catch (e) { /* on demand later */ } }, 0); } } catch (e) { /* on demand later */ } }, 0);
  }
  function tierParams(t) {
    const T = CFG.TIERS[t];
    tier = t; rs = T.rs.start; mipsN = T.bloomMips; halfP = false; misconv = T.misconv; audioTier = t;
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
    governor(raw, now);
  }
  // ---------------------------------------------------------------- governor
  // EMA of the real frame interval; holds are measured in wall time. 60 Hz panels never reach 12.5 ms,
  // so a step up also counts frames that hit vsync with < 5 ms of main-thread work.
  function governor(dt, now) {
    if (!govOn || now - govT0 < 2500 || !World.warmDone) { downAcc = upAcc = 0; return; }
    ema += (dt - ema) * GV.EMA;
    if (ema > GV.DOWN_MS) downAcc += dt; else downAcc = 0;
    if (ema < GV.UP_MS || (ema < 17.6 && work < 5)) upAcc += dt; else upAcc = 0;
    if (downAcc > GV.DOWN_HOLD_MS && ema > GV.DOWN_MS * 3 && tier > 0 && now - lastN > 2500) {
      downAcc = 0; lastDown = lastChange = lastN = now; rs = CFG.TIERS[tier - 1].rs.min; setTier(tier - 1);
    } else if (downAcc > GV.DOWN_HOLD_MS) { downAcc = 0; stepDown(now); }
    else if (upAcc > GV.UP_HOLD_MS && now - lastDown > GV.COOLDOWN_MS) { upAcc = 0; stepUp(now); }
    if (now - Math.max(lastChange, govT0) > GV.STABLE_WRITE_MS && Store.data.tier !== tier) Store.set('tier', tier);
  }
  function stepDown(now) {
    const T = CFG.TIERS[tier];
    lastDown = lastChange = now; govT0 = now - 1500;
    if (rs > T.rs.min + 0.01) { rs = Math.max(T.rs.min, rs - GV.RS_STEP); applySize(); return; }
    if (mipsN > 2) { mipsN--; applySize(); return; }
    if (!halfP) { halfP = true; applySize(); return; }
    if (misconv) { misconv = false; return; }
    if (tier > 0 && now - lastN > GV.N_CHANGE_MIN_MS) { lastN = now; setTier(tier - 1); return; }
    if (audioTier > 0) { audioTier--; Sound.setTier(audioTier); }
  }
  function stepUp(now) {
    const T = CFG.TIERS[tier];
    lastChange = now;
    if (audioTier < tier) { audioTier++; Sound.setTier(audioTier); return; }
    if (!misconv && T.misconv) { misconv = true; return; }
    if (halfP) { halfP = false; applySize(); return; }
    if (mipsN < T.bloomMips) { mipsN++; applySize(); return; }
    if (rs < T.rs.max - 0.01) { rs = Math.min(T.rs.max, rs + GV.RS_STEP); applySize(); return; }
    if (tier < 2 && now - lastN > GV.N_CHANGE_MIN_MS && !(env.coarse && tier >= 1)) { lastN = now; setTier(tier + 1); }
  }
  function setTier(t) {
    const old = rs;
    tierParams(t);
    if (t < 2) rs = Math.min(old, CFG.TIERS[t].rs.max);
    World.setTier(t); Sound.setTier(t);
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
