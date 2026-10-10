// 12-wire-geo.js — shared generator geometry: silhouettes/clipping, striped discs, skylines, ridges, sky.
const WireGeo = (() => {
  const P = (p, o) => Object.assign({ p }, o);
  const arc = (cx, cy, z, rx, ry, a0, a1, n, out) => {
    out = out || [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z); }
    return out;
  };
  // Subtract [a,b] from sorted disjoint intervals.
  function cut(ivs, a, b) {
    if (a > b) { const t = a; a = b; b = t; }
    const o = [];
    for (const v of ivs) {
      if (b <= v[0] || a >= v[1]) o.push(v);
      else { if (a > v[0]) o.push([v[0], a]); if (b < v[1]) o.push([b, v[1]]); }
    }
    return o;
  }
  // Visible x-intervals of [xa,xb] at height y on plane zP, seen from eye E past silhouettes
  // {z, r:[[x0,x1,y0,y1]..], ridge:[x,y,..]} (all planes nearer than zP).
  function visible(sils, E, zP, y, xa, xb) {
    let ivs = [[xa, xb]];
    for (const S of sils) {
      const t = (S.z - E[2]) / (zP - E[2]);
      if (!(t > 0 && t < 1)) continue;
      const yy = E[1] + (y - E[1]) * t, bk = (x) => E[0] + (x - E[0]) / t;
      if (S.r) for (const r of S.r) if (yy > r[2] && yy < r[3]) ivs = cut(ivs, bk(r[0]), bk(r[1]));
      const v = S.ridge;
      if (v) for (let i = 0; i + 3 < v.length; i += 2) {
        const x0 = v[i], y0 = v[i + 1], x1 = v[i + 2], y1 = v[i + 3];
        if (yy >= Math.max(y0, y1)) continue;
        let a = x0, b = x1;
        if (yy > Math.min(y0, y1)) { const xc = x0 + (x1 - x0) * (yy - y0) / (y1 - y0); if (y0 < y1) a = xc; else b = xc; }
        ivs = cut(ivs, bk(a), bk(b));
      }
      if (!ivs.length) break;
    }
    return ivs;
  }
  // Serpentine horizontal-stripe disc fill. o: {cx,cy,z,r,n,yt,yb,vis(y,xa,xb),min}. Stripes run top->bottom;
  // runs continue through a rim arc when both stripe ends touch the rim. Each stripe piece is a string whose
  // pitch length is the full chord (L), the arc belongs to the stripe it leaves. o.deg(L) (optional) maps the full
  // chord to a degree for every piece of that stripe (used by the sun so a vertical swipe is a glissando).
  function disc(o, base) {
    const paths = [];
    let cur = null, dir = 1, last = null;
    for (let k = 0; k < o.n; k++) {
      const y = o.yt + (o.yb - o.yt) * k / (o.n - 1), dy = y - o.cy;
      const hw = Math.sqrt(Math.max(0, o.r * o.r - dy * dy)), xa = o.cx - hw, xb = o.cx + hw, L = 2 * hw;
      let ivs = hw > 0 ? o.vis(y, xa, xb).filter((v) => v[1] - v[0] > o.min) : [];
      if (dir < 0) ivs = ivs.map((v) => [v[1], v[0]]).reverse();
      let first = true;
      for (const v of ivs) {
        const atEdge = Math.abs(v[0] - (dir > 0 ? xa : xb)) < 1e-6;
        let ok = first && atEdge && last && last.edge;
        if (ok) {
          const a0 = Math.atan2(last.y - o.cy, last.x - o.cx), a1 = Math.atan2(dy, v[0] - o.cx);
          const am = (a0 + a1) / 2, mx = o.cx + Math.cos(am) * o.r, my = o.cy + Math.sin(am) * o.r;
          ok = o.vis(my, mx - 0.02, mx + 0.02).length > 0 && my > 0;
          if (ok) {
            const tmp = arc(o.cx, o.cy, o.z, o.r, o.r, a0, a1, 4);
            for (let i = 3; i < tmp.length - 3; i++) cur.p.push(tmp[i]);
            cur.b.push(cur.p.length / 3); cur.L.push(L); if (o.deg) cur.d.push(o.deg(L)); cur.p.push(v[0], y, o.z);
          }
        }
        if (!ok) { cur = Object.assign({ p: [v[0], y, o.z], b: [], L: [L] }, base); if (o.deg) cur.d = [o.deg(L)]; paths.push(cur); }
        cur.p.push(v[1], y, o.z);
        last = { edge: Math.abs(v[1] - (dir > 0 ? xb : xa)) < 1e-6, x: v[1], y };
        first = false;
      }
      if (!ivs.length) last = null;
      dir = -dir;
    }
    return paths;
  }
  // Ridge polyline [x,y,..] (2D) through peaks [[x,h]..] with valleys and midpoint displacement.
  function ridge(rnd, x0, x1, peaks, vf, rough) {
    const v = [[x0, peaks[0][1] * 0.6]];
    for (let i = 0; i < peaks.length; i++) {
      const pk = peaks[i];
      if (i) { const q = peaks[i - 1]; v.push([(q[0] + pk[0]) / 2 + (rnd() - 0.5) * 0.3 * (pk[0] - q[0]), Math.min(q[1], pk[1]) * (vf + rnd() * 0.25)]); }
      v.push(pk);
    }
    v.push([x1, peaks[peaks.length - 1][1] * 0.6]);
    let pts = v;
    for (let lv = 0; lv < 2; lv++) {
      const o = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.abs(b[0] - a[0]);
        o.push([(a[0] + b[0]) / 2 + (rnd() - 0.5) * d * 0.15, Math.max(0.2, (a[1] + b[1]) / 2 + (rnd() - 0.5) * d * rough)], b);
      }
      pts = o;
      rough *= 0.6;
    }
    const out = [];
    for (const p of pts) out.push(p[0], p[1]);
    return out;
  }
  // Building outline + candidate window cells. t: 0 flat+box, 1 setbacks, 2 antenna, 3 slant, 4 dome, 5 pyramid, 6 deco crown.
  function building(b, rnd) {
    const { x0, w, h, z } = b, x1 = x0 + w, xc = x0 + w / 2, o = [x0, 0, z, x0, h, z], R = [[x0, x1, -1, h]];
    let top = h;
    const add = (...a) => { for (let i = 0; i < a.length; i += 2) o.push(a[i], a[i + 1], z); };
    switch (b.t) {
      case 1: { const s = w * 0.17, h1 = h, h2 = h + h * 0.1, h3 = h + h * 0.18;
        add(x0 + s, h1, x0 + s, h2, x0 + 2 * s, h2, x0 + 2 * s, h3, x1 - 2 * s, h3, x1 - 2 * s, h2, x1 - s, h2, x1 - s, h1, x1, h1);
        R.push([x0 + s, x1 - s, 0, h2], [x0 + 2 * s, x1 - 2 * s, 0, h3]); top = h3; break; }
      case 2: { const sp = b.sp || 2.5;
        add(xc - 0.4, h, xc - 0.4, h + 0.5, xc, h + 0.5, xc, h + 0.5 + sp, xc, h + 0.5, xc + 0.4, h + 0.5, xc + 0.4, h, x1, h);
        R.push([xc - 0.4, xc + 0.4, 0, h + 0.5], [xc - 0.05, xc + 0.05, 0, h + 0.5 + sp]); break; }
      case 3: { const d = Math.min(1.6, w * 0.45); add(x1, h - d); R[0][3] = h - d; R.push([x0, xc, 0, h - d / 2]); break; }
      case 4: { const ry = w * 0.32;
        arc(xc, h, z, w / 2, ry, Math.PI, Math.PI / 2, 6, o); add(xc, h + ry + 0.7, xc, h + ry); arc(xc, h, z, w / 2, ry, Math.PI / 2, 0, 6, o);
        R.push([x0 + w * 0.15, x1 - w * 0.15, 0, h + ry * 0.8], [xc - 0.05, xc + 0.05, 0, h + ry + 0.7]); top = h + ry; break; }
      case 5: { const ph = w * 0.55; add(xc, h + ph, x1, h); R.push([x0 + w * 0.3, x1 - w * 0.3, 0, h + ph * 0.5]); top = h + ph; break; }
      case 6: { const s = w * 0.14, a = h + 0.7, c = h + 1.5, sp = h + 3.2;
        add(x0 + s, h, x0 + s, a, x0 + 2 * s, a, x0 + 2 * s, c, xc, sp, x1 - 2 * s, c, x1 - 2 * s, a, x1 - s, a, x1 - s, h, x1, h);
        R.push([x0 + s, x1 - s, 0, a], [x0 + 2 * s, x1 - 2 * s, 0, c], [xc - 0.3, xc + 0.3, 0, sp - 0.6]); top = sp; break; }
      case 7: add(x1, h); break;
      default: { const a = x0 + w * (0.15 + rnd() * 0.3), bw = w * 0.3;
        add(a, h, a, h + 0.45, a + bw, h + 0.45, a + bw, h, x1, h); R.push([a, a + bw, 0, h + 0.45]); }
    }
    add(x1, 0);
    // window cells: rows of [xa, xb]
    const rows = [], ry = b.ry || 0.82, cw = b.cw || 0.62, m = 0.32;
    const nx = Math.max(1, Math.floor((w - 2 * m) / cw)), off = x0 + (w - nx * cw) / 2;
    const wTop = (b.t === 3 ? h - Math.min(1.6, w * 0.45) : h) - 0.55;
    for (let y = 0.85; y < wTop; y += ry) {
      const row = [];
      for (let k = 0; k < nx; k++) row.push([off + k * cw + cw * 0.2, off + k * cw + cw * 0.78, y]);
      rows.push(row);
    }
    return { o, R, rows, top };
  }
  // A skyline: outlines (strings per wall/roof edge) + lit window dashes (one string per row), serpentine rows.
  // style per building: 0 dashes, 1 vertical light strips, 2 lit floors.
  function skyline(list, o, rnd) {
    const paths = [], sils = [];
    let est = 0;
    for (const b of list) if (!b.ws) est += (b.w / 0.62) * (b.h / 0.82);
    const f = U.clamp(Math.sqrt(o.budget * 0.5 / 4.7 / Math.max(1, est * 0.8)), 1, 1.7);
    list = list.map((b) => Object.assign({ cw: 0.62 / f, ry: 0.82 / f }, b));
    const bs = list.map((b) => building(b, rnd));
    let cells = 0, cost = 0;
    bs.forEach((B, i) => { cost += B.o.length + 4; if ((list[i].ws || 0) === 0) for (const r of B.rows) cells += r.length; else cost += B.rows.length * 9; });
    const p = Math.min(0.8, Math.max(0, (o.budget - cost) * 0.8 / 4.7) / Math.max(1, cells));
    bs.forEach((B, i) => {
      const b = list[i], z = b.z, base = { c: o.c, seg: true, n: 0, g: o.g || null };
      paths.push(P(B.o, base));
      sils.push({ z, r: B.R });
      const win = { c: o.c, gv: o.gw, n: 0 }, ws = b.ws || 0;
      let dir = 1;
      if (ws === 0) {
        for (const r of B.rows) {
          let lit = r.filter(() => rnd() < p);
          if (dir < 0) lit = lit.reverse();
          lit.forEach((d, k) => paths.push(P(dir > 0 ? [d[0], d[2], z, d[1], d[2], z] : [d[1], d[2], z, d[0], d[2], z], Object.assign({ j: k > 0 }, win))));
          if (lit.length) dir = -dir;
        }
      } else if (ws === 1) {
        const n = B.rows.length ? B.rows[0].length : 0, yt = B.rows.length ? B.rows[B.rows.length - 1][0][2] : 0;
        for (let k = 0; k < n; k++) {
          if (rnd() < 0.3) continue;
          const x = (B.rows[0][k][0] + B.rows[0][k][1]) / 2, ya = 0.8 + rnd() * yt * 0.5, yb = Math.min(yt, ya + 1.5 + rnd() * yt);
          paths.push(P(dir > 0 ? [x, ya, z, x, yb, z] : [x, yb, z, x, ya, z], win)); dir = -dir;
        }
      } else if (ws === 2) {
        for (const r of B.rows) {
          if (rnd() < 0.45 || !r.length) continue;
          const a = r[0][0] + (rnd() < 0.5 ? 0 : (r[r.length - 1][1] - r[0][0]) * rnd() * 0.4), bb = r[r.length - 1][1];
          paths.push(P(dir > 0 ? [a, r[0][2], z, bb, r[0][2], z] : [bb, r[0][2], z, a, r[0][2], z], win)); dir = -dir;
        }
      }
    });
    return { paths, sils, tops: bs.map((B) => B.top) };
  }
  // Star directions: stratified in azimuth/elevation (denser near the centre), filtered by ok(x,y,z).
  function stars(rnd, n, E, az, el0, el1, ok) {
    const out = [], cand = [];
    const cols = Math.ceil(Math.sqrt(n * 4)), rows = Math.ceil(n * 3 / cols);
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      const u = (a + rnd()) / cols * 2 - 1, A = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * az;
      const e = el0 + (el1 - el0) * Math.pow((b + rnd()) / rows, 1.15), R = 120 + rnd() * 50;
      const x = E[0] + R * Math.sin(A) * Math.cos(e), y = E[1] + R * Math.sin(e), z = E[2] - R * Math.cos(A) * Math.cos(e);
      if (ok(x, y, z)) cand.push([x, y, z]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    for (let i = 0; i < n; i++) out.push(cand[i % Math.max(1, cand.length)] || [E[0], E[1] + 60, E[2] - 120]);
    return out;
  }
  // Nearest-neighbour tour starting nearest to s.
  function tour(pts, s) {
    const left = pts.slice(), out = [];
    let c = s;
    while (left.length) {
      let bi = 0, bd = 1e18;
      for (let i = 0; i < left.length; i++) { const d = (left[i][0] - c[0]) ** 2 + (left[i][1] - c[1]) ** 2 * 1.5; if (d < bd) { bd = d; bi = i; } }
      c = left[bi]; out.push(c); left.splice(bi, 1);
    }
    return out;
  }
  // Sky retrace: dwell stars joined by blank hops, with the secret blank text in the middle.
  function sky(st, from, secret, cStar, cText) {
    const R = st.filter((p) => p[0] >= secret.cx), L = st.filter((p) => p[0] < secret.cx), paths = [];
    for (const p of tour(R, from)) paths.push(P(p.slice(), { k: KIND.STAR, c: cStar, ns: true }));
    const a = paths.length;
    for (const s of WireFont.layout(WireFont.norm(secret.text), secret.cx, secret.cy, secret.z, secret.w, 9)) paths.push(P(s.p, { sec: true, c: cText }));
    const b = paths.length;
    for (const p of tour(L, [secret.cx - secret.w / 2, secret.cy])) paths.push(P(p.slice(), { k: KIND.STAR, c: cStar, ns: true }));
    return { paths, sub: ['secret', a, b] };
  }
  return { P, arc, cut, visible, disc, ridge, building, skyline, stars, tour, sky };
})();
