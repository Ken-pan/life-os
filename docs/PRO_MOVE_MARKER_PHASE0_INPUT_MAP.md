# Marker Phase 0: chiappa Input Device Map

**Date:** 2026-07-09 · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`), OS 5.7.126 (scarthgap), aarch64
**Method:** read-only SSH enumeration of `/proc/bus/input/devices` + `/dev/input` (no rootfs writes, xochitl untouched)

## Why the Marker does nothing in PaperOS today

The epaper QPA platform plugin only instantiates `epaperevdevtouchscreenhandler`
(touch) and a keyboard handler — confirmed in PaperOS session logs. Pen events
from the marker's evdev node are never translated into Qt pointer events, so
QML `MouseArea`/`PointHandler` never see the pen. Touch works; the Marker
needs a custom evdev input stack (Phase 1: `PenInputService`).

## Verified event node map (chiappa — measured, not inherited from ferrari)

| Node | Device name | Role | Capabilities (decoded from bitmasks) |
| --- | --- | --- | --- |
| `event0` | `44440000.bbnsm:pwrkey` | Power key | `EV_KEY` |
| `event1` | `Hall effect sensors` | Folio/cover detect | `EV_SW` |
| `event2` | **`Elan marker input`** | **Pen** | `EV_KEY` + `EV_ABS`; KEY `1c03…` → `BTN_TOOL_PEN`, `BTN_TOOL_RUBBER`, `BTN_TOUCH`, `BTN_STYLUS`, `BTN_STYLUS2`; ABS `f000003` → `ABS_X`, `ABS_Y`, `ABS_PRESSURE`, `ABS_DISTANCE`, `ABS_TILT_X`, `ABS_TILT_Y` |
| `event3` | `Elan touch input` | Touchscreen | `EV_ABS` multitouch (`PROP=2` direct); symlinked as `touchscreen0` |

Touch axis ranges from the QPA log: x 0–1248, y 0–2208, mapped to
954×1696 screen geometry.

## What this means for the pen roadmap

Everything the ideal Marker experience needs is exposed by the kernel:

- **Pressure** (`ABS_PRESSURE`) → variable line width
- **Hover** (`ABS_DISTANCE` + `BTN_TOOL_PEN` without `BTN_TOUCH`) → cursor/preview
- **Eraser** (`BTN_TOOL_RUBBER`) → Marker Plus flip-to-erase
- **Tilt** (`ABS_TILT_X/Y`) → available if ever wanted
- **Stylus buttons** (`BTN_STYLUS`, `BTN_STYLUS2`)

## Still unknown (needs Phase 1 with `EVIOCGABS` ioctls)

- Exact min/max for pen `ABS_X/ABS_Y` (needed for `CoordinateMapper`; do
  NOT assume the touch ranges or ferrari values)
- Pressure/distance/tilt ranges
- Whether the pen axes need swap/invert relative to the 954×1696 portrait
  framebuffer

Phase 1 plan: `PenInputService` reading `/dev/input/event2` (24-byte aarch64
`input_event` frames, `SYN_REPORT` framing, `SYN_DROPPED` recovery), exposing
high-level pen events to QML via a bridge object, with axis calibration read
at runtime from `EVIOCGABS` — never hardcoded.
