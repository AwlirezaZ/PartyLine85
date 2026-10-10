// 30-ui.js — DOM HUD (owner: ui): overlay, status, controls, hints, chips, toast, caption, aria-live,
// directory + keypad, help, handset XY inset, NO CARRIER. The IIFE body is pure; DOM work starts in init().
// CONTRACT NOTES:
//  - Extra UI-private DOM: #xyw (bezel + label around #xy; carries z 15), .ui-top (stacks #chips over #toast),
//    #ui-sa (safe-area probe), #dir-* / #help-* / #h-* dialog internals.
//  - Phones (< 700 px) label the 52 px BACK button BACK / DIVE; its aria-label carries STEP BACK / DIVE IN.
//  - No hint shows before notify('downbeat'); hint 4 waits 1.5 s after the first knit so it lands after the morph.
//  - chip(id, true) also announces its copy through #live.
//  - Root classes owned by UI: .calm .hudoff .nocar .xyon .mono (Monoton loaded) .ptr (last input was a pointer:
//    hides the #scene ring that Core's programmatic cv.focus() on pointerdown would otherwise paint).
//  - While a dialog is open, a capture keydown listener on window stopImmediatePropagation()s every key.
//  - Integration: a freshly opened directory starts with an empty display (a key that opened it is typed after);
//    hints are suppressed in the desk view (setBack) and placed clear of a showing toast, chip or desk caption.
const UI = (() => {
  const HINT = ['', 'touch the lines|click the lines', 'drag across the lines to strum', 'press and hold a line, then pull',
    'hold two fingers still to slow the beam|hold Space (or right-click) to slow the beam',
    'pinch out to step back|scroll out to step back', 'double-tap to degauss|double-click to degauss'];
  const SUCC = ['', 'pluck', 'strum', 'pullStart', 'slow', 'desk', 'degauss'];
  const NOTES = ['if the line hums, someone is listening. (J)',
    'the city sounds different when it rains. dial 0 if you need me.',
    'they cut the trunk lines tonight. i patched this one back in.',
    "the sun is just the beam going back and forth. don't tell anyone.",
    'you came back. i kept your seat warm.',
    'some callers left their songs on the wire. listen at night.',
    'pull too hard and the whole city comes undone. it always knits back.',
    "it's still 1986 in here. i don't mind."];
  // found key (empty = always) | number | NAME | text | silhouette number | silhouette text | dial digits | exchange
  const DIR = ['|555-0185|MERIDIAN|the city of lights|||5550185|0',
    'tide|555-0127|TIDE LINE|the sea, and the lighthouse|555-01··|·········|5550127|1',
    'orbit|1-555-0199|LONG DISTANCE|please hold|1-555-01··|·············|15550199|2',
    'operator|0|OPERATOR|ask for Seven|·|········|0|',
    "june|555-0001|JUNE|Operator Seven's line|555-0001|········|5550001|",
    'handset||HANDSET|hear the picture||HANDSET ········||'];
  const PAD = '123456789*0#', SUB = ',ABC,DEF,GHI,JKL,MNO,PRS,TUV,WXY,,OPER,'.split(',');
  const TYPE = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], FADE = [{ opacity: 0 }, { opacity: 1 }];
  const SHAKE = [0, -7, 6, -4, 2, 0].map((x) => ({ transform: 'translateX(' + x + 'px)' }));

  let ok = false, d = {}, H = {}, env = {}, root = null;
  let calm = false, ov = 0, hudOff = false, modal = '', opener = null, openerPtr = false, curEx = 0, inDesk = false;
  let px = 0, py = 0, hasPtr = false, touch = false;
  let hint = 0, hintEnd = 0, hintNext = 0, plucks = 0, lastIn = 0, capShown = false, capT = 0;
  const did = { downbeat: 0, pluck: 0, strum: 0, pullStart: 0, knit: 0, slow: 0, desk: 0, degauss: 0 };
  const seen = [1, 0, 0, 0, 0, 0, 0];
  let slowSrc = 0, dial = '', speedT = 0, liveT = 0, livePend = '', toastBusy = false;
  const keyT = {}, chipEl = {}, toastQ = [];
  let xyOn = false, xy = null, xyS = 140, xyK = 62, xyDot = 1.2, xyCol = '#7DFFA0';

  const report = (e) => { try { console.error(e); } catch (_) {} };
  function fire(n, a) { const f = H[n]; if (typeof f === 'function') try { f(a); } catch (e) { report(e); } }
  const on = (el, t, f, o) => el && el.addEventListener(t, f, o || false);
  const focus = (el) => { try { if (el) el.focus({ preventScroll: true }); } catch (e) {} };
  const blur = (el) => { try { if (el) el.blur(); } catch (e) {} };
  const has = (el, a) => !!(el && a && el.contains(a));
  const anim = (el, k, o) => { try { if (el && el.animate) el.animate(k, o); } catch (e) {} };
  const typeOn = (el, n, per) => (calm ? anim(el, FADE, 220)
    : anim(el, TYPE, { duration: U.clamp(n * per, 140, 560), easing: 'steps(' + Math.max(2, n) + ', end)' }));
  const later = (f, ms) => setTimeout(f, ms);

  // init
  function init(handlers, e) {
    if (ok || typeof document === 'undefined') return;
    H = handlers || {}; env = e || {}; touch = !!env.coarse; root = document.documentElement;
    const $ = (i) => document.getElementById(i);
    d = { scene: $('scene'), ov: $('overlay'), status: $('status'), s1: $('status1'), s2: $('status2'), ctl: $('controls'),
      sound: $('b-sound'), slow: $('b-slow'), back: $('b-back'), hint: $('hint'), toast: $('toast'), cap: $('caption'),
      live: $('live'), dir: $('dir'), dirS: $('dir-sheet'), list: $('dir-list'), note: $('dir-note'), disp: $('dir-disp'),
      num: $('dir-num'), cur: $('dir-cur'), rest: $('dir-rest'), pad: $('dir-pad'), call: $('dir-call'),
      help: $('help'), helpS: $('help-sheet'), calm: $('h-calm'), xy: $('xy'), xyw: $('xyw'), nocar: $('nocarrier'), sa: $('ui-sa') };
    ok = true;
    try { wire($); } catch (err) { report(err); }
    setCalm(env.calm);
    setDial('');
    try {
      const f = document.fonts;
      if (f && f.load) f.load('40px Monoton').then((a) => { if (a && a.length) root.classList.add('mono'); }, U.noop);
    } catch (err) {}
    try { setInterval(tick, 250); } catch (err) {}
  }

  function wire($) {
    on($('pickup'), 'click', () => fire('onPickUp'));
    on($('watch'), 'click', () => fire('onJustWatch'));
    on(d.sound, 'click', (e) => { fire('onSound'); if (e.detail) blur(d.sound); });
    on(d.back, 'click', (e) => { fire('onBack'); if (e.detail) blur(d.back); });
    on($('b-dial'), 'click', (e) => openModal('dir', e.detail > 0));
    on($('b-help'), 'click', (e) => openModal('help', e.detail > 0));
    // SLOW is press-and-hold: pointer (bit 1) and key (bit 2) sources; its own click is suppressed.
    const s = d.slow, rel = () => slowSet(1, 0), isKey = (e) => e.key === ' ' || e.key === 'Enter';
    on(s, 'pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      try { s.setPointerCapture(e.pointerId); } catch (err) {}
      slowSet(1, 1);
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) on(s, t, rel);
    on(s, 'keydown', (e) => { if (isKey(e)) { e.preventDefault(); if (!e.repeat) slowSet(2, 1); } });
    on(s, 'keyup', (e) => { if (isKey(e)) { e.preventDefault(); slowSet(2, 0); } });
    on(s, 'blur', slowOff); on(window, 'blur', slowOff);
    on(s, 'click', (e) => e.preventDefault()); on(s, 'contextmenu', (e) => e.preventDefault());
    const mClick = (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.classList.contains('scrim')) closeModal(true);
      else if (t.closest('.x')) closeModal(e.detail > 0);
    };
    on(d.dir, 'click', mClick); on(d.help, 'click', mClick);
    for (let i = 0; i < 12 && d.pad; i++) {
      const b = document.createElement('button'), sm = document.createElement('small'), ch = PAD[i];
      b.className = 'b k'; b.type = 'button'; b.dataset.k = ch;
      b.setAttribute('aria-label', ch === '*' ? 'star' : ch === '#' ? 'pound' : ch);
      sm.textContent = SUB[i]; sm.setAttribute('aria-hidden', 'true');
      b.append(ch, sm); d.pad.append(b);
    }
    on(d.pad, 'click', (e) => { const b = e.target.closest && e.target.closest('.k'); if (b) { stopSpeed(); press(b.dataset.k); } });
    on(d.list, 'click', (e) => { const b = e.target.closest && e.target.closest('[data-dial]'); if (b) speedDial(b.dataset.dial); });
    on(d.call, 'click', (e) => doCall(e.detail > 0));
    on($('dir-clr'), 'click', () => { stopSpeed(); setDial(''); });
    on(d.calm, 'click', () => { setCalm(!calm); fire('onCalm', calm); });
    const fs = $('h-fs'), fsk = $('h-fsk');
    on(fs, 'click', () => fire('onFullscreen'));
    if (fs) fs.hidden = !env.fullscreen;
    if (fsk) fsk.hidden = !env.fullscreen;
    on(window, 'keydown', onKey, true);
    // Input modality: Core focuses #scene from pointerdown, which Chrome paints as :focus-visible.
    on(window, 'pointerdown', () => root.classList.add('ptr'), true);
    on(window, 'keydown', (e) => { if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') root.classList.remove('ptr'); }, true);
    on(document, 'focusin', (e) => { const sh = sheet(); if (sh && !sh.contains(e.target)) focus(sh); });
    on(window, 'resize', () => { if (hint) placeHint(); });
    const cw = $('chips'), C = CFG.TEXT.chip;
    for (const id in C) {
      const c = document.createElement('div'), lamp = document.createElement('i');
      c.className = 'chip'; lamp.setAttribute('aria-hidden', 'true');
      c.append(lamp, C[id]); chipEl[id] = c;
      if (cw) cw.append(c);
    }
  }
  function slowSet(bit, down) {
    const was = slowSrc;
    slowSrc = down ? slowSrc | bit : slowSrc & ~bit;
    if (!was !== !slowSrc) fire('onSlow', !!slowSrc);
  }
  function slowOff() { if (slowSrc) { slowSrc = 0; fire('onSlow', false); } }

  // overlay, status, controls
  function showOverlay() {
    if (!ok || ov || !d.ov) return;
    ov = 1; d.ov.inert = false; d.ov.classList.add('on');
    later(() => d.ov.classList.add('done'), 1300);
  }
  function hideOverlay() {
    if (!ok || ov === 2) return;
    const o = d.ov, inside = has(o, document.activeElement);
    ov = 2;
    if (o) { o.classList.remove('on'); o.inert = true; }
    if (d.ctl) { d.ctl.inert = hudOff; d.ctl.classList.add('on'); later(() => d.ctl.classList.add('done'), 1000); }
    if (inside) focus(d.scene);
  }
  function setLine(el, t, type) {
    if (!el || el.textContent === t) return;
    el.textContent = t;
    if (type && t) typeOn(el, t.length, 22);
  }
  function setStatus(mode, ex, calls, callers) {
    if (!ok) return;
    const S = CFG.TEXT.status;
    let v = S[mode];
    if (typeof v === 'function') v = v(mode === STATUS.PARTY ? callers | 0 : ex | 0);
    if (ex === 0 || ex === 1 || ex === 2) curEx = ex;
    setLine(d.s1, v == null ? '' : String(v), 1);
    setLine(d.s2, S.line2(calls | 0), 0);
  }
  function setSound(v) {
    if (!ok || !d.sound) return;
    d.sound.setAttribute('aria-pressed', v ? 'true' : 'false');
    d.sound.lastElementChild.textContent = v ? 'SOUND' : 'MUTED';
  }
  function setSlow(v) {
    if (!ok || !d.slow) return;
    d.slow.classList.toggle('on', !!v);
    d.slow.setAttribute('aria-pressed', v ? 'true' : 'false');
  }
  function setBack(desk) {
    inDesk = !!desk;
    if (inDesk && hint) hideHint();
    const c = ok && d.back ? d.back.children : [];
    if (c.length < 3) return;
    c[0].textContent = desk ? '' : 'STEP ';
    c[1].textContent = desk ? 'DIVE' : 'BACK';
    c[2].textContent = desk ? ' IN' : '';
    d.back.setAttribute('aria-label', desk ? 'Dive back in' : 'Step back from the screen');
  }
  function setCalm(v) {
    calm = !!v;
    if (!ok) return;
    root.classList.toggle('calm', calm);
    if (d.calm) d.calm.setAttribute('aria-checked', calm ? 'true' : 'false');
  }
  function toggleHud() {
    if (!ok) return;
    hudOff = !hudOff;
    root.classList.toggle('hudoff', hudOff);
    if (d.ctl) d.ctl.inert = hudOff || ov !== 2;
    if (hudOff && has(d.ctl, document.activeElement)) focus(d.scene);
  }
  function showNoCarrier() {
    if (!ok) return;
    if (d.ov) { d.ov.classList.remove('on'); d.ov.inert = true; }
    ov = 2;
    if (d.ctl) d.ctl.inert = true;
    hideHint();
    root.classList.add('nocar');
    if (d.nocar) { d.nocar.classList.add('on'); announce('No carrier. ' + d.nocar.lastElementChild.textContent); }
  }

  // hints & caption (§4.4)
  function notify(evt) {
    if (!ok) return;
    const t = U.now();
    switch (evt) {
      case 'downbeat': if (!did.downbeat) did.downbeat = t; if (lastIn < t) lastIn = t; return;
      case 'input': lastIn = t; return;
      case 'knit': if (!did.knit) did.knit = t; return;
      case 'pluck': plucks++; break;
      case 'desk': if (!capShown) caption(); break;
      case 'strum': case 'pullStart': case 'slow': case 'degauss': break;
      default: return;
    }
    if (!did[evt]) did[evt] = t;
    lastIn = t;
    if (hint && SUCC[hint] === evt) hideHint();
  }
  function due(n, t) {
    switch (n) {
      case 1: return t >= did.downbeat + 6000;
      case 2: return seen[1] && (plucks >= 5 || t - lastIn >= 6000);
      case 3: return did.strum && t >= did.strum + 20000;
      case 4: return did.knit && t >= did.knit + 1500;
      case 5: return did.slow && t >= did.slow + 30000;
      case 6: return did.slow && t >= did.slow + 90000;
    }
    return false;
  }
  function tick() {
    try {
      const t = U.now();
      if (hint) { if (t >= hintEnd) hideHint(); return; }
      if (!did.downbeat || modal || inDesk || t < hintNext) return;   // world hints make no sense from the desk
      for (let n = 1; n <= 6; n++) {
        if (seen[n]) continue;
        if (did[SUCC[n]] || Store.hintShown(n)) { seen[n] = 1; continue; }
        if (due(n, t)) { showHint(n, t); return; }
      }
    } catch (e) { report(e); }
  }
  function showHint(n, t) {
    const el = d.hint, c = HINT[n].split('|');
    seen[n] = 1;
    if (!el) return;
    el.textContent = c[touch ? 0 : c.length - 1];
    placeHint();
    el.classList.add('on');
    hint = n; hintEnd = t + 6000;
    try { Store.setHint(n); } catch (e) {}
  }
  function hideHint() {
    if (!hint) return;
    hint = 0; hintNext = U.now() + 1500;
    if (d.hint) d.hint.classList.remove('on');
  }
  function insets() {
    try {
      const c = getComputedStyle(d.sa);
      return [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((v) => parseFloat(v) || 0);
    } catch (e) { return [0, 0, 0, 0]; }
  }
  // Phones: 64 px above the controls row. Otherwise 48 px above the last pointer (below it when that would hit
  // the status lines), or bottom centre above the controls. Clamped to the safe area; lifted over controls / XY.
  function placeHint() {
    const el = d.hint;
    if (!el) return;
    const W = innerWidth, Hh = innerHeight, sa = insets(), w = el.offsetWidth, h = el.offsetHeight, bot = Hh - Math.max(12, sa[2]);
    const cr = ov === 2 && !hudOff && d.ctl ? d.ctl.getBoundingClientRect() : null;
    const xr = xyOn && d.xyw ? d.xyw.getBoundingClientRect() : null;
    const kr = d.cap && d.cap.classList.contains('on') ? d.cap.getBoundingClientRect() : null;
    const rowTop = cr && cr.height ? cr.top : bot - 44, top = Math.max(12, sa[0]) + (hudOff ? 0 : d.status.offsetHeight + 8);
    let x, y;
    if (W < 700 || !hasPtr) { x = (W - w) / 2; y = rowTop - (W < 700 ? 64 : 24) - h; }
    else { x = px - w / 2; y = py - 48 - h; if (y < top) y = py + 40; }
    x = U.clamp(x, sa[3] + 12, W - sa[1] - 12 - w);
    y = U.clamp(y, top, bot - h);
    // never under a showing toast / chip (top centre): drop below it
    const tops = toastBusy && d.toast ? [d.toast.getBoundingClientRect()] : [];
    for (const k in chipEl) if (chipEl[k] && chipEl[k].classList.contains('on')) tops.push(chipEl[k].getBoundingClientRect());
    for (const r of tops) if (r.height && x + w > r.left - 8 && x < r.right + 8 && y + h > r.top - 8 && y < r.bottom + 8) y = r.bottom + 12;
    for (const r of [cr, xr, kr]) if (r && r.height && x + w > r.left - 8 && x < r.right + 8 && y + h > r.top - 8 && y < r.bottom + 8) y = r.top - 12 - h;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  }
  function caption() {
    capShown = true;
    if (!d.cap) return;
    d.cap.textContent = CFG.TEXT.caption.desk;
    d.cap.classList.add('on');
    if (hint) placeHint();
    clearTimeout(capT);
    capT = later(() => d.cap.classList.remove('on'), 4000);
  }
  function notePointer(x, y, isTouch) { px = x; py = y; touch = !!isTouch; hasPtr = true; }

  // chips, toast, live
  function chip(id, v) {
    const c = chipEl[id];
    if (!ok || !c || c.classList.contains('on') === !!v) return;
    c.classList.toggle('on', !!v);
    if (v) announce(c.textContent);
  }
  function toast(text, ms) {
    if (!ok || !d.toast || text == null) return;
    toastQ.push(String(text), ms > 0 ? ms : 2500);
    if (toastQ.length > 8) toastQ.splice(0, 2);
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const el = d.toast, t = toastQ.shift(), ms = toastQ.shift();
    toastBusy = t != null;
    if (!toastBusy) return;
    el.textContent = t;
    el.classList.add('on');
    typeOn(el, t.length + 6, 26);
    later(() => { el.classList.remove('on'); later(nextToast, 450); }, ms);
  }
  function announce(text) {
    if (!ok || !d.live || !text) return;
    livePend = livePend ? livePend + ' ' + text : String(text);
    if (liveT) return;
    d.live.textContent = '';
    liveT = later(() => { liveT = 0; d.live.textContent = livePend; livePend = ''; }, 60);
  }

  // dialogs (§7.4, §7.5)
  const sheet = () => (modal === 'dir' ? d.dirS : modal === 'help' ? d.helpS : null);
  function openModal(name, ptr) {
    const el = ok && (name === 'dir' ? d.dir : d.help);
    if (!el || modal === name) return;
    if (modal) closeModal(false, true);
    else {
      const a = document.activeElement;
      opener = a && a !== document.body && a !== root ? a : null;
      openerPtr = !!ptr;
    }
    if (name === 'dir') { renderDir(); stopSpeed(); setDial(''); }   // a fresh dialog never inherits stale digits
    modal = name;
    hideHint();
    el.inert = false;
    el.classList.add('on');
    const sh = sheet();
    sh.scrollTop = 0;
    focus(sh);
    fire('onModal', true);
  }
  // A dialog opened AND closed by pointer from a HUD button leaves focus on body, so Space / Enter keep
  // reaching the world; otherwise focus returns to the opener, else #scene.
  function closeModal(byPtr, switching) {
    if (!ok || !modal) return;
    const el = modal === 'dir' ? d.dir : d.help;
    stopSpeed();
    modal = '';
    el.classList.remove('on');
    el.inert = true;
    fire('onModal', false);
    if (switching) return;
    const t = opener;
    opener = null;
    if (byPtr && openerPtr && has(d.ctl, t)) blur(document.activeElement);
    else focus(t && t.isConnected && !t.closest('[inert]') && t.getClientRects().length ? t : d.scene);
  }
  function onKey(e) {
    if (!modal) return;
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const k = e.key, sh = sheet(), pad = k.length === 1 && PAD.indexOf(k) >= 0;
    if (k === 'Escape' || k === 'Esc') { e.preventDefault(); closeModal(false); }
    else if (k === 'Tab') {
      const f = [].filter.call(sh.querySelectorAll('button,[href],[tabindex="0"]'), (b) => !b.disabled && b.getClientRects().length);
      const i = f.indexOf(document.activeElement);
      if (!f.length) e.preventDefault();
      else if (e.shiftKey ? i <= 0 : i < 0 || i === f.length - 1) { e.preventDefault(); focus(f[e.shiftKey ? f.length - 1 : 0]); }
    } else if (modal === 'help') { if (pad) { e.preventDefault(); openDirectory(k); } }
    else if (pad) { e.preventDefault(); if (!e.repeat) { stopSpeed(); press(k); } }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); stopSpeed(); setDial(dial.slice(0, -1)); }
    else if (k === 'Enter') {
      const a = document.activeElement;
      if (!(a && a.tagName === 'BUTTON' && has(sh, a))) { e.preventDefault(); doCall(false); }
    }
  }
  function openDirectory(first) {
    openModal('dir', false);
    if (first != null && modal === 'dir') press(String(first));
  }
  function renderDir() {
    let found = {}, calls = 0;
    try { found = Store.data.found || {}; calls = Store.data.calls | 0; } catch (e) {}
    const list = d.list, mk = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
    if (list) {
      list.textContent = '';
      for (const line of DIR) {
        const r = line.split('|'), f = !r[0] || !!found[r[0]], dialable = f && r[6];
        const li = mk('li'), row = mk(dialable ? 'button' : 'div', 'row' + (f ? '' : ' sil') + (r[7] !== '' && +r[7] === curEx ? ' cur' : ''));
        const num = mk('span', 'num'), txt = mk('span');
        num.textContent = f ? r[1] : r[4];
        if (f) { const b = mk('b'); b.textContent = r[2]; txt.append(b, ': ' + r[3]); }
        else { const sr = mk('span', 'sr'); sr.textContent = 'unlisted'; txt.textContent = r[5]; txt.setAttribute('aria-hidden', 'true'); row.append(sr); }
        if (dialable) { row.type = 'button'; row.dataset.dial = r[6]; row.title = 'Dial ' + r[1]; }
        row.append(num, txt); li.append(row); list.append(li);
      }
    }
    if (d.note) d.note.textContent = found.june ? '555-0001. my line. (J)' : NOTES[calls > 0 ? (calls - 1) % 8 : 0];
  }
  // Display: typed digits laid into ___-____ (or _-___-____ after a leading 1), a blinking cursor in the next
  // slot, dim placeholders after it. Numbers with * / # or longer than the template show raw.
  function setDial(s) {
    dial = s;
    if (!d.num) return;
    const one = s[0] === '1', tpl = one ? '_-___-____' : '___-____';
    let typed = s, rest = '';
    if (!s) rest = tpl;
    else if (!/[*#]/.test(s) && s.length <= (one ? 8 : 7)) {
      let i = 0, j = 0;
      typed = '';
      for (; i < tpl.length && j < s.length; i++) typed += tpl[i] === '_' ? s[j++] : tpl[i];
      while (i < tpl.length && tpl[i] !== '_') typed += tpl[i++];
      rest = tpl.slice(i);
    } else if (s.length < 15) rest = '_';
    d.num.textContent = typed;
    d.cur.textContent = rest.slice(0, 1);
    d.rest.textContent = rest.slice(1);
    d.call.classList.toggle('ready', !!s);
  }
  function press(ch) {
    if (ch.length !== 1 || PAD.indexOf(ch) < 0) return;
    if (dial.length < 15) setDial(dial + ch);
    const b = d.pad && d.pad.children[PAD.indexOf(ch)];
    if (b) {
      b.classList.add('hit');
      clearTimeout(keyT[ch]);
      keyT[ch] = later(() => b.classList.remove('hit'), 130);
    }
    fire('onDialKey', ch);
  }
  function speedDial(s) {
    stopSpeed();
    setDial('');
    let i = 0;
    const step = () => {
      speedT = 0;
      if (modal !== 'dir') return;
      press(s[i++]);
      if (i < s.length) speedT = later(step, 90);
      else focus(d.call);
    };
    step();
  }
  function stopSpeed() { if (speedT) { clearTimeout(speedT); speedT = 0; } }
  function doCall(byPtr) {
    stopSpeed();
    if (!dial) { anim(d.disp, calm ? [{ borderColor: CFG.COL.hex.accent }, {}] : SHAKE, { duration: 380, easing: 'ease-out' }); return; }
    const s = dial;
    fire('onCall', s);
    setDial('');
    closeModal(byPtr);
  }

  // handset XY inset
  function setXYVisible(v) {
    if (!ok || !d.xy) return;
    xyOn = !!v;
    if (xyOn) {
      try {
        if (!xy) xy = d.xy.getContext('2d');
        const dpr = Math.min(2, devicePixelRatio || 1), S = Math.round(140 * dpr);
        if (d.xy.width !== S) d.xy.width = d.xy.height = S;
        xyS = S; xyK = S * 0.44; xyDot = Math.max(1, 1.15 * dpr);
        xyCol = getComputedStyle(root).getPropertyValue('--xy').trim() || xyCol;
        if (xy) xy.clearRect(0, 0, S, S);
      } catch (e) { xy = null; }
    }
    if (d.xyw) d.xyw.classList.toggle('on', xyOn);
    root.classList.toggle('xyon', xyOn);
    if (hint) placeHint();
  }
  // ⚡ phosphor persistence: erase 30% of the previous frame's alpha, then add this frame's points.
  function drawXY(l, r) {
    const c = xy;
    if (!xyOn || !c || !l || !r) return;
    try {
      const S = xyS, h = S * 0.5, k = xyK, p = xyDot, n = l.length < r.length ? l.length : r.length;
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(0, 0, S, S);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.55;
      c.fillStyle = xyCol;
      c.beginPath();
      for (let i = 0; i < n; i++) c.rect(h + l[i] * k, h - r[i] * k, p, p);
      c.fill();
    } catch (e) {}
  }

  const safe = (fn) => function () { try { return fn.apply(null, arguments); } catch (e) { report(e); return undefined; } };
  return {
    init: safe(init), showOverlay: safe(showOverlay), hideOverlay: safe(hideOverlay), setStatus: safe(setStatus),
    setSound: safe(setSound), setSlow: safe(setSlow), setBack: safe(setBack), setCalm: safe(setCalm),
    notify: safe(notify), notePointer, chip: safe(chip), toast: safe(toast), announce: safe(announce),
    openDirectory: safe(openDirectory), openHelp: safe(() => openModal('help', false)), closeModal: safe(() => closeModal(false)),
    isModalOpen: () => modal !== '', toggleHud: safe(toggleHud), setXYVisible: safe(setXYVisible), drawXY,
    showNoCarrier: safe(showNoCarrier),
  };
})();
