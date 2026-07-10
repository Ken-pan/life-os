# Marker Phase 2: Instant-Ink Strategy for PaperOS

**Date:** 2026-07-09 · **Status:** recon complete, step 1 shipped, step 2 designed

Goal: close the last latency gap between PaperOS ink and native xochitl
("instant ink"). Phase 1 already moved ink to a C++ fast path with batched
dirty rects; the remaining latency lives in the vendor e-ink backend's
waveform selection and flush pipeline.

## Recon: what the vendor backend actually exposes (read-only, on device)

Both plugins load **inside our process** when running `-platform epaper`
with `QT_QUICK_BACKEND=epaper`:

- `/usr/lib/plugins/platforms/libepaper.so` (QPA)
- `/usr/lib/plugins/scenegraph/libqsgepaper.so` (render loop + framebuffer)

Exported symbols found via `strings`/dynsym on `libqsgepaper.so`:

```text
EPFramebuffer::instance()                                   ← singleton accessor
EPFramebuffer::swapBuffers(QRect, EPContentType,
                           EPScreenMode, QFlags<UpdateFlag>) ← per-rect flush
EPContentMap::setTypeForRect(QRect, EPContentType)           ← region typing
EPScreenModeMap::setModeForRegion(QRegion, EPScreenMode)
epimageutils::scanForContentType(QImage const&, QRect)       ← AUTO-CLASSIFIER
EPRenderLoop::maybeUpdate(QQuickWindow*)
```

Waveform assets: `/usr/share/remarkable/ct33_pen.bin`, `ct33_fast.bin`,
plus the main `GAL3_*.eink` bundle. There IS a dedicated pen waveform.

Key insight: the backend **scans rendered pixels to classify each updated
rect** (`scanForContentType`) and picks the waveform accordingly. Content
that looks like ink (crisp bilevel strokes) can ride the pen waveform;
antialiased gray-haloed strokes classify as image and repaint slower.

## Strategy ladder

### Step 1 — classifier-friendly ink (SHIPPED)

Dark opaque pen tools (ballpoint, fineliner, eraser) now render with
antialiasing OFF: pure bilevel edges, exactly what `ct33_pen.bin` content
looks like. Marker/pencil/colored strokes keep AA (they want the richer
waveform anyway). Runtime override: `PAPEROS_INK_AA=1|0`.

Also shipped in the same push: dirty-rect batching at 30 ms (fixes the
"dashed live line" — per-segment updates collided with in-flight e-ink
refreshes and were dropped until a catch-up repaint).

### Step 2 — in-process direct flush experiment (DESIGNED, behind env flag)

Because `libqsgepaper.so` is already mapped into PaperOS, we can `dlsym`
the two exported entry points and flush ink rects ourselves:

```cpp
using InstanceFn = void *(*)();
using SwapFn = void (*)(void *self, QRect rect, int contentType,
                        int screenMode, int updateFlags);
auto instance = (InstanceFn)dlsym(handle, "_ZN13EPFramebuffer8instanceEv");
auto swap = (SwapFn)dlsym(handle,
    "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE");
```

Unknowns and how to resolve them:
- `EPContentType` / `EPScreenMode` enum values are not public → sweep
  small integers via env (`PAPEROS_INK_CT`, `PAPEROS_INK_SM`) with a test
  pattern; wrong values produce transient artifacts only.
- Ordering: swapBuffers flushes the current backbuffer, so it must run
  after the render loop has drawn our dirty rect — hook after the
  QQuickWindow afterRendering signal for rects drawn that frame.
- Risk containment: everything behind `PAPEROS_INK_DIRECT=1`, default off;
  ship as `paperos.next` only; xochitl recovery already proven.

### Step 3 — quill-style dedicated ink host (FALLBACK, biggest hammer)

[riddle](https://github.com/MaximeRivest/riddle)'s `quill` interposes the
vendor waveform engine via a QImage-constructor shim exposed as a C ABI
(`quill_init/quill_buffer/quill_swap`) and achieves xochitl-grade instant
ink. Adopting it means a separate takeover display host for ink sessions
(PaperOS UI would hand off to an ink surface and resume after). Only worth
it if Steps 1–2 don't get close enough.

## Current ink stack (after this phase)

```text
Elan pen evdev (event2, 200 Hz, pressure 0..4096)
  → PenInputService (SYN framing, EVIOCGABS calibration, SYN_DROPPED recovery)
    → tap on UI: synthesized mouse events (3 px motion filter)
    → ink: InkCanvasItem C++ direct calls
        · tools: ballpoint / fineliner / marker / pencil / eraser
        · pressure EMA α=0.45, gamma 1.6, width-step clamp 0.5 px
        · velocity thinning (ballpoint 4.5%, pencil 10%)
        · midpoint quadratic smoothing
        · undo/redo via stroke replay; JSONL rewrite per commit
        · bilevel rendering for dark pen tools (waveform-friendly)
        · dirty batching 30 ms, immediate first-segment + pen-up flush
```

## Measurement plan (before/after any Step 2 work)

- Slow-mo phone video of pen tip vs first pixel (target < 80 ms for MVP,
  instant-ink target ≈ xochitl side-by-side).
- Log-based: timestamp delta between evdev frame and update() flush.
- The comparison baseline is xochitl's own notebook on the same device.
