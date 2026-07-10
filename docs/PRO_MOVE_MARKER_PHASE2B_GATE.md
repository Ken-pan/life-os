# Marker Phase 2B-0 — Native Takeover Ink Gate

**Status: PHASE 2B GOLD BASELINE — BUILD/DEVICE TEST PENDING**
**Date:** 2026-07-09 · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`)

Do not merge the Qt Quick + direct-framebuffer hybrid path into production,
do not tag it as a PaperOS note architecture, and do not proceed to color,
highlighter, pencil texture, lasso, zoom, or animations until the standalone
native takeover baseline passes on the physical Move.

## Product Direction Lock

PaperOS Notes is not allowed to fall back to a "better Qt canvas" product.
The target architecture is:

```text
paperos-shell       Qt Quick shell: Notes list, Planner, Tasks, Settings
paperos-core        resident state, canonical strokes, JSONL, undo/redo, IPC
paperos-ink-runtime QCoreApplication-only native ink host, exclusive display
```

The user-visible flow remains one PaperOS navigation:

```text
PaperOS Notes list
→ PaperOS Native Ink Mode
→ Marker immediately writes
→ Back returns to the same Notes route and navigation state
```

The process boundary is an engineering isolation boundary only. The user must
not see SSH, scripts, a terminal, xochitl management, process restarts, or a
separate app.

## Hybrid Rejection

The old `PAPEROS_DIRECT_INK=1` Qt Quick shell path is now a failed experiment.
Live hybrid code is gated only by the deliberately explicit
`PAPEROS_REJECTED_HYBRID_DIRECT_INK=1` forensic flag. It is not a product path.

Rejected properties:

- Qt Scene Graph running in parallel with direct ink.
- Segment-level direct swaps from inside `InkCanvasItem`.
- Mode 1 as the default live waveform merely because a deterministic line
  rendered solid.
- Any pen-up Qt reconciliation repaint.
- Any architecture where the display layer owns canonical stroke data.

Target properties:

- QCoreApplication-only ink runtime.
- No QML, no QQuickWindow, no Qt Scene Graph.
- xochitl stopped while native note mode owns the display.
- Exclusive vendor framebuffer ownership.
- Raw Marker evdev.
- CPU raster on every Marker frame.
- One serialized display scheduler with maximum one swap every 8 ms.
- Live content type `Mono`, live mode `0`, full refresh false.
- PaperOS-branded toolbar rasterized into the same framebuffer.

## Gold Baseline First

Before PaperOS enter/exit integration, the standalone Move Quill-style
baseline must prove:

```text
first stroke immediately solid
fast stroke continuous
no delayed fill
no black/white flashing
no full-screen update during pen-down
```

The baseline behavior must copy real Quill:

```text
raster on every marker frame
union pending dirty rect
maximum one swap every 8ms
live content type Mono
live mode 0
full refresh false
single display thread
```

Forbidden during the baseline:

```text
swap per point
swap per segment
Qt Scene Graph running in parallel
mode 1 as default live waveform without evidence
CompleteRefresh during pen-down
Qt update on pen-up
```

## Corrections applied (per directive)

1. **`createControlledInstance()` is shim-provided.** The Phase 2A conclusion
   that its absence from the export table meant Quill was unavailable is
   retracted. epfb-re implements it and calls vendor `EPFramebuffer::instance()`
   inside the controlled QImage window.
2. **Authoritative ABI recovered** (ELF dynsym RE, not guessed):
   - Backend is `EPFramebufferAcep2` (ACeP color panel);
     `swapBuffers` dispatches to
     `EPFramebufferAcep2::swapBuffers_impl(QRegion, EPContentMap, EPScreenModeMap, flags)`.
   - `EPFramebuffer::setBuffers(std::tuple<QImage,QImage>, QImage*)` — exact
     signature. AArch64: `this`=x0, tuple by-value indirect=x1, aux=x2.
   - Two `swapBuffers` overloads (rect form and region form).
   - `getAuxFramebuffer`/`getMainFramebuffer` confirmed NOT exported.
3. **Rejected the competing-swap live integration.** `InkCanvasItem::drawSegment`
   was drawing each segment into BOTH the Qt QImage and the direct framebuffer
   and calling `swapBuffers` per segment, concurrently with the Qt
   scene-graph swap over the same canvas region — the Case-3 competing-swap
   root cause, using unverified enums and scene (954) coordinates against a
   960-allocated buffer. This is not a product path.
4. **Dimension-only interception replaced** with candidate discovery: dladdr
   provenance (only `libqsgepaper.so`-constructed images count), all
   discriminating signals recorded, dedupe by stable **data** pointer.

## Buffer identity — PROVEN (dladdr-verified, two runs)

The QImage complete-object ctor `QImage(uchar*,int,int,qsizetype,Format,…)`
is interposed; only vendor-scenegraph callers are accepted:

```text
candidate  data=0x…b40b3010  960x1696  fmt=4 (RGB32)      bpl=3840  from libqsgepaper.so
candidate  data=0x…a6662010  960x1696  fmt=24 (Grayscale8) bpl=960  from libqsgepaper.so
```

Critical lesson: the captured QImage **object** address is a stack temporary
(`0xffff…` high stack) that is dangling by gate time — dereferencing it
segfaulted the first two gate attempts silently. Only the mmap'd **data**
pointer is stable. The draw path rebuilds a QImage over the data pointer.

`setBuffers` interposition did **not** fire (its symbol isn't preempting the
vendor's internal call). Not blocking: the RGB32 buffer identity is already
dladdr-proven. Recovering the semantic aux/main roles via `setBuffers` (or
`forceInstance`) remains open and would disambiguate which of the two the
panel actually presents.

## Hard direct-ready gate — PASS (resolves + logs)

```text
DIRECT_INK_READY=1
DIRECT_BUFFER_OBJECT=0x490fd0 (rebuilt over data)
DIRECT_BUFFER_DATA=0xffffb40b3010
DIRECT_BUFFER_FORMAT=4
DIRECT_BUFFER_SIZE=960x1696
DIRECT_BUFFER_BPL=3840
DIRECT_BUFFER_SOURCE=qimage-ctor
```

## Test A — deterministic solid line

| Stage | Result |
| --- | --- |
| buffer checksum before | `bbce95c5` |
| after clearWhite | `bbce95c5` (region already white) |
| after raster (400 px, r=3) | `7e6b243c` |
| **memory continuity scan** | **SOLID — 0 gap columns of 401** |
| dirty rect | 197,845 407×7 |
| swap issued | Mono, mode 1, rect 184,832 432×32 |

**Memory-side interpretation (decision tree):** the in-memory line is
continuous → this is **not** a raster/stride error; `ink_raster.cpp` Bresenham
+ circle-stamp geometry and the RGB32 stride (bpl 3840, bpp 4, allocated
width 960) are correct.

**Physical side: CONFIRMED SOLID (operator, 2026-07-09).** With the Test-A
hold mode (`PAPEROS_DIRECT_TESTA=1`, line re-asserted every 500 ms), the
operator confirmed the mid-screen line renders **solid and continuous** on
the panel, Mono + mode 1. Per the decision tree this is **Case 3**: buffer,
waveform, stride, and swap semantics are all correct — the dotted *live*
line is caused by competing Qt/direct `swapBuffers` over the canvas during
pen-down. Fix = exclusive canvas ownership during strokes.

## Remaining work to clear the native gate

- **Gold baseline harness**: standalone `paperos-ink-probe` runs as
  QCoreApplication, uses raw evdev, rasterizes every marker frame, unions dirty
  rects, and swaps from one display thread at an 8 ms cadence.
- **Physical evidence**: video of first stroke, fast Chinese, fast English,
  circles, and 30 second scribble. Capture `/tmp/paperos-ink-probe-metrics.jsonl`.
- **IPC contract**: `paperos-core` owns session state and canonical strokes;
  shell and runtime talk through explicit commands/events.
- **Seamless state machine**: enter/exit note mode restores Notes route without
  visible process restart or navigation loss.
- **Native toolbar prototype**: Back, title mark, undo, redo, pen, eraser, page
  navigation rasterized directly into the runtime framebuffer before marker
  input becomes active.

## PASS Criteria

Only after all of these pass may more brushes start:

```text
first stroke continuous
fast Chinese continuous
fast English continuous
continuous circles close
30 second scribble has no flashing
no delayed fill
no refresh queue backlog
enter/exit Notes 10/10 success
crash returns to PaperOS automatically
JSONL matches canvas pixels
```

## Safety

Native takeover work must keep stock boot recoverability:

- No xochitl binary patching.
- No boot replacement.
- Supervisor restores PaperOS shell after ink-runtime crash.
- Standalone probes may stop xochitl only inside wrapper-controlled tests.
- Production `paperos-shell` remains unchanged until the gold baseline passes.
