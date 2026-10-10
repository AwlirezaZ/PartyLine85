# PARTY LINE '85: Build Spec v1.0

> **Decision record.** Three pitches tied at 22 points. I am building **Party Line '85**. It is the only pitch with a premise nobody has seen before (wow 9), and every fatal flaw the judges raised against it is an *execution* flaw: sparse look, slow opening, thin touch targets, content scope, RGBA8 ghosting. This spec fixes each one directly. The runner-ups' flaws are *structural*. Gridskin's fixed sim domain cannot cover a perspective plane, and its gesture set is a swamp. PHOSPHOR's identity depends on a room it planned to cut. So they contribute grafts instead of the core:
> - **Gridskin**: the first touch is the entry, the magnetic reticle, hitstop, and discovery slots.
> - **PHOSPHOR**: downbeat choreography, springs everywhere, and the pull-back reveal.
> - **GRIDSONG**: audio-clock event sync, visible delay echoes, spectrum mountains, and sidechain breathing.
>
> **Tech:** zero-dependency raw WebGL2, Web Audio and vanilla JS in one file (~3,200 lines). No external scripts at all.

---

## 1. Name & description

- **`<title>`:** `Party Line '85`
- **One sentence:** Pick up a phone line that was cut in 1986 and play Meridian, a neon city drawn by one unbroken beam of light, where touching any line sends a note through the whole world.
- **Publish metadata:** icon `phone`. Description: "A 1985 party line where a neon city drawn by one beam of light rings when you touch it."

---

## 2. Premise & art direction

### Premise
In this 1985, vector displays beat raster TV. Halcyon Bell sold the **LINEA**, a home terminal that plugs into your phone jack. You dialled **555-0185** and the shared city of **Meridian** came down the copper as stereo audio. An oscilloscope steers its beam with two channels, so a picture *is* a sound. The LINEA drew the whole city with **one beam that never lifts**: the skyline, the striped sun, the grid, the billboard letters and the payphone are all one wire. Subscribers plucked it to play music to strangers. Service ended at 23:59 on 31 Dec 1986. You found a LINEA at an estate sale and the line is still open. Operator Seven, June, never hung up.

The story is only whispered: a status line, a billboard, a note in the directory. **Play comes first.** You touch a line, it rings, and you *watch the vibration travel* through the sun, down the horizon, up a tower, through the billboard letters and into the grid.

### Why this is not a synthwave cliché
- **The cliché gets a reason.** The sun's stripes are the beam's zigzag fill. The grid is one serpentine wire. The stars are where the beam pauses during its retrace. Every iconic element follows the one-wire rule.
- **No scanlines, on purpose.** Vector tubes have none. We use curvature, halation, convergence fringes and two-stage phosphor instead.
- **The sound world is the telephone:** dial tone, DTMF, a modem warble that turns into a chord, and "not in service" tones.
- **No hidden-line removal** (authentic vector x-ray look). The only exception is the sun, which generators clip against the silhouettes in front of it.
- **One physical rule does all the work:** it's one string, so touching any part touches all of it.

### Palette (exact hex; all colours become CSS tokens or GLSL palette uniforms)

| Token | Hex | Use |
|---|---|---|
| `--void` | `#05030A` | body background, tube black |
| `--glass` | `#0B0718` | glass tint added in composite |
| `--wall` | `#07060C` | desk-view room base |
| `--bezel` | `#14111C` | LINEA bezel plastic |
| `--panel` | `#0D0A1FC7` | HUD panels (78% alpha) |
| `--ui-text` | `#D8FBFF` | HUD text |
| `--ui-dim` | `#8A86B8` | secondary HUD text |
| `--focus` | `#3DF5FF` | focus rings |
| `--accent` | `#FF3D9A` | hover, active |
| `--warn` | `#FFC861` | NO DIAL TONE / SIGNAL LOST chips |
| **Meridian ("Halcyon" phosphor)** | | |
| floor near / far | `#E62CFF` → `#FF3D9A` | grid gradient by depth |
| sun top / mid / bottom | `#FFD15C` / `#FF7A3D` / `#FF2E88` | sun gradient by y |
| mountains back / front | `#7B4DFF` / `#3DF5FF` | |
| skyline far / mid / near | `#5B3DFF` / `#3DF5FF` / `#FF3D9A` | |
| text | `#FFF2FA` | billboard, clock |
| June's window | `#FFC861` | always lit |
| stars (dwell) | `#CFE9FF` | |
| heat flash → core | `#FF5FB0` → `#FFF4FB` | plucked segments |
| afterglow result | `#19C8B4` | decay per 60 Hz frame R .78 / G .935 / B .885 |
| **Tide Line ("P3 amber")** | `#FFB347` sea, `#FFE3A3` crests/text, `#FFF0C9` moon, `#FF8A1F` lighthouse, `#FFF7E0` beam | decay R .94 / G .87 / B .70 (trails `#B34A00`) |
| **Long Distance ("violet")** | `#9D7BFF` planet, `#3DF5FF` rings, `#C77DFF` galaxy, `#FFE6FF` core, `#FFF2FA` probe | decay R .86 / G .80 / B .945 (trails `#4B2BFF`) |

### Fonts (Google Fonts)
- **Monoton** for the title only. Fallback: `"Arial Black", Impact, sans-serif` with `letter-spacing: .12em`.
- **VT323** for all HUD, hints, directory and keypad text. Fallback: `"Courier New", ui-monospace, monospace`.
- Load with `@import url('https://fonts.googleapis.com/css2?family=Monoton&family=VT323&display=swap');` as the first line of `<style>`. Text inside the world (billboard, clock) is **not** a font. It is the built-in single-stroke vector font, part of the wire.

### Mood references
Vectrex and Atari *Tempest* / *Battlezone* vector monitors, Jerobeam Fenderson's oscilloscope music, *Tron* (1982) wireframes, 1980s Bell System ads and touch-tone phones, *Blade Runner* dusk skyline, radar P7 phosphor afterglow.

### Fatal-flaw fixes (every judge flaw, with its fix)

| Flaw | Fix in this spec |
|---|---|
| Thin lines look sparse | Dense serpentine fills (44-stripe sun, 78-line grid, moon, sea), 12k–48k points, vertex dwell hot spots, two-stage phosphor trails, **glass halation** (widest bloom mip spread across the frame), 3 parallax depths. The city is at full density before any gesture (§3.1). |
| Slow, harsh opening | Handshake takes **2.4 s** on the first call and **1.25 s** on a return, at −22 to −26 dB and low-passed. A second tap skips to the downbeat within 250 ms. The first touch *is* the entry. |
| Heavy content authoring | Everything is procedural math plus one 46-glyph stroke font. Three exchanges only. Cut: Weather, Switchboard/verlet cords, portrait, fireworks. |
| No rhythmic bed | A 96 BPM "carrier" bed (pad + soft kick + octave bass from the first downbeat) builds with play energy. A carrier bead sweeps the whole wire once per bar. |
| Thin touch targets | Screen-space spatial hash with **44 CSS px snap** (56 px for long-press), a magnetic reticle and string highlight on hover or touch. A tap that misses all lines becomes a **ping**, which is never silent. |
| RGBA8 decay ghosting | Persistence uses `max(prev*decay − ε, 0)` with ε = 1.5/255 on RGBA8, plus composite dither. |
| Depth relies on reading and dialling | Core depth is physical: pluck, strum, pull the thread, slow the beam, degauss, call-and-response by ear. Dialling is an optional secret layer. |
| Vector look drifts from the lush synthwave the user picked | The canonical synthwave composition (grid to a striped sun between mountains) is kept as the home world, with full bloom and halation. |
| Quantize lag (GRIDSONG) | Direct touches sound inside the event handler. Only echoes and the bed are clock-locked. |
| Gesture overload | 7 verbs. No three-finger gestures. No velocity-only distinctions. Every verb has a button or key. |

---

## 3. Experience flow

### 3.1 Boot / warm-up (silent; the world is alive before any gesture)

| t (ms) | What happens |
|---|---|
| 0–150 | First frame: `--glass` black with a faint Fresnel highlight, and one white-hot dot wobbling at the centre (jitter ±1.5 px, 9 Hz). Drawn analytically in `crt.frag`, so only that one program is needed before first paint. |
| 250–600 | The dot stretches into a horizontal line across 92% of the width with a spring overshoot. This is the "warm-up" line shape (§5.2). |
| 600–1400 | **The line ties itself into Meridian.** This uses the same knit morph as exchange changes, staggered outward from the centre (`g = 0.5`). |
| 1400 → | Full-density Meridian at **60% exposure**. The sun is half-sunk (centre y = 3). The grid scrolls toward the viewer at 0.6 units/s. Every 3.5 s a faint "line noise" packet (amp 0.25) runs from a random point. A carrier bead sweeps the wire every 2.5 s (performance clock, 96 BPM). |
| 900 → | Overlay fades in (400 ms). **The magnet is live:** lines bow around the mouse or a resting finger. |
| 1600 | A faint ghost crosshair (June) plucks the centre sun stripe **silently**. The packet visibly runs the whole wire. This teaches the core idea before any sound. It repeats every 7 s while on hook. |

### 3.2 Pick-up (the enter + sound-on moment)
**Triggers:** the first `pointerdown` anywhere on the canvas, the **PICK UP** button, or Enter/Space while the canvas or button has focus. In the same handler: create/resume the AudioContext (resume again on `pointerup`/`click` for iOS), play the silent data-URI `<audio>` once inside try/catch, play the off-hook click, inject a pluck packet at the touch point (or at the sun centre for button or keyboard), and start fading the overlay out (300 ms).

**First call** (localStorage `calls == 0`). t is measured from the gesture:

| t (ms) | Audio | Visual |
|---|---|---|
| 0 | off-hook click | packet at touch point; status `◔ DIALING 555-0185` |
| 0–350 | dial tone 350 + 440 Hz, −24 dB | — |
| 350–1050 | DTMF 5-5-5-0-1-8-5, 70 ms on / 30 ms off, −22 dB | each digit launches a packet from s = 0.12 + 0.11·i; the billboard reveals `555-0185` digit by digit; exposure steps 60% → 85% |
| 1050–1250 | 2100 Hz answer tone, low-passed 2.8 kHz, −26 dB | — |
| 1250–1650 | FM chirps 600→1800 Hz, 18 Hz vibrato, −26 dB | — |
| 1650–2150 | three carriers glide (exponential, 500 ms) to Am9 tones A2, E3, G3, B3, C4 and become the pad | sun rises y 3 → 9 on a spring timed to settle at 2400 |
| **2400 = DOWNBEAT** | kick, pad, octave bass in | exposure reaches 100%, bloom swell +30% decaying over 600 ms, first carrier bead, billboard types `WELCOME BACK TO MERIDIAN` / `SUBSCRIBERS ONLINE: 1 · CALL #1` at 28 ms per character; status `● LINE OPEN · 555-0185 · MERIDIAN` |
| 3650 (beat 3) | sun chime and sympathetic chimes | June's ghost crosshair **audibly** plucks the centre sun stripe; the wave runs down the stripes, along the horizon, up the far towers, through the billboard letters and into the grid |
| 6000 | — | if the user has not plucked yet: hint `touch the lines` plus a breathing ring over the sun |

- **Returning call** (`calls ≥ 1`), "redial": click at 0. Dial tone 0–200 ms. DTMF `8`,`5` from 200–400 ms. Chord glide 400–1000 ms. **Downbeat at 1250 ms.**
- **Skip:** any tap during the handshake cancels the remaining telephony (40 ms fade) and schedules the downbeat at the next 16th ≥ 250 ms away. Springs retarget to land on it.
- **"just watch":** the same visual timeline runs on the performance clock with no AudioContext. Status: `● LINE OPEN · MUTED`. SOUND turns audio on later and re-anchors to the next downbeat.

