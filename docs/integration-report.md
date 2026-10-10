# Party Line '85: integration report

The assembled page works. It builds cleanly, passes `node --check`, and every QA run had zero console errors or exceptions: about 30 headless Chrome runs plus a 90-second random-input stress test (336 actions). The final file is **243.0 KB (248,827 bytes)** against the 250 KB limit; it was 310.7 KB before I added a minify step.

**Test environment caveat.** Headless SwiftShader renders at 0.3–3 s per frame, and Chrome delivers touch and drag events only at frame boundaries. Real-device frame rates could not be measured here. Timing-sensitive gestures (taps, long-press, pinch, two-finger) were also driven with synthetic PointerEvents dispatched in the page, which have exact timing. For screenshots I turned the governor off, and in some shots I advanced the camera/world springs (or cleared phosphor trails) so they show the settled state.

## Checks

| | Check | Result | Evidence |
|---|---|---|---|
| a | Desktop 1280×800 before the gesture | PASS | 0 errors. The AudioContext constructor was wrapped and called 0 times; `Sound.status()` is `none`. City renders by 2 s (screenshot 01). Overlay opacity is 1. |
| b | Pick-up and handshake | PASS | Overlay opacity goes to 0. Exactly one AudioContext, state `running`. Measured from the gesture: digits at +350…+950 ms, glide at +1650, downbeat at +2400 (it was +148 ms late before fix 3). Status goes `◔ DIALING 555-0185` → `● LINE OPEN · 555-0185 · MERIDIAN`. |
| c | Pluck, strum, hover | PASS | A pluck plus 3 echo packets at ×0.38ⁿ amplitude; chimes fire as packets reach landmarks (03/03b). A sun strum plays 10 distinct notes (76 74 71 67 62 60 57 55 50 52); before fix 6 it played only 3. Hover bends lines with colour fringes. |
| d | Pull → unravel → knit | PASS | Into Tide and then Long Distance: pull → unravel → knit, with landings exactly on a bar line (bar 7.0000093 and 4.999999). Also works from the keyboard (hold Enter plus arrows). The return to Meridian was verified with Esc and by dialling 555-0185, not with a third drag; that drag hit the 240 s harness timeout under software rendering. |
| e | Modes, keys, dialogs | PASS | Space hold, right-button hold and the SLOW button all show `◌ BEAM SLOWED`. Wheel, `-`/`+` and the STEP BACK button all reach the desk view and come back. Double-click in empty space and `D` both degauss. `M` mutes and unmutes, `H` hides the HUD. Help keeps focus inside and Esc returns it to the canvas. Directory and keypad work. Dialling `0` reaches the Operator (it played the out-of-service tones before fix 10). An unlisted number plays the out-of-service tones and sign. |
| f | Mobile 390×844, dpr 2, touch | PASS | A real touch tap starts audio (it resumes on touchend). No horizontal scroll (scrollWidth 390). Controls are 52×44 at y=788. Horizon is 46.6% from the top; the sun is 55.3% of the width. Tap, strum, pinch to desk and back, two-finger slow, and double-tap degauss all work (screenshots 08 and 09). |
| g | Reduced motion and CALM | PASS | Headless Chrome reports reduced motion by default, so the early runs, knits included, all ran in calm mode with no errors. The CALM toggle switches both ways (CSS class, shader flag, saved setting). |

**Extra checks, all PASS:**
- **No WebGL2:** the NO CARRIER poster shows, with 0 errors.
- **Storage blocked:** a throwing `localStorage` causes 0 errors.
- **Return call:** downbeat at +1250 ms, `CALL #4`.
- **Skip:** a second tap moves the downbeat to the next 16th at least 250 ms away.
- **Just watch:** status shows MUTED and no AudioContext is created.
- **Tab hidden and shown:** audio suspends within 350 ms and resumes with no burst of missed notes.
- **Context loss and restore:** the SIGNAL LOST chip shows, then the scene comes back with its state.
- **Audio blocked:** the NO DIAL TONE chip shows; SOUND resumes audio and the chip clears.
- **Party line:** after 45 s idle, "2 CALLERS" and ghost plucks.
- **June:** her call plays E-G-A-C-B. Answering it types `HELLO? I HEAR YOU.` and marks her line found.
- **Other secrets:** Retrace, the handset (with its XY inset) and the Konami overlay all work.

## Bugs fixed

