# PaperOS Ink Gold Baseline Probe

Standalone Move probe for the PaperOS native takeover ink path.

This is not the product runtime. It is the hard evidence harness that must pass
before building `paperos-core` / `paperos-ink-runtime` integration.

## Runtime Shape

```text
QCoreApplication only
no QML
no Qt Quick window class
no Qt Scene Graph
raw Marker evdev
CPU raster on every marker frame
dirty rect union
one display scheduler thread
max one swap every 8 ms
live content type Mono
live mode 0
```

The probe draws a minimal PaperOS toolbar directly into the framebuffer before
Marker input starts. During pen-down it only swaps live dirty rects.

## Run

Build `build-docker/paperos-ink-probe` with the reMarkable SDK container, then:

```bash
./scripts/run-probe.sh 30
```

The wrapper stops xochitl, removes e-paper lock files, runs the probe, restores
xochitl, and pulls metrics into:

```text
logs/paperos-ink-probe-YYYYMMDD-HHMMSS.jsonl
```

## Required Video

Capture slow-motion phone video for:

```text
first stroke immediately solid
fast Chinese continuous
fast English continuous
continuous circles closed
30 second scribble no flashing
no delayed fill
no full-screen update during pen-down
```

## Metrics

Each swap line includes:

```json
{
  "event": "swap",
  "rect": [0, 0, 0, 0],
  "raster_frames": 1,
  "pen_down": true,
  "swap_dur_ms": 0
}
```

Gate failures:

```text
full-screen swap while pen_down=true
large swap backlog / delayed fill
black-white flashing in video
visible gaps in fast strokes
mode 1 used as the live default
```
