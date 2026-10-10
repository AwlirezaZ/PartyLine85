# Party Line '85: Interface Contracts v1 (authoritative)

This file and `parts/00-config.js` are the only shared truth. When the spec and this file disagree, **this file wins** (§7 lists every deliberate deviation). The spec stays authoritative for behaviour, look and copy that is not mentioned here. Read `00-config.js` in full. It is short, and every constant you need is already in it. Never re-declare its values.

---

## 0. Ground rules (all engineers)

**Assembly.** `parts/ui.html` is followed by one `<script>` that holds every `parts/*.js` file, concatenated in filename order inside `(() => { 'use strict'; … })();`. All parts share ONE function scope.

- **Top-level names:** each part declares only names with its owner's prefix:
  - Wire: `Wire`, `Wire*`
  - Sound: `Sound`, `Sound*`
  - UI: `UI`, `UI*`
  - Core: `App`, `Core*`, `GL`, `Renderer`, `View`, `Input`, `World`, `Fallback`, `Shaders`
  - Reserved by 00-config: `U M4 Spring FixedStep CFG EX KIND FLAG EV VOICE PLUCK SRC STATUS Store`

  A second top-level `const clamp` anywhere is a SyntaxError that kills the whole page. Wrap each module as `const Name = (() => { …; return {…}; })();`.
- **Evaluation:** a module's IIFE body must have **no side effects**: no DOM queries, listeners, timers, AudioContext or GL. It may build pure data (font tables, for example). All work starts in the `init` functions that `App.boot()` calls. Later modules do not exist yet while an earlier one is being evaluated, so never call another module at evaluation time.
- **Forbidden text and APIs:** never write the literal text `</script` (split it as `'<' + '/script'`). No `alert/confirm/prompt`. No network calls except the Google Fonts `@import` in ui.html. No globals on `window`, with one exception: Core may set `window.__pl85` (§5.6, QA only). `localStorage` is touched **only** inside `Store`.
- **Never throw:** every public method of Wire, Sound and UI must be safe to call at any time, including before `init`, without an AudioContext, with missing DOM nodes, and after an audio failure. Wrap browser APIs in try/catch.
- **Hot paths:** functions marked ⚡ are called every frame. They must not allocate (no closures, no arrays or objects, no string building) and must not read layout.
- **Isolated testing:** copy `parts/` to your own temp dir, add stub modules there, and assemble that copy. Only ever write your own files into `build/parts/`.
- **Size budget** (total file ≤ 250 KB): config 39 KB (done), Wire ≤ 38 KB, Sound ≤ 50 KB, UI (html + css + js) ≤ 38 KB, Core ≤ 80 KB. Keep comments terse.

**Units and clocks (read twice).**

| Quantity | Unit |
|---|---|
| **Time across module boundaries** | **performance-clock milliseconds** (`performance.now()` / the rAF timestamp / `event.timeStamp`), written `…Ms`. Durations are ms unless the name ends in `_S` or `sec`. |
| AudioContext seconds | **never cross a module boundary.** Only Sound sees them. |
| Transport times returned by Sound | the perf-ms moment the listener **hears** the event (output latency is included via the slewed offset, §6.2). Drive visuals from them directly. |
| Screen | CSS px from the canvas top-left (the canvas is full-viewport, so `clientX/clientY`). |
| pan | −1 … 1 |
| velocity / amp | 0 … 1 (packet amp may reach 1.5) |
| wire parameter `s` | 0 … 1 |
| MIDI | numbers (floats allowed) |
| Angles | radians |

---

## 1. Shared: `parts/00-config.js` (architect, done)

