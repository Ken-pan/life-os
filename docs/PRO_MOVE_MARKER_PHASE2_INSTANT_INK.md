# Marker Phase 2: Instant-Ink Strategy for PaperOS

**Date:** 2026-07-09 · **Status:** recon complete; Qt/direct hybrid rejected; native takeover runtime target

Goal: close the last latency gap between PaperOS ink and native xochitl
("instant ink"). The old Qt Quick canvas path is no longer an acceptable
product fallback. The target is a PaperOS-native, full-takeover ink runtime
entered seamlessly from the PaperOS Notes list.

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

## Direction Lock

The product architecture is now:

```text
paperos-shell       Qt Quick shell for normal PaperOS UI
paperos-core        resident canonical note/session/persistence service
paperos-ink-runtime QCoreApplication-only full-takeover note canvas
```

The user-visible flow must remain:

```text
PaperOS Notes list
→ PaperOS Native Ink Mode
→ Marker immediately writes
→ Back returns to the same Notes route
```

The user must not see SSH, scripts, terminal output, xochitl management,
process restart, or a separate app.

## Strategy ladder

### Step 1 — classifier-friendly ink (SHIPPED)

Dark opaque pen tools (ballpoint, fineliner, eraser) now render with
antialiasing OFF: pure bilevel edges, exactly what `ct33_pen.bin` content
looks like. Marker/pencil/colored strokes keep AA (they want the richer
waveform anyway). Runtime override: `PAPEROS_INK_AA=1|0`.

Also shipped in the same push: dirty-rect batching at 30 ms (fixes the
"dashed live line" — per-segment updates collided with in-flight e-ink
refreshes and were dropped until a catch-up repaint).

### Step 2 — Qt/direct hybrid experiment (REJECTED)

Because `libqsgepaper.so` is already mapped into PaperOS, the previous plan
tried to `dlsym` swap entry points and flush ink rects from inside the Qt Quick
shell:

```cpp
using InstanceFn = void *(*)();
using SwapFn = void (*)(void *self, QRect rect, int contentType,
                        int screenMode, int updateFlags);
auto instance = (InstanceFn)dlsym(handle, "_ZN13EPFramebuffer8instanceEv");
auto swap = (SwapFn)dlsym(handle,
    "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE");
```

That path is rejected for product use. It allows Qt Scene Graph and direct
swaps to compete over the same canvas region, encourages segment-level swaps,
and keeps canonical note data in the display layer.

The old `PAPEROS_DIRECT_INK=1` flag must not enable product ink. Any retained
hybrid live path must use an explicit rejected/forensic flag such as
`PAPEROS_REJECTED_HYBRID_DIRECT_INK=1`.

### Step 3 — standalone Quill-style gold baseline (CURRENT NEXT STEP)

Before shell integration, prove the standalone Move baseline:

```text
raster on every marker frame
union pending dirty rect
maximum one swap every 8ms
live content type Mono
live mode 0
full refresh false
single display thread
```

The gate requires video and `/tmp/paperos-ink-probe-metrics.jsonl` evidence for
first stroke, fast Chinese, fast English, closed circles, and 30 second scribble.

### Step 4 — PaperOS native takeover runtime

[riddle](https://github.com/MaximeRivest/riddle)'s `quill` interposes the
vendor waveform engine via a QImage-constructor shim exposed as a C ABI
(`quill_init/quill_buffer/quill_swap`) and achieves xochitl-grade instant
ink. PaperOS should adopt the same full-takeover principle, but present it as
a seamless internal Notes mode, not as a user-visible separate app.

## Legacy hybrid ink stack (do not productize)

```text
Elan pen evdev (event2, 200 Hz, pressure 0..4096)
  → PenInputService (SYN framing, EVIOCGABS calibration, SYN_DROPPED recovery)
    → tap on UI: synthesized mouse events (3 px motion filter)
    → legacy ink: InkCanvasItem C++ direct calls
        · tools: ballpoint / fineliner / marker / pencil / eraser
        · pressure EMA α=0.45, gamma 1.6, width-step clamp 0.5 px
        · velocity thinning (ballpoint 4.5%, pencil 10%)
        · midpoint quadratic smoothing
        · undo/redo via stroke replay; JSONL rewrite per commit
        · bilevel rendering for dark pen tools (waveform-friendly)
        · dirty batching 30 ms, immediate first-segment + pen-up flush
```

This stack is useful historical context only. The product target is documented
in [`PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md`](PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md).

## Measurement Plan

- Slow-mo phone video of pen tip vs first pixel (target < 80 ms for MVP,
  instant-ink target ≈ xochitl side-by-side).
- Log-based: `/tmp/paperos-ink-probe-metrics.jsonl` swap cadence, dirty rect
  size, raster frame count per swap, and swap duration.
- The comparison baseline is xochitl's own notebook on the same device.
