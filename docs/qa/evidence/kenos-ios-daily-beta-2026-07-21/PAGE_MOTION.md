# Page chrome motion — Music-style headers / nav (2026-07-21)

## What felt flat before

- Large titles + glass action bubbles appeared instantly (no settle)
- Bubble / chevron taps only changed background color — no press scale
- Shelf close + live accessory used plain buttons with no KenosMotion press
- Dock/Shelf already had SSOT springs; **in-page chrome did not share that language**

## Applied (restrained)

| Surface | Motion | Timing |
| ------- | ------ | ------ |
| Title enter | opacity + translateY(6→0) | 280ms · `cubic-bezier(0.22, 1, 0.36, 1)` |
| Action bubble enter | same, +45ms stagger | 280ms |
| Bubble / btn press | scale 0.97 · opacity 0.92 | 180ms |
| Bubble capsule press | scale 0.97 | 180ms |
| Title chevron press | translateY +2px · title opacity 0.82 | 180ms |
| Reduce Motion | no enter anim; press → 0.99 / 100ms | matches KenosMotion reduce |

Native (same token family):

- `KenosMotion.chrome` — response 0.28 / damping 0.88 (aliases Selection)
- `KenosPressStyle` — shelf cards, live accessory, bug prompt dismiss, Focus return banner
- Web CSS vars `--kenos-motion-*` mirror native SSOT (180 / 280 / 320ms)

## Files

- `clients/apple/Packages/KenosDesign/Sources/KenosDesign/KenosMotion.swift` (+ `KenosPressStyle`)
- `clients/apple/Packages/KenosDesign/Tests/KenosDesignTests/KenosDesignTests.swift`
- `clients/apple/Apps/Shared/KenosDomainShell.swift` (shelf cards press)
- `clients/apple/Apps/Shared/KenosRootView.swift` (live accessory + Focus return press)
- `clients/apple/Apps/Shared/KenosBugReport.swift` (prompt dismiss press)
- `apps/aios/src/lib/components/KenosSystemBar.svelte`
- `apps/aios/src/app.css` (token vars)
- Domain Music headers (planner / fitness / …)

## Deliberately NOT animated

- Scroll-linked title collapse / parallax / blur morph
- Content list stagger, card fly-ins, glow / particle noise
- Dock selection re-architecture / matchedGeometryEffect
- Continuity leave-guard / WK load path
- Bouncey overshoot (damping stays ≥ 0.86)

## Feel-test checklist (nav / header)

1. Open Kenos Today — large title + glass bubble **settle** (~0.28s), bubble slightly after title
2. Press bubble icon — light scale + opacity; spring back on release
3. Domain Plan/Training — title chevron dips slightly on press; bubble same as Kenos
4. Open Spaces shelf — cards press-scale like dock
5. Live accessory (if Focus/session active) — press scale on glass bar
6. Settings → Accessibility → Reduce Motion **On** — no enter travel; muted press only