1. **Page too large** (`assemble.mjs`, new `minify.mjs`). Added a minifier that strips comments and whitespace and only joins lines where that is safe. Wire's output is byte-identical after minifying, and Sound's tests still pass. Size went from 310.7 KB to 243.0 KB.
2. **Multi-second stalls** (`40-gl.js`). Every render-target rebuild called `checkFramebufferStatus`, which forces a full GPU sync; the profiler showed 8.5 s of main-thread stalls and taps landing seconds late. The float format is now checked once.
3. **Handshake started late** (`48-world.js`, `46-input.js`, `25-sound.js`). The 2.4 s timeline started after the slow AudioContext creation. The gesture time is now passed in as `Sound.startHandshake(first, atMs)`, and the touch-point lookup runs after the sound starts.
4. **Slow pick-up handler** (`25-sound.js`). About 113 ms of reverb setup ran inside the tap handler; it now runs on timers.
5. **Possible host console error** (`25-sound.js`). The silent data-URI `<audio>` now runs only on iOS older than 17; iOS 17+ uses `navigator.audioSession`. Elsewhere it would risk an uncatchable error under a strict host content-security policy.
6. **Sun strum was nearly one note** (`12-wire-geo.js`, `13-wire-meridian.js`). Sun stripes only covered 6 pitches. They now map from each stripe's chord length to 16 pitches, so a vertical swipe is an arched glissando.
7. **Billboard text unreadable** (`19-wire.js`, `11-wire-core.js`, `10-wire-font.js`). Sign letters no longer get extra bright corner dots. Dots in `· . : ? !` keep them, since without them they would disappear.
8. **Sun, moon and galaxy too dim** (`41-shaders.js`). Distance fog cut them to 25%; landmark elements now keep 75%.
9. **Zoom-in sank below the floor on phones** (`44-view.js`). The bottom half went empty; zoom now moves the camera forward at constant height.
10. **Wrong number on the Operator** (`30-ui.js`). The directory kept stale digits, so pressing `0` dialled "5550". The display now clears when it opens.
11. **Hints overlapping text** (`30-ui.js`). Hints now avoid the toast, chips and desk caption, and are hidden in the desk view.
12. **Breathing ring stayed on during knits** (`48-world.js`). Fixed.
13. **Idle mode could start mid-pull** (`48-world.js`). Pull movement now counts as input.
14. **Phone desk view** (`40`/`41`/`42`/`44`/`48`). The TV now sits higher and smaller and the handset is scaled, so the badge and handset clear the controls row. Pointer mapping uses the same transform.
15. **Test harness** (`qa.mjs`). Fixed an error on non-mobile viewports and added steps for init scripts, media emulation, reload and CPU profiling.

The Core files in `parts/` are now the readable sources (minifying happens at assembly), and `tmp-core/src` is synced to them. All deviations from the contracts are recorded in the CONTRACT NOTES comments of `40-gl.js`, `20-sound-dsp.js`, `30-ui.js` and `10-wire-font.js`.

## Remaining issues, most severe first

1. **Real-device frame rate is unverified.** Software rendering only showed that the governor steps down correctly. The beam and transform-feedback passes are the main cost on software GL.
2. **Sun cut-out shows in some views.** The sun is clipped against the billboard and clock-tower outlines from the rest camera, so a stepped notch appears when the sun is sunk, when zoomed in, or with parallax. This follows the spec's design.
3. **Skip timing conflict.** The contract says the downbeat lands on the next 16th at least 250 ms away (it measures 250–406 ms); the acceptance criteria say "≤ 250 ms". I kept the contract.
4. **Sparse lower floor on phones.** The bottom third of the screen shows only 2–3 widely spaced floor lines because of perspective.
5. **Tap versus long-press depends on frame timing.** A main-thread stall over 450 ms between touch down and up could turn a tap into a pull. I only saw this with software rendering.
6. **Touch warnings.** On touch devices Chrome logs "AudioContext was not allowed to start" warnings (not errors) until the touchend resume. This is the spec's design.
7. **Not testable here:** how the audio actually sounds, real iOS behaviour, and the claude.ai host's content-security policy for Google Fonts.

The `tmp-*` folders hold test material and can be deleted.

## Files

- Final page: `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/party-line-85.html`
- Minifier: `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/minify.mjs`

Screenshots, all in `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/qa-final/`:
- `01-desktop-pregesture.png`
- `02-desktop-playing.png`
- `03-desktop-pluck-in-flight.png`
- `03b-desktop-pluck-later.png`
- `04-tide-line.png`
- `05-long-distance.png`
- `06-desk-view.png`
- `07-slow-beam.png`
- `08-mobile-pregesture.png`
- `09-mobile-playing.png`
- `10-directory-dialog.png`