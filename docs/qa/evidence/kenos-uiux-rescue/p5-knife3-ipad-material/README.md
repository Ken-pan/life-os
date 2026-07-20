# P5 Knife 3 — iPad adaptive material & interaction mode

**Date:** 2026-07-20  
**Status:** DONE (adaptive mode + restrained material) · Visual Quality overall **IN_PROGRESS**  
**Owner Review:** **NOT OPEN**  
**Continuity:** FROZEN · canonical `continuity-e2e-2026-07-20T20-12-22-998Z`

## Adaptive decision table

| Width | Pointer capability | Continue mode |
| ----- | ------------------ | ------------- |
| `<600` | any | `mobile` bottom sheet |
| `600–899` | any | `tablet` form sheet (~560px) |
| `≥900` | touch-first (`!fine` or `!hover`) | `tablet-lg` large form sheet (640–680px) |
| `≥900` | `(pointer: fine)` **and** `(hover: hover)` | `desktop` anchored panel (~440px) |

No UA / device-name checks. Source: `apps/aios/src/lib/kenos/continueOverlayMode.core.js`.

## Key proof

| Case | Expect | Result |
| ---- | ------ | ------ |
| 1024×768 touch-first | `tablet-lg` form (~640px) | PASS |
| 1024×768 fine+hover | `desktop` anchored (~440px) | PASS |
| 1440×900 fine+hover | `desktop` | PASS |
| 768×1024 | `tablet` | PASS |

## Material (tablet / tablet-lg)

```text
Scrim (lighter than mobile) → Panel frost + 1px hairline + soft shadow → Hairline list
```

- Panel radius ~22px; max-height ~74–76dvh
- No drag handle; 44×44 close
- Dark theme: opaque-enough panel so text contrast does not rely on blur
- Desktop anchored behavior from Knife 2 Direction A **preserved** (no heavy blur)

## Evidence files

- `open-*.png` — all required viewports + touch/fine variants
- `scroll-*.png` / interaction matrix in `manifest.json`
- `open-dark-*` — dark comparison
- `continuity-regression.log` — OVERALL PASSED (`…T21-52-46-113Z`, not new functional canonical)

## Changed files

- `apps/aios/src/lib/kenos/continueOverlayMode.core.js` (+ test)
- `apps/aios/src/lib/components/SpaceSwitcher.svelte`
- `docs/qa/kenos-uiux-rescue-progress.md`
- `docs/roadmap/KENOS_MIGRATION_LEDGER.md` (Knife 3 note)

## Residual

- Knife 4: domain identity colors
- Knife 5: Today type rhythm
- Real iPad Safari / Stage Manager live device pass (evidence used matchMedia override for touch-first)
- Optional: further reduce tablet frost if Owner prefers flatter material
