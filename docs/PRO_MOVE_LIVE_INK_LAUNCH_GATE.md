# PaperOS Live Ink — Launch Readiness Gate

Status as of 2026-07-10, superseding all prior claims about the live ink test
chain.

## Current verdict (updated 2026-07-10 evening)

```text
LIVE TEST LAUNCH UX: PASS (user-confirmed)
REAL DISPLAY READY: PASS (user saw READY page and live ink on the panel)
PHYSICAL WRITING GATE: PASS — build 572effbfa669
  user verdict: "都正常了，很好用" — no flashing, ink follows the pen,
  strokes continuous, pressure-sensitive width works, eraser works
```

The earlier FAIL verdict below is preserved for the record; every root cause
has since been found and fixed (see "Display path corrections").

### Display path corrections (the actual fixes)

1. **QRasterWindow never reaches the panel.** The first candidate painted
   into Qt's backing store; paint events completed but the e-ink panel never
   updated. The candidate now takes over the vendor framebuffer directly:
   `DirectInkDiag::armCapture()` → `EPFramebuffer::instance()` → resolve the
   RGB32 960x1696 buffer → draw → `swapBuffers`.
2. **The EPFramebuffer enums were wrong in every position.** Verified against
   asivery/epfb-re and MaximeRivest/riddle (both live-draw on this panel):
   `EPContentType { Mono=0, Color=1 }`,
   `EPScreenMode { QualityFastest=0, QualityFast=1, Quality3=3, QualityFull=4, Quality5=5 }`,
   `UpdateFlag { NoRefresh=0, CompleteRefresh=1 }`.
   The old placeholders sent every stroke as **Color + CompleteRefresh** —
   the whole-screen black flashing the user reported was a full flashing
   refresh per stroke, not a waveform-frequency problem.