| Export | Contents |
|---|---|
| `U` | `clamp sat lerp mix invLerp remap smoothstep fract mod damp TAU DEG`<br>`ease.{linear,smooth,inQuad,outQuad,inOutQuad,outCubic,inOutCubic,inOutSine,outBack,elastic}` (`elastic` is exactly the §5.4 knit curve: 0 at x ≤ 0, 1 at x ≥ 1, ~7% overshoot)<br>`rng(seed)` → `() => [0,1)` (mulberry32); `hash32 hash01 hash2 fnv1a`<br>`hex(str)` → `[r,g,b,a]` sRGB 0..1; `toLin toSrgb hexLin palette(list, lin, size)` → `Float32Array`<br>`midiToHz dbToGain gainToDb pc(midi)`; `now()` = perf ms; `noop` |
| `M4` | Column-major `Float32Array(16)`:<br>`create()`<br>`perspective(out, fovy, aspect, near, far)`<br>`lookAt(out, eye, target, up)`<br>`mul(out, a, b)` (out = a·b, may alias)<br>`invert(out, m)` → `out \| null`<br>`project(m, x, y, z, out)` writes `out[0]` = ndcX, `out[1]` = ndcY, `out[2]` = clip w (view depth) and returns w (w ≤ 0 means behind the camera) |
| `Spring` | `new Spring(x0, omega, zeta=1)`. Fields `x v target omega zeta`. `set(x)` snaps; `to(T)`; `kick(dv)`; `step(h)` is an exact analytic advance (critical, under- or overdamped); `update(dt)` does its own 120 Hz substeps (max 6); `settled(eps)`; `Spring.omegaForSettle(sec)` = 6.64/sec |
| `FixedStep` | `new FixedStep(1/120, 6)`. `advance(dtSec)` returns the number of substeps; the remainder is dropped when over max. Core's frame loop uses ONE of these and calls `spring.step(clock.h)` n times. |
| `EX` | `MERIDIAN 0, TIDE 1, LONG 2, COUNT 3` |
| `KIND` | (`a_info.y`) `STATIC 0, FLOOR_H 1, FLOOR_V 2, MTN_BACK 3, SUN 4, CLOCK_H 5, CLOCK_M 6, STAR 7, SEA 8, LH_BEAM 9, PLANET 10, GALAXY 11, PROBE 12, WINDOW 13` |
| `FLAG` | (`a_info.z` bits) `BLANK 1, ANCHOR 2, DWELL 4, SECRET 8, RESONATOR 16, BILLBOARD 32, BLINK 64` (128 reserved) |
| `EV` | event types: `KICK 1, SNARE 2, HAT 3, BAR 4, CHORD 5, KNIT_LAND 6, GHOST_PLUCK 7, DOWNBEAT 8, HS_DIGIT 9, HS_GLIDE 10, TOM 11` |
| `VOICE` | chime voices: `SUN 0, CLOCK 1, BILLBOARD 2, WINDOW 3, MAST 4` |
| `PLUCK` | `Sound.pluck` flag bits: `STRUM 1, GHOST 2, JUNE 4, NO_ENERGY 8, LIGHTHOUSE 16` |
| `SRC` | `GHOST_PLUCK` source tags: `GHOST0 0, GHOST1 1, GHOST2 2, JUNE 3, LIGHTHOUSE 4, OTHER 5` |
| `STATUS` | `ONHOOK 'onhook', HANDSHAKE 'handshake', PLAY 'play', MUTED 'muted', SLOW 'slow', PARTY 'party', DESK 'desk', RETRACE 'retrace'` |
| `CFG.EXCHANGES[ex]` | `id key name title number digits altDigits foundKey`<br>`scale` (6 semitone steps), `root` (MIDI), `rootPc`, `scalePcs`<br>`progression[4]` = `{name, rootPc, tones (pcs in role order root, 3rd, 5th, 7th/6th, ext), safe (tones ∩ scale, never empty), pad (4 MIDI), bass (MIDI)}`<br>`call` (5 pcs), `callResolve` (pc)<br>`reverb` `'hall' \| 'sea'`; `pluckVoice` `'ks' \| 'fm'`; `drums` `'full' \| 'half' \| 'none'`<br>`palHex[16]`, `pal` (sRGB F32 ×48), `palLin` (linear F32 ×48), `col` (slot names → index)<br>`heat`, `core` (linear rgb); `heatHex`, `coreHex`<br>`decay`, `decayVec` (per-60-Hz-frame RGB)<br>`camera`; `sign` (default 2 lines); `seed` |
| `CFG.TIERS[t]` | `id name N packets strings stars rs{start,min,max} bloomMips misconv grain padSaws poly irHall irSea hashStride dprCap`. Shader array maxima are `CFG.MAX_PACKETS` 32 and `CFG.MAX_STRINGS` 8. |
| `CFG.TRANSPORT` | `BPM 96`<br>Seconds: `BEAT .625`, `BAR 2.5`, `S16 .15625`, `E8`, `DOTTED8 .46875`; `_MS` versions of each<br>`LOOKAHEAD .12, TICK_MS 25, RESYNC .05, SWING .54, OFFSET_ALPHA .05, EVENT_RING 64, STALE_EVENT_MS 1000`, `BARS_PER_CHORD 2`, … |
| Other `CFG` constant groups | `ENERGY`, `HANDSHAKE` (FIRST / RETURN timelines, `GLIDE_MIDI`, `SKIP_MIN_MS`, `DIGIT_S0/DS`, `TYPE_MS_PER_CHAR` …), `INPUT` (all §4.1/§4.2 numbers, including `KONAMI`), `SPRING` (ω values, `SUBSTEP`), `CAMERA`, `VIS` (all §5.4/§6.6 numbers), `IDLE`, `GOVERNOR`, `SIGN {LINES 2, COLS 40}`, `COL` (UI/composite colours: `.hex`, `.lin`, `.srgb`) |
| `CFG.TEXT` | Shared copy:<br>`status.*` (strings or fns of ex/n/calls; `status.line2(calls)`)<br>`announce.*` (`connected[ex]`, `found(label)` …)<br>`chip.{nodial,signal}`; `toast.{overlay, found(name)}`<br>`found[key] = [toastName, announceLabel]`; `caption.desk`<br>`sign.{welcome(calls), june, sit, busy, operator}`<br>`secretSky`, `clockDate`, `badge` |
| `CFG.cameraRest(ex, aspect, out?)` | Returns `{eye[3], target[3], up[3], fov (vertical rad), swayAmp (rad), swayPeriod (s)}` with all the portrait rules applied (§5.5): FOV from `PORTRAIT_TAN_H` 0.33 clamped to [50°, 78°], `eye.z += 8(1−aspect)`, and the horizon placed 46% from the top for exchanges that have a horizon. Verified at 380×800: sun = 55% of width, horizon at 46.0%. |
| `CFG.dial(raw)` | `null` (empty) or one of `{type:'exchange', ex, digits}`, `{type:'operator'\|'retrace'\|'busy'\|'sit', digits}`. Non-dial characters are stripped; a leading `1` is accepted. |
| Music helpers | `CFG.degreeToMidi(ex, degree)` (degree 0..18 → `root + 12⌊d/6⌋ + scale[d%6]`)<br>`CFG.degreeForLength(L)` (the §6.3 rule)<br>`CFG.chimePc(ex, chordIdx, role)` (always in scale ∩ chord)<br>`CFG.midiAtOrAbove(pc, floorMidi)` |
| Environment | `CFG.detectEnv()` → `{hasDOM, coarse, fine, cores, mem, reducedMotion, fullscreen, vibrate, dpr, phone}`<br>`CFG.pickTier(env, storedTier)` → 0..2 |
| `Store` | Single key `'pl85.v1'`. `load()` (boot, once; adds a pagehide → flush listener); `data` (live object, read anywhere); `set(key, v)` (top-level scalar keys); `setFound(name)` → true only if new; `isFound(name)`; `setHint(n)` → true if new; `hintShown(n)`; `calm(env)` (null → media query); `save()` (debounced 1 s); `flush()`; `available`; `FOUND_KEYS`. Schema: `{calls, muted, calm:null\|bool, tier:null\|0..2, found:{tide,orbit,operator,june,handset,konami}, hints:{1..6}, lastExchange}`. **Writers:** UI writes only `hints`; Core writes everything else; Wire and Sound never write. |

---

## 2. Wire (`10-wire*.js`; pure JS, no DOM/GL)

### 2.1 API
```
Wire.build(ex, tier) -> WireData
```
- Synchronous and deterministic: seeded with `U.rng(CFG.EXCHANGES[ex].seed)`. The same `(ex, tier)` always produces identical bytes; context restore depends on this.
- `N = CFG.TIERS[tier].N` exactly, and dwell stars = `CFG.TIERS[tier].stars`.
- Target time: under 80 ms at N = 48 000. Build applies the default sign `CFG.EXCHANGES[ex].sign`.

```
Wire.setSignText(wd, line1, line2) -> { byteOffset, byteLength }
```
- Regenerates **only** the sign text subrange inside `wd.vbo`, in place, and updates `wd.f32/i8/u8`, `wd.pointString` and `wd.sign.{lines,nChars,len1,charS}` for that range.
- Core uploads the result with `gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, new Uint8Array(wd.vbo, byteOffset, byteLength))`. The return is a new object (one allocation per message is fine).
- Text rules: uppercased; characters outside the 46-glyph font become spaces; each line is truncated to `CFG.SIGN.COLS` (40); each line is centred and scaled to fit the sign width.
- A line may be `''`.

```
Wire.charCount(str) -> number
```
Optional helper: the number of characters after normalisation.

### 2.2 `WireData` (all arrays allocated once per build)
```
{ ex, tier, N,
  vbo:  ArrayBuffer(N*24)                          // the static VBO, uploaded as-is (STATIC_DRAW)
  f32:  Float32Array(vbo)   pos = f32[i*6+0..2], s = f32[i*6+4]
  i8:   Int8Array(vbo)      nrm.xyz = i8[i*24+12..14] (unit vector * 127), nrm.w = i8[i*24+15] (gradient, see below)
  u8:   Uint8Array(vbo)     colourIdx = u8[i*24+20], kind = u8[i*24+21], flags = u8[i*24+22], stiff = u8[i*24+23]
  pointString: Uint16Array(N)                       // string id, 0xFFFF = none
  str: { count, sA:F32, sB:F32, i0:U32, i1:U32 (exclusive), degree:U8 (0..18), res:I16 (resonator id | -1), len:F32 (world length) }
  res: { count, sA:F32, sB:F32, i0:U32, i1:U32, voice:U8 (VOICE.*), centre:F32(count*3) (world), name:string[] }
  sign: { i0, i1, iMid, sA, sB, byteOffset:i0*24, byteLength:(i1-i0)*24, strLine1, strLine2, resId,
          lines:[l1,l2], nChars, len1, charS:Float32Array(CFG.SIGN.LINES*CFG.SIGN.COLS+1) }
  el: { [name]: { i0, i1, sA, sB } }             // every named element and sub-range (§2.4)
  order: string[]                                 // top-level element names in wire order
  demoString, homePoint,                          // §2.4
  pivots: { sun:[x,y,z]|null, clock, planet, galaxy, lighthouse, probe : [x,y,z]|null, moonX:number|null } }
```
**Static VBO, 24 B per point** (the GPU layout Core binds):

