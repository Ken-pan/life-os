# Kenos UIUX Screenshot Index

**Suite root (gitignored):** `output/uiux/kenos-compounding-2026-07-20/`
**Tracked latest contact sheets:** `docs/ui-qa-screenshots/{app}/uiux-review/latest/` (gitignored)

| Round                    | Artifact                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 00 baseline before       | `round-00-baseline/before/auth-wall-desktop.png`                                          |
| 00 baseline before       | `round-00-baseline/before/auth-wall-mobile.png`                                           |
| 01 system shell          | `round-01-system-shell/after/aios-uiux-review-light-desktop.png`                          |
| 03 space switcher mobile | `round-03-space-switcher/after/aios-uiux-review-light-mobile.png`                         |
| 06 final desktop         | `round-06-final/after/aios-uiux-review-light-desktop.png`                                 |
| 06 simulator             | `round-06-final/after/iphone17pro-kenos-launch.png`                                       |
| Domain Fitness           | `docs/ui-qa-screenshots/fitness/uiux-review/latest/fitness-uiux-review-light-desktop.png` |

## How to regenerate

```bash
VITE_AIOS_CLOUD=0 npm run build -w aios-os
node scripts/qa/kenos-uiux-compounding-round.mjs --round 06-final --app aios --theme light
node scripts/qa/kenos-uiux-compounding-round.mjs --round 06-final --app aios --theme light --mobile
npm run qa:uiux-review -- --app fitness --theme light
```

Do not commit bulk PNGs; keep docs/qa reports + selective evidence only.
