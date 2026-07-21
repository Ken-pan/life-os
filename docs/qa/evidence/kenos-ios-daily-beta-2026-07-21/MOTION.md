# Motion polish — Continuity dock / Space Shelf (2026-07-21)

## Applied (Apple HIG)

- Motion supports meaning (selection travel, shelf hierarchy) — no decorative multi-stage flourishes
- Snappy springs (~0.3–0.4s feel), low bounce (damping ≥ 0.86)
- Interruptible shelf open/close via spring + `withAnimation` on dismiss
- `accessibilityReduceMotion` → short easeOut + opacity; skip backdrop scale/offset and pill geometry travel
- Dock keeps `.sensoryFeedback(.selection)` once per selection token (no spam)
- Selection pill uses `matchedGeometryEffect` so the indicator moves with the selected tab

## SSOT

`clients/apple/Packages/KenosDesign/Sources/KenosDesign/KenosMotion.swift`

| Token | Full motion | Reduce Motion |
| ----- | ----------- | ------------- |
| Selection | spring r=0.34 d=0.86 | easeOut 0.16s |
| Press | spring r=0.22 d=0.84 · scale 0.94 | easeOut 0.10s · scale 0.98 |
| Shelf | spring r=0.36 d=0.90 | easeOut 0.16s · opacity panel |

## Surfaces

- `KenosGlobalDock.swift` — selection / press / matched geometry / reduce motion
- `KenosDomainShell.swift` — Domain shelf + dim + edge-pan settle
- `KenosRootView.swift` — Kenos Mode shelf host

## Dock re-wire (same day follow-up)

Material-only bar + full-item dark capsule were kept; a later dock polish pass had dropped KenosMotion hooks. Restored:

- `KenosMotion.selection(reduceMotion:)` (was hardcoded spring)
- `@Environment(\.accessibilityReduceMotion)` + skip `matchedGeometryEffect` when On
- Selection pill `matchedGeometryEffect(id: "kenos.dock.selection")` for travel
- Press scale/opacity via `KenosMotion.press*` on plain gesture control (still **not** `Button` / `Glass.*.interactive`)

Shelf hosts (`KenosRootView`, `KenosDomainShell`) still call `KenosMotion.shelf*` — unchanged.

## Dock motion merge (clobber recovery)

**Prior re-wire (`202607211404`) was clobbered** by a later visual polish that kept the good RoundedRectangle pill (material-only Capsule bar, dark fill around icon+label, `dockSelectionAccent`, plain `onTapGesture`) but dropped all KenosMotion / reduceMotion / matchedGeometry / press hooks back to a hardcoded `.spring(response: 0.38, dampingFraction: 0.78)`.

**Merge (this build):** motion wired **into** the current RoundedRectangle design — visual pill unchanged; no Capsule selection fill, no Button/glass morph.

Restored on disk in `KenosGlobalDock.swift`:

- `@Environment(\.accessibilityReduceMotion)` + `@Namespace`
- `KenosMotion.selection(reduceMotion:)` for tab changes
- `matchedGeometryEffect(id: "kenos.dock.selection")` on the selected `RoundedRectangle` fill (skipped when Reduce Motion)
- `KenosMotion.pressScale` / `pressOpacity` / `press` on plain tap control

Shelf hosts still use `KenosMotion.shelf*` — verified unchanged.

## Feel-test (device)

1. Tap dock tabs — dark pill **slides** to the new item; accent tint updates with it
2. Press — light scale, springs back immediately
3. Spaces open/close — dim fades with drawer; reverse mid-open feels cancellable
4. Settings → Accessibility → Reduce Motion **On** — fade only, no backdrop shrink / pill slide

## Build

- **CFBundleVersion:** `202607211406` (dock KenosMotion merge into RoundedRectangle pill)
- Device: `8097F071-CAB6-5AF0-8258-BCD985E9D79E` (17 Pro)
- Log: `logs/motion-dock-merge.txt` — `INSTALL_OK` · `launch_ec=0`
- Clobbered re-wire: `202607211404` — `logs/motion-dock-rewire.txt`
- Prior motion builds: `202607211403` — `logs/motion-rebuild.txt`, `logs/motion-rebuild-2.txt`
