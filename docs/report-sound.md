## Sound module report (parts 20–29)

Sound is implemented and works inside the real integrated build: pick-up, handshake, plucks, strums and chimes all run with 0 console errors. Every contract §3 method exists, and Core's current call sites match it. The one thing over limit is size: Sound is 65.5 KB against its 50 KB budget.

### Files written
| File | Lines | Size | Contents |
|---|---|---|---|
| `parts/20-sound-dsp.js` (`SoundDSP`) | 179 | 9.2 KB | Pure code: Karplus-Strong bank jobs, reverb IR jobs, noise, pitch/chord helpers, clock math, 4 ms-slice job runner |
| `parts/22-sound-voice.js` (`SoundVoice`) | 495 | 29.1 KB | The full §6.1 audio graph, every §6.4 instrument, the voice pool with stealing, the handset XY path, analysers |
| `parts/25-sound.js` (`Sound`) | 503 | 27.1 KB | Public API, transport, lookahead scheduler, arrangement and energy layers, handshake, event bus, mute/hide lifecycle, iOS unlock |

### Tests
- **Node unit tests:** all pass.
  - All 16 KS buffers are finite, peak ≤ 0.8, pitch within 0.1 cent of the target period, and end below −54 dB.
  - IR energy and pre-delay are correct.
  - Every degree, chime, ping, arpeggio and music-box note stays in scale; every chime stays in scale ∩ chord.
  - Grid and chord-index maths check out.
  - Every API method, called before `init`, with no `window` and no audio, never throws.
- **Headless Chrome on port 8742:**
  - **Timing:** `status()` becomes `running` after a click. DOWNBEAT, KICK, BAR and CHORD coincide. Ghost plucks and knit landings fire on their exact times. Skip lands on the next 16th at least 250 ms away and stops further digits.
  - **Lifecycle:** mute and hide/show keep the beat phase. No catch-up notes play after a resume. Slow beam silences drums until the next downbeat after release.
  - **Load and pitch:** at 20 taps/s for 10 s, voices never exceed the tier cap. None of 256 logged notes is out of scale.
- **Offline render through the real graph:** no NaNs. A dense stress mix peaks at −7.9 dBFS, so nothing clips. Levels are balanced: plucks lead at about −14 dBFS, chimes sit 6–8 dB under, and the pad runs at −26 dB RMS in stereo.

### Deviations from contracts.md
1. Added QA-only methods: `debugErr()`, `debugVoices()`, `debugClock()`.
2. The handset `analyserL/R` read the XY loop itself (after its 2.4 kHz low-pass), not the master. Otherwise the music drowns the picture.
3. `readXY()` returns the stored picture when audio is off or muted. It returns `null` only before any picture has been set.
4. `getOutputTimestamp()` is sampled in the 25 ms scheduler tick, not in `update()`, because it allocates.
5. The fallback offset is now − (currentTime − latency)·1000; spec §6.2 has the latency sign flipped.
6. The transport switches to the audio clock only after 8 consistent offset samples (about 200 ms after audio starts). After that, it follows output-latency changes smoothly.
7. MIDI outside the KS bank is shifted by octaves rather than clamped, so it stays in key. Slow beam on KS plays at half speed instead of midi − 12 (same pitch, tape feel).
8. KS buffers get an extra decay. With the spec's damping alone they would still be ringing when the buffer ends.
9. Kick, snare and hats bypass the sidechain duck (a kick ducking itself loses its body). Pad, bass, choir and the sea wash still duck.
10. A knit's KNIT_LAND/CHORD/KICK snap to the heard bar line when within half a 16th of `landMs`. DOWNBEAT is re-timed to the bar-0 grid when within 60 ms. On equal times, DOWNBEAT, KNIT_LAND and HS_* events are delivered first.
11. Spec choices where it was silent:
    - Long Distance gets a soft sub and a probe arpeggio, both gated by the bass layer (E ≥ 0.35 to start).
    - Tide's kick on beat 3 uses the 4-on-the-floor layer (same 0.6 threshold).
    - In fill bars, the beat-4 kick and snare give way to the toms.
    - `status()` reads `'suspended'` while muted.
    - `Sound.energy` includes the 0.35 post-handshake floor.

### Not finished in scope
Only the size budget. Comment and wrapper compaction saved about 2 KB; the rest is dense logic.

### Integration risks to check first
1. **Size:** the assembled page is about 313 KB against the 250 KB limit, and Core is still growing. Stripping indentation and full-line comments in `assemble.mjs` would recover roughly 10%.
2. **Unlock cost:** `unlock()` spends about 45 ms creating the AudioContext in headless plus about 6 ms building the graph, all inside the gesture handler. Noise, the KS bank and reverb IRs are generated in `prewarm()` idle slices, so Core should call `prewarm()`.
3. **Silent `<audio>`:** in a locked-down sandbox, CSP may block the data-URI and log a browser console error that code cannot catch. The spec asks for this call anyway.
4. **Knit timing:** KNIT_LAND's `tMs` can differ from Core's `landMs` by up to 78 ms if output latency drifted between the call and the landing. In real browsers it is usually under 1 ms. Core should use the event's time.
5. **Tide hats:** Tide's shaker sends a HAT event on every 16th (16 per bar). Core's HAT handler must be cheap.
6. **Chime limits:** chimes are rate-limited to 3 per 40 ms across all resonators, on top of Core's per-resonator limits.

Test material is in `build/tmp-sound/` (Node tests, QA step files, test-only parts 90/91); none of it ships.