### 3.3 Core loop (first minute)
You tap a line and it rings (Karplus-Strong string). The touched string flashes white-hot pink and vibrates as a standing wave. A wave packet races both ways along the wire, and its echoes follow at dotted-eighth intervals, matching the ping-pong delay you hear. When the packet reaches a landmark (sun, clock, billboard, June's window, radio mast) that landmark chimes. Strumming across the sun's stripes plays a harp glissando. Every kick makes the city breathe (−8% exposure).

### 3.4 Idle
- **Pre-gesture:** see §3.1. It is hypnotic and silent indefinitely.
- **45 s with no input after pick-up: PARTY LINE.** 1–3 ghost crosshairs (pale cyan, amber for June) drift on springs and pluck or strum generative phrases. Their sound is band-passed 600–2800 Hz with more reverb, so it sounds distant. Status: `● PARTY LINE · 2 CALLERS`. Bed energy decays toward pad + soft kick.
- **3 min idle: screensaver.** The kick drops out (pure ambient). The camera does a slow dolly drift (amplitude 3 units, period 90 s). Every 4 minutes the beam auto-slows for one bar.
- **Any input** fades the ghosts out over 400 ms and hands control back mid-phrase with no cut.

### 3.5 Escalation over minutes
- **0–1 min:** plucks, strums. Hints teach one verb at a time.
- **~45 s:** June's ghost plays **THE CALL** (a 5-note phrase, §10) when the user has been idle for at least 6 s. Repeats every 48 s.
- **1–3 min:** energy builds the bed (hats → snare → four-on-the-floor kick, §6.3). Hint: pull the thread. The first unravel goes to **Tide Line**, where the lighthouse plays the sea by itself.
- **3–5 min:** slow the beam, step back to the desk, unravel to **Long Distance**, back to Meridian. The directory fills with found exchanges.
- **5+ min:** secrets (§10): answer June, Retrace, Operator, wrong numbers, the handset, the Konami overlay. Each visit shows a new note from June and a higher `CALL #n`.

### 3.6 The three exchanges (worlds)

All exchanges share the same point count N, so every transition is a pure vertex morph.

**MERIDIAN** (555-0185, home, A minor). Camera eye (0, 1.6, 6), target (0, 5.5, −60). The wire runs in this order (this order is how packets travel):

| # | Element | Share of N | Geometry | Colour | Kind / notes |
|---|---|---|---|---|---|
| 1 | Floor horizontals | 16% | 37 lines z = 4 − 2k, x ∈ ±40, serpentine | floor gradient | `floorH` (scroll); line k → degree ⌊k/2⌋, so a strum toward the horizon ascends |
| 2 | Floor verticals | 12% | 41 lines x = −40 + 2j, z 4 → −70 | floor gradient | `floorV`; degree 2 + ⌊\|j−20\|/2⌋ |
| 3 | Front mountains | 5% | z = −60, x ±70, ridge + 2 contours, anchors at peaks | `#3DF5FF` | tuned by length |
| 4 | Near-left skyline | 6% | 6 buildings, z −14…−22, x −8…−26, h 6–14, window rows as dashes | `#FF3D9A` | |
| 5 | Mid-left skyline + June's building | 6% | z = −30, h 3–11; avenue clear for \|x\| < 7 | `#3DF5FF` | |
| 6 | Far skyline | 7% | 22 buildings z = −45, h 4–14; clear for \|x\| < 11 | `#5B3DFF` | |
| 7 | Back mountains | 5% | z = −72, ridge + 1 contour | `#7B4DFF` | `mtnBack`: ridge y += spectrum |
| 8 | **Sun** | 16% | centre (0, 9, −78), r = 16, 44 horizontal stripes, serpentine; lower-half stripes blanked in slits that widen toward the bottom; clipped below y = 0 and against mountain and skyline silhouettes from the rest camera | gold → coral → pink | `sun` (rise offset); **resonator**; each stripe is a string |
| 9 | Billboard | 7% | rooftop of the mid building (z = −28, 9 × 3), frame + 2 text lines × 26 chars | `#FFF2FA` | `billboard` subrange; **resonator** |
| 10 | Clock tower | 3% | face r = 1.4 at y = 13, 12 dwell ticks, hour/minute hands showing **real local time**, tiny text `31 DEC 86` | `#FFF2FA` | `clockH` / `clockM`; **resonator** |
| 11 | June's window | 1% | 1.4 × 1.0 amber serpentine fill, 9 passes | `#FFC861` | **resonator**; flickers ±6% |
| 12 | Radio mast | 2% | 22 high lattice zigzag, blinking top dwell (1 Hz) | `#3DF5FF` | `blink`; **resonator** |
| 13 | Mid-right skyline | 4% | | `#3DF5FF` | |
| 14 | Near-right skyline + **payphone** | 4% | booth at (4.2, 0, −4): outline, handset, 3×4 dwell keypad | `#FF3D9A` | payphone hit zone |
| 15 | Sky retrace | 6% | 140 dwell stars joined by blank hops; secret blank text `I KNEW SOMEONE WOULD PICK UP` at z = −50, y = 20, width 30 | `#CFE9FF` | `star` twinkle; flag `secret` |

**TIDE LINE** (555-0127, D Dorian, amber). Eye (0, 3.2, 8), target (0, 4, −60). Wire order:

| Element | Share of N | Notes |
|---|---|---|
| Sea | 50% | 40 stacked ridgelines z −2…−70, serpentine; `sea` kind: y += Σ3 travelling sines (swell) + noise; points near x = moonX are brightened ×(1 + 1.5·exp(−((x−moonX)/3)²)) to make a reflection column |
| Cliff & rocks (right) | 6% | |
| Lighthouse | 6% | tower and gallery; **resonator** |
| Lighthouse beam | 4% | 2 lines; `lhBeam` kind rotates around y, period 8 bars |
| Moon | 12% | serpentine fill r = 7 at (−16, 15, −78); **resonator** |
| Buoy sign | 7% | `TIDE LINE · 555-0127` / `SWELL 4FT · ALL CALLERS WELCOME`; **resonator** |
| Distant ship | 2% | |
| Stars + retrace + secret text | 13% | |

The lighthouse is a **self-playing tidal harp**: on each 8th note, the ridge under the beam's current azimuth is plucked (generative, Dorian, velocity 0.35–0.6).

**LONG DISTANCE** (1-555-0199, E Lydian, violet). Camera at (0, 8, −10) looking at the planet centre (0, 6, −40), with yaw sway ±25° and a 60 s period (static under reduced motion). Wire order:

| Element | Share of N | Notes |
|---|---|---|
| Galaxy | 28% | 2-arm log spiral r ≤ 60 at z = −120, serpentine across arm width, dwell stars; `galaxy` kind rotates slowly |
| Planet | 32% | r = 9; 24 latitude rings serpentine + 10 meridians; `planet` kind spins around y; **resonator** |
| Rings | 14% | 3 ellipses spiral-linked, tilted 18°; **resonator** |
| Probe | 6% | dish, body, antenna, panels; drifts; **resonator** |
| Sign text | 7% | `LONG DISTANCE` / `PLEASE HOLD` |
| Stars + retrace + secret text | 13% | |

### 3.7 States & transitions

| State | Enter | Exit | Transition |
|---|---|---|---|
| WARM-UP | load | 1.4 s | dot → line → knit |
| ON HOOK | after warm-up | pick-up / just watch | overlay fade |
| HANDSHAKE | pick-up | downbeat or skip | timeline in §3.2 |
| PLAY (per exchange) | downbeat | — | — |
| PULLING | long-press on a line + drag | release or threshold | elastic thread constraint |
| UNRAVELLED | pull ≥ threshold | release | world → one taut humming line (0.8 s) |
| KNIT | release after unravel, or dialling | lands **on a downbeat** | staggered elastic morph line → new world, palette crossfade |
| SLOW BEAM | 2-finger still / right-hold / Space / SLOW | release | uSlow spring 0.6 s, tape-stop |
| DESK VIEW | zoom below 0 (pinch out, wheel, `−`, STEP BACK) | zoom ≥ 0 (tap screen, pinch in, `+`, DIVE IN) | uPull spring ω = 3 |
| PARTY LINE | 45 s idle | any input | ghosts fade 400 ms |
| RETRACE (secret) | dial 555-0001 | any tap / Esc / 16 bars | visible lines dim 0.8 s |
| DISCONNECTED | tab hidden | tab visible | power-on on return (600 ms) |

---

## 4. Interaction map

### 4.1 Recognizer constants (CSS px, ms)

| Gesture | Rule |
|---|---|
| Tap | < 250 ms and < 10 px movement |
| Double-tap | second tap < 300 ms after the first and within 32 px |
| Drag (strum) | > 10 px movement before 450 ms |
| Long-press | 450 ms with < 8 px movement |
| Snap radius | coarse pointer 44, fine pointer 28, long-press 56 |
| Two-finger | second pointer down within 200 ms of the first, or while the first has moved < 10 px. **Pinch** if pointer distance changes > 8% or the centroid moves > 16 px within 250 ms; otherwise **SLOW BEAM** after 250 ms (stays slow until both pointers lift) |
| Independent pointers | otherwise each pointer strums or plucks on its own (max 3) |

Velocity is never the only thing that separates two gestures. **There are no three-finger gestures.**

### 4.2 Verb table

| Verb | Mouse | Touch | Keyboard / button | Effect |
|---|---|---|---|---|
| **Magnet** | hover (no button) | finger resting or dragging | — | Lines within 110 px bow away radially (max 14 px push) with RGB convergence fringes (max 3 px). Mouse adds camera parallax (eye x ±0.6, y ±0.3, spring ω = 4). The nearest string within the snap radius glows (+0.25 heat) and the reticle snaps to it. |
| **Pluck** | click on or near a line | tap within 44 px | Enter at the reticle | Sound in the handler. String standing wave + white-hot flash. Packet travels both ways through the whole wire. 3 echo packets at +0.469 / 0.938 / 1.406 s, amp ×0.38ⁿ, alternately tinted cyan and magenta to show the ping-pong. Landmarks chime as the packet reaches them. Velocity: touch pressure if real (≠ 0.5), else 0.75. Velocity > 0.85 triggers 50 ms visual hitstop and a 0.08-unit camera kick. |
| **Ping** | click in empty space | tap > 44 px from any line (stars are not pluckable, so the sky is ping territory) | — | A screen-space magnetic ring expands at 900 px/s and bends lines. Low FM bell. Blank retrace hops flash to 0.22 alpha and decay over 1.2 s, showing faint constellations (hints at Retrace). |
| **Strum** | drag across lines | drag across lines | — | Each crossed string plucks once (debounce 120 ms per string, max 1 pluck per 30 ms per pointer). Velocity = clamp(0.35 + speed·0.25, 0.35, 1), speed in px/ms. Strum packets have no echoes. A vertical swipe across the sun plays an arched harp glissando. |
| **Pull the thread** | press-hold 450 ms on a line, then drag | same | hold Enter 450 ms, then arrows; release Enter | The grabbed region follows the finger with stretch falloff (§5.4). Tension drone rises. At **pull ≥ 33% of min(viewport w, h) and held ≥ 0.5 s**, the city unravels into one taut humming line. **Release → SNAP:** hitstop, twang + gated boom, `navigator.vibrate(8)` in try/catch, and the line re-knits into the **next exchange** (Meridian → Tide Line → Long Distance → Meridian), landing exactly on the next downbeat ≥ 1.2 s away. Releasing early springs back with an underdamped wobble (ω = 14, ζ = 0.35) and a deep twang. |
| **Strong magnet** | press-hold in empty space | long-press on empty space | — | Magnet push grows to 40 px over 1.5 s with larger fringes and a rising hum. Release fires a ping. |
| **Degauss** | double-click | double-tap (not on the payphone) | `D` | 0.9 s rainbow swirl, 60 Hz thunk-hum, resets magnet distortion and clears trails. |
| **Slow the beam** | hold the right button | two fingers held still | hold `Space` / hold **SLOW** | The image dissolves into one comet of light drawing the world stroke by stroke (refresh period 4 s) with long pink → teal afterglow. Visual time ×0.2. The bed tape-stops into a beating drone. Plucks play an octave down. Release springs back in 0.6 s, and the bed resumes on the next downbeat. |
| **Zoom / step back** | wheel; ctrl+wheel (trackpad pinch) ×2.5 | pinch | `−` / `+`, **STEP BACK** / **DIVE IN** | zoomT ∈ [−1, 1], spring ω = 5. Range [0, 1] dollies toward the pinch centroid (eye z 6 → −22, lateral ≤ ±6). Range [−1, 0) pulls back out of the glass into the **desk view**. Wheel: deltaY 100 → 0.12 (normalise deltaMode). |
| **Dive in** | click the screen in desk view | tap the screen / pinch in | `+` / Enter / **DIVE IN** | zoomT → 0 |
| **Dial** | **DIAL** button | **DIAL** button | digits `0–9`, `*`, `#` | Opens directory + keypad. Each key plays its DTMF pair. **CALL** triggers an automatic pull-unravel-knit to listed numbers, otherwise the secret behaviour (§10). |
| **Payphone knock** | double-click the payphone | double-tap the payphone | reticle on payphone, Enter twice | Secret HANDSET mode (§10). Single taps on the payphone just pluck it. |

**Other keys:** `M` mute, `H` hide HUD (for clean screenshots), `?` help, `Esc` (closes the dialog, else leaves desk view or Retrace, else returns to Meridian via auto-knit), `F` fullscreen (only if `document.fullscreenEnabled`, in try/catch). Arrows/WASD move the reticle 24 px per step, accelerating to 60 px when held, and snap to the nearest line within 40 px. The right-button `contextmenu` event is suppressed on the canvas only.

### 4.3 Teaching itself (no manual)
1. **Before sound:** the ghost demo plucks the sun silently every 7 s, and the magnet responds to the pointer.
2. **Affordances:** the reticle snaps and the nearest string glows. A breathing ring sits over the sun until the first pluck.
3. **Progressive hints.** VT323 20px (18px on phone), placed 48 px above the last pointer position (clamped to the safe area), otherwise bottom centre. One hint at a time. Each fades in over 300 ms, hides on success or after 6 s, is shown at most once, and is stored in localStorage.

| # | Shown when | Copy (touch / mouse) |
|---|---|---|
| 1 | 6 s after the downbeat with no pluck | `touch the lines` / `click the lines` |
| 2 | after 5 plucks or 6 s idle | `drag across the lines to strum` |
| 3 | after the first strum + 20 s | `press and hold a line, then pull` |
| 4 | after the first knit | `hold two fingers still to slow the beam` / `hold Space (or right-click) to slow the beam` |
| 5 | 30 s after slow-beam | `pinch out to step back` / `scroll out to step back` |
| 6 | 60 s later | `double-tap to degauss` / `double-click to degauss` |

4. The directory shows silhouetted unfound entries (`555-01·· ·········`), which gives a reason to keep exploring.

---

## 5. Rendering architecture

### 5.1 Context & capabilities
- `getContext('webgl2', {alpha:false, antialias:false, depth:false, stencil:false, premultipliedAlpha:false, powerPreference:'high-performance', preserveDrawingBuffer:false})`.
- Probe `EXT_color_buffer_float` (RGBA16F targets) and `KHR_parallel_shader_compile`.
- Probe `matchMedia('(pointer:coarse)')`, `navigator.hardwareConcurrency`, `navigator.deviceMemory` and `prefers-reduced-motion`.
- If WebGL2 is unavailable, use the Canvas2D fallback (§9).
- **Compile order:** `crt` compiles synchronously, because the first frame is the analytic dot. The other 6 programs compile in parallel; poll `COMPLETION_STATUS_KHR` and only enable each pass once it is ready. If bloom or persist is not ready, the beam renders directly to the composite.

### 5.2 The wire (data model)
**Generators.** Each exchange generator outputs ordered **elements**. Each element is a list of polylines with per-vertex flags.

**Resampling.** Each element is resampled by weighted arc length to its share of N:
- Blank (pen-up) hops get weight 0.12 and at least 2 points.
- **Anchors** (turn angle > 35°, string ends, element joins) are forced samples, plus 2 **dwell duplicates** at the same position. Zero-length segments render as bright dots, which gives true vector-monitor hot spots.
- Element joins are blank retrace hops, so the wire is literally one path.

**Per-point static VBO** (24 B/point; two resident buffers A = current, B = next):

| Attribute | Type | Content |
|---|---|---|
| `a_pos` | 3×f32 | base world position |
| `a_nrm` | 4×SNORM8 | displacement direction (perpendicular to tangent in the element's plane; floor lines use +y), smoothed over 5 points |
| `a_s` | f32 | normalised wire parameter 0..1 (cumulative weighted length) |
| `a_info` | 4×UINT8 (`vertexAttribIPointer`) | colourIdx, kind, flags (1 blank, 2 anchor, 4 dwell, 8 secret, 16 resonator, 32 billboard, 64 blink), stiffness 0–255 (anchors 255) |

**CPU-side tables** (Float32Array / Uint16Array, built once per exchange):
- `strings[]` = {sA, sB, degree, resonatorId}. Strings are contiguous s-ranges between anchors, so the GPU only needs `(sA, sB)` uniforms.
- Per-point `stringId`.
- `resonators[]` = {sA, sB, voice}.
- Billboard subrange `[sB0, sB1]`.

**Warm-up / unravel line shape** is computed in the shader, not stored: `P_line(s) = mix(uLineA, uLineB, s)` + hum.

**Stroke font.** 46 glyphs (A–Z, 0–9, space, `· : ? ! - # * ' . ,`) on a 4×6 grid, y up, advance 6. Encoding: a string of coordinate pairs, with `|` = pen-up (blank hop). Examples fixing the style:
- `A:"0 0 0 4 2 6 4 4 4 0|0 3 4 3"`
- `E:"4 6 0 6 0 0 4 0|0 3 3 3"`
- `M:"0 0 0 6 2 3 4 6 4 0"`
- `0:"1 0 0 1 0 5 1 6 3 6 4 5 4 1 3 0 1 0|0 1 4 5"`

Text is laid out into its element's budget.

**Billboard messages.** Changing the message regenerates only the billboard subrange on the CPU and uploads it with `bufferSubData` into the live VBO, once per message. Typing is a `uBillboardReveal` uniform: points beyond it render as blank. Max 2 lines × 26 characters.

### 5.3 Pass list (per frame, in order)

| # | Program | Target | Purpose |
|---|---|---|---|
| 1 | `wire_tf` (VS + empty FS, `RASTERIZER_DISCARD`) | TF buffer, N × 32 B, `DYNAMIC_COPY` | All motion per point, computed once (§5.4) |
| 2 | `beam` (instanced, N−1 instances × 4-vertex strip) | `sceneTex` (RGBA16F or RGBA8 ×0.25 prescale), additive `ONE, ONE` | Capsule beam segments |
| 3 | `persist` | ping-pong `persistTex[2]` | Two-stage phosphor |
| 4 | `bright` | bloom mip 0 (½ res) | Soft-knee threshold 0.8, knee 0.4 |
| 5 | `kawase_down` × (3/4/5) | mips | Dual-filter downsample |
| 6 | `kawase_up` × (3/4/5) | mips | Tent upsample |
| 7 | `kawase_down` to 1×1 | `avgTex` | Screen-light colour (no CPU readback) |
| 8 | `crt` | default framebuffer, full canvas res | Composite, desk view, overlays |

**Draw discipline:** about 14 passes, most on tiny targets. No depth test anywhere. Unbind the TF buffer (`bindBufferBase(TRANSFORM_FEEDBACK_BUFFER, 0, null)`) before using it as an `ARRAY_BUFFER`.

**Fallback if transform feedback fails validation:** compile `beam` with `#define INLINE_SIM`, which evaluates `wireSim()` for both endpoints in the beam VS.

### 5.4 Shaders and key math

**`wire_tf.vert`** (highp). Inputs: A/B static attributes + uniforms. Outputs: `v_pos` (vec4: world xyz, heat) and `v_col` (vec4: premultiplied rgb·intensity, depth fade). Steps:

1. **Morph/knit:**
   - Per point: `d = abs(s − uG)`.
   - Unravel: `u = ease(clamp(uU*(1+st) − d*st, 0, 1))`, with st = 1.0.
   - Knit: `k = elastic(clamp(uK*(1+st) − d*st, 0, 1))`, with `elastic(x) = 1 − pow(2, −9x)·cos(7.5x)` (overshoot).
   - `pos = mix(mix(posA + pull, P_line(s), u), posB, k)`.
   - Palette: `mix(uPalA[c], uPalB[c], k)`.
   - Reduced motion: no positional morph; alpha crossfade A → B.
2. **Kind transforms:**
   - `floorH`: `z += mod(uScroll, 2.0)` (seamless, no wrap needed).
   - `sun`: `y += uSunRise − 6`.
   - `mtnBack`: `y += uBands[int(clamp((x+70)/140*63, 0, 63))] * 2.4`.
   - `clockH` / `clockM`: rotate about the face centre by the local-time angles.
   - `sea`: `y += 0.35 sin(0.21x + 0.9t) + 0.22 sin(0.37z − 1.3t) + 0.12 sin(0.8x + 0.5z + 2.1t)`.
   - `lhBeam`, `planet`, `galaxy`: rotate by their uniforms.
   - `star`: twinkle = 0.6 + 0.4·sin(hash·40 + t·(1.5 + hatsEnv·3)).
   - `blink`: on when `fract(t) < 0.5`.
3. **Packets.** Up to 32 / 24 / 16 by tier. `uPkA[i] = (s0, t0, amp, width=0.0035)`, `uPkB[i] = (speed=0.18, echoTint, dispScale, 0)`. Time `T = uTimeScaled`.
   ```glsl
   float age = T - t0, f = speed*age, x = (abs(s - s0) - f)/width;
   float env = exp(-x*x);
   disp += amp*exp(-f/0.35)*exp(-age*0.6) * env * sin(5.65*x) * (1.0 - stiff);
   heat += amp*exp(-f/1.2)*exp(-age*0.25) * env;
   ```
4. **String ring.** Up to 8 / 6 / 4 slots. `uStr[i] = (sA, sB, t0, amp)`. For `s ∈ [sA, sB]`: `u = (s−sA)/(sB−sA)`.
   - `disp += amp·sin(πu)·sin(2π·fv·age)·exp(−2.2·age)`, where fv = 4 + 0.4·degree Hz (perceptual, not the audio frequency).
   - `heat += 0.6·amp·exp(−1.5·age)`.
   - `uHover = (sA, sB)` adds +0.25 heat to the hovered string.
5. **Carrier bead:** `heat += 0.35·exp(−((s − uBarPhase)·220)²)` (×0.4 under reduced motion).
6. **Apply displacement:** `pos += nrm * disp * viewDepth * 0.012`. Screen amplitude ≈ 6 px at amp 1, whatever the depth.
7. **Thread pull:** `pull = uPullVec * exp(−d/σ) * (1 − 0.5·stiff)`, with `σ = mix(0.01, 0.5, uPullT)`. `uPullVec` is the world offset from the grabbed point's base to the finger, unprojected at that point's view depth.
8. **Magnet and ping (screen space):**
   - Project to px: `dv = sp − uMag.xy; r = length(dv)`.
   - Magnet push: `uMag.z·exp(−r²/uMag.w²)`.
   - Ping ring: `uPing.amp·exp(−((r − 900·age)/30)²)·exp(−2·age)`.
   - Convert the px offset back with `Δworld = (Δpx.x·camRight + Δpx.y·camUp)·viewDepth/focalPx`.
9. **Intensity:**
   - `I = base × fog(depth: 1 → 0.25 over 20…80) × blankAlpha × beamAge × flashLimiter × nearFade(depth < 1.5)`.
   - blankAlpha = 0.012 normally. Ping raises it to 0.22. Retrace mode: 1.0 for secret points, 0.6 for other blanks, 0.12 for visible lines.
   - `col = mix(pal, #FF5FB0, sat(heat)) + #FFF4FB·sat(heat − 0.7)·1.5`.
10. **Slow beam:** `age = fract(uBeamHead − s)`; `beamAge = mix(1, exp(−age·4·2.2) + 3·exp(−pow(age·N/40, 2)), uSlow)`. The second term is the comet head.

**`beam.vert` / `beam.frag`.**
- Attributes: P0/C0 at offset 0 and P1/C1 at offset 32, stride 32, divisor 1 (the same TF buffer bound twice).
- Project both endpoints. If either has w < 0.1, collapse the quad. If both intensities are < 0.002, collapse (saves fill).
- Expand to a screen-space capsule with half-extent 3σ + 1 px.
- σ = 0.75 CSS px × dpr × renderScale × (1 + 0.06·kickEnv). The core is at least 1.4 target px.
- Fragment: `d` = distance from `gl_FragCoord` to segment ab. `I = exp(−d²/2σ²) + 0.18·exp(−d²/(2(2.5σ)²))`, colour = `mix(C0, C1, t)`. Dwell duplicates make round hot dots.

**`persist.frag`:**
```glsl
vec3 dec = pow(uDecay, vec3(uDt*60.0));
vec3 trail = max(texture(uPrev,uv).rgb*dec - uEps, 0.0);   // uEps = 1.5/255 RGBA8, 0.002 float
o = vec4(max(texture(uScene,uv).rgb, trail), 1.0);
```
- `uDecay` is spring-driven per exchange (§2).
- Slow beam: `mix(normal, vec3(.97, .99, .985), uSlow)`.
- Reduced motion: pow(decay, 1.6), which gives shorter trails.
- Degauss sets `uDecay = 0` for 2 frames.

**`kawase_down` / `kawase_up`:**
- Down: `(4·c + tl + tr + bl + br)/8` at ±0.5 texel half-offsets.
- Up: 8-tap tent (4 edges ×1 and 4 diagonals ×2, /12).
- Bloom strength 0.9, plus +30% swell on downbeat events, capped (see flash limiter).

**`crt.frag`** (mediump except UVs):
1. **Desk view.** `e = smoothstep(0,1,uPull)`. Screen rect centre (0.5, 0.56), half-size `mix(vec2(0.5), vec2(0.30, 0.24)·aspectFix, e)`, corner radius 0.06.
   - Outside the rect: wall = `--wall` + `avgTex·0.9/(1 + 6·dist²)`.
   - Bezel: rounded-rect SDF 1.18× the screen, `--bezel` with a top specular from avgTex.
   - Badge `HALCYON BELL · LINEA`: a one-time 2D-canvas texture of 256×32.
   - Desk edge at uv.y < 0.18, lit by avgTex.
   - **The handset lying off the hook** beside the terminal: capsule + 2 circle SDFs, with a coiled cord as a sinusoid SDF.
   - The room is lit only by the screen.
2. **Barrel curvature:** `c = uv*2−1; c *= (1 + k·dot(c,c))/(1 + k)`, k = 0.06 desktop / 0.045 phone. Fresnel edge falloff; black outside the tube.
3. **Convergence fringes:** `fr = uFringe·exp(−|p−m|²/R²)·normalize(p−m) + 0.6px·c` (static edge misconvergence). Sample R at uv+fr, G at uv, B at uv−fr from `persist + bloom`.
4. **Glass halation:** `+ avgTex·0.06·(1.2 − uv.y) + widestMip·0.35`. This fills the void with a coloured atmosphere.
5. **Degauss** (tD = seconds since trigger): `a = 0.9·exp(−tD/0.32)·sin(14r − 20tD)`; rotate uv about the centre by `a·smoothstep(0, 0.6, r)`; hue-rotate by `6.283·exp(−tD/0.45)·r`. Lasts 0.9 s. Reduced motion: a 400 ms colour-bloom fade instead.
6. **Power mask:** dot → line → open, driven by uPower springs. The same mask runs in reverse on DISCONNECTED.
7. **Overlays:**
   - Reticle: ring r = 10 px + 4 ticks, `--focus`.
   - Up to 3 ghost crosshairs (pale `#BFEFFF` at 0.35 alpha; June `#FFC861`).
   - Konami overlay tint (§10).
8. **Finish:**
   - Exposure × (1 − 0.08·kickEnv) × uExposure.
   - Grain ±1.5% hash (static under reduced motion). Vignette 0.35 at the corners.
   - ACES fitted: `x(2.51x + .03)/(x(2.43x + .59) + .14)`.
   - Triangular dither ±0.5/255.
   - **No scanlines.**

**Flash limiter.** The CPU tracks the requested flash energy (bloom swells, heat spikes) in 333 ms windows and allows at most 1 large flash per window (≤ 3/s). `uFlashScale` attenuates the excess.

### 5.5 Camera model
- Perspective with near 0.1, far 200. Every parameter is spring-driven at fixed 120 Hz substeps (critically damped `x'' = ω²(T−x) − 2ωx'`). ω: parallax 4, zoom 5, exchange camera 3, uPull 3, sun rise 6.
- **Landscape:** vFov 50°.
- **Portrait** (aspect < 1): vFov = min(78°, …). Eye pulled back by `8·(1 − aspect)` units. Look target y adjusted so the horizon sits at **44–48% from the top**.
- **Constraint to verify at 380×800:** sun diameter ≥ 52% of viewport width. If needed, raise the sun radius toward 17.
- **Idle drift:** eye += (0.35·sin(2π·0.07t), 0.15·sin(2π·0.05t), 0). Zero under reduced motion.
- **Precision:** floor scroll is wrapped mod 2.0; positions are bounded (largest |coord| ≈ 120), so camera-relative rendering is not needed.

### 5.6 Pointer → world
- **Spatial hash:** cell 32 CSS px, rebuilt **at most once per frame and only when a pointer, reticle or ghost needs it**. Built from base positions projected on the CPU with the same `floorH` scroll and `planet`/`galaxy`/`lhBeam` rotations (packets and magnet are ignored). It includes non-blank, non-star points; every point on LOW/MID, every 2nd point on HIGH.
- **Nearest query:** 3×3 cells (5×5 for the long-press radius). Returns point index → s → `stringId`.
- **Strum:** for each coalesced move segment q0→q1, walk the cells along it and test 2D segment intersection against consecutive point pairs.
- **Thread target:** unproject the finger at the grabbed point's view depth.
- **Payphone zone:** screen bbox of payphone points + 12 px. It takes priority for double-tap.
- **Sun hit:** handled like any other string. The sun's 44 stripes give ~5 px stripe spacing at phone width, and the snap picks the nearest one.
- All pointer input uses Pointer Events with `setPointerCapture` and `getCoalescedEvents()` where available. Canvas CSS: `touch-action:none; overscroll-behavior:none; user-select:none; -webkit-touch-callout:none`.

### 5.7 Code layout (one IIFE, `'use strict'`; ≈ line budget)

| Module | Lines |
|---|---|
| CSS + markup | 320 |
| boot/caps/fallback | 140 |
| GL kit (program cache, FBO pool, fullscreen-triangle VAO, uniform cache, context loss) | 220 |
| GLSL | 480 |
| stroke font + resampler | 260 |
| 3 generators | 420 |
| wire state (packets, strings, morph state machine, springs) | 280 |
| input | 340 |
| audio engine | 680 |
| UI / hints / directory / secrets | 300 |
| governor | 90 |
| **Total** | **≈ 3,500** (target ≤ 3,500) |

---

## 6. Audio engine

All audio is synthesised with Web Audio. No samples, no AudioWorklet, no ScriptProcessor, no Workers or blobs. `new AudioContext({latencyHint:'interactive'})` is created inside the pick-up gesture.

### 6.1 Graph
```
voices ─┬─ musicBus (pad, bass, kick, snare, hats) → sidechainGain ─┐
        └─ playBus  (plucks, chimes, telephony, ghosts) ────────────┤
                                                                     ▼
 sum → tapeSat (WaveShaper tanh, drive 1.6, oversample '2x')
     → wowFlutter (DelayNode 5 ms; LFO 0.45 Hz ±0.25 ms + 6.3 Hz ±0.04 ms)
     → speakerLP (BiquadFilter LP: 20 kHz in-world → 1400 Hz Q 0.7 in desk view)
     → speakerPeak (peaking 2.8 kHz: 0 dB → +5 dB Q 1.2 in desk view)
     → handsetHP (300 Hz, bypassed at 10 Hz) → handsetLP (3400 Hz, bypassed at 20 kHz)
     → limiter (DynamicsCompressor: thr −10 dB, knee 6, ratio 12, attack 3 ms, release 120 ms)
     → masterGain (starts −14 dB → −6 dB over 1.5 s) → destination
                                    └→ ChannelSplitter → analyserL/R (secret handset inset)
                                    └→ analyser (fftSize 512, smoothing 0.75)
Sends (post-voice): reverbHall (Convolver, 2.6 s) and reverbSea (Convolver, 4.2 s) with crossfaded wet gains (0.28 default);
  pingPong: DelayL/DelayR 0.46875 s, cross-feedback 0.38 through LP 3.2 kHz, hard-panned; send 0.22 from playBus;
  gatedVerb: Convolver (0.9 s dense IR) → gateGain (opens on hit, hard-closes at +240 ms with a 5 ms ramp).
lineHiss: 2 s looped noise → BP 4 kHz Q 0.4 → −50 dB into sum.
```
- **IRs** are generated once at boot (after the first frame) as stereo noise × exp(−t/τ), one-pole low-passed at 0.3, with 18 ms pre-delay. Reverb is never changed by reassigning `.buffer`; only the wet gains crossfade (Tide and Long Distance use Sea).
- **Desk-view filter** values follow uPull with `setTargetAtTime` (τ 0.15).

### 6.2 Clock, scheduler, event bus
- **Transport:** 96 BPM. Beat 0.625 s, bar 2.5 s, 16th 0.15625 s, dotted 8th 0.46875 s. Before audio it runs on `performance.now()`. At pick-up it re-anchors so bar 0 starts at the downbeat.
- **Scheduler:** `setInterval(tick, 25)`, lookahead 0.12 s, 16th-step resolution. On resume after a stall, if `nextStepTime < currentTime − 0.05`, re-anchor to the next 16th **without** playing the missed notes. Arrangement decisions (energy layers, fills, chord changes, knit landings) happen at bar boundaries.
- **Event bus:** a ring buffer of 64 entries `{tAudio, type, value}` for kick, snare, hat, bar, chord, knit-land, ghost-pluck. Each frame the visual offset is updated:
  - `off = EMA(ts.performanceTime − ts.contextTime*1000, α = 0.05)` from `getOutputTimestamp()`.
  - Fallback: `performance.now() − (currentTime + (outputLatency || baseLatency || 0.02))*1000`.
  - An event fires when `performance.now() ≥ tAudio*1000 + off`.
- `uBarPhase` is derived from the same slewed estimate. The scroll and the bead never step from raw `currentTime`.
- **Direct plucks are never quantized:** sound starts at `currentTime` and the visual packet is born in the same handler. Echo packets are born at pluck time + n·0.46875 s, the same timestamps the delay uses.

### 6.3 Musical system

| Exchange | Pluck scale (hexatonic, no wrong notes) | Progression (2 bars each, 8-bar cycle) | Arrangement |
|---|---|---|---|
| Meridian | A B C D E G | Am9 – Fmaj7 – Cmaj7 – G6 | Pad always; kick 1 & 3 (4-on-the-floor at E ≥ 0.6); bass octave 8ths (E ≥ 0.3); hats 8ths, 54% swing, velocity 0.6/0.35 (E ≥ 0.5); gated snare on 2 & 4 (E ≥ 0.75); tom fill on 4-and-a of every 8th bar (E ≥ 0.6) |
| Tide Line | D E F G A C | Dm9 – G9 – Am7 – Cmaj7 | Half-time: kick on 1 (+3 at E ≥ 0.6), gated snare on 3 (E ≥ 0.75), soft 16th shaker (E ≥ 0.5), sub-sine root whole notes + fifth on 3; sea wash (pink noise LP 600 Hz, gain follows the swell); lighthouse plucks 8ths |
| Long Distance | E F♯ G♯ A♯ B C♯ | Emaj9 – F♯6/E – G♯m7 – Bsus2 | No drums; pad + "choir" (3 saws +2 octaves through peaking filters at 800 and 1150 Hz); FM-bell plucks; probe arpeggio 16ths pp |

- **Energy E:**
  - +0.06·vel per pluck, +0.03 per strummed string. Decay τ = 18 s. Clamp 0..1.
  - Layer thresholds have ±0.05 hysteresis and change only at bar boundaries.
  - After the handshake, E is floored at 0.35 for 8 bars, so bass and kick drive from the first downbeat.
  - After 3 min idle, E = 0 and the kick is muted.
- **Pluck pitch:** fixed per string, so the instrument is learnable. The generator assigns `degree` 0..18 (3 octaves of the hexatonic scale).
  - Rule: longer or nearer strings are lower. Default `t = clamp((log2 40 − log2 L)/(log2 40 − log2 0.3), 0, 1)`, `degree = round(18t)`. Floor lines use the overrides in §3.6.
  - Degree → MIDI from the scale table, rooted at A2 = 45 / D2 = 38 / E2 = 40.
- **Chimes (resonators)** pick from scale ∩ current chord tones (always non-empty), so they are always consonant:

| Resonator | Voice |
|---|---|
| sun | chord root +2 octaves, FM bell 1:3.5 |
| clock | 5th +1 octave, FM bell |
| billboard | KS cluster 9 / root / 5 at +2 octaves, 40 ms apart |
| June's window | 3rd, FM e-piano 1:1, index 1.6 |
| mast | FM blip 1:7, 60 ms |
| Tide / Long Distance resonators | same scheme |

  A chime triggers when a packet front with remaining amp > 0.3 enters the resonator's s-range. Limits: 1 per resonator per 400 ms, max 2 per packet, volume ∝ remaining amplitude.

### 6.4 Instruments

| Voice | Recipe |
|---|---|
| **KS pluck bank** | Rendered in plain JS right after context creation in 4 ms chunks. 16 buffers at MIDI 33, 36 … 78 (step 3). Length 1.8 s (< 110 Hz), 1.3 s (< 330 Hz), 0.9 s (higher). Delay P = sr/f with fractional allpass `C = (1−frac)/(1+frac)`. Excitation: P samples of noise → one-pole LP a = 0.55 → pick comb `x[n] − x[n − round(0.13P)]`. Loop: `y = ρ·½(d[i] + d[i−1])`, ρ 0.9965 (low) → 0.9935 (high). Normalise peak to 0.8 with a 4 ms tail fade. Playback: nearest buffer, `playbackRate = 2^((midi − bankMidi)/12)` (≤ 1.5 st), → LP (1.2–9 kHz by velocity) → gain (vel) → StereoPanner (screen x) → playBus + sends. Until the bank is ready, the FM e-piano substitutes. |
| **FM bell / e-piano** | Carrier sine f, modulator f·ratio. Mod gain (Hz) = I·f·ratio, I envelope 5 → 0.2 over 1.4 s (bell) or 1.6 → 0.3 (e-piano). Amp: 3 ms attack, exp decay 2.2 s. |
| **Ping bell** | FM ratio 2.0, chord root −1 octave, I 3 → 0, decay 2.5 s, −14 dB |
| **Telephony** | Dial tone 350 + 440 Hz. DTMF rows 697/770/852/941 × columns 1209/1336/1477 (`*` = 941+1209, `0` = 941+1336, `#` = 941+1477), 70/30 ms in the handshake, 120 ms on the keypad, −22 dB. SIT 913.8 / 1370.6 / 1776.7 Hz for 274/274/380 ms. Busy 480 + 620 Hz, 0.5 s on/off ×4. Off-hook click: 6 ms noise HP 2 kHz + 40 ms 120 Hz thump. Modem: §3.2. Everything telephonic goes through LP 3 kHz. |
| **Pad** | Per note: 3 saws (−9, 0, +9 cents; 2 on LOW) → LP 1400 Hz Q 0.7 (LFO 0.07 Hz ±400 Hz) → amp attack 1.2 s, release 2.5 s. 4-note voicings. Sidechain duck to 0.55 on each kick, release τ 0.22 s. |
| **Bass** | Saw + sine −1 octave, octave-pumping 8ths, LP 380 → 900 Hz envelope, decay 180 ms |
| **Kick** | Sine 120 → 48 Hz exponential over 110 ms, amp decay 380 ms, 3 ms click, −10 dB |
| **Snare** | Noise BP 1.9 kHz Q 0.8 + triangle 185 Hz (80 ms) → gatedVerb |
| **Hats** | Noise HP 7.5 kHz, 30 ms decay |
| **Toms (fill)** | Sines 160 / 130 / 100 Hz with −30% pitch drop over 120 ms |
| **Tension drone** | 2 saws (root, +7 cents) → LP 300 → 3200 Hz, Q 6. Pitch glides continuously up to +12 st with pull t; gain → −14 dB. After unravel: 7 Hz tremolo shimmer. |
| **Snap** | KS at MIDI 76 + sine 420 → 70 Hz in 160 ms (twang) + kick + gated noise burst |
| **Early release** | Sine 90 → 45 Hz + low KS (MIDI 40) |
| **Degauss** | 60 Hz sine + 120 Hz (×0.5) + 180 Hz (×0.25) → LP 260 Hz Q 4, decay 1.1 s; 25 ms noise thunk LP 180 Hz; 523 Hz sine ring-modulated at 77 Hz, 0.4 s at −26 dB; overall −12 dB |
| **Slow-beam** | Drums and bass stop after the current beat. Pad detune ramps to −1200 cents over 0.8 s and LP closes to 500 Hz (tape stop). Drone of root + fifth sines with 0.7 Hz beating at −18 dB. Plucks at playbackRate ×0.5. Release: detune back to 0 over 0.4 s; the bed resumes on the next downbeat. |
| **Ghost voices** | Same voices → BP 600–2800 Hz, wet +0.25, −10 dB, random pan ±0.6 |

- **Voice pool:** 10 / 14 / 20 by tier. Steal the oldest-quietest with a 15 ms fade. Every voice disconnects on `onended` or after release.
- **Rate limit:** max 3 triggers per instrument per 40 ms.

### 6.5 Gesture → music

| Gesture | Musical event | Timing |
|---|---|---|
| pluck | string's fixed degree, KS (FM on Long Distance), velocity, pan by x | immediate |
| echoes | ping-pong delay (audio) + echo packets (visual) | +n·0.46875 s |
| strum | each crossed string's degree | immediate, ≤ 1 per 30 ms |
| packet reaches resonator | chime (scale ∩ chord) | when the front arrives |
| ping | ping bell | immediate |
| pull | tension drone ∝ t | continuous |
| snap / knit | snap immediately; knit lands with kick + new pad chord + carrier bead | next downbeat ≥ 1.2 s away |
| slow beam | tape stop + drone; resume | immediate / next downbeat |
| dial keys | DTMF | immediate |
| lighthouse / ghosts | generative degrees | scheduled on 8ths |

### 6.6 Visual reactions to audio

| Source | Visual |
|---|---|
| kick | exposure −8% and beam σ +6% (attack 0, decay 220 ms; off under reduced motion) |
| snare | bloom +10% |
| bar | carrier bead sweeps s 0 → 1 over the bar |
| chord change | palette hue shift ±8° lerped over 1 bar |
| analyser: 64 log bands 60 Hz–8 kHz (attack 0.5, release 0.92) | back-mountain ridge heights |
| hats band (6–10 kHz) | star twinkle rate |

### 6.7 Mute & lifecycle
- **Mute:** `masterGain` → 0 over 60 ms, then `ctx.suspend()` after 200 ms; the transport falls back to the performance clock. **Unmute:** resume, re-anchor at the next downbeat, fade in over 400 ms. Persisted.
- **visibilitychange hidden:** schedule a 120 ms tape-stop ramp, then `suspend()`, and stop rAF.
- **Visible:** power-on animation, `resume()`, re-anchor.

---

## 7. UI / HUD

All overlay elements are real DOM. Text is VT323, the title is Monoton. Every colour uses tokens.

### 7.1 Pre-gesture overlay
Centred column at 40% height. Background: radial vignette `rgba(5,3,10,.55)` → transparent, so the city shows through.
- **Title (Monoton,** `clamp(32px, 9vw, 72px)`, gradient `#FFD15C → #FF3D9A → #3DF5FF` via `background-clip:text`, glow): `PARTY LINE '85`
- **Subtitle:** `Meridian is still on the line.`
- **Primary button** (≥ 200×56, inline-SVG handset glyph + text): `PICK UP`, with `aria-label="Pick up the receiver and turn sound on"`
- **Small line:** `sound on · or tap anywhere · or press Enter`
- **Text button:** `just watch`, with `aria-label="Watch without sound"`

### 7.2 Status (top-left)
Inset `max(12px, env(safe-area-inset-top))` / `max(12px, env(safe-area-inset-left))`, 16px (18px desktop), `--ui-text` with a cyan glow.

| State | Line 1 |
|---|---|
| on hook | `○ ON HOOK` |
| handshake | `◔ DIALING 555-0185` |
| play | `● LINE OPEN · 555-0185 · MERIDIAN` / `· 555-0127 · TIDE LINE` / `· 1-555-0199 · LONG DISTANCE` |
| muted | `● LINE OPEN · MUTED` |
| slow | `◌ BEAM SLOWED` |
| party line | `● PARTY LINE · 2 CALLERS` |
| desk view | `LINEA · HALCYON BELL · 1985` |
| retrace | `◍ RETRACE · 555-0001` |

Line 2 (`--ui-dim`): `CALL #4`.

### 7.3 Controls

| Button | Labels and behaviour |
|---|---|
| SOUND | `SOUND` / `MUTED`; `aria-pressed` |
| SLOW | press-and-hold; Space/Enter hold when focused |
| BACK | `STEP BACK` / `DIVE IN` |
| DIAL | opens the directory dialog |
| ? | `aria-label="Help"` |

- **Phone (< 700 px):** one row centred at the bottom, `bottom: max(12px, env(safe-area-inset-bottom))`. Buttons 52×44, gap 8, total ≈ 292 px wide. Hints sit 64 px above the row.
- **Desktop:** the same row anchored bottom-right, buttons 72×40.
- **Button style:** `background: var(--panel); border: 1px solid #3DF5FF73; color: var(--ui-text); font: 20px VT323; letter-spacing: .08em; text-shadow: 0 0 8px #3DF5FF80`. Hover: border `--accent`.
- `H` hides all HUD except the hint layer.

### 7.4 Directory dialog
A `<dialog>`-like `role="dialog"` with `aria-modal="true"` and a focus trap. Esc closes it. Width `min(92vw, 420px)`.

- **Heading:** `HALCYON BELL · MERIDIAN DIRECTORY · 1986`
- **Entries** (unfound entries shown as silhouettes in `--ui-dim`):
  - `555-0185 MERIDIAN: the city of lights`
  - `555-0127 TIDE LINE: the sea, and the lighthouse` (silhouette `555-01·· ·········`)
  - `1-555-0199 LONG DISTANCE: please hold` (silhouette `1-555-01·· ·············`)
  - `0 OPERATOR: ask for Seven` (silhouette until dialled)
  - `555-0001 ········` (secret; found: `555-0001 JUNE: Operator Seven's line`)
  - `HANDSET ········` (secret; found: `HANDSET: hear the picture`)
- **June's note** (italic VT323, changes with `calls % 8`):
  1. `if the line hums, someone is listening. (J)`
  2. `the city sounds different when it rains. dial 0 if you need me.`
  3. `they cut the trunk lines tonight. i patched this one back in.`
  4. `the sun is just the beam going back and forth. don't tell anyone.`
  5. `you came back. i kept your seat warm.`
  6. `some callers left their songs on the wire. listen at night.`
  7. `pull too hard and the whole city comes undone. it always knits back.`
  8. `it's still 1986 in here. i don't mind.`

  After the answer secret: `555-0001. my line. (J)`
- **Whisper line:** `the payphone on Kestrel St. still takes calls. knock twice.`
- **Keypad:** 3×4 grid of 56×48 buttons `1 2 3 / 4 5 6 / 7 8 9 / * 0 #`. Display `DIAL: 555-01__`. Buttons `CALL` and `CLEAR`.
- **Footer:** `Service ends 23:59, Dec 31 1986. Thank you for being a subscriber.`

### 7.5 Help sheet (`?`)
- **Heading:** `HOW THE LINE WORKS`
- **Intro:** `Everything you see is one unbroken line of light. Touch it and it rings.`
- **Body:**
  - `TOUCH a line: pluck it. The note travels through the whole city.`
  - `DRAG across lines: strum.`
  - `PRESS & HOLD a line, then PULL: unravel the city. Let go and it knits into somewhere else.`
  - `TWO FINGERS still / RIGHT-CLICK hold / SPACE: slow the beam.`
  - `DOUBLE-TAP: degauss.`
  - `PINCH / SCROLL: move closer, or step back from the screen.`
  - `DIAL: call another exchange. Some numbers aren't in the book.`
- **Keys:** `arrows move the reticle · Enter plucks (hold + arrows to pull) · Space slows the beam · D degauss · − / + step back / dive in · 0–9 dial · M mute · H hide controls · F fullscreen · Esc close`
- **Footer:** `No sound? Check your phone's silent switch, then tap SOUND.`
- Shows a `FULLSCREEN` button only if `document.fullscreenEnabled`.

### 7.6 Chips, captions, announcements
- **Chips** (top-centre, `--warn` border):
  - `NO DIAL TONE: sound is blocked. Check the silent switch, then tap SOUND.`
  - `SIGNAL LOST · reconnecting`
  - Toast: `OVERLAY INSERTED`
- **Desk-view caption,** shown once per session, 4 s, bottom centre: `THE RECEIVER IS STILL OFF THE HOOK.`
- **Secret found toast:** `► FOUND: JUNE'S LINE` (or the relevant name).
- **aria-live (polite):** `Connected to Meridian.` · `Unravelling.` · `Connected to Tide Line.` · `Connected to Long Distance.` · `Beam slowed.` · `Beam restored.` · `Stepped back from the screen.` · `Back on the line.` · `Muted.` · `Sound on.` · `Secret found: June's line.`

### 7.7 Focus
```css
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px #3DF5FF40, 0 0 18px var(--focus);
}
```
Applied to every button and the canvas. Focus never lands behind the overlay.

---

## 8. Performance plan

### 8.1 Resolution
- **Canvas backing** = CSS size × min(DPR, cap). Cap: LOW 1.25, MID 1.5, HIGH 2.
- **Scene and persistence targets** = backing × `renderScale` (0.5–1.0). The composite always runs at full backing resolution: the beam's Gaussian profile and bloom hide the upscale.
- Bloom starts at ½ of scene resolution.

### 8.2 Tiers
Initial tier: HIGH if `pointer:fine` and cores ≥ 8; LOW if coarse and (cores ≤ 4 or deviceMemory ≤ 3); otherwise MID. The last stable tier stored in localStorage overrides this.

| | LOW | MID | HIGH |
|---|---|---|---|
| Wire points N | 12,000 | 24,000 | 48,000 |
| Packet slots | 16 | 24 | 32 |
| String-ring slots | 4 | 6 | 8 |
| Dwell stars | 90 | 140 | 200 |
| renderScale start (range) | 0.7 (0.5–0.85) | 0.85 (0.6–1) | 1.0 (0.7–1) |
| Bloom mips | 3 | 4 | 5 |
| Edge misconvergence / grain | off / on | on / on | on / on |
| Pad saws per voice | 2 | 3 | 3 |
| Polyphony | 10 | 14 | 20 |
| IR hall / sea | 1.8 / 3.0 s | 2.6 / 4.2 s | 2.6 / 4.2 s |
| Hash sampling | every point | every point | every 2nd |

### 8.3 Governor
- EMA (α 0.1) of rAF dt. **Step down** after > 18.5 ms sustained for 1.2 s. **Step up** after < 12.5 ms for 5 s, with a 10 s cooldown after any step-down.
- **Step-down order:**
  1. renderScale −0.1 (to the floor)
  2. bloom mips −1
  3. persistence at ½ resolution
  4. edge misconvergence off
  5. drop an N tier
  6. audio tier (pad saws, polyphony)
- An N change regenerates the VBOs (s is normalised, so live packets survive). It happens at most once per 20 s and preferably during a knit.
- Write the stable tier to localStorage after 60 s without a change.

### 8.4 Frame loop
1. rAF, dt clamped to 50 ms.
2. Fixed 120 Hz spring substeps (max 6 per frame).
3. Drain the input queue.
4. Update packets, strings, ghosts, the event bus and uniforms.
5. Upload: uniforms only, plus `bufferSubData` only for billboard regeneration.
6. Render the passes.
7. Sample the governor.

**Zero allocations per frame:** preallocated Float32Arrays, pooled packet and string slots, no closures in hot paths, no DOM layout reads in the loop.

### 8.5 Lifecycle
- **visibilitychange:** stop rAF and suspend audio; on return, power-on animation (600 ms) and resume.
- **Context loss:** `webglcontextlost` → `preventDefault`, show the `SIGNAL LOST` chip, stop rAF. `webglcontextrestored` → rebuild programs, VBOs (re-run generators), TF buffer, FBOs and the badge texture; all state lives in JS; play power-on.
- **Resize:** ResizeObserver on the canvas, debounced 100 ms. The projection updates immediately (CSS-stretched until then); FBOs are rebuilt once. Orientation change triggers the same path.

### 8.6 Build order (each step is a shippable checkpoint)
- **A (core):** boot/caps/fallback → GL kit → stroke font + resampler → Meridian → `wire_tf` + `beam` → persist + bloom + `crt` → warm-up knit → audio core (graph, KS bank, FM, telephony, scheduler, bed) → pick-up handshake → pluck/strum/ping/echoes/resonators → degauss → HUD + hints → reduced motion → governor + lifecycle.
- **B:** pull the thread + unravel/knit → Tide Line → Long Distance → slow beam → desk view → ghosts, party line and June's call → directory/keypad + Operator / wrong numbers / Retrace.
- **C (cut only if out of time; nothing in A or B may be cut):** Handset XY secret, Konami overlay.

---

## 9. Accessibility & robustness

### prefers-reduced-motion
Applied automatically. A **CALM** toggle in the help sheet also controls it, and the setting is persisted.
- No camera parallax, idle drift, camera kick or hitstop.
- Degauss becomes a 400 ms colour-bloom fade. Power-on/off becomes a 300 ms fade.
- Unravel and knit become alpha crossfades. Pulling still stretches, but limited to 40% of the normal offset.
- Displacement ×0.5, damping ×3. Carrier bead ×0.4. No kick exposure duck.
- Shorter trails. Static grain. Long Distance yaw sway off.
- Flash limiter at ≤ 2 per second.
- **Every verb, sound and secret still works.**

### Keyboard
The full experience is reachable without a pointer (§4.2). The canvas has `tabindex="0"`, `role="application"`, `aria-roledescription="interactive vector city"` and:

`aria-label="Party Line '85: a neon city drawn by one line of light. Arrows move the reticle, Enter plucks, hold Enter and use arrows to pull the thread, hold Space to slow the beam, D degausses, minus and plus step back and dive in, digits dial, M mutes, question mark opens help."`

The reticle is visible whenever the canvas has keyboard focus.

### No WebGL2
A Canvas2D poster: the Meridian generator projected on the CPU and drawn with `globalCompositeOperation='lighter'`, `shadowBlur 10`, and the palette colours. It is redrawn only on resize. Overlay text: `NO CARRIER` / `This browser can't open the line (WebGL2 is unavailable). Here is the last picture Meridian sent.` No errors are thrown.

### Audio failure
Wrap AudioContext construction in try/catch. If `state !== 'running'` 600 ms after pick-up, show the `NO DIAL TONE` chip. The visuals run on the performance clock regardless. SOUND retries `resume()` inside its click handler. The silent data-URI `<audio>` is attempted once inside try/catch; if CSP blocks it, ignore the error.

### Storage
One key `pl85.v1`, read and written in try/catch with in-memory defaults:
```js
{calls, muted, calm, tier, found:{tide, orbit, operator, june, handset, konami}, hints:{1..6}, lastExchange}
```
Written on change, debounced 1 s. Under 1 KB.

### Other robustness
- No `alert`/`confirm`/`prompt`. No device orientation, camera, mic or geolocation.
- `navigator.vibrate` and fullscreen are feature-detected and wrapped in try/catch.
- The NaN guard clamps packet amp ≤ 1.5 and displacement ≤ 3 world units.

---

## 10. Secrets & easter eggs (all cheap)

1. **June answers (call-and-response) → RETRACE.**
   - THE CALL in Meridian is degrees **E–G–A–C–B**. Tide uses **A–C–D–F–E** and Long Distance **B–C♯–E–F♯–G♯**.
   - June's amber crosshair plucks visible strings with those pitch classes, one per quarter note.
   - If the user plucks the same 5 pitch classes in order (any octave) within 10 s of the call ending:
     - June's window flares (heat 3 for 4 s).
     - She replies with the phrase reversed.
     - The billboard types `HELLO? I HEAR YOU.` / `DIAL 555-0001`.
     - The directory entry is found.
   - **Dialling 555-0001:**
     - Visible lines dim to 12%.
     - Blank retrace hops glow and spell **`I KNEW SOMEONE WOULD PICK UP`** across the sky between the stars.
     - Bed: pad only. A music-box KS plays the call phrase resolved every 2 bars.
2. **Handset: hear the picture.** Double-tap the payphone.
   - The master switches to the 300–3400 Hz handset band.
   - A looping stereo AudioBuffer (1024 frames ≈ 47 Hz) holds the current exchange's wire, downsampled and projected to [−1, 1]² (L = x, R = y). It is low-passed at 2.4 kHz and plays at −26 dB, regenerated on exchange change and every 2 s.
   - A 140×140 2D-canvas inset (bottom-left, `aria-hidden`) plots `analyserL` against `analyserR` (fftSize 2048) as green XY points. The city is redrawn from the sound itself.
   - Double-tap again or Esc to exit.
3. **Konami code** (↑↑↓↓←→←→BA): Vectrex cellophane overlay.
   - Composite multiplies by translucent bands: top 30% `#FF4FD8`, middle `#3DF5FF`, bottom `#FFD15C`, at 55%.
   - Thin frame art drawn as an SDF border.
   - Toast `OVERLAY INSERTED`. The same code or Esc removes it.
4. **Wrong numbers & Operator.**
   - Any unlisted number: SIT tones + billboard `THE NUMBER YOU HAVE DIALED` / `IS NOT IN SERVICE`.
   - `867-5309`: busy tone + `LINE BUSY` / `SINCE 1981`.
   - `0`: June's crosshair circles her window, and the billboard types `OPERATOR SEVEN.` / `LINES CLOSED 12-31-86. I'M STILL HERE.` (directory found).

**Also, as world detail rather than secrets:** the clock tower shows the viewer's real local time with the date frozen at `31 DEC 86`. `CALL #n` counts visits, and June's note changes every visit.

---

## 11. Artifact page-contract checklist

- [ ] One `.html` file that **starts with `<title>Party Line '85</title>` and then `<style>`**. No `<!doctype>`, `<html>`, `<head>` or `<body>` tags. The host provides the skeleton and the viewport meta.
- [ ] `<style>` begins with the Google Fonts `@import` (Monoton, VT323, `display=swap`). No other external stylesheets, **no external scripts at all**, and no fetch/XHR/WebSocket.
- [ ] All assets are procedural. The only data: URIs are the silent WAV and the badge texture, which is canvas-generated at runtime.
- [ ] `html, body { height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; background: var(--void); }`. **No `100vh`.**
- [ ] `:root { color-scheme: dark; … }` with every colour as a token. Redefine them **identically** under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and `:root[data-theme="dark"] {…}`. The single dark look is deliberate.
- [ ] Canvas is `position: fixed; inset: 0; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-touch-callout: none;`.
- [ ] No `alert`/`confirm`/`prompt`. No downloads. No permissions requested.
- [ ] No AudioContext before a user gesture. Sound starts only from pick-up or SOUND.
- [ ] localStorage only inside try/catch, for small conveniences.
- [ ] Layout works at 380 px with a 16 px side gutter for overlay text, no horizontal scroll, and safe-area insets respected.
- [ ] File ≤ 250 KB (far under the 16 MB limit).

---

## 12. Acceptance criteria

1. **First frame:** the glass and dot are painted ≤ 200 ms after script start on a desktop. Full-density Meridian is visible ≤ 1.6 s after load with **no gesture and no AudioContext** (verify `AudioContext` is never constructed before a gesture).
2. **Pre-gesture:** mouse hover bends lines on the next frame. The ghost sun-pluck packet visibly traverses the wire every 7 s, silently.
3. **First pointerdown anywhere on the canvas:** off-hook click audible ≤ 50 ms after, packet visible on the next frame, overlay gone ≤ 300 ms.
4. **Downbeat timing:** 2400 ± 20 ms after the gesture on the first call, 1250 ± 20 ms on a return. Kick, bloom swell, carrier bead and billboard typing start within ±1 frame of each other.
5. **Skip:** a second tap during the handshake brings the downbeat ≤ 250 ms later with no stuck tones.
6. **Snap:** on a coarse pointer, any tap within 44 CSS px of a visible line plucks the nearest string. A tap beyond that pings. **When unmuted, every tap makes a sound.**
7. **Latency:** pluck sound starts inside the event handler (no quantization). On Meridian, plucking the sun visibly moves a bright packet through the billboard letters and into the floor grid within 4 s. At least 1 resonator chime sounds as the packet arrives.
8. **Key safety:** every user-triggered pitch is in the current exchange's pluck scale, and every chime is in scale ∩ chord. Verify with a debug note log over 2 min of random input.
9. **Strum stress:** strumming across all sun stripes in < 400 ms plays ≥ 8 distinct notes. Active voices never exceed the tier cap, and no voice outlives 3 s after release.
10. **Pull the thread:** long-press 450 ms + drag ≥ 33% of min(viewport) → the city becomes a single straight humming line. Release → knit completes on a downbeat (±1 frame) into the next exchange in the cycle. Early release springs back with a wobble. No frame > 33 ms during the sequence on MID.
11. **Slow the beam:** two-finger hold (250 ms still), right-button hold, Space hold and SLOW hold each produce the comet. Release returns within 600 ms, and the bed resumes on the next downbeat.
12. **Desk view:** pinch out, wheel out, `−` and STEP BACK each reach the desk view, with audio audibly through the TV-speaker filter and the room lit in the screen's current colour. Tap screen, `+` and DIVE IN return.
13. **Degauss:** double-tap / double-click / `D` play the 0.9 s swirl and thunk. Under reduced motion it is a colour fade with no swirl.
14. **Frame rate:** p95 frame time ≤ 16.7 ms over 60 s of continuous play on a Pixel 6a / iPhone 11 class phone, and on Intel Iris Xe at 1440p (the governor may choose the tier).
15. **Governor:** under 4× CPU throttle, the tier steps down within 2 s. It recovers only after 5 s of good frames plus the 10 s cooldown. The stable tier persists across reloads.
16. **Tab hidden:** rAF stops and the AudioContext is suspended within 200 ms. On return there is a power-on animation, audio resumes, and no burst of catch-up notes plays.
17. **Context loss:** `WEBGL_lose_context.loseContext()` shows `SIGNAL LOST`. `restoreContext()` restores the full scene within 1 s with the exchange, mute and found secrets preserved.
18. **No WebGL2:** Canvas2D poster plus `NO CARRIER` copy, zero console errors.
19. **Audio blocked:** `NO DIAL TONE` chip, visuals unaffected, SOUND retries successfully after a later gesture.
20. **Reduced motion:** no parallax, drift, swirl, unravel motion or kick duck. Flashes ≤ 2/s. All verbs and secrets still work and sound.
21. **Keyboard-only:** pick up, pluck, pull, slow, degauss, step back / dive in, dial, mute, help and Esc all work without a pointer. Tab reaches every HUD control with a visible focus ring. The dialog traps and restores focus.
22. **Phone layout (380×740 portrait):** no horizontal scroll, all controls ≥ 44×44 px, sun diameter ≥ 50% of viewport width, horizon 44–48% from the top, HUD clear of the safe-area insets.
23. **Storage disabled** (throwing localStorage): no errors, defaults used, everything works.
24. **Network:** the only requests are to fonts.googleapis.com / fonts.gstatic.com.
25. **Audio safety:** output never clips (limiter). Start level −14 dB. 20 taps/s for 10 s causes no audio dropouts on MID and keeps voices ≤ cap.
26. **Hints:** each hint appears at most once, only for undiscovered verbs, hides on success or after 6 s, and its state persists.
27. **Secrets:** repeating June's call reveals 555-0001, and dialling it shows a legible Retrace message. An unlisted number plays SIT tones. `0` shows Operator. The Konami code toggles the overlay. The payphone double-tap shows an XY inset that recognisably redraws the current exchange.
28. **Memory:** no per-frame allocations. In DevTools, steady-state heap growth is < 1 MB/min with no periodic GC hitches.
29. **Smoothness:** no point jumps > 2 px between frames during warm-up, knit or exchange morph, except the intentional snap.
30. **Flash safety:** the flash limiter keeps large flashes to ≤ 3 per second (≤ 2 under reduced motion), and there are no full-screen white strobes.
31. **Echo sync:** visible echo packets appear at the dotted-eighth intervals of the audible ping-pong (±1 frame, measured via the event bus).
32. **Page contract:** the file starts with `<title>`, contains no doctype/html/head/body tags, is ≤ 250 KB, and passes every item in §11.