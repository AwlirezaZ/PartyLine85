// 46-input.js — Input: the gesture recognizer (§4.1) and verb table (§4.2) for mouse, touch, pen, wheel and keys.
// Sound always starts inside the event handler; only long-press / two-finger timers resolve in tick().
const Input = (() => {
  const S = CoreS, IN = CFG.INPUT;
  const M = { PEND: 0, STRUM: 1, PULL: 2, STRONG: 3, TWO: 4, PINCH: 5, SLOW: 6, DEAD: 7, RSLOW: 8 };
  const P = [0, 1, 2].map(() => ({ id: -1, touch: false, mode: 0, t0: 0, sx0: 0, sy0: 0, x0: 0, y0: 0, x: 0, y: 0, lx: 0, ly: 0, lt: 0, mv: 0, plucked: false, lastPluck: -1e9 }));
  const sc = new Float32Array(2);
  let cv = null, frame = 0, deb = new Float64Array(256), debWd = null;
  let lastTapT = -1e9, lastTapX = 0, lastTapY = 0, lastTapPing = false;
  let tw = null, twP0 = 0, twD0 = 1, twCX = 0, twCY = 0, twT0 = 0, twZ0 = 0, twMode = 0;
  let mouseIn = false, mxs = 0, mys = 0, kbd = false, rx = -1, ry = -1, kStep = IN.KEY_STEP;
  let enterT = -1, enterPull = false, enterPt = -1, lastEnterT = -1e9, kon = 0;
  function on(t, ev, fn, o) { try { t.addEventListener(ev, fn, o || false); } catch (e) { /* ignore */ } }
  function init(canvas) {
    cv = canvas;
    on(cv, 'pointerdown', down, { passive: false });
    on(cv, 'pointermove', move, { passive: false });
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up); on(cv, 'lostpointercapture', up);
    on(cv, 'pointerleave', (e) => { if (e.pointerType === 'mouse') { mouseIn = false; World.hover(0, 0, false); } });
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(cv, 'wheel', wheel, { passive: false });
    on(cv, 'focus', () => { if (kbd) World.reticle(rx, ry, 1); });
    on(cv, 'blur', () => { World.reticle(rx, ry, 0); });
    on(window, 'keydown', keydown); on(window, 'keyup', keyup);
    on(window, 'blur', releaseAll);
  }
  function slot(id) { for (let i = 0; i < 3; i++) if (P[i].id === id) return P[i]; return null; }
  function free() { for (let i = 0; i < 3; i++) if (P[i].id < 0) return P[i]; return null; }
  function count() { let n = 0; for (let i = 0; i < 3; i++) if (P[i].id >= 0) n++; return n; }
  function snapR(touch) { return touch ? IN.SNAP_COARSE : IN.SNAP_FINE; }
  function hashReady() { return World.warmDone && World.wd && World.pm === World.PM.NONE && S.U === 0 && S.K === 0; }
  function nearest(x, y, r) { if (!hashReady()) return -1; View.ensureHash(frame); return View.nearest(x, y, r); }
  // Strum debounce table (per string, event-time ms). A pluck on pointer-down marks its string too, so a strum
  // that starts on the string just plucked does not attack it a second time.
  function debFor(w) { if (debWd !== w) { debWd = w; if (deb.length < w.str.count) deb = new Float64Array(w.str.count); deb.fill(-1e9); } }
  function debMark(i, t) { const w = World.wd; if (!w) return; debFor(w); const sid = w.pointString[i]; if (sid !== 0xFFFF) deb[sid] = t; }
  function pluckAt(p, e, touch, now) {
    if (!World.canPluck()) return;
    const i = nearest(sc[0], sc[1], snapR(touch));
    if (i >= 0) { World.pluck(i, sc[0], vel(e), false); p.plucked = true; p.lastPluck = now; debMark(i, now); }
  }
  function vel(e) { const p = e.pressure; return e.pointerType !== 'mouse' && p > 0 && p < 1 && p !== 0.5 ? U.clamp(0.3 + p * 0.9, 0.3, 1) : IN.VEL_DEFAULT; }
  // ---------------------------------------------------------------- pointers
  function down(e) {
    if (UI.isModalOpen()) return;
    e.preventDefault();
    try { cv.focus({ preventScroll: true }); } catch (er) { /* ignore */ }
    const now = Math.min(U.now(), e.timeStamp || 1e15), touch = e.pointerType !== 'mouse';
    kbd = false;
    UI.notePointer(e.clientX, e.clientY, e.pointerType === 'touch');
    View.toScene(e.clientX, e.clientY, sc);
    const p = free();
    if (!p) return;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    p.id = e.pointerId; p.touch = touch; p.t0 = now; p.sx0 = e.clientX; p.sy0 = e.clientY; p.x0 = p.x = p.lx = sc[0]; p.y0 = p.y = p.ly = sc[1];
    p.lt = now; p.mv = 0; p.plucked = false; p.lastPluck = -1e9; p.mode = M.PEND;
    if (touch) World.hover(sc[0], sc[1], true);
    if (!touch && e.button === 2) { p.mode = M.RSLOW; World.activity(); World.slowSrc(1, true); return; }
    if (!touch && e.button !== 0) { p.mode = M.DEAD; return; }
    if (World.state === World.ST.ONHOOK) { const x = sc[0], y = sc[1]; World.pickUp(() => nearest(x, y, snapR(touch)), false, now); p.mode = M.DEAD; return; }
    World.activity();
    if (World.state === World.ST.HANDSHAKE) World.skip();
    if (World.retrace) { World.retraceEnd(); p.mode = M.DEAD; return; }
    if (World.desk) { World.zoomTo(0); p.mode = M.DEAD; return; }
    if (touch) {
      for (let i = 0; i < 3; i++) {
        const o = P[i];
        if (o === p || o.id < 0 || !o.touch || (o.mode !== M.PEND && o.mode !== M.STRUM)) continue;
        if (now - o.t0 < IN.TWO_WITHIN_MS || o.mv < IN.TWO_STILL_PX) {
          // tw holds pointerIds, not slots: a reused slot must never inherit SLOW / PINCH.
          o.mode = p.mode = M.TWO; tw = [o.id, p.id]; twT0 = now; twP0 = Math.min(o.t0, now); twMode = 0;
          twD0 = Math.max(1, Math.hypot(p.x - o.x, p.y - o.y)); twCX = (p.x + o.x) / 2; twCY = (p.y + o.y) / 2;
          pluckAt(p, e, true, now);   // the second finger sounds too (trills, rest + tap)
          return;
        }
      }
    }
    if (now - lastTapT < IN.DTAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < IN.DTAP_PX) {
      const w = World.wd;
      if (w && w.el.payphone && World.ex === 0 && View.inRange(w, w.el.payphone, sc[0], sc[1], IN.PAYPHONE_PAD)) { lastTapT = -1e9; p.mode = M.DEAD; World.handsetToggle(); return; }
      if (lastTapPing) { lastTapT = -1e9; p.mode = M.DEAD; World.degauss(); return; }
    }
    pluckAt(p, e, touch, now);
  }
  function move(e) {
    if (e.pointerType === 'mouse') { mouseIn = true; mxs = e.clientX; mys = e.clientY; if (kbd && !enterPull) { kbd = false; World.reticle(rx, ry, 0); } }
    const p = slot(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && !UI.isModalOpen()) {
        UI.notePointer(e.clientX, e.clientY, false);
        View.toScene(e.clientX, e.clientY, sc); World.hover(sc[0], sc[1], true);
        World.parallax(e.clientX / S.cssW * 2 - 1, e.clientY / S.cssH * 2 - 1);
        if (World.state === World.ST.PLAY) World.activity();
      }
      return;
    }
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length) for (let k = 0; k < list.length; k++) sample(p, list[k].clientX, list[k].clientY, list[k].timeStamp || e.timeStamp);
    else sample(p, e.clientX, e.clientY, e.timeStamp);
    UI.notePointer(e.clientX, e.clientY, e.pointerType === 'touch');
    if (!p.touch) World.parallax(e.clientX / S.cssW * 2 - 1, e.clientY / S.cssH * 2 - 1);
  }
  function sample(p, cx, cy, t) {
    if (p.mode === M.PEND && t - p.t0 >= IN.LONG_MS && p.mv < IN.LONG_PX) longPress(p);
    View.toScene(cx, cy, sc);
    const x = sc[0], y = sc[1];
    p.mv = Math.max(p.mv, Math.hypot(cx - p.sx0, cy - p.sy0));
    if (p.touch || p.mode === M.STRONG) World.hover(x, y, true);
    if (p.mode === M.PEND && p.mv > IN.DRAG_PX && World.state !== World.ST.ONHOOK) p.mode = M.STRUM;
    if (p.mode === M.STRUM) strum(p, x, y, t);
    else if (p.mode === M.PULL) World.pullMove(x, y);
    p.x = x; p.y = y;
    if (p.mode === M.TWO || p.mode === M.PINCH) two(U.now());
    p.lx = x; p.ly = y; p.lt = t;
  }
  function strum(p, x, y, t) {
    if (!World.canPluck() || !hashReady()) return;
    debFor(World.wd);
    View.ensureHash(frame);
    const X = View.crossings(p.lx, p.ly, x, y), dt = Math.max(1, t - p.lt), speed = Math.hypot(x - p.lx, y - p.ly) / dt;
    const v = U.clamp(IN.STRUM_VEL_BASE + speed * IN.STRUM_VEL_PER_SPEED, IN.STRUM_VEL_BASE, 1);
    for (let k = 0; k < X.n; k++) {
      const sid = X.str[k];
      if (t - deb[sid] < IN.STRUM_DEBOUNCE_MS) continue;
      deb[sid] = t;
      if (t - p.lastPluck >= IN.STRUM_MIN_INTERVAL_MS) { p.lastPluck = t; World.pluck(X.pt[k], X.x[k], v, true); }
      else World.ringOnly(X.pt[k], v * 0.5);
    }
  }
  function two(now) {
    if (!tw) return;
    const a = slot(tw[0]), b = slot(tw[1]);
    if (!a || !b) return;
    const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (twMode === 0) {
      if (now - twT0 <= IN.PINCH_WINDOW_MS && (Math.abs(d / twD0 - 1) > IN.PINCH_RATIO || Math.hypot(cx - twCX, cy - twCY) > IN.PINCH_CENTROID_PX)) {
        twMode = 1; a.mode = b.mode = M.PINCH; twZ0 = World.zoomT; twD0 = d; World.cancelEchoes(twP0);
      } else if (now - twT0 >= IN.SLOW_AFTER_MS) { twMode = 2; a.mode = b.mode = M.SLOW; World.slowSrc(2, true); World.cancelEchoes(twP0); }
    }
    if (twMode === 1) World.zoomTo(twZ0 + Math.log(d / twD0) * 1.25, cx, cy);
  }
  function up(e) {
    const p = slot(e.pointerId);
    if (!p) return;
    const now = Math.min(U.now(), e.timeStamp || 1e15);
    View.toScene(e.clientX, e.clientY, sc);
    // an undecided two-finger touch (twMode 0) lifts like a normal tap
    if ((p.mode === M.PEND || (p.mode === M.TWO && twMode === 0)) && now - p.t0 < IN.TAP_MS && p.mv < IN.TAP_PX) {
      lastTapPing = !p.plucked;
      if (!p.plucked && World.state !== World.ST.ONHOOK && !World.desk && World.pm === World.PM.NONE) World.ping(sc[0], sc[1]);
      lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;
    }
    if (p.mode === M.PULL) World.pullEnd();
    else if (p.mode === M.STRONG) World.strongMag(false, sc[0], sc[1]);
    else if (p.mode === M.RSLOW) World.slowSrc(1, false);
    if (tw && (tw[0] === p.id || tw[1] === p.id)) {
      const o = slot(tw[0] === p.id ? tw[1] : tw[0]);
      if (twMode === 2) { if (!o) { World.slowSrc(2, false); tw = null; } else o.mode = M.SLOW; }
      else { if (o) o.mode = twMode === 0 ? M.PEND : M.DEAD; tw = null; }   // undecided: the other finger keeps its own tap / strum / long-press
    }
    if (p.mode === M.SLOW && !tw) World.slowSrc(2, false);
    p.id = -1; p.mode = M.DEAD;
    if (tw && !slot(tw[0]) && !slot(tw[1])) { if (twMode === 2) World.slowSrc(2, false); tw = null; }
    let touchLeft = false;
    for (let i = 0; i < 3; i++) if (P[i].id >= 0 && P[i].touch) touchLeft = true;
    if (p.touch && !touchLeft) World.hover(0, 0, false);
  }
  function wheel(e) {
    if (UI.isModalOpen()) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= IN.LINE_HEIGHT_PX; else if (e.deltaMode === 2) dy *= IN.PAGE_PX;
    let dz = -dy / 100 * IN.WHEEL_PER_100;
    if (e.ctrlKey) dz *= IN.CTRL_WHEEL_MULT;
    View.toScene(e.clientX, e.clientY, sc);
    World.zoomBy(U.clamp(dz, -0.5, 0.5), sc[0], sc[1]);
  }
  function releaseAll() {
    for (let i = 0; i < 3; i++) {
      const p = P[i];
      if (p.id < 0) continue;
      if (p.mode === M.PULL) World.pullEnd(); else if (p.mode === M.STRONG) World.strongMag(false, p.x, p.y);
      p.id = -1; p.mode = M.DEAD;
    }
    tw = null; World.slowSrc(1 | 2 | 4 | 8, false);
    if (enterPull) { enterPull = false; World.pullEnd(); }
    enterT = -1;
  }
  // ---------------------------------------------------------------- keyboard
  function worldFocus() { const a = document.activeElement; return !a || a === document.body || a === cv || a === document.documentElement; }
  function keydown(e) {
    if (UI.isModalOpen()) return;
    const k = e.key || '';
    konamiStep(k);
    if (worldFocus()) {
      if (k === 'Enter') { e.preventDefault(); if (!e.repeat) enterDown(); return; }
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (e.repeat) return;
        if (World.state === World.ST.ONHOOK) { World.pickUp(-1, false, e.timeStamp); return; }
        World.activity(); World.slowSrc(4, true); return;
      }
      const dx = k === 'ArrowLeft' || k === 'a' || k === 'A' ? -1 : k === 'ArrowRight' ? 1 : 0;
      const dy = k === 'ArrowUp' || k === 'w' || k === 'W' ? -1 : k === 'ArrowDown' || k === 's' || k === 'S' ? 1 : 0;
      if (dx || dy) { e.preventDefault(); arrow(dx, dy, e.repeat); return; }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const on = World.state !== World.ST.ONHOOK;
    switch (k) {
      case 'm': case 'M': World.toggleMute(false); break;
      case 'h': case 'H': UI.toggleHud(); break;
      case '?': UI.openHelp(); break;
      case 'd': case 'D': if (on) World.degauss(); break;
      case 'f': case 'F': App.fullscreen(); break;
      case '-': case '_': if (on) World.zoomTo(World.zoomT > 0 ? 0 : -1); break;
      case '+': case '=': if (on) World.zoomTo(World.zoomT < 0 ? 0 : Math.min(1, World.zoomT + 0.5)); break;
      case 'Escape': World.esc(); break;
      default:
        if (on && k.length === 1 && ((k >= '0' && k <= '9') || k === '*' || k === '#')) { e.preventDefault(); UI.openDirectory(k); }
    }
  }
  function keyup(e) {
    const k = e.key || '';
    if (k === 'Enter') {
      if (enterPull) { enterPull = false; World.pullEnd(); }
      enterT = -1;
    } else if (k === ' ' || k === 'Spacebar') World.slowSrc(4, false);
  }
  function konamiStep(k) {
    const seq = IN.KONAMI, want = seq[kon], kk = k.length === 1 ? k.toLowerCase() : k;
    if (kk === want) { kon++; if (kon === seq.length) { kon = 0; if (World.state !== World.ST.ONHOOK) World.konamiToggle(); } }
    else kon = kk === seq[0] ? 1 : 0;
  }
  function ensureReticle() {
    if (rx >= 0) return;
    const w = World.wd;
    if (w && View.projPoint(w, w.homePoint, sc)) { rx = sc[0]; ry = sc[1]; } else { rx = S.cssW / 2; ry = S.cssH / 2; }
  }
  function arrow(dx, dy, rep) {
    kbd = true; ensureReticle(); World.activity();
    kStep = rep ? Math.min(IN.KEY_STEP_MAX, kStep + 6) : IN.KEY_STEP;
    rx = U.clamp(rx + dx * kStep, 0, S.cssW); ry = U.clamp(ry + dy * kStep, 0, S.cssH);
    if (enterPull) { World.pullMove(rx, ry); World.reticle(rx, ry, 1); return; }
    const i = nearest(rx, ry, IN.KEY_SNAP);
    if (i >= 0) { World.setHover(World.wd.pointString[i]); World.reticle(View.hit.x, View.hit.y, 1); } else { World.setHover(-1); World.reticle(rx, ry, 1); }
  }
  function enterDown() {
    const now = U.now();
    kbd = true; ensureReticle();
    if (World.state === World.ST.ONHOOK) { World.pickUp(-1, false); return; }
    World.activity();
    if (World.state === World.ST.HANDSHAKE) World.skip();
    if (World.retrace) { World.retraceEnd(); return; }
    if (World.desk) { World.zoomTo(0); return; }
    const i = nearest(rx, ry, IN.KEY_SNAP), w = World.wd;
    if (now - lastEnterT < IN.DTAP_MS * 1.5 && w && w.el.payphone && World.ex === 0 && View.inRange(w, w.el.payphone, rx, ry, IN.PAYPHONE_PAD)) {
      lastEnterT = -1e9; World.handsetToggle(); return;
    }
    lastEnterT = now;
    World.reticle(i >= 0 ? View.hit.x : rx, i >= 0 ? View.hit.y : ry, 1);
    if (i >= 0 && World.canPluck()) { World.pluck(i, View.hit.x, IN.VEL_DEFAULT, false); enterT = now; enterPt = i; }
    else if (World.pm === World.PM.NONE) World.ping(rx, ry);
  }
  function longPress(p) {
    const i = World.canPluck() ? nearest(p.x0, p.y0, IN.SNAP_LONG) : -1;
    if (i >= 0 && World.pullBegin(i, p.x, p.y)) p.mode = M.PULL;
    else if (World.state !== World.ST.ONHOOK && World.pm === World.PM.NONE) { p.mode = M.STRONG; World.strongMag(true, p.x, p.y); }
    else p.mode = M.DEAD;
  }
  // ---------------------------------------------------------------- per frame
  function tick(now, f) {
    frame = f;
    for (let k = 0; k < 3; k++) {
      const p = P[k];
      if (p.id >= 0 && p.mode === M.PEND && now - p.t0 >= IN.LONG_MS && p.mv < IN.LONG_PX) longPress(p);
    }
    if (tw && twMode === 0) two(now);
    if (enterT >= 0 && !enterPull && now - enterT >= IN.LONG_MS) {
      enterT = -1;
      if (World.pullBegin(enterPt, rx, ry)) enterPull = true;
    }
    // hover: string glow + reticle snap (mouse), keyboard reticle otherwise
    if (mouseIn && !kbd && count() === 0 && !UI.isModalOpen()) {
      View.toScene(mxs, mys, sc);
      const i = nearest(sc[0], sc[1], IN.SNAP_FINE);
      if (i >= 0) { World.setHover(World.wd.pointString[i]); World.reticle(View.hit.x, View.hit.y, 0.8); }
      else { World.setHover(-1); World.reticle(sc[0], sc[1], 0); }
    } else if (!kbd) {
      let tp = null;
      for (let k = 0; k < 3; k++) if (P[k].id >= 0 && P[k].touch && (P[k].mode === M.PEND || P[k].mode === M.STRUM)) tp = P[k];
      const i = tp ? nearest(tp.x, tp.y, IN.SNAP_COARSE) : -1;
      World.setHover(i >= 0 ? World.wd.pointString[i] : -1);
      World.reticle(i >= 0 ? View.hit.x : 0, i >= 0 ? View.hit.y : 0, i >= 0 ? 0.6 : 0);
    } else if (enterPull) World.reticle(rx, ry, 1);
  }
  return { init, tick, releaseAll };
})();
