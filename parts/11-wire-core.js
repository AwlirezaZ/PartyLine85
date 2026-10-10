// 11-wire-core.js — weighted arc-length resampler, VBO packing, strings, resonators, sign regeneration.
// Generators hand over elements {name, share, paths, res, subs, sign}. A path is
// {p:[x,y,z..], k:kind, c:colour, g:fn(x,y,z)->0..1, f:flags, n:normal mode (0 plane z,1 +y,2 view),
//  j:joins previous path's string, b:[break vertex idx], seg:break at every anchor, d/L:degree/length
//  per string (number|array), nt:no turn anchors, ns:no string, sec:secret stroke}.
const WireCore = (() => {
  const COS35 = Math.cos(35 * Math.PI / 180), BW = 0.12, DOTW = 2;   // a single-vertex path (font dot, lamp) always keeps 2 dwells: it is only visible as a dwell hot spot
  const F = FLAG;
  const h3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  const pick = (x, k) => (x == null ? -1 : typeof x === 'number' ? x : x[k] != null ? x[k] : -1);

  // Dedupe consecutive vertices, classify forced vertices: 0 none, 1 forced sample, 2 anchor(+dwells).
  function prep(P, nextJ, fx) {
    const src = P.p, v = [], map = [];
    for (let i = 0; i < src.length; i += 3) {
      const n = v.length;
      if (n && Math.abs(v[n - 3] - src[i]) + Math.abs(v[n - 2] - src[i + 1]) + Math.abs(v[n - 1] - src[i + 2]) < 1e-7) { map.push(n / 3 - 1); continue; }
      map.push(n / 3); v.push(src[i], src[i + 1], src[i + 2]);
    }
    const nv = v.length / 3, typ = new Uint8Array(nv), brk = new Uint8Array(nv);
    const noStr = fx < 0 && !!(P.ns || P.sec || P.k === KIND.STAR), A = P.sec ? 1 : 2;
    if (nv === 1) typ[0] = A;
    else {
      typ[0] = fx >= 0 || (P.j && !noStr) ? 1 : A;
      typ[nv - 1] = fx >= 0 || (nextJ && !noStr) ? 1 : A;
      for (let i = 1; i < nv - 1; i++) {
        const ax = v[i * 3] - v[i * 3 - 3], ay = v[i * 3 + 1] - v[i * 3 - 2], az = v[i * 3 + 2] - v[i * 3 - 1];
        const bx = v[i * 3 + 3] - v[i * 3], by = v[i * 3 + 4] - v[i * 3 + 1], bz = v[i * 3 + 5] - v[i * 3 + 2];
        const c = (ax * bx + ay * by + az * bz) / (h3(ax, ay, az) * h3(bx, by, bz) || 1);
        if (!P.nt && c < COS35) { typ[i] = A; if (P.seg && !noStr && fx < 0) brk[i] = 1; }
      }
      if (P.b && !noStr && fx < 0) for (const b of P.b) { const m = map[b]; if (m > 0 && m < nv - 1) { typ[m] = A; brk[m] = 1; } }
    }
    const fv = [];
    for (let i = 0; i < nv; i++) if (typ[i]) fv.push(i);
    const sp = new Float64Array(Math.max(0, fv.length - 1));
    for (let q = 1; q < fv.length; q++) {
      let L = 0;
      for (let i = fv[q - 1]; i < fv[q]; i++) L += h3(v[i * 3 + 3] - v[i * 3], v[i * 3 + 4] - v[i * 3 + 1], v[i * 3 + 5] - v[i * 3 + 2]);
      sp[q - 1] = L;
    }
    let n1 = 0, n2 = 0;
    for (const i of fv) if (typ[i] === 2) n2++; else n1++;
    return { P, v, nv, typ, brk, fv, sp, n1, n2, noStr };
  }

  // Emit paths into ctx at ctx.i using exactly B points with s in [sa, sb].
  // o: {e, dw, res, fx (fixed string tmp id or -1), hf (flags on every point), prev {x,y,z,c,k}|null, exit [x,y,z]|null}
  function emit(ctx, paths, B, sa, sb, o) {
    const fx = o.fx == null ? -1 : o.fx;
    let pr = paths.map((P, k) => prep(P, !!(paths[k + 1] && paths[k + 1].j), fx));
    let np = pr.length, dw = o.dw == null ? 2 : o.dw;
    const exitMin = o.exit ? 1 : 0;
    const fixedOf = (n, d) => {
      let f = 0;
      for (let k = 0; k < n; k++) f += pr[k].n1 + pr[k].n2 * (1 + d) + (pr[k].nv === 1 && pr[k].n2 ? Math.max(0, DOTW - d) : 0);
      const hops = (o.prev && n ? 1 : 0) + Math.max(0, n - 1) + (o.exit ? 1 : 0);
      return f + 2 * hops + exitMin + (!n && o.prev && !o.exit ? 2 : 0);
    };
    while (fixedOf(np, dw) > B) { if (dw > 0) dw--; else if (np > 0) np--; else break; }
    pr = pr.slice(0, np);
    // Weights in emission order: [lead hop], spans/hops..., [exit hop]
    const w = [];
    const P3 = (r, i) => [r.v[i * 3], r.v[i * 3 + 1], r.v[i * 3 + 2]];
    let last = o.prev ? [o.prev.x, o.prev.y, o.prev.z] : null;
    for (const r of pr) {
      const a = P3(r, 0);
      if (last) w.push(BW * h3(a[0] - last[0], a[1] - last[1], a[2] - last[2]));
      for (let q = 0; q < r.sp.length; q++) w.push(r.P.sec ? r.sp[q] * 0.3 : r.sp[q]);
      last = P3(r, r.nv - 1);
    }
    if (o.exit && last) w.push(BW * h3(o.exit[0] - last[0], o.exit[1] - last[1], o.exit[2] - last[2]));
    else if (o.exit || (!pr.length && o.prev)) w.push(0);
    let W = 0;
    for (const x of w) W += x;
    const R = Math.max(0, B - fixedOf(np, dw)), cnt = new Int32Array(w.length);
    if (w.length) {
      if (W > 0) { let c = 0, pv = 0; for (let j = 0; j < w.length; j++) { c += w[j]; const t = Math.round(R * c / W); cnt[j] = t - pv; pv = t; } }
      else cnt[w.length - 1] = R;
      if (o.exit) cnt[w.length - 1] += exitMin;
    }
    const Wt = W > 0 ? W : 1, ds = sb - sa;
    const { f32, i8, u8, K, strs } = ctx;
    let i = ctx.i, Wc = 0, wi = 0, cs = -1, lastC = 0, lastK = 0, lastNm = 0;
    const put = (x, y, z, c, k, fl, g, run, st, nm) => {
      const q = i * 6, b = i * 24;
      f32[q] = x; f32[q + 1] = y; f32[q + 2] = z; f32[q + 4] = sa + ds * Wc / Wt;
      u8[b + 20] = c; u8[b + 21] = k; u8[b + 22] = fl | (o.hf || 0); i8[b + 15] = Math.round(U.sat(g) * 254 - 127);
      K.run[i] = run; K.el[i] = o.e; K.st[i] = st; K.nm[i] = nm;
      if (st >= 0 && fx < 0) strs[st].i1 = i + 1;
      i++;
    };
    const hop = (ax, ay, az, ac, ak, bx, by, bz, bc, bk, nm) => {
      const n = cnt[wi], ww = w[wi++];
      put(ax, ay, az, ac, ak, F.BLANK, 0, -1, -1, nm);
      for (let m = 1; m <= n; m++) {
        const t = m / (n + 1); Wc += ww / (n + 1);
        put(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, t < 0.5 ? ac : bc, t < 0.5 ? ak : bk, F.BLANK, 0, -1, -1, nm);
      }
      Wc += ww / (n + 1);
      put(bx, by, bz, bc, bk, F.BLANK, 0, -1, -1, nm);
    };
    const pS = new Float64Array(paths.length).fill(-1), pI = new Int32Array(paths.length * 2).fill(-1);
    let px = 0, py = 0, pz = 0;
    if (o.prev) { px = o.prev.x; py = o.prev.y; pz = o.prev.z; lastC = o.prev.c; lastK = o.prev.k; }
    let havePrev = !!o.prev;
    for (let k = 0; k < pr.length; k++) {
      const r = pr[k], P = r.P, v = r.v, run = ctx.runC++;
      const sec = !!P.sec, nm = P.n || 0, kind = P.k || 0, col = P.c || 0;
      const inkF = (P.f || 0) | (sec ? F.BLANK | F.SECRET : 0) | (o.res && !r.noStr ? F.RESONATOR : 0);
      if (havePrev) hop(px, py, pz, lastC, lastK, v[0], v[1], v[2], col, kind, nm);
      pI[k * 2] = i; pS[k] = sa + ds * Wc / Wt;
      let ls = 0;
      const newStr = () => { strs.push({ e: o.e, i0: i, i1: i, len: 0, d: pick(P.d, ls), L: pick(P.L, ls), fixed: false, dm: !!P.dm }); ls++; return strs.length - 1; };
      if (fx >= 0) cs = fx; else if (r.noStr) cs = -1; else if (!(P.j && cs >= 0)) cs = -2;
      const runId = sec ? -1 : run;
      const pt = (x, y, z, fl, st) => put(x, y, z, P.cf ? P.cf(x, y, z) : col, kind, fl, P.g ? P.g(x, y, z) : P.gv || 0, runId, st, nm);
      for (let q = 0; q < r.fv.length; q++) {
        const vi = r.fv[q];
        if (q > 0) {
          const a = r.fv[q - 1], n = cnt[wi], wq = w[wi++], L = r.sp[q - 1];
          if (cs >= 0 && fx < 0) strs[cs].len += L;
          // interior samples at uniform arc length between forced vertices a..vi
          let seg = a, segStart = 0, segLen = h3(v[a * 3 + 3] - v[a * 3], v[a * 3 + 4] - v[a * 3 + 1], v[a * 3 + 5] - v[a * 3 + 2]);
          for (let m = 1; m <= n; m++) {
            const tl = L * m / (n + 1);
            while (tl > segStart + segLen && seg < vi - 1) { segStart += segLen; seg++; segLen = h3(v[seg * 3 + 3] - v[seg * 3], v[seg * 3 + 4] - v[seg * 3 + 1], v[seg * 3 + 5] - v[seg * 3 + 2]); }
            const t = segLen > 0 ? U.sat((tl - segStart) / segLen) : 0, b3 = seg * 3;
            Wc += wq / (n + 1);
            pt(v[b3] + (v[b3 + 3] - v[b3]) * t, v[b3 + 1] + (v[b3 + 4] - v[b3 + 1]) * t, v[b3 + 2] + (v[b3 + 5] - v[b3 + 2]) * t, inkF, cs);
          }
          Wc += wq / (n + 1);
        }
        const t = r.typ[vi], x = v[vi * 3], y = v[vi * 3 + 1], z = v[vi * 3 + 2];
        if (cs === -2) cs = newStr();
        const anc = t === 2 ? F.ANCHOR : 0;
        pt(x, y, z, inkF | anc, cs);
        if (r.brk[vi] && q > 0) cs = newStr();
        if (t === 2) for (let d = 0, nd = r.nv === 1 ? Math.max(dw, DOTW) : dw; d < nd; d++) pt(x, y, z, inkF | F.DWELL, cs);
      }
      pI[k * 2 + 1] = i;
      px = v[r.nv * 3 - 3]; py = v[r.nv * 3 - 2]; pz = v[r.nv * 3 - 1]; lastC = col; lastK = kind; lastNm = nm;
      havePrev = true;
    }
    if (o.exit) {
      if (!havePrev) { px = o.exit[0]; py = o.exit[1]; pz = o.exit[2]; }
      hop(px, py, pz, lastC, lastK, o.exit[0], o.exit[1], o.exit[2], lastC, lastK, lastNm);
      px = o.exit[0]; py = o.exit[1]; pz = o.exit[2];
    } else if (!pr.length && o.prev) hop(px, py, pz, lastC, lastK, px, py, pz, lastC, lastK, lastNm);
    // pad (only when everything degenerated): park blanks at the end
    const end = ctx.i + B;
    while (i < end) put(px, py, pz, lastC, lastK, F.BLANK, 0, -1, -1, lastNm);
    // exact s at the right edge
    if (B > 0) f32[(end - 1) * 6 + 4] = sb;
    ctx.i = end;
    return { last: { x: px, y: py, z: pz, c: lastC, k: lastK }, pS, pI, dw, np, slack: R };
  }

  // Normals (smoothed over 5 points within a pen-down run) and stiffness for [a, b).
  function finish(ctx, a, b) {
    const f32 = ctx.f32, i8 = ctx.i8, u8 = ctx.u8, run = ctx.K.run, nm = ctx.K.nm, el = ctx.K.el, eye = ctx.eye, N = ctx.N;
    const n = b - a, raw = new Float32Array(n * 3);
    for (let i = a; i < b; i++) {
      const r = run[i];
      if (r < 0) continue;
      if (nm[i] === 1) { raw[(i - a) * 3 + 1] = 1; continue; }
      const i6 = i * 6, x = f32[i6], y = f32[i6 + 1], z = f32[i6 + 2];
      let p = i, q = i;
      for (let j = i - 1, c = 0; c < 4 && j >= a && run[j] === r; j--, c++) { p = j; if (f32[j * 6] !== x || f32[j * 6 + 1] !== y || f32[j * 6 + 2] !== z) break; }
      for (let j = i + 1, c = 0; c < 4 && j < b && run[j] === r; j++, c++) { q = j; if (f32[j * 6] !== x || f32[j * 6 + 1] !== y || f32[j * 6 + 2] !== z) break; }
      const tx = f32[q * 6] - f32[p * 6], ty = f32[q * 6 + 1] - f32[p * 6 + 1], tz = f32[q * 6 + 2] - f32[p * 6 + 2], m = nm[i];
      let nx = 0, ny = 1, nz = 0;
      if (m === 0) { const l = Math.sqrt(tx * tx + ty * ty); if (l > 1e-9) { nx = -ty / l; ny = tx / l; } }
      else if (m === 2) {
        const ex = eye[0] - x, ey = eye[1] - y, ez = eye[2] - z;
        const cx = ty * ez - tz * ey, cy = tz * ex - tx * ez, cz = tx * ey - ty * ex, l = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (l > 1e-9) { nx = cx / l; ny = cy / l; nz = cz / l; }
      }
      const o = (i - a) * 3;
      raw[o] = nx; raw[o + 1] = ny; raw[o + 2] = nz;
    }
    for (let i = a; i < b; i++) {
      const r = run[i];
      if (r < 0) continue;
      if (nm[i] === 1) { const bb = i * 24; i8[bb + 12] = 0; i8[bb + 13] = 127; i8[bb + 14] = 0; continue; }
      const o = (i - a) * 3, rx = raw[o], ry = raw[o + 1], rz = raw[o + 2];
      let sx = 0, sy = 0, sz = 0;
      const j0 = i - 2 < a ? a : i - 2, j1 = i + 2 >= b ? b - 1 : i + 2;
      for (let j = j0; j <= j1; j++) {
        if (run[j] !== r) continue;
        const oj = (j - a) * 3, qx = raw[oj], qy = raw[oj + 1], qz = raw[oj + 2];
        if (qx * rx + qy * ry + qz * rz < 0) { sx -= qx; sy -= qy; sz -= qz; } else { sx += qx; sy += qy; sz += qz; }
      }
      let l = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (l < 1e-6) { sx = rx; sy = ry; sz = rz; l = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1; }
      const bb = i * 24;
      i8[bb + 12] = Math.round(sx / l * 127); i8[bb + 13] = Math.round(sy / l * 127); i8[bb + 14] = Math.round(sz / l * 127);
    }
    // blanks copy the nearest ink normal in the same element (previous first, else next)
    let li = -1, pend = -1;
    for (let j = a - 1; j >= 0 && el[j] === el[a]; j--) if (run[j] >= 0) { li = j; break; }
    for (let i = a; i <= b; i++) {
      const end = i === b, newEl = !end && i > a && el[i] !== el[i - 1];
      if (end || newEl || run[i] >= 0) {
        if (pend >= 0) {
          let src = -1;
          if (!end && !newEl) src = i;
          else if (end) for (let j = b; j < N && el[j] === el[b - 1]; j++) if (run[j] >= 0) { src = j; break; }
          for (let k = pend; k < i; k++) { const kb = k * 24; if (src >= 0) { i8[kb + 12] = i8[src * 24 + 12]; i8[kb + 13] = i8[src * 24 + 13]; i8[kb + 14] = i8[src * 24 + 14]; } else { i8[kb + 12] = 0; i8[kb + 13] = 127; i8[kb + 14] = 0; } }
          pend = -1;
        }
        if (end) break;
        if (newEl) li = -1;
        if (run[i] >= 0) { li = i; continue; }
      }
      if (li >= 0) { const ib = i * 24, lb = li * 24; i8[ib + 12] = i8[lb + 12]; i8[ib + 13] = i8[lb + 13]; i8[ib + 14] = i8[lb + 14]; }
      else if (pend < 0) pend = i;
    }
    // stiffness: 255 on anchors/dwells, 170/85 on the next two samples each side
    const AD = F.ANCHOR | F.DWELL, lo = a - 3 < 0 ? 0 : a - 3, hi = b + 3 > N ? N : b + 3;
    let d = 9;
    for (let i = lo; i < hi; i++) { d = u8[i * 24 + 22] & AD ? 0 : d < 9 ? d + 1 : 9; if (i >= a && i < b) u8[i * 24 + 23] = d; }
    d = 9;
    for (let i = hi - 1; i >= lo; i--) {
      d = u8[i * 24 + 22] & AD ? 0 : d < 9 ? d + 1 : 9;
      if (i >= a && i < b) { const q = d < u8[i * 24 + 23] ? d : u8[i * 24 + 23]; u8[i * 24 + 23] = q === 0 ? 255 : q === 1 ? 170 : q === 2 ? 85 : 0; }
    }
  }

  return { emit, finish };
})();
