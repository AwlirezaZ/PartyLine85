// 42-render.js — Renderer: programs, buffers, targets and the per-frame pass list (§5.3).
const Renderer = (() => {
  const S = CoreS;
  let gl = null, canvas = null, P = {}, vbo = [null, null, null], vboN = [0, 0, 0], tfBuf = null, tfo = null, tfN = 0;
  let vaoTF = null, vaoBeam = null, vaoInl = null, inline = false, tfChecked = false, curA = -1, curB = -1, N = 0;
  let scene = null, pers = [null, null], pi = 0, mips = [], avg = [], badge = null;
  let rsW = 1, rsH = 1, halfP = false, nMips = 5, lost = false, sceneClear = false;
  const C = CFG.COL.lin;
  function initGL(cv) {
    canvas = cv;
    gl = GL.init(cv);
    if (!gl) return false;
    P.crt = GL.program('crt', Shaders.TRI, Shaders.CRT);
    gl.getProgramParameter(P.crt.p, gl.LINK_STATUS);
    if (!GL.ready(P.crt)) return false;
    badge = makeBadge();
    return true;
  }
  function compileRest() {
    P.tf = GL.program('wire_tf', Shaders.TF_VS, Shaders.TF_FS, Shaders.ATTR, ['v_pos', 'v_col']);
    P.beam = GL.program('beam', Shaders.BEAM_VS, Shaders.BEAM_FS, ['aP0', 'aC0', 'aP1', 'aC1']);
    P.persist = GL.program('persist', Shaders.TRI, Shaders.PERSIST);
    P.bright = GL.program('bright', Shaders.TRI, Shaders.BRIGHT);
    P.kdown = GL.program('kdown', Shaders.TRI, Shaders.KDOWN);
    P.kup = GL.program('kup', Shaders.TRI, Shaders.KUP);
    if (inline) P.inl = GL.program('beam_inline', Shaders.BEAM_INL_VS, Shaders.BEAM_FS, Shaders.INL_ATTR);
  }
  function goInline() {
    if (inline) return;
    inline = true;
    P.inl = GL.program('beam_inline', Shaders.BEAM_INL_VS, Shaders.BEAM_FS, Shaders.INL_ATTR);
    curA = curB = -1;
  }
  function makeBadge() {
    let t = null;
    try {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
      const x = cv.getContext('2d');
      const draw = () => {
        x.clearRect(0, 0, 256, 32); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '22px VT323, "Courier New", monospace'; x.fillText(CFG.TEXT.badge, 128, 17);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      };
      t = GL.tex(256, 32, false, null); draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!lost && gl && t) try { draw(); } catch (e) { /* ignore */ } });
    } catch (e) { t = null; }
    return t;
  }
  // ---------------------------------------------------------------- sizing
  function resize(bw, bh, rs, half, mipsN) {
    if (!gl) return;
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    rsW = Math.max(16, Math.round(bw * rs)); rsH = Math.max(16, Math.round(bh * rs)); halfP = half; nMips = mipsN;
    GL.drop(scene); GL.drop(pers[0]); GL.drop(pers[1]);
    for (const m of mips) GL.drop(m);
    for (const a of avg) GL.drop(a);
    scene = GL.target(rsW, rsH, true);
    const pw = half ? rsW >> 1 : rsW, ph = half ? rsH >> 1 : rsH;
    pers = [GL.target(pw, ph, true), GL.target(pw, ph, true)];
    for (const p of pers) { GL.into(p); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    mips = []; let w = rsW >> 1, h = rsH >> 1;
    for (let i = 0; i < nMips; i++) { mips.push(GL.target(w, h, true)); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
    avg = [];
    while (w > 1 || h > 1) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); avg.push(GL.target(w, h, true)); }
    if (!avg.length) avg.push(GL.target(1, 1, true));
    GL.into(null);
  }
  // ---------------------------------------------------------------- wire buffers
  function uploadWire(ex, wd) {
    if (!gl) return;
    if (!vbo[ex]) vbo[ex] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo[ex]);
    gl.bufferData(gl.ARRAY_BUFFER, wd.vbo, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    vboN[ex] = wd.N;
    if (ex === curA || ex === curB) curA = curB = -1;
  }
  function uploadSign(ex, wd, r) {
    if (!gl || !vbo[ex] || !r) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo[ex]);
    gl.bufferSubData(gl.ARRAY_BUFFER, r.byteOffset, new Uint8Array(wd.vbo, r.byteOffset, r.byteLength));
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  function attr4(loc, buf, off, div) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(loc + i);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 24, off);
    gl.vertexAttribPointer(loc + 1, 4, gl.BYTE, true, 24, off + 12);
    gl.vertexAttribPointer(loc + 2, 1, gl.FLOAT, false, 24, off + 16);
    gl.vertexAttribIPointer(loc + 3, 4, gl.UNSIGNED_BYTE, 24, off + 20);
    for (let i = 0; i < 4; i++) gl.vertexAttribDivisor(loc + i, div);
  }
  function bindAB(a, b) {
    if (a === curA && b === curB && N === vboN[a]) return;
    curA = a; curB = b; N = vboN[a];
    if (vboN[b] !== N) b = a;
    if (!vaoTF) { vaoTF = gl.createVertexArray(); vaoBeam = gl.createVertexArray(); vaoInl = gl.createVertexArray(); tfo = gl.createTransformFeedback(); }
    gl.bindVertexArray(vaoTF); attr4(0, vbo[a], 0, 0); attr4(4, vbo[b], 0, 0);
    gl.bindVertexArray(vaoInl); attr4(0, vbo[a], 0, 1); attr4(4, vbo[b], 0, 1); attr4(8, vbo[a], 24, 1); attr4(12, vbo[b], 24, 1);
    if (tfN !== N) {
      if (!tfBuf) tfBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tfBuf); gl.bufferData(gl.ARRAY_BUFFER, N * 32, gl.DYNAMIC_COPY); tfN = N;
      gl.bindVertexArray(vaoBeam);
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(i, 1);
      }
    }
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  // ---------------------------------------------------------------- uniforms
  function v3(u, a, i) { gl.uniform3f(u, a[i], a[i + 1], a[i + 2]); }
  function simUniforms(u) {
    gl.uniformMatrix4fv(u.uVP, false, S.vp);
    gl.uniform4f(u.uView, S.cssW, S.cssH, S.focal, N);
    v3(u.uCamR, S.camR, 0); v3(u.uCamU, S.camU, 0);
    gl.uniform4f(u.uTime, S.t, S.rt, S.hats, S.bead);
    gl.uniform3fv(u.uPalA, S.palA); gl.uniform3fv(u.uPalB, S.palB);
    v3(u.uHeatA, S.heatA, 0); v3(u.uHeatB, S.heatB, 0); v3(u.uCoreA, S.coreA, 0); v3(u.uCoreB, S.coreB, 0);
    v3(u.uLineCol, S.lineCol, 0); v3(u.uTintC, C.focus, 0); v3(u.uTintM, C.accent, 0); v3(u.uSlowC, C.slowHead, 0);
    gl.uniform4f(u.uMorph, S.U, S.K, S.G, S.calm);
    v3(u.uLineA, S.lineA, 0); v3(u.uLineB, S.lineB, 0); v3(u.uLinePull, S.linePull, 0); v3(u.uLineUp, S.lineUp, 0);
    gl.uniform4fv(u.uPull, S.pull);
    gl.uniform4f(u.uKinA, S.scroll, S.sunRise, S.lhAng, S.planetAng);
    gl.uniform4f(u.uKinB, S.galaxyAng, World.piv.moonX, S.clock[0], S.clock[1]);
    const pv = World.piv;
    v3(u.uClockC, pv.clock, 0); v3(u.uLhC, pv.lighthouse, 0); v3(u.uPlanetC, pv.planet, 0); v3(u.uGalaxyC, pv.galaxy, 0);
    v3(u.uProbeOff, S.probe, 0);
    gl.uniform4fv(u.uBands, S.bands);
    gl.uniform4fv(u.uPkA, S.pkA); gl.uniform4fv(u.uPkB, S.pkB);
    gl.uniform4fv(u.uStr, S.str); gl.uniform4fv(u.uStrF, S.strF);
    gl.uniform2i(u.uCount, S.nPk, S.nStr);
    gl.uniform4fv(u.uHov, S.hov); gl.uniform4fv(u.uMag, S.mag); gl.uniform4fv(u.uPing, S.ping);
    gl.uniform4fv(u.uAlpha, S.alpha); gl.uniform4fv(u.uSlow, S.slow); gl.uniform2fv(u.uSign, S.sign); gl.uniform1f(u.uFloorQ, S.floorQ);
  }
  function beamUniforms(u, scaleOut) {
    const sig = Math.max(0.6, 0.75 * S.dpr * S.rs * (1 + 0.06 * S.kickEnv));
    gl.uniform4f(u.uTgt, rsW, rsH, sig, scaleOut);
  }
  // ---------------------------------------------------------------- frame
  function frame() {
    if (!gl || lost) return;
    const fl = scene.fl, sIn = fl ? 1 : 4, sOut = 1 / sIn;
    const wireOn = S.wireReady && vbo[S.exA] && GL.ready(P.beam) && (inline ? GL.ready(P.inl) : GL.ready(P.tf));
    if (wireOn) bindAB(S.exA, S.exB);
    // 1-2: wire sim + beam
    GL.into(scene);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (wireOn && N > 1) {
      if (!inline) {
        const u = GL.use(P.tf); simUniforms(u);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.bindVertexArray(vaoTF);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfo);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tfBuf);
        if (!tfChecked) gl.getError();
        gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, N); gl.endTransformFeedback();
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.disable(gl.RASTERIZER_DISCARD);
        if (!tfChecked) { tfChecked = true; if (gl.getError() !== gl.NO_ERROR) { goInline(); gl.bindVertexArray(null); return; } }
        const ub = GL.use(P.beam); beamUniforms(ub, sOut);
        gl.uniformMatrix4fv(ub.uVP, false, S.vp);
        gl.bindVertexArray(vaoBeam);
      } else {
        const u = GL.use(P.inl); simUniforms(u); beamUniforms(u, sOut);
        gl.bindVertexArray(vaoInl);
      }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N - 1);
      gl.disable(gl.BLEND);
    }
    // 3: persistence
    let img = scene;
    if (GL.ready(P.persist)) {
      const prev = pers[pi], dst = pers[pi ^ 1];
      GL.into(dst); const u = GL.use(P.persist);
      GL.bindTex(0, scene.t); GL.bindTex(1, prev.t);
      gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uPrev, 1);
      if (S.clearTrails > 0) gl.uniform3f(u.uDec, 0, 0, 0); else gl.uniform3fv(u.uDec, S.dec);
      gl.uniform1f(u.uEps, fl ? CFG.VIS.EPS_FLOAT : CFG.VIS.EPS_RGBA8);
      GL.drawTri(); pi ^= 1; img = dst;
    }
    // 4-7: bloom + average colour
    const bloomOn = GL.ready(P.bright) && GL.ready(P.kdown) && GL.ready(P.kup) && mips.length > 0;
    let n = 0;
    if (bloomOn) {
      n = mips.length;
      GL.into(mips[0]); let u = GL.use(P.bright); GL.bindTex(0, img.t); gl.uniform1i(u.uSrc, 0);
      gl.uniform4f(u.uP, 1 / img.w, 1 / img.h, sIn, sOut); GL.drawTri();
      u = GL.use(P.kdown); gl.uniform1i(u.uSrc, 0);
      for (let i = 1; i < n; i++) { GL.into(mips[i]); GL.bindTex(0, mips[i - 1].t); gl.uniform2f(u.uH, 1 / mips[i - 1].w, 1 / mips[i - 1].h); GL.drawTri(); }
      let src = mips[n - 1];
      for (let i = 0; i < avg.length; i++) { GL.into(avg[i]); GL.bindTex(0, src.t); gl.uniform2f(u.uH, 1 / src.w, 1 / src.h); GL.drawTri(); src = avg[i]; }
      u = GL.use(P.kup); gl.uniform1i(u.uSrc, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = n - 2; i >= 0; i--) { GL.into(mips[i]); GL.bindTex(0, mips[i + 1].t); gl.uniform2f(u.uH, 0.5 / mips[i + 1].w, 0.5 / mips[i + 1].h); GL.drawTri(); }
      gl.disable(gl.BLEND);
    }
    // 8: composite
    GL.into(null);
    const u = GL.use(P.crt);
    GL.bindTex(0, img.t); GL.bindTex(1, bloomOn ? mips[0].t : null); GL.bindTex(2, bloomOn ? mips[n - 1].t : null);
    GL.bindTex(3, bloomOn ? avg[avg.length - 1].t : null); GL.bindTex(4, badge);
    gl.uniform1i(u.uPersist, 0); gl.uniform1i(u.uBloom, 1); gl.uniform1i(u.uWide, 2); gl.uniform1i(u.uAvg, 3); gl.uniform1i(u.uBadge, 4);
    composite(u, sIn, n);
    GL.drawTri();
  }
  function composite(u, sIn, n) {
    gl.uniform4f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight, S.cssW, S.cssH);
    gl.uniform4f(u.uA, S.rt, S.deskE, S.barrel, S.deskScale);
    gl.uniform4fv(u.uFr, S.fringe);
    gl.uniform4f(u.uB, S.misconv, sIn, n ? S.bloom * 2.2 / n : 0, n ? 0.35 : 0);
    gl.uniform4fv(u.uDeg, S.deg); gl.uniform4fv(u.uPow, S.power); gl.uniform4fv(u.uDot, S.dot);
    gl.uniform4fv(u.uRet, S.ret); gl.uniform4fv(u.uGh, S.gh); gl.uniform4fv(u.uRing, S.ring);
    gl.uniform4fv(u.uFin, S.fin); gl.uniform4f(u.uMisc, S.konami, S.calm ? 0 : (S.rt * 60) % 97, S.deskCY, 0);
    v3(u.uGlass, C.glass, 0); v3(u.uWall, C.wall, 0); v3(u.uBezel, C.bezel, 0); v3(u.uFocus, C.focus, 0);
    v3(u.uGhostC, C.ghost, 0); v3(u.uJuneC, C.june, 0); v3(u.uHot, S.coreA, 0);
    v3(u.uK1, C.konamiTop, 0); v3(u.uK2, C.konamiMid, 0); v3(u.uK3, C.konamiBot, 0);
  }
  // First frame: glass + the analytic dot, before anything else exists.
  function firstFrame() {
    if (!gl) return;
    GL.into(null);
    const u = GL.use(P.crt);
    for (let i = 0; i < 5; i++) GL.bindTex(i, null);
    gl.uniform1i(u.uPersist, 0); gl.uniform1i(u.uBloom, 1); gl.uniform1i(u.uWide, 2); gl.uniform1i(u.uAvg, 3); gl.uniform1i(u.uBadge, 4);
    composite(u, 1, 0);
    GL.drawTri();
  }
  function ready() { return { tf: GL.ready(P.tf) || inline, beam: GL.ready(P.beam), persist: GL.ready(P.persist), bloom: GL.ready(P.kup) }; }
  function setLost(v) { lost = v; }
  // Context restored: everything GPU-side is rebuilt from JS state.
  function restore(wds) {
    lost = false; GL.setup(); P = {}; vbo = [null, null, null]; vboN = [0, 0, 0]; tfBuf = null; tfo = null; tfN = 0;
    vaoTF = vaoBeam = vaoInl = null; curA = curB = -1; tfChecked = false; scene = null; pers = [null, null]; mips = []; avg = [];
    P.crt = GL.program('crt', Shaders.TRI, Shaders.CRT); gl.getProgramParameter(P.crt.p, gl.LINK_STATUS); GL.ready(P.crt);
    badge = makeBadge();
    compileRest();
    for (let e = 0; e < 3; e++) if (wds[e]) uploadWire(e, wds[e]);
  }
  return {
    initGL, compileRest, resize, uploadWire, uploadSign, frame, firstFrame, ready, restore, setLost,
    get gl() { return gl; }, get floatRT() { return GL.floatRT; }, get inline() { return inline; },
  };
})();
