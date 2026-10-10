// 40-gl.js — Core: shared frame state (CoreS) + GL kit (owner: core).
// CONTRACT NOTES:
// - TF buffer v_col.a carries "ink" (1 = drawn point, 0 = blank hop) instead of a depth fade, and v_pos.w packs
//   heat + 16*dwellLevel (dwell-dot weight, 0..31). Both are Core-internal; the 32 B interleaved layout is unchanged.
// - Beam uses an along-segment Gaussian integral (logistic CDF) so consecutive segments tile with no beading;
//   dwell duplicates add explicit round hot dots. Profile, sigma and half-extent (3σ+1 px) follow spec §5.4.
// - All three exchanges keep their own resident VBO (superset of "A and B"); A/B are bindings, not copies.
// - Context restore re-uploads the existing WireData bytes (identical to a fresh Wire.build, but keeps the sign text).
// - `D` is the degauss shortcut, so WASD reticle movement is W/A/S only (ArrowRight moves right).
// - Double-tap degausses in empty space; on a string the two taps stay two plucks (fast repeated notes stay musical).
//   The payphone double-tap (handset) always wins.
// - Pointer → world mapping applies the composite's barrel + desk transform, so taps land on what is seen.
// - Portrait: FLOOR_H/FLOOR_V/SEA z is stretched affinely toward the camera by the portrait pull-back (uFloorQ, mirrored
//   in hit tests) so the bottom of a phone screen is not empty. Seamless: line spacing stays uniform.
// - Secret sky text idles at 0.35×BLANK_ALPHA (ping flash ×0.2) so it stays secret; retrace still shows it at 1.0.
// - The A↔B swap happens when uK reaches 1 at `land` (time-based); KNIT_LAND only adds a bloom accent.
// - Desk view scales the screen uniformly (0.6 landscape / 0.66 portrait) so the picture is never squashed; in portrait
//   the TV sits higher (centre 0.6 instead of 0.56, uMisc.z) and the handset shrinks so both clear the controls row.
// - Integration: fog is 1 -> 0.75 (not 0.25) for hero points (RESONATOR flag, or GALAXY kind), so the sun, moon and
//   galaxy at depth 80-110 keep their glow. Zoom-in is a dolly (eye and target translate in z at constant height):
//   lerping the eye toward the target sank it under the floor in portrait. Pick-up passes the gesture time to
//   Sound.startHandshake(first, atMs) so the 2.4 s timeline is measured from the touch, not from after the
//   AudioContext unlock; the touch-point hash lookup runs after the sound has started.
// - Governor holds are wall-time; step-up also accepts vsync-bound frames with < 5 ms main-thread work; an EMA above
//   3×DOWN_MS drops a whole N tier (2.5 s spacing). Phosphor decay uses the real frame time (cap 250 ms).
// - UI.notify('input') is sent on every input (throttled 250 ms) so UI can time hint 2. Mouse hover counts as input.
// - QA extras: App.core (internal modules), App.gov(on) pauses the governor.
const CoreS = {
  cssW: 1, cssH: 1, bw: 1, bh: 1, dpr: 1, rs: 1, aspect: 1,
  now: 0, t: 0, rt: 0, dt: 0.016, ts: 1,
  vp: new Float32Array(16), camR: new Float32Array(3), camU: new Float32Array(3), focal: 1, eye: new Float32Array(3),
  exA: 0, exB: 0, U: 0, K: 0, G: 0.5, lineA: new Float32Array(3), lineB: new Float32Array(3),
  linePull: new Float32Array(3), lineUp: new Float32Array(3), lineCol: new Float32Array(3),
  pull: new Float32Array(4), scroll: 0, sunRise: 0, clock: new Float32Array(2), lhAng: 0, planetAng: 0, galaxyAng: 0,
  probe: new Float32Array(3), hats: 0, bands: new Float32Array(64),
  pkA: new Float32Array(128), pkB: new Float32Array(128), nPk: 0,
  str: new Float32Array(32), strF: new Float32Array(8), nStr: 0,
  hov: new Float32Array(4), bead: 0.35, mag: new Float32Array(4), ping: new Float32Array(4),
  alpha: new Float32Array([0.012, 0.012, 1, 1]), slow: new Float32Array(4), sign: new Float32Array([2, 2]),
  palA: new Float32Array(48), palB: new Float32Array(48), heatA: new Float32Array(3), heatB: new Float32Array(3),
  coreA: new Float32Array(3), coreB: new Float32Array(3), calm: 0,
  deskE: 0, deskScale: 0.6, deskCY: 0.56, barrel: 0.06, fringe: new Float32Array(4), misconv: 0.6, deg: new Float32Array(4),
  power: new Float32Array([0, 0, 0, 1]), dot: new Float32Array(4), ret: new Float32Array(4), gh: new Float32Array(12),
  ring: new Float32Array(4), fin: new Float32Array([0.6, 0, 0.015, 0.35]), konami: 0, bloom: 0.9,
  dec: new Float32Array(3), dtRaw: 0.016, floorQ: 0, clearTrails: 0, kickEnv: 0, wireReady: false,
  refl: new Float32Array(4),   // floor reflection: horizon (scene uv y), gain, ripple time (View.update fills it)
};

