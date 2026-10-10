// 13-wire-meridian.js — MERIDIAN: grid floor to a striped sun between mountains, three skyline depths.
const WireMeridian = (() => {
  function make({ N, stars: nStars, rnd }) {
    const G = WireGeo, P = G.P, X = CFG.EXCHANGES[EX.MERIDIAN], C = X.col, E = X.camera.eye;
    const bud = (sh) => N * sh / 100, els = [], sils = [];
    const el = (name, share, paths, res, extra) => els.push(Object.assign({ name, share, paths, res: res == null ? -1 : res }, extra));
    // 1-2 floor: serpentine grid, pitch by row / column
    const depthG = (x, y, z) => U.sat((4 - z) / 74);
    const fh = [], fhB = [], fhD = [];
    for (let k = -3; k < 37; k++) { const q = k + 3, s = q & 1 ? -1 : 1, z = 4 - 2 * k; fh.push(-40 * s, 0, z, 40 * s, 0, z); if (q) fhB.push(2 * q); fhD.push(Math.max(0, k >> 1)); }
    el('floorH', 16, [P(fh, { k: KIND.FLOOR_H, c: C.FLOOR_NEAR, g: depthG, n: 1, b: fhB, d: fhD })]);
    const fv = [], fvB = [], fvD = [];
    for (let q = 0; q < 41; q++) { const j = 40 - q, x = -40 + 2 * j, s = q & 1; fv.push(x, 0, s ? 10 : -70, x, 0, s ? -70 : 10); if (q) fvB.push(2 * q); fvD.push(2 + (Math.abs(j - 20) >> 1)); }
    el('floorV', 12, [P(fv, { k: KIND.FLOOR_V, c: C.FLOOR_NEAR, g: depthG, n: 1, b: fvB, d: fvD })]);
    // 3 front mountains: ridge + 2 contours, one serpentine
    const fr = G.ridge(rnd, -70, 70, [[-64, 8], [-55, 10.8], [-46, 7.2], [-37, 9.6], [-28, 6.2], [-19, 4.6], [-10.5, 2.5],
      [9.5, 2.3], [18, 4.9], [27, 7], [36, 10.2], [45, 7.4], [55, 11.2], [64, 8.4]], 0.42, 0.22);
    sils.push({ z: -60, ridge: fr });
    const mtn = (r, z, fs, rev) => {
      const p = [], b = [];
      fs.forEach((f, li) => {
        if (li) b.push(p.length / 3);
        const n = r.length / 2;
        for (let q = 0; q < n; q++) { const i = (li + (rev ? 1 : 0)) & 1 ? n - 1 - q : q; p.push(r[i * 2], Math.max(0.25, r[i * 2 + 1] * f - (1 - f) * 0.6), z); }
      });
      return { p, b };
    };
    const m1 = mtn(fr, -60, [1, 0.64, 0.33]);
    el('mtnFront', 5, [P(m1.p, { c: C.MTN_FRONT, b: m1.b, seg: true, g: (x, y) => U.sat(0.75 - y / 9) })]);
    // 4-6 skylines
    const sky = (list, sh, c, gw, res) => { const s = G.skyline(list, { c, gw, budget: bud(sh) - (res || 0) }, rnd); for (const q of s.sils) sils.push(q); return s.paths; };
    el('skyNearL', 6, sky([
      { x0: -10.9, w: 2.9, h: 7.4, z: -15, t: 0 }, { x0: -14.4, w: 3.3, h: 12.6, z: -21, t: 2, sp: 3.2 },
      { x0: -17.6, w: 2.7, h: 8.8, z: -14.5, t: 3 }, { x0: -21.9, w: 3.8, h: 11.2, z: -19, t: 1, ws: 2 },
      { x0: -24.7, w: 2.5, h: 6.4, z: -22, t: 4 }, { x0: -28.8, w: 3.6, h: 9.6, z: -16, t: 5, ws: 1 }], 6, C.SKY_NEAR, 0.45));
    const JUNE = { x0: -12.2, w: 4.8, h: 7.6, z: -30, t: 7, ws: 3 };
    el('skyMidL', 6, sky([JUNE,
      { x0: -15.8, w: 3.1, h: 10.4, z: -30, t: 6 }, { x0: -19.6, w: 3.4, h: 5.4, z: -30, t: 0 },
      { x0: -22.6, w: 2.7, h: 8.6, z: -30, t: 2, sp: 2 }, { x0: -26.8, w: 3.8, h: 6.6, z: -30, t: 1, ws: 2 },
      { x0: -29.8, w: 2.7, h: 4.2, z: -30, t: 4 }, { x0: -34.2, w: 4, h: 9.2, z: -30, t: 5 }], 6, C.SKY_MID, 0.3));
    const far = [];
    for (const sd of [-1, 1]) {
      const row = [];
      let x = 11.2 + rnd() * 0.5;
      for (let i = 0; i < 11; i++) {
        const w = 2.5 + rnd() * 1.9, tall = i === 2 || i === 6 || i === 9, h = tall ? 11 + rnd() * 3 : 4 + rnd() * 6 + i * 0.25;
        row.push({ x0: sd > 0 ? x : -x - w, w, h, z: -45, t: tall ? [2, 6, 1][i % 3] : [0, 7, 3, 5, 0, 4, 7][(i + (sd > 0 ? 3 : 0)) % 7], ws: i % 4 === 3 ? 2 : 0, sp: 1.5 + rnd() * 2 });
        x += w + 0.2 + rnd() * 0.6;
      }
      if (sd < 0) row.reverse();
      for (const b of row) far.push(b);
    }
    el('skyFar', 7, sky(far, 7, C.SKY_FAR, 0.35));
    // 7 back mountains (ridge follows the spectrum)
    const br = G.ridge(rnd, -70, 70, [[-67, 12.5], [-57, 16.5], [-47, 12], [-37, 14.6], [-27, 9.4], [-17.5, 6.4], [-8.5, 3.6],
      [7.5, 3.3], [16.5, 6.9], [25.5, 10.3], [35, 15.2], [45, 12.2], [56, 17], [66, 13]], 0.45, 0.2);
    sils.push({ z: -72, ridge: br });
    const brP = [], brC = [];
    for (let i = br.length / 2 - 1; i >= 0; i--) brP.push(br[i * 2], br[i * 2 + 1], -72);
    for (let i = 0; i < br.length / 2; i++) brC.push(br[i * 2], Math.max(0.25, br[i * 2 + 1] * 0.56 - 0.3), -72);
    el('mtnBack', 5, [P(brP, { k: KIND.MTN_BACK, c: C.MTN_BACK, seg: true }), P(brC, { c: C.MTN_BACK, seg: true, gv: 0 })]);
    // billboard + clock tower + mast silhouettes (needed by the sun clip)
    const BB = { cx: -8, y0: 8.1, y1: 11.1, x0: -12.5, x1: -3.5, z: -28 };
    sils.push({ z: BB.z, r: [[BB.x0, BB.x1, BB.y0, BB.y1]] });
    const CT = { x: 8.6, z: -33, cy: 13, r: 1.4 };
    sils.push({ z: CT.z, r: [[7.5, 9.7, -1, 11.4], [7, 10.2, -1, 14.6], [7.8, 9.4, -1, 15.8]] });
    // 8 sun: 44 stripes, slits widening toward the bottom, clipped by everything in front
    const cy = 9, R = 16, top = cy + R;
    const slit = (y) => { if (y >= cy - 0.3) return false; const u = (cy - y) / cy; return U.fract(u * 4.6 + 0.62) > 1 - (0.1 + 0.5 * u); };
    // Sun pitch: from each stripe's full chord L via its distance from the centre line (|dy| = sqrt(R² − L²/4)),
    // spread over degrees 3..18 so a vertical swipe is an arched glissando (centre lowest, rim highest).
    const sunDeg = (L) => Math.round(3 + 15 * Math.sqrt(Math.max(0, 1 - (L * L) / (4 * R * R))));
    const sun = G.disc({ cx: 0, cy, z: -78, r: R, n: 44, yt: top - 0.25, yb: 0.3, min: 0.12, deg: sunDeg,
      vis: (y, xa, xb) => (y < 0.2 || slit(y) ? [] : G.visible(sils, E, -78, y, xa, xb)) },
    { k: KIND.SUN, n: 0, dm: true, cf: (x, y) => (y >= cy ? C.SUN_TOP : C.SUN_MID), g: (x, y) => (y >= cy ? (top - y) / R : (cy - y) / cy) });
    el('sun', 16, sun, VOICE.SUN);
    // 9 billboard on June's roof: double frame, posts, lamps, two text lines
    const bl = [P([-11.2, 7.6, BB.z, -11.2, BB.y0, BB.z, BB.x0, BB.y0, BB.z, BB.x0, BB.y1, BB.z, BB.x1, BB.y1, BB.z, BB.x1, BB.y0, BB.z, -11.2, BB.y0, BB.z], { c: C.TEXT, seg: true }),
      P([-8.6, BB.y0, BB.z, -8.6, 7.6, BB.z, -5.2, BB.y0 - 0.02, BB.z], { c: C.TEXT, seg: true }),
      P([BB.x1 - 0.18, BB.y0 + 0.18, BB.z, BB.x0 + 0.18, BB.y0 + 0.18, BB.z, BB.x0 + 0.18, BB.y1 - 0.18, BB.z, BB.x1 - 0.18, BB.y1 - 0.18, BB.z, BB.x1 - 0.18, BB.y0 + 0.18, BB.z], { c: C.SKY_NEAR, seg: true })];
    for (let i = 0; i < 6; i++) bl.push(P([BB.x1 - 0.7 - i * 1.52, BB.y1 + 0.28, BB.z], { c: C.WINDOW }));
    el('billboard', 7, bl, VOICE.BILLBOARD, { sign: { share: 0.8, z: BB.z, cx: BB.cx, w: 8.3, h: 0.9, y: [10.12, 8.98], exit: [[BB.x1 - 0.35, 10.12], [BB.x1 - 0.35, 8.98]], c: C.TEXT } });
    // 10 clock tower with real-time hands
    const z = CT.z, x = CT.x, ck = [];
    ck.push(P([7.5, 0, z, 7.5, 11.4, z, 7, 11.4, z, 7, 14.6, z, 7.8, 14.6, z, 7.8, 15.8, z, x, 17.4, z, x, 18.6, z, x, 17.4, z, 9.4, 15.8, z, 9.4, 14.6, z, 10.2, 14.6, z, 10.2, 11.4, z, 9.7, 11.4, z, 9.7, 0, z], { c: C.CLOCK, seg: true }));
    ck.push(P(G.arc(x, CT.cy, z, CT.r, CT.r, Math.PI / 2, Math.PI / 2 - U.TAU, 48), { c: C.CLOCK }));
    for (let i = 0; i < 12; i++) { const a = Math.PI / 2 - i * U.TAU / 12; ck.push(P([x + Math.cos(a) * 1.16, CT.cy + Math.sin(a) * 1.16, z], { c: C.CLOCK })); }
    for (const s of WireFont.layout(WireFont.norm(CFG.TEXT.clockDate), x, CT.cy - 0.62, z, 1.25, 0.2)) ck.push(P(s.p, { c: C.CLOCK, j: true }));
    ck.push(P([x, CT.cy - 0.16, z, x, CT.cy + 0.78, z], { k: KIND.CLOCK_H, c: C.CLOCK }));
    ck.push(P([x, CT.cy - 0.22, z, x, CT.cy + 1.18, z], { k: KIND.CLOCK_M, c: C.CLOCK }));
    for (const sx of [8.15, 9.05]) ck.push(P([sx, 1.4, z, sx, 10.2, z], { c: C.SKY_MID, gv: 0.4 }));
    el('clock', 3, ck, VOICE.CLOCK);
    // 11 June's window: 1.4 x 1.0 amber serpentine, 9 passes
    const jw = [], wx = -9.75, wy = 5.25;
    for (let i = 0; i < 9; i++) { const yy = wy + 0.5 - i * 0.125, s = i & 1 ? -1 : 1; jw.push(wx - 0.7 * s, yy, -30, wx + 0.7 * s, yy, -30); }
    el('window', 1, [P(jw, { k: KIND.WINDOW, c: C.WINDOW })], VOICE.WINDOW);
    // 12 radio mast: tapered lattice, platforms, dishes, blinking top dwell
    const mx = 18.2, mz = -56, lx = (y) => mx - 0.95 + 0.77 * y / 21, rx = (y) => mx + 0.95 - 0.77 * y / 21;
    const ma = [lx(0), 0, mz, lx(21), 21, mz, rx(21), 21, mz, rx(0), 0, mz];
    for (let i = 1; i <= 14; i++) { const yy = i * 1.5; ma.push(i & 1 ? lx(yy) : rx(yy), yy, mz); }
    ma.push(mx, 21, mz, mx, 22.2, mz);
    const mast = [P(ma, { c: C.MAST, seg: true })];
    for (const [yy, ww] of [[8, 1.5], [15, 1.2]]) mast.push(P([mx - ww, yy, mz, mx + ww, yy, mz], { c: C.MAST }));
    mast.push(P(G.arc(mx + 1.15, 11.6, mz, 0.42, 0.5, Math.PI * 0.62, Math.PI * 1.38, 6), { c: C.MAST }));
    mast.push(P(G.arc(mx - 1.0, 17.6, mz, 0.34, 0.4, -Math.PI * 0.38, Math.PI * 0.38, 6), { c: C.MAST }));
    mast.push(P([mx, 22.55, mz], { c: C.SKY_NEAR, f: FLAG.BLINK }));
    el('mast', 2, mast, VOICE.MAST);
    // 13 mid-right skyline
    el('skyMidR', 4, sky([
      { x0: 12.6, w: 2.6, h: 9.4, z: -30, t: 2, sp: 2.4 }, { x0: 15.4, w: 3.6, h: 5.2, z: -30, t: 0, ws: 2 },
      { x0: 19.2, w: 2.8, h: 7.8, z: -30, t: 5 }, { x0: 22.2, w: 4, h: 4.6, z: -30, t: 4 },
      { x0: 26.4, w: 3, h: 8.8, z: -30, t: 6 }, { x0: 29.8, w: 3.8, h: 6, z: -30, t: 0 }], 4, C.SKY_MID, 0.3));
    // 14 near-right skyline + payphone (booth, phone box, keypad, handset, cord)
    const nr = sky([
      { x0: 19.8, w: 3.4, h: 10.6, z: -19, t: 2, sp: 2.6 }, { x0: 15.4, w: 3.6, h: 12.4, z: -21, t: 6, ws: 1 },
      { x0: 10.6, w: 3, h: 8.2, z: -15.5, t: 1 }], 4, C.SKY_NEAR, 0.45, 210);
    const pz = -4, pa = nr.length, pc = C.PAYPHONE;
    nr.push(P([3.7, 0, pz, 3.7, 2.3, pz, 3.6, 2.3, pz, 3.6, 2.46, pz, 4.8, 2.46, pz, 4.8, 2.3, pz, 4.7, 2.3, pz, 4.7, 0, pz], { c: pc, seg: true }));
    nr.push(P([3.7, 2.12, pz, 4.7, 2.12, pz], { c: pc }));
    nr.push(P([3.98, 1.0, pz, 4.42, 1.0, pz, 4.42, 1.8, pz, 3.98, 1.8, pz, 3.98, 1.0, pz], { c: C.TEXT, seg: true }));
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { const cc = r & 1 ? 2 - q : q; nr.push(P([4.1 + cc * 0.1, 1.5 - r * 0.1, pz], { c: C.TEXT })); }
    nr.push(P([3.98, 1.72, pz, 3.88, 1.72, pz, 3.85, 1.66, pz, 3.85, 1.26, pz, 3.88, 1.2, pz, 3.98, 1.2, pz], { c: pc }));
    const cord = [3.86, 1.2, pz];
    for (let i = 1; i <= 9; i++) cord.push(3.86 + (i & 1 ? -0.05 : 0.05) + i * 0.012, 1.2 - i * 0.025, pz);
    cord.push(4.05, 1.0, pz);
    nr.push(P(cord, { c: pc, nt: true }));
    el('skyNearR', 4, nr, -1, { subs: [['payphone', pa, nr.length]] });
    // 15 sky retrace: dwell stars + secret blank text
    const st = G.stars(rnd, nStars, E, 50 * U.DEG, 4 * U.DEG, 45 * U.DEG, (x, y, z) => {
      const t = (-78 - E[2]) / (z - E[2]), sx = E[0] + (x - E[0]) * t, sy = E[1] + (y - E[1]) * t;
      if (Math.hypot(sx, sy - cy) < R + 1.6) return false;
      return G.visible(sils, E, z, y, x - 0.01, x + 0.01).length > 0;
    });
    const sk = G.sky(st, [30, 8], { text: CFG.TEXT.secretSky, cx: 0, cy: 20, z: -50, w: 30 }, C.STAR, C.TEXT);
    el('sky', 6, sk.paths, -1, { subs: [sk.sub] });
    return { els, eye: E, pivots: { sun: [0, cy, -78], clock: [x, CT.cy, z] }, demo: { el: 'sun', c: [0, cy, -78] } };
  }
  return { make };
})();
