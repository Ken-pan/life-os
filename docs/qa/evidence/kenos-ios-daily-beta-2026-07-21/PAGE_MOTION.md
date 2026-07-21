# Page chrome motion — Music-style headers / nav (2026-07-21)

## What felt flat before

- Large titles + glass action bubbles appeared instantly (no settle)
- Bubble / chevron taps only changed background color — no press scale
- Shelf close + live accessory used plain buttons with no KenosMotion press
- Dock/Shelf already had SSOT springs; **in-page chrome did not share that language**

## Applied (restrained)

| Surface | Motion | Timing |
| ------- | ------ | ------ |
| Title enter | opacity + translateY(6→0) | 340ms · `cubic-bezier(0.22, 1, 0.36, 1)` |
| Action bubble enter | same, +45ms stagger | 340ms |
| Bubble / btn press | scale 0.94 · opacity 0.88 | 220ms |
| Bubble capsule press | scale 0.97 | 220ms |
| Title chevron press | translateY +2px · title opacity 0.82 | 220ms |
| Reduce Motion | no enter anim; press → 0.98 / 100ms | matches KenosMotion reduce |

Native (same token family):

- `KenosMotion.chrome` — response 0.34 / damping 0.88
- `KenosPressStyle` — shelf close, shelf cards, live accessory
- Web CSS vars `--kenos-motion-*` documented as mirrors of native SSOT

## Files

- `clients/apple/Packages/KenosDesign/Sources/KenosDesign/KenosMotion.swift` (+ `KenosPressStyle`)
- `clients/apple/Packages/KenosDesign/Tests/KenosDesignTests/KenosDesignTests.swift`
- `clients/apple/Apps/Shared/KenosDomainShell.swift` (close + cards press)
- `clients/apple/Apps/Shared/KenosRootView.swift` (live accessory press)
- `apps/aios/src/lib/components/KenosSystemBar.svelte`
- `apps/aios/src/app.css` (token vars)
- `apps/planner/src/lib/components/DomainMusicHeader.svelte`
- `apps/fitness/src/lib/components/DomainMusicHeader.svelte`

**Not touched:** `KenosGlobalDock.swift` (KenosMotion + RoundedRectangle pill preserved).

## Deliberately NOT animated

- Scroll-linked title collapse / parallax / blur morph
- Content list stagger, card fly-ins, glow / particle noise
- Dock selection re-architecture
- Continuity leave-guard / WK load path
- Bouncey overshoot (damping stays ≥ 0.84)

## Feel-test checklist (nav / header)

1. Open Kenos Today — large title + glass bubble **settle** (~0.34s), bubble slightly after title
2. Press bubble icon — light scale + opacity; spring back on release
3. Domain Plan/Training — title chevron dips slightly on press; bubble same as Kenos
4. Open Spaces shelf — close (×) and cards press-scale like dock
5. Live accessory (if Focus/session active) — press scale on glass bar
6. Settings → Accessibility → Reduce Motion **On** — no enter travel; muted press only

## Build

| Layer | Result |
| ----- | ------ |
| Daily Beta web | `kenos-ctl build` + `restart` — release `4aa3a639e5cf` @ `2026-07-21T14:09:33Z` · aios/planner/fitness **UP** |
| Native iOS | `device-build-install.sh` — **CFBundleVersion `202607211409`** · `INSTALL_OK` · `launch_ec=0` · origin `http://10.20.202.15:5219` |
| Logs | `logs/page-motion-rebuild.txt` · `logs/page-motion-native-install.txt` |

**Guards:** Did not touch `KenosAppModel` / `KenosWebSurfaceView` / switch-perf paths. `KenosGlobalDock` still has `KenosMotion.press*` + `RoundedRectangle` pill.
