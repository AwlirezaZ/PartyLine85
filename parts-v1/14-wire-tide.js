// 14-wire-tide.js — TIDE LINE: amber moonlit sea, cliff and lighthouse, buoy sign, distant ship.
const WireTide = (() => {
  function make({ N, stars: nStars, rnd }) {
    const G = WireGeo, P = G.P, X = CFG.EXCHANGES[EX.TIDE], C = X.col, E = X.camera.eye, T = U.TAU;
    const els = [], el = (name, share, paths, res, extra) => els.push(Object.assign({ name, share, paths, res: res == null ? -1 : res }, extra));
    const MX = -16, MY = 15, MZ = -78, MR = 7;
    // 1 sea: 40 stacked ridgelines, serpentine, peaky crests; ridge k -> degree min(18, k/2)
    const sea = [], sb = [], sd = [];
    for (let k = 0; k < 40; k++) {
      const z = 8.8 - 78.8 * Math.pow(k / 39, 1.6), dep = E[2] - z, hw = Math.min(80, Math.max(0.8 * dep, 0.36 * (dep + 4.3)) + 4);
      const amp = 0.06 + 0.17 * Math.pow(1 - k / 39, 1.4), lam = 3.2 + 0.11 * Math.abs(dep), ph = rnd() * T, ph2 = rnd() * T;
      const n = Math.ceil(2 * hw / (lam / 9)), dbl = k < 16, zb = z - 0.3 - 0.02 * dep;
      if (k) sb.push(sea.length / 3);
      sd.push(Math.min(18, k >> 1));
      for (let pass = 0; pass < (dbl ? 2 : 1); pass++) {
        const dir = dbl ? (pass ? -1 : 1) : k & 1 ? -1 : 1, zz = pass ? zb : z, a = pass ? amp * 0.55 : amp, p2 = pass ? 1.9 : 0;
        for (let i = 0; i <= n; i++) {
          const x = dir * (-hw + 2 * hw * i / n), u = x / lam * T + ph + p2;
          sea.push(x, a * (Math.pow(0.5 + 0.5 * Math.cos(u), 2.4) * 1.15 - 0.3 + 0.18 * Math.sin(0.43 * u + ph2)), zz);
        }
      }
    }
    el('sea', 50, [P(sea, { k: KIND.SEA, c: C.SEA, n: 1, b: sb, d: sd, nt: true,
      g: (x, y, z) => U.sat(y / 0.3 + 0.15) * Math.pow(U.sat((z + 70) / 68), 0.7) })]);
    // 2 cliff & rocks (right): jagged face, headland, strata, rocks in the surf
    const cz = -30, cl = [];
    const face = [[6.2, -0.3], [6.9, 1.3], [6.6, 2.4], [7.4, 3.5], [7.1, 4.7], [7.9, 5.8], [7.6, 6.9], [8.4, 7.8], [8.9, 8.6],
      [12.6, 8.6], [13.6, 9.3], [16, 9.9], [18.5, 11.2], [22, 11.6], [26, 12.7], [31, 13.1], [37, 13.9], [44, 13.6], [52, 12.2], [60, 9]];
    const fp = [];
    for (const v of face) fp.push(v[0], v[1], cz);
    const cg = (x, y) => U.sat((y - 4) / 10) * 0.55;
    cl.push(P(fp, { c: C.CLIFF, seg: true, g: cg }));
    // seaward front edge (4 units nearer) + ledges tying it to the back edge: reads as a solid headland
    const f2 = [];
    for (let i = 0; i < 13; i++) f2.push(face[i][0] - 0.7 + (i > 8 ? 0.3 : 0), Math.max(-0.3, face[i][1] - 0.5), cz + 4);
    cl.push(P(f2, { c: C.CLIFF, seg: true, g: () => 0.15 }));
    for (const i of [1, 3, 5, 7, 9, 12]) cl.push(P([f2[i * 3], f2[i * 3 + 1], cz + 4, face[i][0], face[i][1], cz], { c: C.CLIFF, g: () => 0.3 }));
    for (const [y, x0, x1] of [[0.9, 7.2, 58], [1.9, 7.5, 59], [2.9, 7.3, 57], [4.0, 7.8, 58], [5.0, 7.6, 55], [6.1, 8.2, 57], [7.2, 8.1, 56], [9.6, 15.2, 54], [11.4, 21.5, 52]]) {
      const p = [];
      for (let x = x0; x <= x1; x += 0.9 + rnd() * 1.4) p.push(x, y + (rnd() - 0.5) * 0.42 + Math.sin(x * 0.7) * 0.12, cz);
      cl.push(P(p, { c: C.CLIFF, g: cg, nt: true }));
    }
    for (const [x, y] of [[7.3, 2.2], [7.8, 4.6], [8.2, 6.6]]) cl.push(P([x, y, cz, x + 0.7, y - 1.1, cz, x + 1.3, y - 1.6, cz], { c: C.CLIFF, g: cg }));
    for (const [x, z, h, w] of [[4.3, -27, 1.1, 1.2], [5.6, -25.5, 0.7, 0.9], [2.8, -24, 0.55, 0.8], [8.6, -23, 0.8, 1.1]]) {
      cl.push(P([x - w, -0.2, z, x - w * 0.5, h * 0.7, z, x - w * 0.1, h, z, x + w * 0.4, h * 0.6, z, x + w, -0.2, z], { c: C.CLIFF, g: () => 0.35 }));
    }
    el('cliff', 6, cl);
    // 3 lighthouse on the headland
    const lx = 10.6, lb = 8.6, lt = 15.6, lz = cz, hw0 = 1.15, hw1 = 0.74, LH = [lx, 16.55, lz];
    const twx = (y) => hw0 + (hw1 - hw0) * (y - lb) / (lt - lb);
    const lh = [P([lx - hw0, lb, lz, lx - hw1, lt, lz, lx - 1.25, lt, lz, lx - 1.25, lt + 0.25, lz, lx + 1.25, lt + 0.25, lz, lx + 1.25, lt, lz, lx + hw1, lt, lz, lx + hw0, lb, lz, lx - hw0, lb, lz], { c: C.LIGHTHOUSE, seg: true })];
    for (const [ya, yb] of [[10.2, 11.2], [12.6, 13.6]]) {
      const p = [];
      for (let i = 0; i < 5; i++) { const y = ya + (yb - ya) * i / 4, w = twx(y), s = i & 1 ? -1 : 1; p.push(lx - w * s, y, lz, lx + w * s, y, lz); }
      lh.push(P(p, { c: C.LIGHTHOUSE, gv: 0.55 }));
    }
    lh.push(P([lx - 0.38, lb, lz, lx - 0.38, lb + 0.8, lz, ...G.arc(lx, lb + 0.8, lz, 0.38, 0.3, Math.PI, 0, 6), lx + 0.38, lb, lz], { c: C.LIGHTHOUSE, gv: 0.3 }));
    for (const y of [11.8, 14.3]) lh.push(P([lx, y, lz, lx, y + 0.5, lz], { c: C.BEAM }));
    const rail = [];
    for (let i = 0; i <= 8; i++) { const x = lx - 1.2 + i * 0.3, s = i & 1; rail.push(x, lt + 0.25 + (s ? 0 : 0.5), lz, x, lt + 0.25 + (s ? 0.5 : 0), lz); }
    lh.push(P(rail, { c: C.LIGHTHOUSE, gv: 0.4 }));
    const g0 = lt + 0.25, g1 = g0 + 1.3;
    lh.push(P([lx - 0.62, g0, lz, lx - 0.62, g1, lz, lx + 0.62, g1, lz, lx + 0.62, g0, lz, lx - 0.62, g1, lz], { c: C.BEAM }));
    lh.push(P([lx + 0.62, g1, lz, ...G.arc(lx, g1, lz, 0.72, 0.75, 0, Math.PI / 2, 5), lx, g1 + 1.4, lz, ...G.arc(lx, g1, lz, 0.72, 0.75, Math.PI / 2, Math.PI, 5), lx - 0.62, g1, lz], { c: C.LIGHTHOUSE, seg: true }));
    lh.push(P(G.arc(LH[0], LH[1], lz, 0.26, 0.26, 0, -T, 10), { c: C.BEAM }));
    lh.push(P([LH[0], LH[1], lz], { c: C.BEAM }));
    el('lighthouse', 6, lh, VOICE.CLOCK);
    // 4 beam: a long thin wedge pointing +x (shader turns it about y)
    const bm = [LH[0] + 0.3, LH[1] + 0.05, lz + 0.06, LH[0] + 46, LH[1] - 1.1, lz + 2.8, LH[0] + 46, LH[1] - 1.6, lz - 2.8, LH[0] + 0.3, LH[1] - 0.05, lz - 0.06];
    el('lhBeam', 4, [P(bm, { k: KIND.LH_BEAM, c: C.BEAM, n: 1, nt: true, b: [2], g: (x, y, z) => U.sat(Math.hypot(x - LH[0], z - lz) / 46) * 0.85 })]);
    // 5 moon: striped disc with crater cut-outs, crater rims and a halo
    const cr = [[-2.3, 1.9, 1.55], [2.5, -1.3, 1.9], [-0.7, -3.7, 1.1], [3.6, 3.2, 0.9], [-4, -1.5, 0.85], [0.9, 4.5, 0.7]];
    const moon = G.disc({ cx: MX, cy: MY, z: MZ, r: MR, n: 34, yt: MY + MR - 0.2, yb: MY - MR + 0.2, min: 0.1, vis: (y, xa, xb) => {
      let iv = [[xa, xb]];
      for (const c of cr) { const dy = y - (MY + c[1]); if (Math.abs(dy) < c[2]) { const w = Math.sqrt(c[2] * c[2] - dy * dy); iv = G.cut(iv, MX + c[0] - w, MX + c[0] + w); } }
      return iv;
    } }, { c: C.MOON, n: 0, dm: true, g: (x, y) => U.sat((MY - y) / MR * 0.4 + (x - MX) / MR * 0.25 + 0.1) });
    for (const c of cr.slice(0, 3)) moon.push(P(G.arc(MX + c[0], MY + c[1], MZ, c[2] + 0.12, c[2] + 0.12, 0, T, 24), { c: C.MOON, gv: 0.35 }));
    moon.push(P(G.arc(MX, MY, MZ - 0.5, MR + 2.4, MR + 2.4, -Math.PI / 2, -Math.PI / 2 + T, 64), { c: C.MOON, gv: 0.85 }));
    el('moon', 12, moon, VOICE.SUN);
    // 6 buoy sign: hull, lattice tower, double-framed board, blinking light
    const bx = 1.0, bz = -20, by0 = 3.9, by1 = 6.3, bw = 4.1, bu = [];
    bu.push(P([bx - 1.1, -0.1, bz, bx - 1.1, 0.8, bz, bx + 1.1, 0.8, bz, bx + 1.1, -0.1, bz, ...G.arc(bx, -0.1, bz, 1.1, 0.45, 0, -Math.PI, 8)], { c: C.TEXT, gv: 0, seg: true }));
    const tw = [bx - 0.8, 0.8, bz, bx - 0.35, by0, bz, bx + 0.35, by0, bz, bx + 0.8, 0.8, bz];
    for (let i = 1; i <= 5; i++) { const y = 0.8 + (by0 - 0.8) * i / 5, w = 0.8 - 0.45 * i / 5; tw.push(bx + (i & 1 ? -w : w), y, bz); }
    bu.push(P(tw, { c: C.SEA, seg: true }));
    bu.push(P([bx - 0.4, by0, bz, bx - bw, by0, bz, bx - bw, by1, bz, bx + bw, by1, bz, bx + bw, by0, bz, bx + 0.4, by0, bz], { c: C.TEXT, seg: true }));
    bu.push(P([bx + bw - 0.17, by0 + 0.17, bz, bx - bw + 0.17, by0 + 0.17, bz, bx - bw + 0.17, by1 - 0.17, bz, bx + bw - 0.17, by1 - 0.17, bz, bx + bw - 0.17, by0 + 0.17, bz], { c: C.SEA, seg: true }));
    bu.push(P([bx, by1, bz, bx, by1 + 0.55, bz], { c: C.TEXT }));
    bu.push(P([bx, by1 + 0.75, bz], { c: C.BEAM, f: FLAG.BLINK }));
    el('billboard', 7, bu, VOICE.BILLBOARD, { sign: { share: 0.8, z: bz, cx: bx, w: 2 * bw - 0.7, h: 0.95, y: [5.58, 4.56], exit: [[bx + bw - 0.35, 5.58], [bx + bw - 0.35, 4.56]], c: C.TEXT } });
    // 7 distant ship on the horizon
    const sx = -21, sz = -64, sh = [];
    sh.push(P([sx - 5, 0.55, sz, sx - 4.2, -0.3, sz, sx + 3.6, -0.3, sz, sx + 4.6, 0.7, sz, sx - 5, 0.55, sz], { c: C.SHIP, seg: true }));
    sh.push(P([sx - 2.6, 0.6, sz, sx - 2.6, 1.5, sz, sx + 0.9, 1.5, sz, sx + 0.9, 0.62, sz], { c: C.SHIP, seg: true }));
    sh.push(P([sx - 1.9, 1.5, sz, sx - 1.9, 2.05, sz, sx + 0.2, 2.05, sz, sx + 0.2, 1.5, sz], { c: C.SHIP, seg: true }));
    sh.push(P([sx + 1.6, 0.65, sz, sx + 1.9, 2.3, sz, sx + 2.5, 2.3, sz, sx + 2.4, 0.68, sz], { c: C.SHIP, seg: true }));
    sh.push(P([sx - 5, 0.55, sz, sx - 3.8, 3.4, sz, sx - 3.8, 0.58, sz], { c: C.SHIP, gv: 0.4 }));
    sh.push(P([sx + 4.6, 0.7, sz, sx + 3.3, 2.7, sz, sx + 3.3, 0.68, sz], { c: C.SHIP, gv: 0.4 }));
    sh.push(P([sx - 3.8, 3.4, sz, sx + 3.3, 2.7, sz], { c: C.SHIP, gv: 0.6 }));
    for (const [x, y] of [[-3.8, 3.6], [3.3, 2.9], [-1.4, 1.1], [-0.4, 1.1], [0.5, 1.1]]) sh.push(P([sx + x, y, sz], { c: C.TEXT }));
    el('ship', 2, sh);
    // 8 sky: moonlit cloud wisps, dwell stars, secret text
    const sk = [];
    for (const [x0, x1, y, z] of [[-34, -7, 11.2, -74], [-24, 2, 13.4, -72], [-40, -20, 19.6, -76]]) {
      const top = [], bot = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18, x = x0 + (x1 - x0) * t, th = Math.sin(Math.PI * t) * 0.55; top.push(x, y + th * 0.6 + 0.12 * Math.sin(t * 9), z); bot.unshift(x, y - th * 0.4 + 0.1 * Math.sin(t * 7 + 1), z); }
      sk.push(P(top.concat(bot.slice(3)), { c: C.MOON, gv: 0.62, nt: true }));
    }
    const sils = [{ z: cz, ridge: face.flatMap((v) => v) }, { z: bz, r: [[bx - bw, bx + bw, by0, by1 + 0.9]] }, { z: lz, r: [[lx - 1.3, lx + 1.3, 0, g1 + 1.4]] }];
    const st = G.stars(rnd, nStars, E, 52 * U.DEG, 3 * U.DEG, 48 * U.DEG, (x, y, z) => {
      const t = (MZ - E[2]) / (z - E[2]);
      if (Math.hypot(E[0] + (x - E[0]) * t - MX, E[1] + (y - E[1]) * t - MY) < MR + 3.2) return false;
      return G.visible(sils, E, z, y, x - 0.01, x + 0.01).length > 0;
    });
    const s2 = G.sky(st, [-8, 11], { text: CFG.TEXT.secretSky, cx: 0, cy: 20, z: -50, w: 30 }, C.STAR, C.TEXT);
    const off = sk.length;
    for (const p of s2.paths) sk.push(p);
    el('sky', 13, sk, -1, { subs: [['secret', s2.sub[1] + off, s2.sub[2] + off]] });
    return { els, eye: E, pivots: { lighthouse: LH, moonX: MX }, demo: { el: 'moon', c: [MX, MY, MZ] } };
  }
  return { make };
})();