const GL = (() => {
  let gl = null, par = null, floatRT = false, floatOK = false, black = null, tri = null;
  function init(canvas) {
    try {
      gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    } catch (e) { gl = null; }
    if (gl) setup();
    return gl;
  }
  function setup() {
    floatRT = !!gl.getExtension('EXT_color_buffer_float'); floatOK = false;
    par = gl.getExtension('KHR_parallel_shader_compile');
    tri = gl.createVertexArray();
    black = tex(1, 1, false, new Uint8Array([0, 0, 0, 255]));
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }
  function tex(w, h, fl, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (fl) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    return t;
  }
  // Render target {t, f, w, h, fl}. Falls back to RGBA8 when a float target is incomplete. checkFramebufferStatus
  // is a full GPU sync (seconds on software GL, a stall anywhere), so the float format is verified once only.
  function target(w, h, fl) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    const t = tex(w, h, fl && floatRT), f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = !(fl && floatRT) || floatOK || gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (ok && fl && floatRT) floatOK = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && fl && floatRT) { gl.deleteTexture(t); gl.deleteFramebuffer(f); floatRT = false; return target(w, h, false); }
    return { t, f, w, h, fl: fl && floatRT };
  }
  function drop(rt) { if (rt) { gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.f); } }
  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  // Starts compiling; poll with ready(). attribs: names bound to locations 0..n; tf: varyings (interleaved).
  function program(name, vs, fs, attribs, tf) {
    const p = gl.createProgram(), v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f);
    if (attribs) for (let i = 0; i < attribs.length; i++) gl.bindAttribLocation(p, i, attribs[i]);
    if (tf) gl.transformFeedbackVaryings(p, tf, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    return { name, p, v, f, ok: false, bad: false, u: null };
  }
  function ready(pr) {
    if (!pr || pr.bad) return false;
    if (pr.ok) return true;
    if (par && !gl.getProgramParameter(pr.p, par.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
      pr.bad = true;
      try {
        console.warn('[pl85] program ' + pr.name + ' failed:', gl.getProgramInfoLog(pr.p) || '',
          gl.getShaderInfoLog(pr.v) || '', gl.getShaderInfoLog(pr.f) || '');
      } catch (e) { /* ignore */ }
      return false;
    }
    const u = {}, n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(pr.p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(pr.p, info.name);
    }
    pr.u = u; pr.ok = true;
    gl.detachShader(pr.p, pr.v); gl.detachShader(pr.p, pr.f); gl.deleteShader(pr.v); gl.deleteShader(pr.f);
    return true;
  }
  function use(pr) { gl.useProgram(pr.p); return pr.u; }
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t || black); }
  function into(rt) {
    if (rt) { gl.bindFramebuffer(gl.FRAMEBUFFER, rt.f); gl.viewport(0, 0, rt.w, rt.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
  }
  function drawTri() { gl.bindVertexArray(tri); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  return {
    init, setup, tex, target, drop, program, ready, use, bindTex, into, drawTri,
    get gl() { return gl; }, get floatRT() { return floatRT; }, get black() { return black; }, get parallel() { return !!par; },
  };
})();
