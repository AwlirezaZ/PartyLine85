// 15-wire-long.js — LONG DISTANCE: spiral galaxy, ringed wire planet, drifting probe, hold card.
const WireLong = (() => {
  function make({ N, stars: nStars, rnd }) {
    const G = WireGeo, P = G.P, X = CFG.EXCHANGES[EX.LONG], C = X.col, E = X.camera.eye, T = U.TAU, D = U.DEG;
    const els = [], el = (name, share, paths, res, extra) => els.push(Object.assign({ name, share, paths, res: res == null ? -1 : res }, extra));
    const PC = [0, 6, -40], PR = 9, GC = [21, 25, -120], PB = [-4.4, 11.2, -22];
    // 1 galaxy (plane z = -120): arm A strands, core spiral, arm B strands; dwell stars at string breaks
    const ga = 2.0, gb = 0.27, th1 = Math.log(40 / ga) / gb, gp = [];
    // each arm: 4 braided strands swept serpentine (out, back, out, back) across the arm width
    const strand = (ph, o, ph2) => {
      const pts = [];
      for (let th = 0.12; th < th1; ) {
        const r = ga * Math.exp(gb * th), w = 0.9 + 0.24 * r, a = th + ph;
        const tx = gb * Math.cos(a) - Math.sin(a), ty = gb * Math.sin(a) + Math.cos(a), tl = Math.hypot(tx, ty);
        const off = w * (o + 0.11 * Math.sin(th * 2.3 + ph2) + 0.06 * Math.sin(th * 5.7 + ph2 * 2));
        pts.push([GC[0] + r * Math.cos(a) - ty / tl * off, GC[1] + r * Math.sin(a) + tx / tl * off, GC[2]]);
        th += 0.55 / (r * 1.036);
      }
      return pts;
    };
    const gbk = [], push = (pts) => { for (const p of pts) gp.push(p[0], p[1], p[2]); };
    const arm = (ph) => {
      for (let j = 0; j < 4; j++) {
        let pts = strand(ph, -0.42 + 0.28 * j, rnd() * T);
        if (j & 1) pts = pts.reverse();
        if (j) gbk.push(gp.length / 3);
        push(pts);
      }
    };
    const sp = (r0, r1, a0, turns) => { const n = Math.ceil(turns * 40); for (let i = 1; i < n; i++) { const t = i / n, r = r0 + (r1 - r0) * t, a = a0 - turns * T * t; gp.push(GC[0] + r * Math.cos(a), GC[1] + r * Math.sin(a) * 0.92, GC[2]); } };
    arm(0);
    sp(2.3, 0.2, 0.12, 3.25); sp(0.2, 2.3, 0.12 - 3.25 * T, 3.25);
    arm(Math.PI);
    for (let i = 0, n = gp.length / 3, k = 0; i < n - 1; i += 18 + ((k++ * 7) % 11)) if (i > 2 && gbk.indexOf(i) < 0) gbk.push(i);
    gbk.sort((x, y) => x - y);
    el('galaxy', 28, [P(gp, { k: KIND.GALAXY, c: C.GALAXY, nt: true, b: gbk, g: (x, y) => Math.pow(U.sat(1 - Math.hypot(x - GC[0], y - GC[1]) / 13), 0.8) })]);
    // 2 planet: 24 latitude rings (one serpentine) + 10 meridians meeting at the poles
    const pr = [], pb = [], lat = (k) => (-86.25 + 7.5 * k) * D;
    for (let k = 0; k < 24; k++) {
      const f = lat(k), y = PC[1] + PR * Math.sin(f), rho = PR * Math.cos(f), n = Math.max(20, Math.round(rho * 7));
      if (k) pb.push(pr.length / 3);
      for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + T * i / n; pr.push(PC[0] + rho * Math.cos(t), y, PC[2] + rho * Math.sin(t)); }
    }
    const pm = [], mb = [];
    for (let m = 0; m < 10; m++) {
      const l = m * T / 10;
      if (m) mb.push(pm.length / 3);
      for (let i = 0; i <= 36; i++) { const f = (m & 1 ? -1 : 1) * (Math.PI / 2 - Math.PI * i / 36); pm.push(PC[0] + PR * Math.cos(f) * Math.cos(l), PC[1] + PR * Math.sin(f), PC[2] + PR * Math.cos(f) * Math.sin(l)); }
    }
    const pg = (x, y) => 0.55 * Math.pow(1 - Math.abs(y - PC[1]) / PR, 2);
    el('planet', 32, [P(pr, { k: KIND.PLANET, c: C.PLANET, n: 2, b: pb, g: pg, dm: true }), P(pm, { k: KIND.PLANET, c: C.PLANET, n: 2, b: mb, gv: 0.12 })], VOICE.SUN);
    // 3 rings: three spiral-linked bands, tilted 18 deg (near side up), slight roll
    const rg = [], rb = [], tl = 18 * D, rl = -8 * D;
    const bands = [[12.1, 12.9, 2, 0], [13.9, 15.0, 3, 0.35], [16.1, 17.1, 2, 0.7]];
    let th = 0, nextB = T / 3;
    const ringPt = (r, a) => {
      const x = r * Math.cos(a), zl = r * Math.sin(a), y1 = zl * Math.sin(tl), z1 = zl * Math.cos(tl);
      rg.push(PC[0] + x * Math.cos(rl) - y1 * Math.sin(rl), PC[1] + x * Math.sin(rl) + y1 * Math.cos(rl), PC[2] + z1);
      if (th >= nextB) { rb.push(rg.length / 3 - 1); nextB += T / 3; }
    };
    bands.forEach((bd, bi) => {
      const n = Math.ceil(bd[2] * T * bd[1] / 0.7);
      for (let i = 0; i < n; i++) { const t = i / n; ringPt(bd[0] + (bd[1] - bd[0]) * t, th); th += bd[2] * T / n; }
      if (bi < 2) { const nb = bands[bi + 1][0], m = 30; for (let i = 0; i < m; i++) { ringPt(bd[1] + (nb - bd[1]) * i / m, th); th += Math.PI / m; } }
      else ringPt(bd[1], th);
    });
    el('rings', 14, [P(rg, { c: C.RINGS, n: 2, b: rb, g: (x, y, z) => U.sat((Math.hypot(x - PC[0], y - PC[1], z - PC[2]) - 12) / 6.5) })], VOICE.WINDOW);
    // 4 probe: dish (rim, inner ring, feed struts), bus, magnetometer boom, RTG boom, scan platform, whip antennas
    const s = 0.52, Dn = [0.5, -0.32, 0.8], dl = Math.hypot(...Dn), dn = Dn.map((v) => v / dl);
    const ux = [dn[2], 0, -dn[0]], ul = Math.hypot(...ux), u1 = ux.map((v) => v / ul);
    const u2 = [dn[1] * u1[2] - dn[2] * u1[1], dn[2] * u1[0] - dn[0] * u1[2], dn[0] * u1[1] - dn[1] * u1[0]];
    const at = (a, b, c) => [PB[0] + s * (a * u1[0] + b * u2[0] + c * dn[0]), PB[1] + s * (a * u1[1] + b * u2[1] + c * dn[1]), PB[2] + s * (a * u1[2] + b * u2[2] + c * dn[2])];
    const ring = (r, c, n, a0) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + T * i / n; o.push(...at(r * Math.cos(a), r * Math.sin(a), c)); } return o; };
    const pbx = { k: KIND.PROBE, c: C.PROBE, n: 2 }, pq = (p, o) => P(p, Object.assign({}, pbx, o));
    const feed = at(0, 0, 0.9), pro = [pq(ring(1.25, 0, 40, 0)), pq(ring(0.45, 0.12, 16, 0))];
    for (let i = 0; i < 3; i++) { const a = i * T / 3 + 0.5; pro.push(pq([...at(1.25 * Math.cos(a), 1.25 * Math.sin(a), 0), ...feed])); }
    pro.push(pq([...ring(0.55, -0.35, 6, 0.3), ...ring(0.55, -0.75, 6, 0.3)], { seg: true }));
    for (const a of [0.3 + T / 3, 0.3 + 2 * T / 3]) pro.push(pq([...at(0.55 * Math.cos(a), 0.55 * Math.sin(a), -0.35), ...at(0.55 * Math.cos(a), 0.55 * Math.sin(a), -0.75)]));
    const mag = [...at(-0.5, 0.3, -0.55)];
    for (let i = 1; i <= 14; i++) { const t = i / 14, zz = 0; mag.push(...at(-0.5 - 3.8 * t, 0.3 + 2.5 * t + zz, -0.55 - 0.6 * t)); }
    pro.push(pq(mag, { nt: true, gv: 0.3 }));
    pro.push(pq([...at(0.5, -0.3, -0.55), ...at(2.4, -1.5, -0.9)]));
    for (let i = 0; i < 3; i++) { const t = 0.55 + i * 0.16, c = [0.5 + 1.9 * t, -0.3 - 1.2 * t]; pro.push(pq([...at(c[0] - 0.12, c[1] - 0.22, -0.7), ...at(c[0] + 0.12, c[1] + 0.22, -0.7), ...at(c[0] + 0.32, c[1] + 0.1, -0.7), ...at(c[0] + 0.08, c[1] - 0.34, -0.7), ...at(c[0] - 0.12, c[1] - 0.22, -0.7)], { seg: true })); }
    pro.push(pq([...at(-0.4, -0.45, -0.6), ...at(-2.2, -0.9, -0.4), ...at(-2.2, -1.35, -0.4), ...at(-2.75, -1.35, -0.4), ...at(-2.75, -0.9, -0.4), ...at(-2.2, -0.9, -0.4)], { seg: true }));
    pro.push(pq([...at(-2.75, -1.1, -0.4), ...at(-3.1, -1.25, -0.2)]));
    pro.push(pq([...at(0.1, -0.5, -0.7), ...at(-0.9, -3.0, -0.9), ...at(0.2, -0.5, -0.7), ...at(1.0, -2.9, -0.6)], { gv: 0.5 }));
    pro.push(pq([...feed], { f: FLAG.BLINK }));
    el('probe', 6, pro, VOICE.MAST);
    // 5 hold card: corner brackets around 'LONG DISTANCE / PLEASE HOLD', under the planet
    const sz = -45, sy = [-6.95, -8.8], sw = 12.4, sx0 = -7, sx1 = 7, st0 = -5.75, sb0 = -9.8;
    const br = (x, y, dx, dy) => P([x + dx, y, sz, x, y, sz, x, y + dy, sz], { c: C.RINGS, seg: true });
    const sgn = [br(sx0, st0, 1.3, -0.8), br(sx1, st0, -1.3, -0.8), br(sx1, sb0, -1.3, 0.8), br(sx0, sb0, 1.3, 0.8),
      P([-2.2, (sy[0] + sy[1]) / 2, sz, 2.2, (sy[0] + sy[1]) / 2, sz], { c: C.DIM, gv: 0 })];
    el('billboard', 7, sgn, -1, { sign: { share: 0.82, z: sz, cx: 0, w: sw, h: 1.0, y: sy, exit: [[sx1 - 0.3, sy[0]], [sx1 - 0.3, sy[1]]], c: C.TEXT } });
    // 6 sky: dwell stars all around (not behind the planet) + secret blank text
    const pd = [PC[0] - E[0], PC[1] - E[1], PC[2] - E[2]], pdl = Math.hypot(...pd), cap = Math.cos(Math.asin(PR / pdl) + 2.5 * D);
    const st = G.stars(rnd, nStars, E, 68 * D, -42 * D, 44 * D, (x, y, z) => {
      const v = [x - E[0], y - E[1], z - E[2]], vl = Math.hypot(...v);
      return (v[0] * pd[0] + v[1] * pd[1] + v[2] * pd[2]) / (vl * pdl) < cap;
    });
    const sk = G.sky(st, [sx1, sb0], { text: CFG.TEXT.secretSky, cx: 0, cy: 20, z: -50, w: 30 }, C.STAR, C.TEXT);
    el('sky', 13, sk.paths, -1, { subs: [sk.sub] });
    return { els, eye: E, pivots: { planet: PC, galaxy: GC, probe: PB }, demo: { el: 'planet', c: PC } };
  }
  return { make };
})();
