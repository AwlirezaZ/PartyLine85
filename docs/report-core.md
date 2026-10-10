Core report: the whole of Core is implemented, and it runs together with the real Wire, Sound and UI parts. The assembled page passes `node --check` and shows zero console errors across all the QA flows. Two things fall short: Core is 96.5 KB against its 80 KB budget, and the whole page is 310.7 KB against the 250 KB target.

## Files written
All in `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/parts/` (lines / bytes):

| File | Lines | Bytes |
|---|---|---|
| `40-gl.js` (CoreS shared state, GL kit, CONTRACT NOTES) | 126 | 7,101 |
| `41-shaders.js` (all GLSL, incl. INLINE_SIM beam) | 201 | 14,257 |
| `42-render.js` (Renderer: passes, FBOs, uploads, restore) | 237 | 10,609 |
| `44-view.js` (camera springs, barrel/desk mapping, CPU kind mirror, spatial hash) | 204 | 8,279 |
| `46-input.js` (gesture recognizer, keyboard) | 284 | 12,153 |
| `48-world.js` (state machine and every flow) | 627 | 26,466 |
| `50-ghosts.js` (CoreGhosts: demo, party line, June's call/answer, lighthouse) | 203 | 8,053 |
| `52-fallback.js` (NO CARRIER Canvas2D poster) | 53 | 2,313 |
| `55-app.js` (boot, frame loop, governor, lifecycle) | 177 | 7,282 |
| `99-boot.js` | 1 | 12 |

The files in `parts/` are a compacted version (whitespace and comments stripped, one statement per line). The readable sources are in `tmp-core/src/`. `tmp-core/publish.sh` compacts them into `parts/` and checks syntax. The compactor is `tmp-core/compact.mjs`.

## What was verified
Tested in headless Chrome at 1280×800, 900×560, 800×500, 640×400 and 390×844 mobile:
- Warm-up dot, line and knit; pick-up handshake; plucks, strums and chimes.
- Pull, unravel and knit into Tide and Long Distance, and dialled auto-knits.
- Slow beam, desk view, degauss, keyboard-only use and Konami.
- Operator, retrace, busy and wrong numbers; payphone handset with the XY inset.
- Party line after 45 s idle; June's call plays at 45 s and answering it unlocks her line.
- Context loss and restore, tab hidden and visible, calm (reduced motion).
- Forced fallbacks: no WebGL2 (NO CARRIER poster), the RGBA8 path, and the INLINE_SIM beam.

## API deviations from contracts.md
All are listed in the `// CONTRACT NOTES:` block at the top of `40-gl.js`:
1. **TF buffer contents:** `v_col.a` holds "ink" (drawn point vs blank hop), and `v_pos.w` packs heat plus a dwell-dot weight. Both are Core-internal; the 32-byte layout is unchanged.
2. **Beam profile:** it integrates the Gaussian along each segment so consecutive segments join without beaded joints, and dwell points add explicit hot dots. Blank-hop segments use a smaller quad (2σ+0.5).
3. **Wire buffers and restore:** all three exchanges keep their own VBO; "A" and "B" are just which ones are bound. Context restore re-uploads the existing WireData bytes rather than calling `Wire.build` again, which keeps the current sign text.
4. **Keys and double-tap:** `D` is degauss, so WASD reticle movement is W/A/S only. Double-tap degausses only in empty space; on a string the two taps stay two plucks so fast repeated notes stay musical. The payphone double-tap still wins.
5. **Pointer mapping:** pointers are mapped through the composite's barrel and desk transform before hit-testing, so taps land on what is seen.
6. **Portrait floor:** the floor and sea are stretched toward the camera (`uFloorQ`, mirrored in hit tests), because the spec's portrait camera pull-back otherwise leaves the bottom 35% of a phone screen black.
7. **Secret sky text:** it idles at 0.35× the blank alpha so it stays secret; Retrace still shows it at full brightness.
8. **Exchange swap:** A↔B swaps when the knit reaches 1 exactly at the landing time; the `KNIT_LAND` event only adds a bloom accent.
9. **Desk view:** the screen scales uniformly (0.6 landscape, 0.7 portrait) instead of `(0.30, 0.24)·aspectFix`, so the picture is never squashed.
10. **Governor:**
    - Hold times are measured in wall-clock time.
    - Step-up also counts 60 Hz frames with under 5 ms of main-thread work; otherwise a 60 Hz screen could never step up.
    - A sustained average above 55 ms drops a whole point-count tier, with 2.5 s spacing instead of 20 s.
    - Phosphor decay uses the real frame time, capped at 250 ms.
11. **UI notifications:** `UI.notify('input')` fires on every input (throttled to 250 ms), not only when leaving idle, so UI can time hint 2. Mouse hover counts as input.
12. **Strum rate limit:** strings crossed while the 30 ms per-pointer limit is active get a visual ring but no sound.
13. **QA extras:** `App.core` exposes the internal modules, and `App.gov(false)` pauses the governor.

## Not finished
- **Size:** Core is 96.5 KB (budget 80 KB) and the assembled page is 310.7 KB (target 250 KB). Every module is over its budget, not just Core.
- **Disconnect animation:** the reverse power mask on tab-hide can't be seen, because animation stops as soon as the tab is hidden. The power-on animation on return does work.

## Integration risks to check first
1. **Page size:** running `compact.mjs` over every part at assembly time saved about 20% on Core; something like it is needed to approach 250 KB.
2. **Headless frame times:** the software renderer in headless Chrome runs at 0.3–1.5 s per frame, so the governor drops to the lowest tier within about 4 s. Call `__pl85.App.gov(false)` before taking high-quality screenshots. Animations stretch in time under this renderer; that is expected, not a bug.
3. **Portrait floor stretch assumptions:** it hard-codes Wire's floor near edge (z = 4 for Meridian, −2 for Tide) and Meridian's 37 floor lines; the farthest line fades in to hide the scroll wrap.
4. **Sound's note log:** it may label strummed notes as something other than `pluck`; that only affects QA counts.
5. **Desk handset position:** it is drawn bottom-left (desktop controls are bottom-right); on phones it sits partly under the centred controls row.
6. **Sunk-sun shape:** the top of the sun looks stepped while it is sunk, because Wire clips it against silhouettes at the risen position. Cosmetic, and on Wire's side.