3. **Correct live-ink parameters** (matches Riddle's quill scribble path):
   strokes = `Mono + QualityFastest + NoRefresh` (partial, non-flashing);
   page setup = `Mono + Quality3 + CompleteRefresh` (one intentional flash to
   clear retained pixels).
4. **Stroke continuity**: consecutive pen frames are joined with line
   segments (was: isolated dots per frame → dashed fast strokes).
5. **Pressure**: raw pressure 0..4096 maps to a 1..4 px nib; eraser is a
   fixed 12 px nib.
6. **paperctl liveness**: candidate liveness is decided by `/proc/<pid>`, not
   bridge responsiveness — a stalled bridge no longer gets the session killed
   mid-test.

## Original verdict (2026-07-10 morning, retained for the record)

```text
LIVE TEST LAUNCH UX: FAIL
REAL DISPLAY READY: NOT PROVEN
PHYSICAL WRITING GATE: NOT RUN
```

The previous physical test launch failed from the user's perspective: paperctl
reported the live test as running while the Move still showed the retained
xochitl page, no PaperOS test page was visible, and the user had no way to
tell whether the test process was active. Retained e-ink content is not an
acceptable test experience.

## Corrected claims

The following statements from earlier reports are **withdrawn** — they were
not supported by evidence:

- ~~"the complete input-to-screen loop is fully proven"~~
- ~~"exclusive DRM path is active"~~
- ~~"physical rendering is confirmed"~~

`WINDOW_UPDATE_REQUEST` events, `window->showFullScreen()` and
`window->update()` prove that Qt was *asked* to paint — not that the panel
updated. The strongest currently valid claims are:

- real evdev input was received
- PenFrames were generated
- the CPU raster buffer changed
- Qt window update requests were issued
- paint events occurred

Physical panel visibility and ink quality remain a **manual gate**. Software
readiness is therefore reported as:

```text
SOFTWARE_DISPLAY_READY=true
PHYSICAL_DISPLAY_VISIBLE=pending_user_confirmation
```

## Readiness state machine

The live candidate (`paperos-ink-live`) now walks an explicit state machine,
logged to `/tmp/paperos-test-driver/events.jsonl` as `STATE` events and
exposed over the test bridge (`paperctl live-ink status`):

```text
PROCESS_STARTED
WINDOW_CREATED
INITIAL_PAINT_REQUESTED
INITIAL_PAINT_COMPLETED
MARKER_OPENED
EVIOCGRAB_SUCCEEDED
INPUT_RANGES_READ
DISPLAY_READY
LIVE_READY
TEST_RUNNING
TEST_COMPLETE
RECOVERING
RECOVERED
```

Key rules:

- A full white **INITIALIZING** page is drawn and painted before Marker init;
  after Marker init succeeds the **READY** page ("Write anywhere below")
  replaces it. Both paints are proven by `INITIAL_PAINT_EVENT_BEGIN/END` and
  `READY_PAGE_PAINT_EVENT_BEGIN/END` log events.
- The session countdown starts only after `READY_PAGE_PAINT_EVENT_END` **and**
  `EVIOCGRAB_SUCCEEDED`. Startup and the initial repaint are not billed to the
  user's test duration.
- Coordinate mapping is validated from the runtime ioctl ranges (ABS_X/ABS_Y/
  ABS_PRESSURE min/max vs. screen 954x1696) *before* LIVE_READY: raw min → 0,
  raw max → width-1/height-1, center strictly inside. On failure the candidate
  aborts instead of asking the user to write. Mapping is never silently
  repaired during a running test.
- After the READY page paint, the backing image is saved to
  `/tmp/paperos-test-driver/live-ready.png` and pulled to the host. It
  confirms application rendering only — it is **not** proof that the physical
  panel updated.
- On first physical pen contact a one-shot `INPUT RECEIVED` header is shown
  (never continuously repainted), with `FIRST_MARKER_FRAME`,
  `FIRST_RASTER_COMPLETE`, `FIRST_UPDATE_REQUEST`, `FIRST_PAINT_EVENT` logged
  so "no input / input-no-raster / raster-no-paint / paint-no-visibility" can
  be told apart.

## Controller behavior (`paperctl live-ink`)

`paperctl live-ink start` no longer fire-and-forgets:

- waits for `LIVE_READY` before printing that the test started; if not reached
  within 8 s it prints the failing state, collects logs, kills the candidate,
  restores xochitl and exits non-zero;
- verifies both initial and READY paint events in `events.jsonl`;
- pulls `live-ready.png` and prints the local path;
- stays attached with a periodic status line (state, PID, build, marker grab,
  time remaining);
- if the candidate exits unexpectedly it reports the exit code (from
  `last_run.txt`) and recovers xochitl.

`live-ink status`, `live-ink stop`, and `live-ink logs` are supported.

Automatic recovery (kill candidate, remove stale locks, restart xochitl,
verify `systemctl is-active xochitl`) runs on normal timeout, Ctrl-C, SIGTERM,
candidate crash, readiness timeout, Marker init failure, and coordinate
mapping failure, and always ends with `XOCHITL_RECOVERED=true` or an explicit
recovery failure.

## Launch validation gate (20 s)

Before any user is asked to run the 120 s physical writing test, a 20-second
launch test must PASS all of:

```text
candidate deployed without replacing production
LIVE_READY reached
READY page paint event recorded
ready screenshot pulled
Marker grab succeeded
duration starts after readiness
candidate exits cleanly
xochitl returns active
```

### Result — 2026-07-10, build 98485fc4ecbd: **PASS**

```text
candidate deployed without replacing production   PASS (candidates/current/, production sha untouched)
LIVE_READY reached                                PASS (0.33 s after process start)
READY page paint event recorded                   PASS (READY_PAGE_PAINT_EVENT_BEGIN/END in events.jsonl)
ready screenshot pulled                           PASS (live-ready.png shows the READY page)
Marker grab succeeded                             PASS (EVIOCGRAB_SUCCEEDED)
duration starts after readiness                   PASS (SESSION_TIMER_STARTED at LIVE_READY; 20.03 s measured)
candidate exits cleanly                           PASS (last_run.txt exit=0)
xochitl returns active                            PASS (XOCHITL_RECOVERED=true)
```

Runtime input ranges read via ioctl: ABS_X 0..6760, ABS_Y 0..11960,
ABS_PRESSURE 0..4096 (screen 954x1696); COORD_MAPPING_CHECK_PASS. Note the
previous build's hardcoded fallbacks (maxX=20967, maxY=15725) did not match
this digitizer — strokes would have mapped to roughly a third of the screen.

Additional defect found and fixed during this gate: stale candidates from the
failed earlier session were still running on the device because the recovery
kill pattern did not match `paperos-ink-*` binary names. Both
`recover-xochitl.sh` and the paperctl launch/recovery scripts now match test
candidates.

The launch gate is green; the 120-second physical writing test may now be
requested from the user. `PHYSICAL_DISPLAY_VISIBLE` remains
`pending_user_confirmation` until the user confirms the READY page on the
panel.
