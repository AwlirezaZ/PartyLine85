// 10-wire-font.js — Wire module (parts 10-15): single-stroke vector font.
// CONTRACT NOTES (Wire):
// - s: each element owns an s-span proportional to its point share; inside it s is cumulative weighted
//   arc length (ink 1, blank 0.12, secret strokes 0.3). Blank hops take the kind/colour of the side they
//   touch, so kind transforms never stretch a visible seam.
// - Pen-up ends inside one string (window-dash rows, sign glyphs) are forced samples, not anchors; every
//   string end, turn > 35 deg and element join is ANCHOR + 2 DWELL, except sign glyph corners: ANCHOR with no
//   dwell duplicates (integration: dwell hot dots + bloom made 7-9 px billboard text illegible; the freed budget
//   smooths the strokes). If a long line still exceeds its budget, trailing glyphs are dropped (they count as
//   spaces for charS). charS[k > nChars] = sign.sB.
// - Sign strings: str.i0/i1 are the line's whole point range [i0,iMid) / [iMid,i1) (may start on a blank);
//   str.len = sign width. Long Distance 'billboard' is not a resonator (contract table), so sign.resId = -1.
// - Portrait fill: Meridian floorH adds 3 nearer lines (z = 6, 8, 10; k = -3..-1, degree 0) and floorV runs
//   z 10 -> -70; Tide sea ridges span z 8.8 -> -70 (k = 0 nearest). Off-screen in landscape, needed at 390 px.
// - FLAG.BLINK is also set on the Tide buoy light and the Long Distance probe beacon (one dwell each).
// - res.centre = ink centroid of the element; res.name[] = element name. wd._ is private (setSignText state).
const WireFont = (() => {
  // 4x6 grid, y up, advance 6. '|' = pen-up. A single pair is a dot (dwell hot spot).
  const G = {
    A: '0 0 0 4 2 6 4 4 4 0|0 3 4 3', B: '0 3 3 3 4 2 4 1 3 0 0 0 0 6 3 6 4 5 4 4 3 3',
    C: '4 5 3 6 1 6 0 5 0 1 1 0 3 0 4 1', D: '0 0 0 6 2 6 4 4 4 2 2 0 0 0',
    E: '4 6 0 6 0 0 4 0|0 3 3 3', F: '4 6 0 6 0 0|0 3 3 3',
    G: '4 5 3 6 1 6 0 5 0 1 1 0 3 0 4 1 4 3 2 3', H: '0 6 0 0|0 3 4 3|4 6 4 0',
    I: '1 6 3 6 2 6 2 0 1 0 3 0', J: '4 6 4 1 3 0 1 0 0 1',
    K: '0 6 0 0|4 6 0 2|1.5 3.5 4 0', L: '0 6 0 0 4 0', M: '0 0 0 6 2 3 4 6 4 0',
    N: '0 0 0 6 4 0 4 6', O: '1 0 0 1 0 5 1 6 3 6 4 5 4 1 3 0 1 0',
    P: '0 0 0 6 3 6 4 5 4 4 3 3 0 3', Q: '1 0 0 1 0 5 1 6 3 6 4 5 4 1 3 0 1 0|2 2 4 0',
    R: '0 0 0 6 3 6 4 5 4 4 3 3 0 3 4 0', S: '4 5 3 6 1 6 0 5 0 4 1 3 3 3 4 2 4 1 3 0 1 0 0 1',
    T: '0 6 4 6|2 6 2 0', U: '0 6 0 1 1 0 3 0 4 1 4 6', V: '0 6 2 0 4 6',
    W: '0 6 1 0 2 3 3 0 4 6', X: '0 6 4 0|4 6 0 0', Y: '0 6 2 3 4 6|2 3 2 0', Z: '0 6 4 6 0 0 4 0',
    0: '1 0 0 1 0 5 1 6 3 6 4 5 4 1 3 0 1 0|0 1 4 5', 1: '1 5 2 6 2 0|1 0 3 0',
    2: '0 5 1 6 3 6 4 5 4 4 0 0 4 0', 3: '0 5 1 6 3 6 4 5 4 4 3 3 4 2 4 1 3 0 1 0 0 1|1 3 3 3',
    4: '3 0 3 6 0 2 4 2', 5: '4 6 0 6 0 3 3 3 4 2 4 1 3 0 0 0',
    6: '4 5 3 6 1 6 0 5 0 1 1 0 3 0 4 1 4 2 3 3 0 3', 7: '0 6 4 6 1 0',
    8: '1 3 0 4 0 5 1 6 3 6 4 5 4 4 3 3 1 3 0 2 0 1 1 0 3 0 4 1 4 2 3 3',
    9: '0 1 1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 4 1 3 4 3',
    '·': '2 3', ':': '2 1|2 4', '?': '0 5 1 6 3 6 4 5 4 4 2 3 2 2|2 0', '!': '2 6 2 2|2 0',
    '-': '1 3 3 3', '#': '1 0 1 6|3 6 3 0|0 4 4 4|4 2 0 2', '*': '2 1 2 5|0 2 4 4|0 4 4 2',
    "'": '2 6 2 4', '.': '2 0', ',': '2 1 2 0 1 -1',
  };
  const cache = {};
  function glyph(ch) {
    let g = cache[ch];
    if (g) return g;
    g = [];
    const src = G[ch];
    if (src) for (const st of src.split('|')) g.push(st.trim().split(/\s+/).map(Number));
    return (cache[ch] = g);
  }
  const ALIAS = { '•': '·', '–': '-', '—': '-', '’': "'", '‘': "'", '`': "'" };
  // Uppercase, map unknown characters to spaces, truncate to max chars.
  function norm(str, max) {
    const s = String(str == null ? '' : str).toUpperCase();
    let o = '';
    for (let i = 0; i < s.length && o.length < (max || 1e9); i++) {
      let c = s[i];
      if (ALIAS[c]) c = ALIAS[c];
      o += c !== ' ' && G[c] ? c : ' ';
    }
    return o;
  }
  // Lay a line of text centred at (cx, cy) in plane z, fitting width w and glyph height h.
  // Returns strokes [{p:[x,y,z,...], ci}] in reading order, plus the scale used.
  function layout(text, cx, cy, z, w, h) {
    const n = text.length, out = [];
    if (!n) return out;
    const sc = Math.min(w / Math.max(1, n * 6 - 2), h / 6);
    const x0 = cx - (n * 6 - 2) * sc / 2, y0 = cy - 3 * sc;
    for (let i = 0; i < n; i++) {
      const g = glyph(text[i]);
      for (const st of g) {
        const p = [];
        for (let k = 0; k < st.length; k += 2) p.push(x0 + (i * 6 + st[k]) * sc, y0 + st[k + 1] * sc, z);
        out.push({ p, ci: i });
      }
    }
    return out;
  }
  return { glyph, norm, layout };
})();
