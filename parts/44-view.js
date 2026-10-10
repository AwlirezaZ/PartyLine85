// 44-view.js — View: camera springs (§5.5), screen<->scene mapping, CPU projection mirroring the shader's
// kind transforms, and the screen-space spatial hash with nearest + strum-segment queries (§5.6).
const View = (() => {
  const S = CoreS, CA = CFG.CAMERA, SP = CFG.SPRING, CELL = CFG.INPUT.HASH_CELL, TAU = U.TAU;
  const rest = { eye: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 0, swayAmp: 0, swayPeriod: 0 };
  const eye = [new Spring(0, SP.CAMERA), new Spring(0, SP.CAMERA), new Spring(0, SP.CAMERA)];
  const tgt = [new Spring(0, SP.CAMERA), new Spring(0, SP.CAMERA), new Spring(0, SP.CAMERA)];
  const fov = new Spring(0.87, SP.CAMERA), sway = new Spring(0, 1.5), ss = new Spring(0, 0.5);
  const parX = new Spring(0, SP.PARALLAX), parY = new Spring(0, SP.PARALLAX), zoom = new Spring(0, SP.ZOOM);
  const zfx = new Spring(0, SP.ZOOM), zfy = new Spring(0, SP.ZOOM), kick = new Spring(0, 38, 0.42);
  const reflS = new Spring(0, 3), RF = [0.6, 0.35, 0];   // floor reflection gain per exchange (Meridian, Tide, Long)
  const springs = [eye[0], eye[1], eye[2], tgt[0], tgt[1], tgt[2], fov, sway, ss, parX, parY, zoom, zfx, zfy, kick, reflS];
  const view = M4.create(), prj = M4.create(), E = new Float32Array(3), T = new Float32Array(3), UP = [0, 1, 0];
  const o3 = new Float32Array(3), h3 = new Float32Array(3);
  let ex = 0;
  function setExchange(e, snap) {
    ex = e;
    CFG.cameraRest(e, S.aspect, rest);
    for (let i = 0; i < 3; i++) { eye[i].to(rest.eye[i]); tgt[i].to(rest.target[i]); if (snap) { eye[i].set(rest.eye[i]); tgt[i].set(rest.target[i]); } }
    fov.to(rest.fov); sway.to(rest.swayAmp); if (snap) { fov.set(rest.fov); sway.set(rest.swayAmp); }
  }
  function step(h) { for (let i = 0; i < springs.length; i++) springs[i].step(h); }
  function update(rt, calm, screensaver) {
    for (let i = 0; i < 3; i++) { E[i] = eye[i].x; T[i] = tgt[i].x; }
    ss.to(screensaver && !calm ? 1 : 0);
    if (!calm) {
      E[0] += parX.x * CA.PARALLAX_X + CA.DRIFT[0] * Math.sin(TAU * CA.DRIFT_HZ[0] * rt);
      E[1] += parY.x * CA.PARALLAX_Y + CA.DRIFT[1] * Math.sin(TAU * CA.DRIFT_HZ[1] * rt) + kick.x;
      E[2] += ss.x * CA.SCREENSAVER_AMP * Math.sin(TAU * rt / CA.SCREENSAVER_PERIOD);
      const a = sway.x * (rest.swayPeriod > 0 ? Math.sin(TAU * rt / rest.swayPeriod) : 0);
      if (a) {
        const dx = E[0] - T[0], dz = E[2] - T[2], c = Math.cos(a), s = Math.sin(a);
        E[0] = T[0] + dx * c + dz * s; E[2] = T[2] - dx * s + dz * c;
      }
    }
    const z = zoom.x;
    if (z > 0) {
      // Dolly = translate eye AND target forward at constant height (eye z 6 -> -22 at z = 1), keeping the
      // orientation. Lerping the eye toward the target sank it under the floor in portrait (target below y = 0).
      const dz = (CA.ZOOM_EYE_Z_IN - CFG.EXCHANGES[ex].camera.eye[2]) * z;
      E[2] += dz; T[2] += dz;
      const lx = zfx.x * CA.ZOOM_LATERAL * z, ly = zfy.x * CA.ZOOM_LATERAL * 0.45 * z;
      E[0] += lx; T[0] += lx; E[1] += ly; T[1] += ly;
    }
    M4.perspective(prj, fov.x, S.aspect, CA.NEAR, CA.FAR);
    M4.lookAt(view, E, T, UP);
    M4.mul(S.vp, prj, view);
    S.camR[0] = view[0]; S.camR[1] = view[4]; S.camR[2] = view[8];
    S.camU[0] = view[1]; S.camU[1] = view[5]; S.camU[2] = view[9];
    S.eye[0] = E[0]; S.eye[1] = E[1]; S.eye[2] = E[2];
    S.focal = S.cssH * 0.5 / Math.tan(fov.x * 0.5);
    S.deskE = U.smoothstep(0, 1, U.sat(-z));
    // Floor reflection for the CRT composite: horizon in scene uv (a floor point 60 ahead). Gain follows the
    // unravel/knit blend down at once (none in Long Distance) and springs back up after landing; ripple frozen in calm.
    const rf = (RF[S.exA] * (1 - S.K) + RF[S.exB] * S.K) * (1 - S.U);
    reflS.to(rf);
    if (proj(E[0], 0, E[2] - 60, h3)) { S.refl[0] = 1 - h3[1] / S.cssH; S.refl[1] = Math.min(rf, reflS.x); } else S.refl[1] = 0;
    S.refl[2] = calm ? 0 : rt;
  }
  // Output CSS px -> scene CSS px (desk rect + barrel, exactly as crt.frag samples). Returns true inside the tube.
  function toScene(x, y, out) {
    const e = S.deskE, k = S.barrel, hs = 0.5 * (1 + (S.deskScale - 1) * e), cy = 0.5 + (S.deskCY - 0.5) * e;
    const qx = (x / S.cssW - 0.5) / hs, qy = (1 - y / S.cssH - cy) / hs, f = (1 + k * (qx * qx + qy * qy)) / (1 + k);
    out[0] = (qx * f * 0.5 + 0.5) * S.cssW; out[1] = (0.5 - qy * f * 0.5) * S.cssH;
    return Math.abs(qx * f) <= 1 && Math.abs(qy * f) <= 1;
  }
  function proj(x, y, z, out) {
    if (M4.project(S.vp, x, y, z, out) <= 0.05) return false;
    out[0] = (out[0] * 0.5 + 0.5) * S.cssW; out[1] = (0.5 - out[1] * 0.5) * S.cssH;
    return true;
  }
  // World position at scene px (x,y) and view depth D.
  function unproject(x, y, D, out) {
    const fx = -view[2], fy = -view[6], fz = -view[10], kx = (x - S.cssW * 0.5) * D / S.focal, ky = (y - S.cssH * 0.5) * D / S.focal;
    for (let i = 0; i < 3; i++) out[i] = S.eye[i] + (i === 0 ? fx : i === 1 ? fy : fz) * D + S.camR[i] * kx - S.camU[i] * ky;
    return out;
  }
  // Sun point hidden by a mountain ridge or a solid (billboard, clock tower), seen from the live eye.
  function sunHid(oc, x, y, z) {
    const e = S.eye, dx = x - e[0], dy = y - e[1], dz = z - e[2], R = oc.rect;
    for (let r = 0; r < 2; r++) {
      const t = (oc.rz[r] - e[2]) / dz, qy = e[1] + dy * t, u = U.clamp((e[0] + dx * t + 18) * 47 / 36, 0, 47);
      const i0 = Math.floor(u), i1 = Math.min(i0 + 1, 47), h = oc.ridge[r * 48 + i0];
      if (qy < h + (oc.ridge[r * 48 + i1] - h) * (u - i0)) return true;
    }
    for (let j = 0; j < 16; j += 4) {
      const t = (oc.z[j >> 2] - e[2]) / dz, qx = e[0] + dx * t, qy = e[1] + dy * t;
      if (qx > R[j] && qx < R[j + 1] && qy > R[j + 2] && qy < R[j + 3]) return true;
    }
    return false;
  }
  // Point i of wd with its kind transform (CPU mirror of kxf). false = hidden (sun under the horizon or occluded);
  // out is filled either way.
  function xf(wd, i, out) {
    const f = wd.f32, b = i * 6, pv = World.piv;
    let x = f[b], y = f[b + 1], z = f[b + 2], c, s, dx, dy, a, vis = true;
    switch (wd.u8[i * 24 + 21]) {
      case 1: z += U.mod(S.scroll, 2) + S.floorQ * (z + U.mod(S.scroll, 2) + 70); break;
      case 2: z += S.floorQ * (z + 70); break;
      case 4: y += S.sunRise - 6; vis = y >= 0 && !(wd.occ && sunHid(wd.occ, x, y, z)); break;
      case 5: case 6:
        a = wd.u8[i * 24 + 21] === 5 ? S.clock[0] : S.clock[1]; c = Math.cos(a); s = Math.sin(a);
        dx = x - pv.clock[0]; dy = y - pv.clock[1]; x = pv.clock[0] + dx * c + dy * s; y = pv.clock[1] - dx * s + dy * c; break;
      case 8: {
        const t = S.t;
        z += S.floorQ * (z + 70);
        y += 0.35 * Math.sin(0.21 * x + 0.9 * t) + 0.22 * Math.sin(0.37 * z - 1.3 * t) + 0.12 * Math.sin(0.8 * x + 0.5 * z + 2.1 * t); break;
      }
      case 9: case 10: {
        const p = wd.u8[i * 24 + 21] === 9 ? pv.lighthouse : pv.planet;
        a = wd.u8[i * 24 + 21] === 9 ? S.lhAng : S.planetAng; c = Math.cos(a); s = Math.sin(a);
        dx = x - p[0]; dy = z - p[2]; x = p[0] + dx * c + dy * s; z = p[2] - dx * s + dy * c; break;
      }
      case 11:
        a = S.galaxyAng; c = Math.cos(a); s = Math.sin(a); dx = x - pv.galaxy[0]; dy = y - pv.galaxy[1];
        x = pv.galaxy[0] + dx * c - dy * s; y = pv.galaxy[1] + dx * s + dy * c; break;
      case 12: x += S.probe[0]; y += S.probe[1]; z += S.probe[2]; break;
      default: break;
    }
    out[0] = x; out[1] = y; out[2] = z;
    return vis;
  }
  function projPoint(wd, i, out) { return xf(wd, i, o3) && proj(o3[0], o3[1], o3[2], out); }
  // ---------------------------------------------------------------- spatial hash
  let list = new Int32Array(0), nList = 0, px = new Float32Array(0), py = new Float32Array(0), ok = new Uint8Array(0), cj = new Int32Array(0);
  let stride = 2, listWd = null, cols = 1, rows = 1, cellStart = new Int32Array(2), cellItems = new Int32Array(0), built = -1, cur = 0;
  const SLICES = 3;
  const pp = new Float32Array(3);
  function setWire(wd, st) {
    // Stride >= 2: samples are a few px apart against a 28-56 px snap radius, and strums test segment pairs.
    listWd = wd; stride = Math.max(2, st | 0); nList = 0; built = -1; cur = 0;
    if (!wd) return;
    if (list.length < wd.N) { list = new Int32Array(wd.N); px = new Float32Array(wd.N); py = new Float32Array(wd.N); ok = new Uint8Array(wd.N); cj = new Int32Array(wd.N); cellItems = new Int32Array(wd.N); }
    for (let i = 0; i < wd.N; i += stride) {
      const fl = wd.u8[i * 24 + 22], k = wd.u8[i * 24 + 21];
      if (wd.pointString[i] !== 0xFFFF && !(fl & FLAG.BLANK) && k !== KIND.STAR) list[nList++] = i;
    }
  }
  function resize() {
    cols = Math.max(1, Math.ceil(S.cssW / CELL)); rows = Math.max(1, Math.ceil(S.cssH / CELL));
    if (cellStart.length < cols * rows + 1) cellStart = new Int32Array(cols * rows + 1);
    built = -1; cur = 0;
  }
  // Re-project list[j0..j1) into px/py/ok.
  function projRange(j0, j1) {
    const wd = listWd, f32 = wd.f32, u8 = wd.u8, rev = S.sign[0];
    for (let j = j0; j < j1; j++) {
      const i = list[j];
      ok[j] = 0;
      if ((u8[i * 24 + 22] & FLAG.BILLBOARD) && f32[i * 6 + 4] >= rev) continue;
      if (!projPoint(wd, i, pp)) continue;
      const x = pp[0], y = pp[1];
      if (x < -CELL || y < -CELL || x > S.cssW + CELL || y > S.cssH + CELL) continue;
      px[j] = x; py[j] = y; ok[j] = 1; cj[j] = cellOf(x, y);
    }
  }
  // Called every frame while hovering / a finger is down. Continuous use re-projects one third of the list per
  // frame (points move < 1 px/frame under drift) and re-buckets everything (cheap); a cold call (first use after a
  // gap, new wire, resize, or force) projects the whole list at once.
  function ensureHash(frameNo, force) {
    if (!listWd || (built === frameNo && !force)) return;
    const cold = force || built < 0 || frameNo < built || frameNo - built > 2;
    built = frameNo;
    if (cold) { projRange(0, nList); cur = 0; }
    else { const j1 = Math.min(nList, cur + Math.ceil(nList / SLICES)); projRange(cur, j1); cur = j1 >= nList ? 0 : j1; }
    const nc = cols * rows;
    cellStart.fill(0, 0, nc + 1);
    for (let j = 0; j < nList; j++) if (ok[j]) cellStart[cj[j] + 1]++;
    for (let c = 0; c < nc; c++) cellStart[c + 1] += cellStart[c];
    for (let j = 0; j < nList; j++) if (ok[j]) cellItems[cellStart[cj[j]]++] = j;
    for (let c = nc; c > 0; c--) cellStart[c] = cellStart[c - 1];
    cellStart[0] = 0;
  }
  function cellOf(x, y) {
    const cx = U.clamp(Math.floor(x / CELL), 0, cols - 1), cy = U.clamp(Math.floor(y / CELL), 0, rows - 1);
    return cy * cols + cx;
  }
  const hit = { i: -1, j: -1, d: 0, x: 0, y: 0 };
  // Nearest eligible point within radius r (scene px). Fills `hit`; returns the point index or -1.
  function nearest(x, y, r) {
    hit.i = hit.j = -1; let bd = r * r;
    const cr = Math.ceil(r / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let gy = Math.max(0, cy - cr); gy <= Math.min(rows - 1, cy + cr); gy++) {
      for (let gx = Math.max(0, cx - cr); gx <= Math.min(cols - 1, cx + cr); gx++) {
        const c = gy * cols + gx;
        for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
          const j = cellItems[k], dx = px[j] - x, dy = py[j] - y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; hit.j = j; }
        }
      }
    }
    if (hit.j >= 0) { hit.i = list[hit.j]; hit.d = Math.sqrt(bd); hit.x = px[hit.j]; hit.y = py[hit.j]; }
    return hit.i;
  }
  // Strings crossed by the segment (x0,y0)->(x1,y1), sorted along it.
  const X = { n: 0, str: new Int32Array(32), pt: new Int32Array(32), t: new Float32Array(32), x: new Float32Array(32) }, XA = [X.t, X.str, X.pt, X.x];
  function crossings(x0, y0, x1, y1) {
    X.n = 0;
    if (!listWd) return X;
    const ps = listWd.pointString;
    const gx0 = Math.max(0, Math.floor(Math.min(x0, x1) / CELL) - 1), gx1 = Math.min(cols - 1, Math.floor(Math.max(x0, x1) / CELL) + 1);
    const gy0 = Math.max(0, Math.floor(Math.min(y0, y1) / CELL) - 1), gy1 = Math.min(rows - 1, Math.floor(Math.max(y0, y1) / CELL) + 1);
    const rx = x1 - x0, ry = y1 - y0;
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const c = gy * cols + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const j = cellItems[k];
        if (j + 1 >= nList || !ok[j + 1] || list[j + 1] !== list[j] + stride) continue;
        const sid = ps[list[j]];
        if (ps[list[j + 1]] !== sid) continue;
        const sx = px[j + 1] - px[j], sy = py[j + 1] - py[j], den = rx * sy - ry * sx;
        if (den > -1e-9 && den < 1e-9) continue;
        const qx = px[j] - x0, qy = py[j] - y0, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        let m = 0;
        while (m < X.n && X.str[m] !== sid) m++;
        if (m < X.n) { if (t < X.t[m]) { X.t[m] = t; X.pt[m] = list[j]; } continue; }
        if (X.n >= 32) continue;
        X.str[X.n] = sid; X.pt[X.n] = list[j]; X.t[X.n] = t; X.x[X.n] = x0 + rx * t; X.n++;
      }
    }
    for (let a = 1; a < X.n; a++) {   // insertion sort by t
      for (let b = a; b > 0 && X.t[b] < X.t[b - 1]; b--) for (const A of XA) { const tmp = A[b]; A[b] = A[b - 1]; A[b - 1] = tmp; }
    }
    return X;
  }
  // Screen bbox of an element range (+pad) contains (x,y)?
  function inRange(wd, r, x, y, pad) {
    if (!wd || !r) return false;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = r.i0; i < r.i1; i++) {
      if (wd.u8[i * 24 + 22] & FLAG.BLANK) continue;
      if (!projPoint(wd, i, pp)) continue;
      if (pp[0] < x0) x0 = pp[0]; if (pp[0] > x1) x1 = pp[0]; if (pp[1] < y0) y0 = pp[1]; if (pp[1] > y1) y1 = pp[1];
    }
    return x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  }
  return {
    setExchange, step, update, toScene, proj, unproject, xf, projPoint, setWire, resize, ensureHash, nearest, crossings, inRange, hit,
    parX, parY, zoom, zfx, zfy, kick,
  };
})();