| Attribute | Type | Bytes | Content |
|---|---|---|---|
| `a_pos` | 3 × f32 | @0 | base world position |
| `a_nrm` | 4 × SNORM8 | @12 | `vertexAttribPointer(loc, 4, BYTE, true, 24, 12)`; xyz = displacement direction; w = gradient factor encoded `round(g*254 − 127)` |
| `a_s` | f32 | @16 | wire parameter |
| `a_info` | 4 × UINT8 | @20 | `vertexAttribIPointer(loc, 4, UNSIGNED_BYTE, 24, 20)`: colourIdx, kind, flags, stiffness |

### 2.3 Invariants Core relies on
1. **Wire order and shares** follow spec §3.6 exactly. Element joins are BLANK hops (blank weight 0.12, ≥ 2 points). `s` is non-decreasing, with `s[0] = 0` and `s[N−1] = 1`.
2. **Anchors:** a turn > 35°, string ends and element joins get FLAG.ANCHOR plus 2 DWELL duplicates at the same position (same `s`). Stiffness is 255 at anchors and dwells and ramps 170 → 85 → 0 over the next 3 samples on each side; everything else is 0.
3. **Normals** are perpendicular to the tangent in the element's plane and smoothed over 5 points. FLOOR_H, FLOOR_V and SEA use +y. Normals are never zero-length; blanks copy their neighbour's normal.
4. **Colour:** `colourIdx` indexes the point's own exchange palette (`CFG.EXCHANGES[ex].col` names the slots). The shader colour is `mix(pal[c], pal[min(c+1,15)], g)` with `g = nrm.w*0.5 + 0.5`. Solid colours use g = 0.
   - Meridian floor: c = FLOOR_NEAR, g by depth (z 4 → −70).
   - Meridian sun: c = SUN_TOP with g over the upper half, then c = SUN_MID with g over the lower half.
   - Tide sea: c = SEA, g toward crest on near / high ridges.
   - Long Distance galaxy: c = GALAXY, g toward the core.
5. **Strings:**
   - Every point that is not BLANK, SECRET or KIND.STAR belongs to exactly one string, so `pointString[i] != 0xFFFF`. All other points are 0xFFFF.
   - Strings are contiguous runs between anchors, with ids in wire order (`sA` ascending).
   - Runs shorter than 0.5 world units merge into the preceding string, so there is no confetti. Serpentine connectors merge into the line they leave.
   - All pieces of one sun stripe (split by slits) share the degree computed from that stripe's full chord length.
6. **Degrees:**
   - Meridian FLOOR_H line k (k = 0 at z = 4, nearest): `⌊k/2⌋`.
   - FLOOR_V line j (x = −40 + 2j): `2 + ⌊|j−20|/2⌋`.
   - Tide sea ridge k (k = 0 nearest): `min(18, ⌊k/2⌋)`.
   - Everything else: `CFG.degreeForLength(str.len)`.
   - The two sign strings use the sign width.
7. **Resonators** (one per element; s-range = the whole element; strings inside them get `str.res`; their points get FLAG.RESONATOR):

   | Exchange | Element → voice |
   |---|---|
   | Meridian | `sun`→SUN, `billboard`→BILLBOARD, `clock`→CLOCK, `window`→WINDOW, `mast`→MAST |
   | Tide | `lighthouse`→CLOCK, `moon`→SUN, `billboard` (buoy sign)→BILLBOARD |
   | Long Distance | `planet`→SUN, `rings`→WINDOW, `probe`→MAST |

8. **Sign:**
   - Every exchange has an element `billboard` containing the text sub-range `sign`: the Meridian rooftop billboard, the Tide buoy sign, the Long Distance sign text.
   - `i0, i1, iMid, sA, sB`, byte ranges and the two string ids never change for a given `wd`.
   - Line 1 uses points `[i0, iMid)` and line 2 uses `[iMid, i1)`. Every sign point carries FLAG.BILLBOARD.
   - After regeneration, s stays inside `[sA, sB]` and non-decreasing. Unused budget is parked as BLANK points at the line's end.
   - **Typing:** `charS[k]` is the s at which char k's first ink point starts, for k = 0..nChars−1; `charS[nChars] = sB`. Characters are counted line 1 then line 2, spaces included; a space gets the next printable char's value. The shader hides sign points with `s ≥ uSignReveal`, so `uSignReveal = charS[k]` shows exactly the first k characters and `2.0` shows all.
