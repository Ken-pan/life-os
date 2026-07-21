# Motion polish — Continuity dock / Space Shelf (2026-07-21)

## Applied (Apple HIG)

- Motion supports meaning (selection travel, shelf hierarchy) — no decorative multi-stage flourishes
- Snappy springs (~0.18–0.32s feel), low bounce (damping ≥ 0.86)
- Interruptible shelf open/close via single chrome-owned spring + host open/dismiss without nested `withAnimation`
- SwiftUI dismiss / Orb swipe velocity uses **pts/sec** (`DragGesture.Value.velocity.width`)
- `accessibilityReduceMotion` → short easeOut + opacity; skip live edge preview, backdrop scale/offset
- Dock keeps `.sensoryFeedback(.selection)` for tab changes only (Shelf open/close = chrome soft impact)
- Selection plate uses GeometryReader + accent Capsule offset (not `matchedGeometryEffect`)

## SSOT

`clients/apple/Packages/KenosDesign/Sources/KenosDesign/KenosMotion.swift`

| Token | Full motion | Reduce Motion |
| ----- | ----------- | ------------- |
| Selection / chrome | spring r=0.28 d=0.88 | easeOut 0.16s |
| Press / micro | spring r=0.18 d=0.86 · scale 0.97 (Orb 0.98) | easeOut 0.10s · scale 0.99 |
| Spatial / shelf open | spring r=0.32 d=0.90 | easeOut 0.16s · opacity |
| Shelf close | spring r=0.24 d=0.92 | easeOut 0.16s |
| Page | spring r=0.32 d=0.92 | easeOut 0.16s |
| Mode depth | outgoing scale 0.978 | 1.0 (no scale) |

Web mirror: `packages/theme/src/kenos-motion.css` — 180 / 280 / 320ms.

## Surfaces

- `KenosGlobalDock.swift` — selection / press / shelf morph / selection haptic (tabs only)
- `KenosSpaceShelfChrome.swift` — single spring owner for progress; threshold soft impact
- `KenosDomainShell.swift` / `KenosRootView.swift` — edge-pan + dismiss hosts (no nested shelf animation)
- `KenosShelfGesture.swift` — panel width rubber-band, dismiss min distance, velocity helper

## Gesture polish (same-day)

- Dismiss velocity unit fixed (was `predicted - translation`, not pts/sec)
- Open tracking follows `preferredPanelWidth` (not hard 320)
- Light rubber-band overshoot allowed (`openProgressOvershootCap` 1.08)
- Panel + dimmer dismiss `minimumDistance` = 16 SSOT
- Tip Orb + edge commit share shelf spring family
- Root dock binds `.animation(shelf, value: shelfProgress)` like Domain

## Feel-test (device)

1. Tap dock tabs — accent plate slides; selection haptic once
2. Press — light scale, springs back immediately
3. Spaces open/close — dim fades with drawer; reverse mid-open cancellable; **one** soft impact at threshold
4. Edge open + dimmer/panel swipe-dismiss — light flick commits
5. Settings → Accessibility → Reduce Motion **On** — fade only, no backdrop shrink / live drag preview
