I've built and self-tested the whole Wire module: the font, resampler, all three exchanges, the string and resonator tables, sign regeneration and the secret text. It runs in the real assembled page with zero console errors. The two things over target are size (69 KB against a 38 KB budget) and the first build after page load, which is slower than the 80 ms target.

**Self-test.** Every exchange × tier passes (`ALL OK`) for every assertion you listed, plus:
- `s` stays inside `[sA, sB]` after a sign rewrite, and no byte outside the returned range changes.
- `charS` never decreases.
- Rewriting the default sign text gives exactly the bytes of a fresh build, and two builds are byte-identical.
- A sign rewrite takes about 1–6 ms.
- `node assemble.mjs` followed by `node --check _check.js` passes.

**Build time.** Repeat builds take 10–26 ms at N=24k and up to about 50 ms at 48k. The first build after page load takes about 95–130 ms at 24k (Node and headless Chrome on this machine, which was busy, so the numbers are noisy). Core should run the first `Wire.build` before the warm-up animation starts, or it may see a one-off hitch.

**Art.** I checked it in a preview page and in the real renderer at 1280×800 and 390×844:
- **Meridian:** 44-stripe sun with slits widening toward the bottom, clipped against every silhouette in front of it. Three skyline depths with seven roof types, lit window rows and spires. Back mountains move with the spectrum. The rooftop billboard has double neon frames and lamps, there's a clock tower, June's amber window, a lattice mast with a blinking top, a payphone booth, and the stars plus the secret sky text.
- **Tide Line:** 40-ridge amber sea (near ridges doubled), cliff with rock layers and a front edge, a detailed lighthouse with its beam, the moon with crater cut-outs and a halo, the buoy sign, a ship, and moonlit cloud wisps.
- **Long Distance:** galaxy made of braided spiral strands, planet as 24 latitude rings plus 10 meridians, three linked ring bands, a Voyager-style probe, and a "PLEASE HOLD" card under the planet.

**Deviations from contracts.md** (also in the `// CONTRACT NOTES` at the top of `10-wire-font.js`):
1. **`s` mapping:** each element owns an `s`-span in proportion to its point share. Inside it, `s` is weighted arc length: ink 1, blank 0.12, secret strokes 0.3.
2. **Pen-up ends inside one string** (window-dash rows, sign glyphs) are plain forced samples, not anchors. Real string ends, turns over 35° and element joins all get ANCHOR plus 2 DWELL.
3. **Long sign lines on the LOW tier:** if a line doesn't fit its fixed point range, glyph corners drop to 1 and then 0 dwells. As a last resort, trailing glyphs are dropped and count as spaces in `charS`. Entries past `nChars` in `charS` hold `sB`.
4. **Sign strings:** `str.i0/i1` cover the whole line range, so a sign string can start on a blank point. `str.len` is the sign width.
5. **Long Distance billboard is not a resonator,** because the contract table lists none for it, so `sign.resId = -1` there.
6. **Floor and sea extended for portrait:**
   - Meridian floorH gets three nearer lines at z = 6, 8, 10 (k = −3..−1, degree 0), and floorV runs from z 10 to −70.
   - Tide sea ridges run from z 8.8 to −70.
   - Without this, the bottom third of a 390×844 screen was empty.
7. **Extra BLINK points:** FLAG.BLINK is also set on the Tide buoy light and the Long Distance probe beacon.
8. **Extra fields:** `res.centre` is the centroid of the element's visible points. `wd._` holds private state for `setSignText`.

**Integration risks to check first:**
1. **Fog dims the heroes.** At depth over 80 the fog cuts the sun (84), moon (86) and galaxy (110) to 25%. Core may want to exempt them or start the fog later.
2. **Points behind the camera.** The extended near floor and sea lines sit behind the landscape camera, so Core's beam shader must keep collapsing segments with w < 0.1.
3. **Budgets.** Wire is 69 KB against 38 KB. The assembled page is 333 KB against 250 KB, and the other modules are over budget too.
4. **Fallback warning.** If a generator throws, `Wire.build` returns a minimal fallback wire and logs one `console.warn`.

I stopped my two preview servers on ports 8741 and 8742. Temp files are in `build/tmp-wire/` (`test.mjs` self-test, `diag.mjs` budget printout, `mkprev.mjs` + `shoot.sh` preview tools, screenshots in `shots/`, and `full/`, a stale scratch copy of the assembled page); you can delete them.

Files are in `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/parts/`:
- `10-wire-font.js` — 78 lines (`WireFont`: 46-glyph font, contract notes)
- `11-wire-core.js` — 231 lines (`WireCore`: resampler, normals, stiffness)
- `12-wire-geo.js` — 212 lines (`WireGeo`: clipping, striped discs, skylines, ridges, stars, sky)
- `13-wire-meridian.js` — 136 lines
- `14-wire-tide.js` — 123 lines
- `15-wire-long.js` — 106 lines
- `19-wire.js` — 187 lines (`Wire.build` / `setSignText` / `charCount`)