// 15-wire.js — public API: Wire.build(ex, tier), Wire.setSignText(wd, l1, l2), Wire.charCount(str).
const Wire = (() => {
  const COLS = () => CFG.SIGN.COLS;

  // Lay out both sign lines into the fixed region. Shared by build and setSignText (identical bytes).
  function signLines(ctx, S, t1, t2) {
    const sp = S.spec, lines = [WireFont.norm(t1, COLS()), WireFont.norm(t2, COLS())];
    const first = new Float64Array(lines[0].length + lines[1].length).fill(-1);
    const B1 = S.iMid - S.i0, B2 = S.i1 - S.iMid;
    const p0 = S.i0 - 1, z = sp.z;
    let prev = { x: ctx.f32[p0 * 6], y: ctx.f32[p0 * 6 + 1], z: ctx.f32[p0 * 6 + 2], c: ctx.u8[p0 * 24 + 20], k: ctx.u8[p0 * 24 + 21] };
    for (let L = 0; L < 2; L++) {
      const strokes = WireFont.layout(lines[L], sp.cx, sp.y[L], z, sp.w, sp.h);
      const paths = strokes.map((st) => ({ p: st.p, k: sp.k || 0, c: sp.c, n: 0 }));
      const ex = sp.exit[L];
      ctx.i = L ? S.iMid : S.i0;
      const r = WireCore.emit(ctx, paths, L ? B2 : B1, L ? S.sm : S.sa, L ? S.sb : S.sm,
        { e: S.e, dw: 0, res: S.res, fx: S.fx[L], hf: FLAG.BILLBOARD, prev, exit: [ex[0], ex[1], z] });
      const off = L ? lines[0].length : 0;
      for (let k = 0; k < r.np; k++) {
        const ci = off + strokes[k].ci;
        if (first[ci] < 0) first[ci] = ctx.f32[r.pI[k * 2] * 6 + 4];
      }
      prev = { x: ex[0], y: ex[1], z, c: sp.c, k: sp.k || 0 };
    }
    return { lines, first };
  }

  function applySign(wd, ctx, t1, t2) {
    const S = wd._.sign, sg = wd.sign;
    const { lines, first } = signLines(ctx, S, t1, t2);
    WireCore.finish(ctx, S.i0, S.i1);
    const K = ctx.K, ps = wd.pointString, fin = wd._.fin;
    for (let i = S.i0; i < S.i1; i++) ps[i] = K.st[i] >= 0 ? fin[K.st[i]] : 0xffff;
    const n = lines[0].length + lines[1].length, cs = sg.charS;
    cs.fill(sg.sB);
    for (let k = n - 1; k >= 0; k--) cs[k] = first[k] >= 0 ? first[k] : cs[k + 1];
    sg.lines = lines; sg.nChars = n; sg.len1 = lines[0].length;
  }

  function ctxOf(wd) {
    return { N: wd.N, f32: wd.f32, i8: wd.i8, u8: wd.u8, K: wd._.K, strs: wd._.strs, i: 0, runC: wd._.runC, eye: wd._.eye };
  }

  function build0(ex, tier, gen) {
    const T = CFG.TIERS[tier] || CFG.TIERS[1], N = T.N, X = CFG.EXCHANGES[ex];
    const sc = gen.make({ N, stars: T.stars, rnd: U.rng(X.seed), ex, tier });
    const vbo = new ArrayBuffer(N * 24);
    const K = { run: new Int32Array(N), el: new Uint8Array(N), st: new Int32Array(N), nm: new Uint8Array(N) };
    const ctx = { N, f32: new Float32Array(vbo), i8: new Int8Array(vbo), u8: new Uint8Array(vbo), K, strs: [], i: 0, runC: 0, eye: sc.eye };
    const el = {}, order = [], eInfo = [];
    let cum = 0, prev = null, S = null;
    sc.els.forEach((E, e) => {
      const c0 = cum, last = e === sc.els.length - 1;
      cum += E.share;
      const i0 = ctx.i, B = last ? N - i0 : Math.round(N * cum / 100) - Math.round(N * c0 / 100);
      const s0 = c0 / 100, s1 = last ? 1 : cum / 100, Bs = E.sign ? Math.round(B * E.sign.share) : 0;
      const sr = s0 + (s1 - s0) * (B - Bs) / B;
      const r = WireCore.emit(ctx, E.paths, B - Bs, s0, sr, { e, dw: 2, res: E.res >= 0, prev });
      for (const sb of E.subs || []) {
        const a = r.pI[sb[1] * 2], b = r.pI[(sb[2] - 1) * 2 + 1];
        if (a >= 0 && b > a) el[sb[0]] = { i0: a, i1: b };
      }
      prev = r.last;
      if (E.sign) {
        const sp = E.sign, iMid = ctx.i + (Bs >> 1);
        const fx = [0, 1].map((L) => {
          ctx.strs.push({ e, i0: L ? iMid : ctx.i, i1: L ? ctx.i + Bs : iMid, len: sp.w, d: -1, L: sp.w, fixed: true });
          return ctx.strs.length - 1;
        });
        S = { spec: sp, e, res: E.res >= 0, i0: ctx.i, iMid, i1: ctx.i + Bs, sa: sr, sm: sr + (s1 - sr) * (iMid - ctx.i) / Bs, sb: s1, fx };
        for (let i = S.i0; i < S.i1; i++) { K.run[i] = -1; K.el[i] = e; K.st[i] = -1; }
        ctx.i = S.i1;
        prev = { x: sp.exit[1][0], y: sp.exit[1][1], z: sp.z, c: sp.c, k: sp.k || 0 };
        el.sign = { i0: S.i0, i1: S.i1 };
      }
      eInfo.push({ name: E.name, i0, i1: ctx.i, res: E.res == null ? -1 : E.res });
      el[E.name] = { i0, i1: ctx.i };
      order.push(E.name);
    });
    const { f32, i8, u8 } = ctx;
    f32[4] = 0; f32[(N - 1) * 6 + 4] = 1;
    WireCore.finish(ctx, 0, N);
    // strings: merge short runs (< 0.5) into the preceding string of the same element
    const strs = ctx.strs, alias = new Int32Array(strs.length).fill(-1), alive = [];
    let cur = -1, curE = -1, pend = [];
    const flush = () => { if (pend.length) { const f = pend[0]; for (const p of pend) { alias[p] = f; if (p !== f) { strs[f].i1 = strs[p].i1; strs[f].len += strs[p].len; } } alive.push(f); pend = []; } };
    strs.forEach((s, t) => {
      if (s.e !== curE) { flush(); cur = -1; curE = s.e; }
      if (s.fixed) { flush(); alias[t] = t; alive.push(t); cur = -1; return; }
      if (s.len < 0.5) { if (cur >= 0) { alias[t] = cur; strs[cur].i1 = s.i1; strs[cur].len += s.len; } else pend.push(t); return; }
      alias[t] = t; alive.push(t); cur = t;
      if (pend.length) { s.i0 = strs[pend[0]].i0; for (const p of pend) { alias[p] = t; s.len += strs[p].len; } pend = []; }
    });
    flush();
    const nS = alive.length, fin = new Int32Array(strs.length).fill(-1);
    alive.forEach((t, id) => { fin[t] = id; });
    for (let t = 0; t < strs.length; t++) fin[t] = fin[alias[t]];
    const pointString = new Uint16Array(N);
    for (let i = 0; i < N; i++) pointString[i] = K.st[i] >= 0 ? fin[K.st[i]] : 0xffff;
    const P = sc.pivots || {};
    const wd = {
      ex, tier, N, vbo, f32, i8, u8, pointString, str: null, res: null, el, order, demoString: 0, homePoint: 0,
      pivots: { sun: P.sun || null, clock: P.clock || null, planet: P.planet || null, galaxy: P.galaxy || null,
        lighthouse: P.lighthouse || null, probe: P.probe || null, moonX: P.moonX == null ? null : P.moonX },
      occ: sc.occ || null, sign: null, _: { K, strs, fin, runC: ctx.runC, eye: sc.eye, sign: S },
    };
    const resId = new Int16Array(eInfo.length).fill(-1);
    let nR = 0;
    eInfo.forEach((E, e) => { if (E.res >= 0) resId[e] = nR++; });
    if (S) {
      wd.sign = { i0: S.i0, i1: S.i1, iMid: S.iMid, sA: Math.fround(S.sa), sB: Math.fround(S.sb), byteOffset: S.i0 * 24, byteLength: (S.i1 - S.i0) * 24,
        strLine1: fin[S.fx[0]], strLine2: fin[S.fx[1]], resId: resId[S.e], lines: ['', ''], nChars: 0, len1: 0,
        charS: new Float32Array(CFG.SIGN.LINES * CFG.SIGN.COLS + 1) };
      const tx = X.sign || ['', ''];
      applySign(wd, ctxOf(wd), tx[0], tx[1]);
    }
    const sOf = (i) => f32[i * 6 + 4];
    const str = wd.str = { count: nS, sA: new Float32Array(nS), sB: new Float32Array(nS), i0: new Uint32Array(nS), i1: new Uint32Array(nS),
      degree: new Uint8Array(nS), res: new Int16Array(nS), len: new Float32Array(nS) };
    alive.forEach((t, id) => {
      const s = strs[t];
      str.i0[id] = s.i0; str.i1[id] = s.i1; str.sA[id] = sOf(s.i0); str.sB[id] = sOf(s.i1 - 1);
      str.len[id] = s.len; str.res[id] = resId[s.e];
      str.degree[id] = U.clamp(s.d >= 0 ? s.d : CFG.degreeForLength(s.L > 0 ? s.L : s.len), 0, 18);
    });
    const res = wd.res = { count: nR, sA: new Float32Array(nR), sB: new Float32Array(nR), i0: new Uint32Array(nR),
      i1: new Uint32Array(nR), voice: new Uint8Array(nR), centre: new Float32Array(nR * 3), name: [] };
    eInfo.forEach((E, e) => {
      const k = resId[e];
      if (k < 0) return;
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (let i = E.i0; i < E.i1; i++) if (!(u8[i * 24 + 22] & FLAG.BLANK)) { cx += f32[i * 6]; cy += f32[i * 6 + 1]; cz += f32[i * 6 + 2]; n++; }
      n = n || 1;
      res.sA[k] = sOf(E.i0); res.sB[k] = sOf(E.i1 - 1); res.i0[k] = E.i0; res.i1[k] = E.i1;
      res.voice[k] = E.res; res.centre[k * 3] = cx / n; res.centre[k * 3 + 1] = cy / n; res.centre[k * 3 + 2] = cz / n; res.name.push(E.name);
    });
    for (const k in el) { el[k].sA = sOf(el[k].i0); el[k].sB = sOf(el[k].i1 - 1); }
    // demo string: in the demo element, the string whose ink centroid is nearest demo.c
    let demo = 0, best = 1e9;
    const de = el[sc.demo.el], dc = sc.demo.c, dm = alive.some((t) => strs[t].dm);
    for (let id = 0; id < nS; id++) {
      if (!de || str.i0[id] < de.i0 || str.i1[id] > de.i1 || (dm && !strs[alive[id]].dm)) continue;
      let x = 0, y = 0, z = 0, n = 0;
      for (let i = str.i0[id]; i < str.i1[id]; i++) if (pointString[i] === id) { x += f32[i * 6]; y += f32[i * 6 + 1]; z += f32[i * 6 + 2]; n++; }
      if (!n) continue;
      const d = Math.hypot(x / n - dc[0], y / n - dc[1], z / n - dc[2]) - 0.02 * Math.min(40, str.len[id]);
      if (d < best) { best = d; demo = id; }
    }
    let home = str.i0[demo], hb = 1e9;
    const sm = (str.sA[demo] + str.sB[demo]) / 2;
    for (let i = str.i0[demo]; i < str.i1[demo]; i++) if (pointString[i] === demo && Math.abs(sOf(i) - sm) < hb) { hb = Math.abs(sOf(i) - sm); home = i; }
    wd.demoString = demo; wd.homePoint = home;
    return wd;
  }

  const GEN = (ex) => (ex === 2 ? WireLong : ex === 1 ? WireTide : WireMeridian);
  const FALLBACK = { make() {
    const p = [], q = [];
    for (let i = 0; i <= 40; i++) p.push(-20 + i, 4, -30);
    for (const y of [9, 7]) q.push(-5, y, -30, 5, y, -30);
    return { eye: [0, 1.6, 6], pivots: {}, demo: { el: 'line', c: [0, 4, -30] },
      els: [{ name: 'line', share: 90, res: -1, paths: [{ p, c: 0 }] },
        { name: 'billboard', share: 10, res: VOICE.BILLBOARD, paths: [{ p: [-5, 8, -30, 5, 8, -30], c: 0 }],
          sign: { share: 0.8, z: -30, cx: 0, w: 10, h: 0.8, y: [9.5, 8.6], exit: [[5, 9.5], [5, 8.6]], c: 0 } }] };
  } };

  function build(ex, tier) {
    ex = ex === 1 || ex === 2 ? ex : 0;
    tier = tier === 0 || tier === 2 ? tier : 1;
    try { return build0(ex, tier, GEN(ex)); } catch (e) {
      try { console.warn('Wire.build fallback: ' + (e && e.message)); } catch (e2) { /* ignore */ }
      return build0(ex, tier, FALLBACK);
    }
  }

  function setSignText(wd, l1, l2) {
    try {
      if (!wd || !wd.sign || !wd._ || !wd._.sign) return { byteOffset: 0, byteLength: 0 };
      applySign(wd, ctxOf(wd), l1, l2);
      return { byteOffset: wd.sign.byteOffset, byteLength: wd.sign.byteLength };
    } catch (e) { return { byteOffset: 0, byteLength: 0 }; }
  }

  const charCount = (str) => { try { return WireFont.norm(str, COLS()).length; } catch (e) { return 0; } };

  return { build, setSignText, charCount };
})();