9. **Kind conventions** (Wire generates in this frame; Core's shader applies the transform):
   - `SUN`: generated at the **risen** position, centre `pivots.sun = (0,9,−78)`, clipped to y ≥ 0. The shader adds `y += uSunRise − 6` (uSunRise 0 = sunk, 6 = risen) and hides sun points whose final y < 0.
   - `MTN_BACK`: back-ridge points only; the contour is STATIC.
   - `CLOCK_H`/`CLOCK_M`: hands are generated pointing **+y** from `pivots.clock`, in the face plane `z = pivots.clock[2]` (the face looks toward +z). The shader rotates clockwise by angle a: `dx' = dx·cos a + dy·sin a`, `dy' = −dx·sin a + dy·cos a`.
   - `LH_BEAM`: generated pointing +x from `pivots.lighthouse`, rotated about the vertical axis through it.
   - `PLANET`: rotated about the vertical axis through `pivots.planet`.
   - `GALAXY`: lies in the plane `z = pivots.galaxy[2]` and is rotated about the z axis through it.
   - Rotation about +y by `a` (both cases above): `dx' = dx·cos a + dz·sin a`, `dz' = −dx·sin a + dz·cos a`.
   - `PROBE`: translated by a uniform offset. `WINDOW`: intensity flicker. `SEA`: swell plus the moon column at `pivots.moonX`.
   - `STAR`: dwell points; twinkle only.
   - FLAG.BLINK: the mast top dwell.
   - FLAG.SECRET: the sky text `CFG.TEXT.secretSky` (z = −50, y = 20, width 30). Its strokes are `BLANK|SECRET`; the pen-ups between its strokes are BLANK only.

### 2.4 Element names (exact keys in `wd.el`; `order` lists the top level)
- **Meridian:** `floorH floorV mtnFront skyNearL skyMidL skyFar mtnBack sun billboard clock window mast skyMidR skyNearR sky`. Sub-ranges: `payphone` (inside skyNearR: booth, handset, keypad), `sign` (inside billboard), `secret` (inside sky).
- **Tide:** `sea cliff lighthouse lhBeam moon billboard ship sky`. Sub-ranges: `sign`, `secret`.
- **Long Distance:** `galaxy planet rings probe billboard sky`. Sub-ranges: `sign`, `secret`.
- `demoString`: the string June's ghost plucks.
  - Meridian: the sun stripe nearest the sun centre.
  - Tide: the moon stripe nearest its centre.
  - Long Distance: the planet's equator ring.
- `homePoint`: the point of `demoString` nearest its midpoint. Packets for button or keyboard pick-up start here.
- Free geometry choices are Wire's, within the spec's numbers: clock tower x/z, billboard x, mast x, cliff, ship. Keep the billboard centre at |x| ≤ 8 so it stays on screen in portrait.

---

## 3. Sound (`20-sound*.js`): everything audible, plus the transport and event bus

### 3.1 Lifecycle
| Call | Contract |
|---|---|
| `Sound.init({tier})` | Boot. **No AudioContext.** Anchors the transport at `U.now()` (bar 0 = now) on the perf clock and starts the 25 ms scheduler (`setInterval`). |
| `Sound.prewarm()` | Called once after the first frame. Optional idle work that needs no AudioContext. May be a no-op. |
| `Sound.unlock()` → bool | **Call synchronously inside a user-gesture handler.**<br>- Creates (once) `new AudioContext({latencyHint:'interactive'})` or resumes the existing one.<br>- Plays the silent data-URI `<audio>` once (try/catch).<br>- Installs capture-phase one-shot resume listeners (`pointerup touchend click keydown`) until the state is `running`.<br>- Starts KS bank rendering (4 ms chunks) and IR generation, using the FM e-piano as the pluck voice until the bank is ready.<br>- Returns true if a context exists. Idempotent. |
| `Sound.status()` | `'none' \| 'running' \| 'suspended' \| 'failed'` |
| `Sound.setMuted(m)` | `true`: masterGain → 0 in 60 ms, `suspend()` after 200 ms; the transport continues on the perf clock.<br>`false` (call inside a gesture): unlock / resume, align audio to the existing bar grid at the next downbeat, fade in 400 ms.<br>Never writes Store. Getter: `Sound.muted`. |
| `Sound.hide()` / `Sound.show()` | Visibility. `hide`: 120 ms tape-stop ramp, then `suspend()`. `show`: `resume()`, re-anchor to the next 16th, **never** play missed notes. |
| `Sound.setTier(t)` | Pad saws and polyphony (`CFG.TIERS[t]`). |
| `Sound.update(nowMs)` ⚡ | Once per frame, before `pollEvents`. Updates the perf↔audio offset EMA (§6.2), `bands`, `hats` and energy decay. |

### 3.2 Transport (works before any AudioContext; all values are perf ms in heard time)
| Call | Returns |
|---|---|
| `Sound.transport.bar(nowMs)` ⚡ | Float bars since bar 0 (negative before it). |
| `Sound.transport.barPhase(nowMs)` ⚡ | `fract(bar)` in [0, 1); this is `uBarPhase` (bead sweep). |
| `Sound.transport.nextDownbeat(nowMs, minAheadMs)` ⚡ | Perf ms of the first bar line ≥ nowMs + minAheadMs. |
| `Sound.transport.nextGrid(nowMs, perBar, minAheadMs)` ⚡ | Next grid line (perBar ∈ 1, 2, 4, 8, 16) ≥ nowMs + minAheadMs. |
| `Sound.transport.version` ⚡ | Integer, +1 on every re-anchor (pick-up, skip, show). Core resyncs its own grid schedulers when it changes. |
| `Sound.transport.anchorMs` | Perf ms of bar 0. |
| `Sound.perfToAudio(ms)` / `Sound.audioToPerf(sec)` | Conversions; −1 without a context. |
| `Sound.chord()` | Current chord index 0..3 (the chord of the bar now being heard). |

- **Pre-gesture:** bar 0 = boot time, so the bead sweeps every 2.5 s.
- **Handshake:** bar 0 = the downbeat.
- **Skip:** bar 0 moves to the new downbeat.
- **Unmute:** phase is preserved.

### 3.3 Handshake (§3.2 timelines are in `CFG.HANDSHAKE`)
| Call | Contract |
|---|---|
| `Sound.startHandshake(firstCall)` → `downbeatMs` | Call right after `unlock()` in the pick-up handler, or without it for "just watch".<br>- Plays the off-hook click immediately (if audible), then dial tone, DTMF, answer, chirps and the Am9 glide (FIRST or RETURN).<br>- Re-anchors so bar 0 = the downbeat.<br>- Queues `HS_DIGIT`, `HS_GLIDE` and `DOWNBEAT` on the event bus **whether or not audio exists**.<br>- At the downbeat the arrangement starts: E is floored at 0.35 for 8 bars; kick, pad and octave bass come in.<br>Returns `now + 2400` (first call) or `now + 1250` (return). |
| `Sound.skipHandshake()` → `downbeatMs \| −1` | 40 ms fade on the remaining telephony. The new downbeat is the next 16th ≥ 250 ms away. No further `HS_*` events fire; `DOWNBEAT` fires at the new time. Returns −1 when no handshake is pending. Getter: `Sound.inHandshake`. |
| Audio-start rule | The visual timeline (perf clock) is authoritative. If the context only starts running after a delay (iOS), audio joins the timeline in progress and skips parts that are already past. |

### 3.4 Event bus
```
Sound.pollEvents(nowMs, fn) ⚡      // fn(type, tMs, v0, v1)
```
- Fires each due event once, in time order. `tMs` is the event's heard perf time.
- Events more than `STALE_EVENT_MS` (1000) late are dropped, **except** `DOWNBEAT`, `KNIT_LAND` and `HS_*`, which are always delivered.
- The ring buffer holds 64 entries.

| type | Fires when | v0 | v1 |
|---|---|---|---|
| `KICK` / `SNARE` / `HAT` / `TOM` | each drum hit. **Also fires while muted or without a context** (the arrangement runs on the perf clock), so "just watch" breathes. | velocity | 0 |
| `BAR` | every bar line from the handshake downbeat on | bar index | chord index |
| `CHORD` | chord change, including bar 0 and knit landings | chord 0..3 | exchange |
| `DOWNBEAT` | handshake downbeat | 1 = first call, 0 = return | 0 |
| `KNIT_LAND` | a `scheduleKnit` landing | exchange | 0 |
| `GHOST_PLUCK` | a `pluck(…, atMs>now, tagA, tagB)` sounds (fires muted too) | tagA (string id) | tagB (`SRC.*`) |
| `HS_DIGIT` | DTMF digit i starts | i (0-based) | digit 0..9 |
| `HS_GLIDE` | the chord glide starts | ms until the downbeat | 0 |

### 3.5 Playing
| Call | Contract |
|---|---|
| `Sound.pluck(midi, vel, pan, flags=0, atMs=0, tagA=-1, tagB=-1)` | **Direct plucks** (`atMs ≤ now`) start at `currentTime` inside the caller's handler and queue no event. **Scheduled plucks** (`atMs > now`) play at that heard time and queue `GHOST_PLUCK(tagA, tagB)`.<br>Voice: KS, or FM when the current exchange's `pluckVoice` is `'fm'`. Chain: velocity LP → pan → playBus + sends (ping-pong delay included).<br>Flags:<br>- `STRUM`: energy +0.03 instead of +0.06·vel.<br>- `GHOST`: BP 600–2800 Hz, wet +0.25, −10 dB, random pan ±0.6, no energy.<br>- `JUNE`: ghost chain at −4 dB, no energy.<br>- `LIGHTHOUSE` and `NO_ENERGY`: no energy.<br>Slow beam: Sound plays midi − 12 automatically.<br>MIDI is clamped to the bank range. The top Meridian degree is MIDI 81, so the nearest bank (78) may be pitched up to +3 st.<br>Limits: rate ≤ 3 per instrument per 40 ms; voice cap by tier; steal the oldest-quietest with a 15 ms fade. |
| `Sound.chime(voice, amp, pan)` | Pitch = `CFG.chimePc(curEx, curChord, role)`:<br>- SUN: role 0, at `midiAtOrAbove(pc, root+24)`, FM bell 1:3.5<br>- CLOCK: role 2, at root+12, FM bell<br>- BILLBOARD: KS cluster of roles 4 / 0 / 2 at root+24, 40 ms apart<br>- WINDOW: role 1, FM e-piano 1:1, I 1.6<br>- MAST: role 0 at root+36, FM blip 1:7, 60 ms<br>Volume ∝ amp (0..1.5). Core applies the per-resonator limits. |
| `Sound.ping(pan)` | Ping bell (FM 2.0, chord root −1 octave, −14 dB). |
| `Sound.degauss()` | Thunk-hum recipe (§6.4). |
| `Sound.magnetHum(level)` | 0..1 rising hum for the strong magnet; 0 stops it. Call only on change. |
| `Sound.dtmf(ch)` | `'0'–'9' '*' '#'`, 120 ms. |
| `Sound.sit()` / `Sound.busy()` | SIT tones; busy tone 0.5 s on/off ×4. |
| `Sound.pullStart()` / `pullUpdate(t)` / `pullUnravel()` / `pullSnap()` / `pullCancel()` | Tension drone: `pullUpdate` takes t 0..1 (≤ once per frame) and glides up to +12 st.<br>`pullUnravel`: 7 Hz tremolo shimmer.<br>`pullSnap`: KS 76 + twang + kick + gated burst; stops the drone.<br>`pullCancel`: early release (sine 90→45 + KS 40); stops the drone. |
| `Sound.scheduleKnit(ex, landMs)` | At `landMs` (a bar line from `nextDownbeat`): switch the musical exchange, restart its progression at chord 0, crossfade reverb (hall / sea), play kick + new pad chord, and queue `KNIT_LAND(ex)` and `CHORD(0, ex)`. |
| `Sound.setExchange(ex)` | Immediate, no transition (boot / restore). |

### 3.6 Modes
| Call | Contract |
|---|---|
| `setSlow(on)` | Tape-stop / resume per §6.4. Drums and bass stop after the current beat; on release the bed resumes on the next downbeat. |
| `setDesk(e)` | e = `smoothstep(0,1,uPull)` 0..1 drives speakerLP / speakerPeak with `setTargetAtTime` τ 0.15. Call when Δ > 0.01. |
| `setIdle(level)` | 0 = active, 1 = party line (energy decays toward pad + soft kick), 2 = screensaver (E = 0, kick muted). |
| `setRetrace(on)` | Pad only, plus a music-box KS playing `call` + `callResolve` of the current exchange every 2 bars. |
| `setHandset(on)` | Master through the 300–3400 Hz handset band; the XY loop plays at −26 dB through LP 2.4 kHz. |
| `setHandsetPicture(xy)` | `Float32Array(2048)` interleaved x, y ∈ [−1, 1] (1024 stereo frames, L = x, R = y). Sound copies it. |
| `readXY()` ⚡ | `{l: Float32Array(2048), r: Float32Array(2048)}` (the same object every call), filled from analyserL / analyserR time-domain data (fftSize 2048). `null` when unavailable. |

### 3.7 Data for visuals ⚡
- `Sound.bands`: `Float32Array(64)`. Log bands 60 Hz–8 kHz, 0..1, attack 0.5 / release 0.92. Zeros without audio.
- `Sound.hats`: 0..1 level of the 6–10 kHz band.
- `Sound.energy`: E, 0..1.
- `Sound.debugNotes()`: QA only, not ⚡. Returns the last 256 triggered notes as `[{tMs, midi, src:'pluck'|'chime'|'bed'|'ghost'|…}]`.

Sound owns all of §6.1 (graph), §6.3 (energy, arrangement, progression at 2 bars per chord), §6.4 (instruments) and §6.7 (mute and lifecycle).

---

## 4. UI (`parts/ui.html` + `30-ui*.js`)

### 4.1 DOM contract (`ui.html`)
- **File start:** `<title>Party Line '85</title>`, then `<style>`. The first line of the style is `@import url('https://fonts.googleapis.com/css2?family=Monoton&family=VT323&display=swap');`. No doctype, html, head or body tags.
- **Root CSS:**
  - `:root { color-scheme: dark; … }` defines every token from spec §2. Repeat them identically under `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){…}}` and under `:root[data-theme="dark"]{…}`.
  - `html, body { height:100%; margin:0; overflow:hidden; overscroll-behavior:none; background:var(--void) }`. Never use `100vh`.
- **`<canvas id="scene">` (Core's; the only id Core needs):**
  - Attributes: `tabindex="0" role="application" aria-roledescription="interactive vector city"`, plus the full §9 `aria-label`.
  - CSS: `position:fixed; inset:0; width:100%; height:100%; display:block; touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; overscroll-behavior:none; z-index:0`.
  - Focus ring: §7.7.
- **UI-private ids** (Core never touches them): `#overlay #pickup #watch #status #status1 #status2 #controls #b-sound #b-slow #b-back #b-dial #b-help #hint #chips #toast #caption #live #dir #help #xy #nocarrier`.
- **Layers:** canvas 0, `#xy` 15, overlay 10, HUD 20, hint 25, chips / toast / caption 30, dialogs 40, `#nocarrier` 50.
- **Pointer events:** `#overlay` and the HUD containers use `pointer-events:none`; only their buttons use `auto`. A tap anywhere else therefore reaches `#scene`, which is how a tap picks up. Dialog backdrops capture pointers, and a click on the backdrop closes the dialog.
- **Before pick-up:** `#controls` is hidden or inert. Only `#pickup`, `#watch` and `#scene` are tabbable, and the status line is visible.
- `#xy` is a 140×140 `<canvas>`, bottom-left, `aria-hidden="true"`, hidden by default.

### 4.2 Core → UI
| Call | Contract |
|---|---|
| `UI.init(handlers, env)` | Once at boot. `env` = `CFG.detectEnv()` + `{calm:boolean}`. Wires DOM events; the overlay starts invisible. |
| `UI.showOverlay()` / `UI.hideOverlay()` | Fade in 400 ms (Core calls at warm-up t = 900 ms) / fade out 300 ms.<br>`hideOverlay` reveals `#controls`, and if focus was inside the overlay it moves focus to `#scene`. Idempotent. |
| `UI.setStatus(mode, ex, calls, callers)` | `mode` is a STATUS value. Line 1 comes from `CFG.TEXT.status`, line 2 from `CFG.TEXT.status.line2(calls)` (empty when calls is 0). Core calls it only on change. |
| `UI.setSound(on)` | Label `SOUND` / `MUTED`; `aria-pressed = on`. |
| `UI.setSlow(on)` | Pressed styling on SLOW. |
| `UI.setBack(isDesk)` | `STEP BACK` / `DIVE IN`. |
| `UI.setCalm(on)` | Root class `.calm` for the CSS motion fallbacks; CALM toggle state. |
| `UI.notify(evt)` | Hint and caption triggers (§4.4): `'downbeat' 'pluck' 'strum' 'pullStart' 'knit' 'slow' 'desk' 'degauss' 'input'`. |
| `UI.notePointer(x, y, isTouch)` ⚡ | Last pointer position (CSS px) and type, used for hint placement and touch/mouse copy. Store it only; no DOM work here. |
| `UI.chip(id, on)` | `'nodial'` or `'signal'`, with copy from `CFG.TEXT.chip`. |
| `UI.toast(text, ms=2500)` | |
| `UI.announce(text)` | `#live`, `aria-live="polite"`. |
| `UI.openDirectory(firstKey?)` | Opens the directory + keypad dialog. A `firstKey` is typed into the display and also calls `handlers.onDialKey`. |
| `UI.openHelp()` / `UI.closeModal()` | Close restores focus to the opener (or `#scene`). |
| `UI.isModalOpen()` ⚡ | |
| `UI.toggleHud()` | Key `H`: hides all HUD except `#hint`. |
| `UI.setXYVisible(on)` / `UI.drawXY(l, r)` ⚡ | Draws green XY points from two `Float32Array(2048)` arrays into `#xy`. |
| `UI.showNoCarrier()` | Shows the `NO CARRIER` overlay (§9 copy) and hides the overlay and HUD. |

### 4.3 UI → Core handlers (Core passes them to `UI.init`)
**Invoke `onPickUp`, `onSound` and `onSlow(true)` synchronously** from the DOM event (no timers or rAF), so the AudioContext unlock counts as a user gesture.

| Handler | Fired by |
|---|---|
| `onPickUp()` | PICK UP (click, or Enter/Space on the button) |
| `onJustWatch()` | the "just watch" button |
| `onSound()` | SOUND click |
| `onSlow(down)` | SLOW: `true` on pointerdown or Space/Enter keydown (repeats ignored); `false` on pointerup, pointercancel, lostpointercapture, keyup or blur. Suppress the button's own click. |
| `onBack()` | STEP BACK / DIVE IN click |
| `onDialKey(ch)` | each keypad press, from a button or from a key while the dialog is open (`'0'–'9' '*' '#'`) |
| `onCall(digits)` | CALL with a non-empty display (digits only). UI then clears the display and closes the dialog. |
| `onCalm(on)` | the CALM toggle |
| `onFullscreen()` | the help sheet's FULLSCREEN button (shown only if `env.fullscreen`) |
| `onModal(open)` | the directory or help opens or closes |

The DIAL and `?` buttons open their dialogs inside UI.

**The UI reads `Store.data`** for found entries, June's note and hints:
- Note index = `(calls − 1) mod 8`, giving the spec's notes 1..8.
- After `found.june`, the note is `555-0001. my line. (J)`.
- Meridian is always listed as found. `found.tide` and `found.orbit` reveal the other exchange entries; `operator`, `june` and `handset` reveal the secret entries.

### 4.4 Hints (UI owns timing, placement, copy and persistence)
- One hint at a time. Each fades in over 300 ms and hides on success or after 6 s.
- Calling `Store.setHint(n)` when a hint is shown marks it as never shown again.
- Skip any hint whose success verb has already happened this session.
- Copy is touch or mouse according to the last `notePointer` (initially `env.coarse`).
- Placement: 48 px above the last pointer, clamped to the safe area; otherwise bottom centre. On phones it sits 64 px above the controls row.

| # | Shown when | Success |
|---|---|---|
| 1 | 6 s after `downbeat` with no `pluck` | `pluck` |
| 2 | after #1 resolves: 5 `pluck`s, or 6 s without `input` | `strum` |
| 3 | 20 s after the first `strum` | `pullStart` |
| 4 | after the first `knit` | `slow` |
| 5 | 30 s after the first `slow` | `desk` |
| 6 | 60 s after #5 was due | `degauss` |

The first `desk` of the session also shows `CFG.TEXT.caption.desk` for 4 s, bottom centre.

### 4.5 Keyboard split
- **While `UI.isModalOpen()`:** UI handles every key (focus trap, Esc closes, digits `*` `#` type and DTMF, Backspace, Enter). Core ignores keys.
- **Otherwise Core** listens on `window`:
  - World keys (Enter, Space, arrows, WASD) act only when `document.activeElement` is `#scene`, `body` or null.
  - Shortcuts (`M H ? D F - + = 0-9 * # Esc` and Konami) act anywhere.
  - When a button has focus, Core does not `preventDefault` Enter or Space; the button handles them.

---

## 5. Core (`40–59` + `99-boot.js`)

### 5.1 Files and ownership
Suggested files:

| File | Contents |
|---|---|
| `40-gl.js` | GL kit + GLSL |
| `42-render.js` | `Renderer`: passes, uniforms, FBOs, governor hooks |
| `44-view.js` | `View`: camera springs, CPU projection, spatial hash, hit tests |
| `46-input.js` | `Input`: recognizer |
| `48-world.js` | `World`: state machine, packets, strings, ghosts, secrets |
| `52-fallback.js` | `Fallback`: Canvas2D |
| `55-app.js` | `App`: boot, loop, lifecycle, governor |
| `99-boot.js` | contains exactly `App.boot();` |

Core's internal APIs are its own business.

### 5.2 GPU data
- **Static VBOs A (current) and B (next):** the §2.2 layout. `wire_tf` binds 8 attributes: the four for A and the four for B.
- **Transform-feedback buffer:** N × 32 B, `DYNAMIC_COPY`, interleaved `v_pos` (world xyz, heat) @0 and `v_col` (rgb·I premultiplied, a = depth fade) @16.
  - `beam` binds this one buffer twice: P0/C0 at offset 0 and P1/C1 at offset 32, stride 32, divisor 1, N−1 instances.
  - Unbind it from `TRANSFORM_FEEDBACK_BUFFER` before drawing.
- **Palette:**

  | Uniform | Source |
  |---|---|
  | `uPalA[16]`, `uPalB[16]` (vec3) | `CFG.EXCHANGES[exA/exB].palLin` |
  | `uHeatA/B`, `uCoreA/B` | `.heat`, `.core` |
  | `uHue` | chord hue shift; `CFG.VIS.CHORD_HUE_DEG[chord]`, lerped over 1 bar on the `CHORD` event |

  The colour rule is in §2.3.4. The knit colour is `mix(colA, colB, k)`, using `infoA.x` for A and `infoB.x` for B.
- **Kind transforms:** apply A's kind to `posA` and B's kind to `posB`, separately. Kinds are unique per exchange, so one uniform set works; fill each pivot from whichever wire has it non-null.

  | Uniforms | Source |
  |---|---|
  | `uScroll`, `uSunRise` | Core |
  | `uBands[64]` | `Sound.bands` |
  | `uClockC`, `uClockAng` (h, m) | `pivots.clock`; angles from local time |
  | `uLhC`, `uLhAng` | `pivots.lighthouse`; `uLhAng = TAU·bar/8` from `Sound.transport.bar` |
  | `uPlanetC`, `uPlanetAng` | `pivots.planet` |
  | `uGalaxyC`, `uGalaxyAng` | `pivots.galaxy` |
  | `uProbeOff` | Core's drift |
  | `uMoonX` | `pivots.moonX` |
  | `uHats` | `Sound.hats` |
  | `uSignReveal` | per buffer side |

- **Persistence:** `uDecay` is a spring toward `decayVec` of the current exchange.

### 5.3 Frame loop
Order per frame:
1. `now` = the rAF timestamp; clamp dt to 50 ms.
2. `Sound.update(now)`, then `Sound.pollEvents(now, onEvent)`.
3. The shared `FixedStep(1/120, 6)` steps every spring.
4. Drain input.
5. Update packets, strings, ghosts and chimes.
6. Upload uniforms, plus `bufferSubData` only for sign changes.
7. Render the passes.
8. Sample the governor.
9. If the handset is on: `UI.drawXY(…)` from `Sound.readXY()`.

### 5.4 Cross-module flows (who calls what)
- **Boot / warm-up:**
  - The carrier bead uses `Sound.transport.barPhase(now)`.
  - The silent ghost demo and line-noise packets are spawned directly; Core makes no Sound call before pick-up.
  - At t = 900 ms: `UI.showOverlay()`.
  - Meridian's billboard reveal is set to `charS[len1]`, so only `MERIDIAN` shows.
- **Pick-up** (canvas pointerdown, Enter/Space on the canvas, or `onPickUp`), all inside the same handler:
  1. `first = Store.data.calls === 0`, then `Store.set('calls', calls + 1)`.
  2. Sound: `Sound.unlock()`, `Sound.setMuted(false)`, `Store.set('muted', false)`.
  3. `db = Sound.startHandshake(first)`.
  4. Spawn a packet at the touch point (or `homePoint`).
  5. UI: `UI.hideOverlay()`, `UI.setStatus(HANDSHAKE, ex, calls)`, `UI.setSound(true)`.
  6. Retarget the sun rise to land at `db`.
  7. After `CFG.HANDSHAKE.NODIAL_CHECK_MS`: if `!Sound.muted && Sound.status() !== 'running'`, call `UI.chip('nodial', true)`. Hide the chip once the status is running.

  **Just watch** is the same, except: no `unlock`; `Sound.setMuted(true)`; `Store.set('muted', true)`; `UI.setSound(false)`.
- **Handshake events:**
  - `HS_DIGIT(i)`: a packet at `s = DIGIT_S0 + DIGIT_DS·i`; sign reveal through that digit of line 2; exposure step.
  - `DOWNBEAT`:
    - state → PLAY; exposure 1; bloom swell; bead.
    - `Wire.setSignText(wd, …CFG.TEXT.sign.welcome(calls))`, typed at 28 ms per char.
    - `UI.setStatus(PLAY or MUTED)`, `UI.announce(connected[ex])`, `UI.notify('downbeat')`.
    - June's audible pluck: `Sound.pluck(CFG.degreeToMidi(ex, str.degree[demo]), 0.8, 0, PLUCK.JUNE, tMs + 2·BEAT_MS, demo, SRC.JUNE)`.
  - A **skip tap** calls `Sound.skipHandshake()` and retargets springs to the returned time. The tap is also processed as a normal pluck or ping.
- **Pluck** (recommended: on pointerdown when a string lies within the snap radius, so sound starts in the handler):
  1. `Sound.pluck(CFG.degreeToMidi(ex, degree), vel, pan)`.
  2. Spawn the packet, then 3 echo packets at `+n·DOTTED8_MS` (amp ×0.38ⁿ, alternating cyan/magenta tint). Strums get no echoes.
  3. Start the string ring; `UI.notify('pluck')`.

  A tap or strong-magnet release in empty space → `Sound.ping(pan)` and the ping ring.
- **Chimes:** Core tracks both fronts `s0 ± PACKET_SPEED·age` of each packet.
  - Remaining amplitude = `amp·exp(−f/1.2)·exp(−0.25·age)`, with f = PACKET_SPEED·age.
  - When a front enters a resonator's [sA, sB] (a packet born inside counts) with remaining > 0.3, call `Sound.chime(res.voice[r], remaining, panOf(res.centre))`.
  - Limits: 1 per resonator per 400 ms, 2 per packet.
- **Pull / knit:**
  1. Long-press on a string → `Sound.pullStart()`, `UI.notify('pullStart')`.
  2. While dragging → `Sound.pullUpdate(t)`.
  3. At threshold, held 500 ms → `Sound.pullUnravel()`, `UI.announce(unravel)`.
  4. Release after unravel:
     - `Sound.pullSnap()`; `land = Sound.transport.nextDownbeat(now, VIS.KNIT_MIN_MS)`; `Sound.scheduleKnit(next, land)`.
     - Build or upload B; drive `uK` so that it reaches 1 **exactly at `land`**; vibrate.
  5. On `KNIT_LAND`: swap A↔B (uK = 0). Then `Store.set('lastExchange')`, `Store.setFound(foundKey)`, `UI.setStatus`, `UI.announce(connected)`, `UI.notify('knit')`.
  6. Early release → `Sound.pullCancel()` and the wobble spring.
- **Dial:** `onCall(d)` → `CFG.dial(d)`:
  - `exchange` → an automatic pull/unravel/knit (the same Sound calls, driven by a timeline).
  - `operator` → June circles her window; the sign shows `TEXT.sign.operator`; `setFound('operator')`.
  - `retrace` → RETRACE state for 16 bars; `Sound.setRetrace(true)`; `setFound('june')`.
  - `busy` → `Sound.busy()` and the busy sign.
  - `sit` → `Sound.sit()` and the SIT sign.
  - `onDialKey(ch)` → `Sound.dtmf(ch)`.
  - New secrets: `UI.toast(TEXT.toast.found(TEXT.found[k][0]))` + `UI.announce(TEXT.announce.found(TEXT.found[k][1]))`.
- **Slow beam:** any of {right-hold, two-finger still, Space on the canvas, `onSlow`} is active → `Sound.setSlow(true)`, `UI.setSlow(true)`, status, announce, `UI.notify('slow')`. When all release, undo each of these.
- **Desk view:** `Sound.setDesk(e)`, `UI.setBack(zoomT < 0)`, status, announce, `UI.notify('desk')`.
- **Degauss:** `Sound.degauss()`, `UI.notify('degauss')`.
- **Strong magnet:** `Sound.magnetHum(level)` while held; release → ping.
- **Handset** (double-tap the payphone zone):
  - `Sound.setHandset(true)` and `UI.setXYVisible(true)`.
  - `Sound.setHandsetPicture(xy)`: the current wire projected with the rest camera into [−1, 1]² and downsampled in s order to 1024 points. Send it on entry, every 2 s, and on exchange change.
  - `setFound('handset')`. Exit with a double-tap or Esc.
- **Konami:** toggles the composite overlay; `UI.toast(TEXT.toast.overlay)`; `setFound('konami')`.
- **Idle:** Core tracks the last user input.
  - `Sound.setIdle(1)` at 45 s: ghosts; status PARTY with the callers count.
  - `Sound.setIdle(2)` at 3 min.
  - Any input → `setIdle(0)` and `UI.notify('input')`.
  - Ghost, June and lighthouse plucks are **scheduled by Core** on `Sound.transport.nextGrid(now, 8 or 4, 150)` with `Sound.pluck(midi, vel, pan, GHOST|JUNE|LIGHTHOUSE, atMs, stringId, SRC.*)`. The packet spawns when `GHOST_PLUCK` arrives.
- **June's call / answer:** Core plays `call` pitch classes on strings whose degree has that pc (one per quarter note), then opens a 10 s detection window over the user's plucked pcs. On success:
  - window flare, the reversed reply, `TEXT.sign.june`
  - `setFound('june')`, toast, announce
- **Mute (`M` / `onSound`):** `Sound.setMuted(x)`, `Store.set('muted', x)`, `UI.setSound`, `UI.announce`, status.
- **Hidden / visible:** stop rAF + `Sound.hide()` + `Store.flush()` / `Sound.show()` + power-on + rAF.
- **Context loss:** `UI.chip('signal', true)`; on restore, rebuild everything (`Wire.build` again; the same bytes) and then `UI.chip('signal', false)`.
- **No WebGL2:** `Fallback` draws `Wire.build(EX.MERIDIAN, 0)` with `CFG.cameraRest` + `M4`, then `UI.showNoCarrier()`. Zero console errors.
- **Esc** (no modal open): handset → Konami → retrace → desk view → otherwise auto-knit to Meridian if not already there.

### 5.5 Boot order (`App.boot()`, called by `99-boot.js`)
1. `Store.load()`; `env = CFG.detectEnv()`; `tier = CFG.pickTier(env, Store.data.tier)`; `calm = Store.calm(env)`.
2. `UI.init(handlers, {...env, calm})`; `UI.setStatus(STATUS.ONHOOK, EX.MERIDIAN, 0, 0)`.
3. `Sound.init({tier})` (no AudioContext); `Sound.setExchange(EX.MERIDIAN)`.
4. Create the WebGL2 context. On failure: Fallback + `UI.showNoCarrier()` and stop.
5. Compile `crt` synchronously and paint the first frame (glass + dot).
6. On the next tick: compile the other programs in parallel; `Wire.build(EX.MERIDIAN, tier)`; upload; `Sound.prewarm()`; start the warm-up timeline (line at 250–600 ms, knit at 600–1400 ms, `UI.showOverlay()` at 900 ms, ON HOOK at 1400 ms).

The world always boots into Meridian; `lastExchange` is informational only.

### 5.6 QA handle
In `App.boot`, inside try/catch:

```js
Object.defineProperty(window, '__pl85', { value: { App, Sound, Wire, UI, Store, CFG }, configurable: true })
```

Also expose `App.debug()` → `{state, ex, tier, fps, packets, muted, zoom, slow}`. This is the only `window` write.

---

## 6. Timing cheat-sheet
| Quantity | Value |
|---|---|
| Bar | 2500 ms |
| Beat | 625 ms |
| 16th | 156.25 ms |
| Echo (dotted 8th) | 468.75 ms |
| First-call downbeat | +2400 ms |
| Return-call downbeat | +1250 ms |
| Skip | downbeat at the next 16th ≥ 250 ms away |
| Knit | lands on `nextDownbeat(now, 1200)` |
| Typing | 28 ms per char |
| Hints | 300 ms in, 6 s max |
| Overlay | 400 ms in / 300 ms out |
| Power-on | 600 ms (calm: 300 ms) |
| Degauss | 0.9 s (calm: 0.4 s fade) |

## 7. Judgement calls (deliberate deviations and clarifications of the spec)
1. **Sign capacity is 2 × 40, not 2 × 26.** The spec's own copy needs 31 characters (`SUBSCRIBERS ONLINE: 1 · CALL #1`, `SWELL 4FT · ALL CALLERS WELCOME`) and 38 (`LINES CLOSED 12-31-86. I'M STILL HERE.`). Text is centred and scaled per line.
2. **On-hook Meridian sign** is `MERIDIAN` / `555-0185` with line 2 hidden; `HS_DIGIT` reveals it digit by digit (a return call reveals the first 6 characters at once).
3. **Gradient colour** uses the otherwise-unused `a_nrm.w`: `mix(pal[c], pal[c+1], g)`. Heat and core colours are per exchange, all taken from spec hexes (Tide `#FFE3A3/#FFF7E0`, Long Distance `#FFE6FF/#FFF2FA`).
4. **Portrait camera:** spec §5.5 leaves the "…" in the vFov formula unspecified. It is implemented in `CFG.cameraRest`: `tan(hFov/2) = 0.33` (giving sun ≥ 55% of width at 380 px), vFov clamped to [50°, 78°], and the horizon placed 46% from the top. Landscape uses the spec values unchanged.
5. **Retrace alpha for non-secret blanks is 0.35** (spec: 0.6) so the message stays legible. Pen-ups inside the secret text are plain BLANK.
6. **PICK UP / tap / Enter always turns sound on**, which is what the button's label says. "just watch" mutes. The persisted `muted` records the last explicit choice and never blocks pick-up.
7. **Drum events fire while muted or without audio**, so "just watch" still breathes on the beat.
8. **Pitch crosses the API as MIDI** (Core converts with `CFG.degreeToMidi`), and Sound adds the −12 for slow beam. Meridian degree 18 is MIDI 81, 3 st above the top KS bank (78), which is allowed.
9. **`calls` increments at pick-up.** `CALL #n` = `calls`. June's note = `(calls−1) mod 8` + 1 in the spec's numbering. Status line 2 is empty while on hook.
10. **The `elastic()` ease returns exactly 1 at x ≥ 1.** Core swaps A↔B as soon as a knit completes, so no residual is left.
11. **Strings** merge runs shorter than 0.5 units, and every piece of a sun stripe shares one degree. Tide sea ridges use `min(18, ⌊k/2⌋)`.
12. **Every exchange's sign element is named `billboard`, with the text sub-range `sign`.** A wrong-number or operator message types on the current exchange's sign.
13. **The breathing ring over the sun is a `crt` overlay owned by Core.** It shows from downbeat + 6 s until the first pluck. The hint text stays with UI.
14. **Chime "remaining amplitude"** is defined as the heat envelope `amp·e^(−f/1.2)·e^(−0.25·age)`.
15. **`window.__pl85`** is the single permitted global, as a QA handle.
16. **Toasts are only for secrets** (operator, June, handset, overlay). Finding Tide Line or Long Distance just fills the directory and announces the connection.
