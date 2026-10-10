// 52-fallback.js — Fallback: the NO CARRIER Canvas2D poster (§9). Meridian projected on the CPU, additive glow.
const Fallback = (() => {
  let wd = null, cv = null, timer = 0;
  function draw(canvas) {
    cv = canvas;
    try { wd = Wire.build(EX.MERIDIAN, 0); } catch (e) { wd = null; }
    paint();
    try { window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(paint, 120); }); } catch (e) { /* ignore */ }
  }
  function paint() {
    let x = null;
    try { x = cv.getContext('2d'); } catch (e) { x = null; }
    if (!x) return;
    try {
      const w = cv.clientWidth || window.innerWidth || 800, h = cv.clientHeight || window.innerHeight || 600;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.globalCompositeOperation = 'source-over'; x.fillStyle = CFG.COL.hex.void; x.fillRect(0, 0, w, h);
      if (!wd) return;
      const r = CFG.cameraRest(EX.MERIDIAN, w / h), v = M4.create(), p = M4.create(), m = M4.create(), o = new Float32Array(3);
      M4.perspective(p, r.fov, w / h, 0.1, 200); M4.lookAt(v, r.eye, r.target, r.up); M4.mul(m, p, v);
      const pal = CFG.EXCHANGES[0].pal, cache = {}, px = new Float32Array(wd.N * 2), ok = new Uint8Array(wd.N);
      const d = new Date(), ha = U.TAU * ((d.getHours() % 12) + d.getMinutes() / 60) / 12, ma = U.TAU * d.getMinutes() / 60, ck = wd.pivots.clock;
      for (let i = 0; i < wd.N; i++) {
        let X = wd.f32[i * 6], Y = wd.f32[i * 6 + 1];
        const k = wd.u8[i * 24 + 21];
        if ((k === KIND.CLOCK_H || k === KIND.CLOCK_M) && ck) {
          const a = k === KIND.CLOCK_H ? ha : ma, c = Math.cos(a), s = Math.sin(a), dx = X - ck[0], dy = Y - ck[1];
          X = ck[0] + dx * c + dy * s; Y = ck[1] - dx * s + dy * c;
        }
        if (M4.project(m, X, Y, wd.f32[i * 6 + 2], o) > 0.1) { px[i * 2] = (o[0] * 0.5 + 0.5) * w; px[i * 2 + 1] = (0.5 - o[1] * 0.5) * h; ok[i] = 1; }
      }
      x.globalCompositeOperation = 'lighter'; x.lineWidth = 1.1; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowBlur = 10;
      let cur = '';
      x.beginPath();
      for (let i = 0; i + 1 < wd.N; i++) {
        const f0 = wd.u8[i * 24 + 22], f1 = wd.u8[i * 24 + 46];
        if (!ok[i] || !ok[i + 1] || (f0 & FLAG.BLANK) || (f1 & FLAG.BLANK)) continue;
        const c = wd.u8[i * 24 + 20], g = Math.round((wd.i8[i * 24 + 15] / 254 + 0.5) * 6) / 6, c1 = Math.min(c + 1, 15), key = c * 8 + g * 6;
        let col = cache[key];
        if (!col) {
          const m3 = (j) => Math.round(255 * (pal[c * 3 + j] + (pal[c1 * 3 + j] - pal[c * 3 + j]) * g));
          col = cache[key] = 'rgb(' + m3(0) + ',' + m3(1) + ',' + m3(2) + ')';
        }
        if (col !== cur) { if (cur) x.stroke(); x.beginPath(); x.strokeStyle = x.shadowColor = cur = col; }
        x.moveTo(px[i * 2], px[i * 2 + 1]); x.lineTo(px[i * 2 + 2] + (wd.f32[i * 6] === wd.f32[i * 6 + 6] ? 0.01 : 0), px[i * 2 + 3]);
      }
      if (cur) x.stroke();
    } catch (e) { /* the poster is best-effort */ }
  }
  return { draw };
})();
