# UI module report

Everything §7, §4.3, §9 and §11 assign to UI is in place, with nothing stubbed. My test page (config + UI + a stub that paints a fake neon city and drives every state) runs with 0 console errors at 1280×800, 390×844 and 380×740. The full assembly also passes `node --check`. The one thing I didn't meet is the size budget: UI is **46.5 KB against 38 KB**.

## Files written
- `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/parts/ui.html`: 210 lines, 23.5 KB. It follows the page contract: title, fonts import, colour tokens, `#scene` canvas and all static markup.
- `C:/Users/A31B6~1.AHM/AppData/Local/Temp/4/claude/C--Users-a-ahmadi-Projects/622383ef-c8a7-4630-ba2a-170107bf27db/scratchpad/build/parts/30-ui.js`: 509 lines, 24.1 KB. It declares only `const UI`, and the module body has no side effects.
- Test files are in `build/tmp-ui/` (`build.mjs`, `stub.js`, `steps-*.json`, `nodom.cjs`).

## What was verified
- **Every UI state, both layouts:** overlay, status, hints, chips, toast, caption, both dialogs, the XY inset and NO CARRIER. Nothing overlaps, there is no horizontal scroll at 380 or 390 px, and every touch target is at least 44×44. The dialogs fit 1280×800 and 390×844 without scrolling; at 380×740 they scroll inside the sheet.
- **Keyboard:**
  - Tab order before pick-up is canvas → PICK UP → just watch; after `hideOverlay` the controls follow the canvas.
  - Holding Space or Enter on SLOW fires `onSlow(true)` then `onSlow(false)`, and its click is suppressed.
  - Typing digits, Backspace and Enter in the directory works and calls `onCall` with the digits.
  - The focus trap held over 20 Tabs. Esc closes and returns focus to the opener, or to `#scene`.
- **Hints:** the full timeline works. Each hint hides on its success event, flips below the pointer when it would hit the status lines, moves above the controls and XY inset, and is not shown again after a reload.
- **Never-throw:** every public method returned safely with no DOM and before `init`.

## API deviations from contracts.md
None. Every signature and handler is exactly as specified. Additions, recorded as `// CONTRACT NOTES` at the top of `30-ui.js`:
- **Extra UI-only markup:** a wrapper `#xyw` around `#xy` (it now carries layer 15 and adds a bezel and label), `.ui-top`, `#ui-sa` and the dialog internals.
- **Phone BACK label:** below 700 px the button reads BACK / DIVE. The full STEP BACK / DIVE IN is in its `aria-label`.
- **Hint timing:** no hint shows before `notify('downbeat')`. Hint 4 appears 1.5 s after the first knit so it lands after the morph.
- **Chips announce:** `chip(id, true)` also reads the chip's text through `#live`.
- **Root classes UI owns:** `.calm`, `.hudoff`, `.nocar`, `.xyon`, `.mono` and `.ptr`.
- **Keys while a dialog is open:** a capture listener on `window` stops every key from reaching Core.
- **Directory entries are tappable:** tapping a found entry dials its number into the display.

## Not finished
- **Size budget:** HTML/CSS is 23.5 KB and JS is 24.1 KB. Most of it is required copy, the colour tokens written out twice, and handlers.

## Integration risks to check first
1. **Whole file is 301.5 KB against the 250 KB limit.** Every module is over its budget. The integrator will need a minify step in `assemble.mjs` (for example, stripping comment lines and indentation).
2. **Canvas focus ring after a mouse click.** Core's `46-input.js:38` calls `cv.focus()` on pointerdown, and Chrome then draws the full-viewport focus ring. I handle it with the `.ptr` class (pointer was last → ring hidden; any key → ring returns), but keep it in mind if that Core code changes.
3. **Hint 2 sees less activity than intended.** Core only calls `notify('input')` when leaving idle (`48-world.js:155`), so only plucks, strums, pulls, slow, desk and degauss count as activity for hint 2's "6 s without input". Pings and hovering don't hold it back.
4. **Port 8744 belongs to another agent.** My early real-page screenshots briefly hit their server. Everything was re-verified on 8743.
5. **Wire is mid-development.** The current full build throws inside Wire's `GEN` during `ensureWire`. That isn't UI, but the real-page screenshot of the city is broken until it's fixed.