# Switch performance — Continuity Space/Domain (2026-07-21)

## What felt slow

1. **Space Shelf → another Space** waited for leave-guard JS **before** dismissing the shelf (serial: probe → dismiss → navigate → WK load).
2. **Leave Continuity** cleared `continuityURL` before flipping `shellMode`, so RootView could paint an empty Domain canvas for one frame.
3. **Cross-origin WK load** (Plan ↔ Training) blanked/white-flashed while the next origin loaded.
4. **Leave-guard hang** risk if the web content process was busy (no timeout).
5. Dock tab path updates re-ran chrome padding JS on every `updateUIView` (noise, not the main shelf lag).

## What changed

| Area | Change |
| ---- | ------ |
| `openShelfCard` | **Optimistic** `showSpaceShelf = false` immediately; leave-guard then navigates (dirty → confirm over Continuity) |
| `dismissContinuity` | Flip `shellMode = .kenos` **before** clearing `continuityURL` |
| `enterDomainMode` | Don’t reset `previousKenosTab` when already in Domain; shelf already dismissed |
| `openSpaceShelf` | Lightweight GET warm of the other Plan/Training origin (HTTP cache / TCP) |
| `KenosDomainWebBridge.probeLeave` | **280ms** timeout so a stuck probe can’t freeze switch forever |
| `KenosWebSurfaceView` | Freeze overlay (`snapshotView`) on cross-origin load; drop on finish/fail; skip chrome JS when pads unchanged |

**Not touched:** `KenosGlobalDock.swift` (KenosMotion / press / RoundedRectangle pill / accent).

## Feel-test (device)

1. Domain Plan → Spaces → Training — shelf should **slide away immediately**; destination prepares under freeze (no long stuck-open shelf).
2. Training → Spaces → Kenos — same optimistic dismiss; return to prior Kenos tab without empty Domain flash.
3. Dirty draft leave — shelf closes; confirm alert still appears; Cancel stays on Domain; Discard continues.
4. Dock tabs inside Domain — still snappy; selection accent + full-item pill unchanged.
5. Settings → Accessibility → Reduce Motion On — shelf opacity path still works.

## Build

- **CFBundleVersion:** `202607211408`
- Device: `8097F071-CAB6-5AF0-8258-BCD985E9D79E` (17 Pro)
- Status: `INSTALL_OK` · `launch_ec=0` · origin `http://10.20.202.15:5219`
- Log: `logs/switch-perf-rebuild.txt`

## Residual risks

- Leave-guard timeout treats a hung probe as clean (could skip dirty confirm if JS is >280ms late).
- Freeze overlay is a static snapshot — destination still needs network time; no multi-WK warm pool yet.
- Same-origin dock path jumps intentionally reload when native path differs (SPA self-nav still skipped).
