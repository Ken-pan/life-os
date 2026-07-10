# Paper Pro Move Direct Instant-Ink Probe — Phase 2A Results

> **STATUS CORRECTED 2026-07-09 → PHASE 2B-0 FAIL — LIVE VISUAL CONTINUITY NOT PROVEN.**
> The original "PHASE 2A PASS" below was premature and is retracted. It certified
> the architecture on the basis that `swapBuffers` "works without crashing" and a
> latency figure that was **estimated from `flush_ms=8`, never measured**. The
> visual-continuity table was never filled. The dotted-live-stroke defect is
> unresolved. See [`PRO_MOVE_MARKER_PHASE2B_GATE.md`](PRO_MOVE_MARKER_PHASE2B_GATE.md)
> for the real gate and the corrected ABI.

## Corrections to the original findings (verified 2026-07-09 via ELF dynsym RE)

The vendor `libqsgepaper.so` (533,648 bytes) dynamic symbol table was parsed
directly (Python ELF reader + `c++filt`; device has no binutils). Corrections:

- **Active backend is `EPFramebufferAcep2`** (ACeP = Advanced Color ePaper),
  not the generic `EPFramebuffer` and not `EPFramebufferSwtcon`.
  `EPFramebuffer::swapBuffers(...)` dispatches through the vtable to
  `EPFramebufferAcep2::swapBuffers_impl(QRegion const&, EPContentMap const&,
  EPScreenModeMap const&, QFlags<UpdateFlag>)`.
- **`createControlledInstance()` is shim-provided, not vendor-absent.** The
  original doc concluded the Quill architecture was unavailable because the
  symbol was missing from the export table. That inference is wrong: in
  epfb-re the shim *implements* `createControlledInstance()` itself and calls
  the vendor `EPFramebuffer::instance()` inside a controlled QImage
  interception window. Absence from the export table proves nothing.
- **Semantic buffer identity is available via `setBuffers`.** Exact recovered
  signature: `EPFramebuffer::setBuffers(std::tuple<QImage, QImage>, QImage*)`.
  This is the authoritative way to learn the front/back/aux buffers — the
  dimension-only QImage-constructor match in `epfb.cpp` is a guess and must be
  replaced/corroborated by interposing `setBuffers`.
- **Two `swapBuffers` overloads exist** — the rect form
  `(QRect, EPContentType, EPScreenMode, QFlags<UpdateFlag>)` and the region
  form `(QRegion const&, EPContentMap const&, EPScreenModeMap const&, ...)`.
- **`EPFramebufferSwtcon::update(QRect, int, PixelMode, int)`** exists (a
  `PixelMode` enum, values not yet recovered — determine empirically).

## Recovered EPFramebuffer ABI surface (authoritative)

```text
EPFramebuffer::instance()
EPFramebuffer::forceInstance(EPFramebuffer*)
EPFramebuffer::setBuffers(std::tuple<QImage, QImage>, QImage*)
EPFramebuffer::swapBuffers(QRect, EPContentType, EPScreenMode, QFlags<UpdateFlag>)
EPFramebuffer::swapBuffers(QRegion const&, EPContentMap const&, EPScreenModeMap const&, QFlags<UpdateFlag>)
EPFramebuffer::framebufferUpdated(QRect const&)
EPFramebuffer::ghostControl(EPFramebuffer::GhostControlMode)
EPFramebuffer::checkLockFile()  /  handleCrash()
EPFramebufferAcep2::swapBuffers_impl(QRegion const&, EPContentMap const&, EPScreenModeMap const&, QFlags<UpdateFlag>)
EPFramebufferSwtcon::update(QRect, int, PixelMode, int)  /  initialize / shutdown / sync / temperature
EPContentMap::setTypeForRect(QRect, EPContentType)
EPScreenModeMap::setModeForRegion(QRegion const&, EPScreenMode)
```

Not exported (confirmed): `createControlledInstance`, `getAuxFramebuffer`,
`getMainFramebuffer` — these are shim/`riddle` constructs.

## What was actually verified (still true, keep)

- Device: `imx93-chiappa`, i.MX93, OS 5.7.126 (scarthgap).
- Marker `/dev/input/event2`: X 0–6760, Y 0–11960, pressure 0–4096, tilt ±9000.
- Framebuffer geometry: allocated **960×1696** (padded from 954 visible),
  RGB32 `bytesPerLine=3840`, plus a Grayscale8 `bytesPerLine=960`.
- xochitl pause/resume + lockfile handling recovered cleanly in every tested
  exit path (normal, SIGTERM, crash, missing-lib).

## What was NOT verified (the reason for the retraction)

- Whether the vendor actually presents the RGB32 buffer we draw into
  (`epfb.cpp` currently labels RGB32 as "main" and Grayscale8 as "aux" — the
  opposite of the epfb-re convention where the RGB32 aux buffer is the draw
  target). **Buffer role is unproven and probably mislabeled.**
- Any physical visual result. No solid-line assertion, no live-ink continuity,
  no ghosting/flash/settle observations. The p95 latency was estimated.

Proceed only through the Phase 2B-0 gate.
