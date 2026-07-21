# Kenos Logo — platform roll-out

**Date:** 2026-07-21  
**Master:** `docs/assets/kenos-logo/kenos-icon-1024.png`

| Platform | Location | Status |
| -------- | -------- | ------ |
| **Web / PWA** (aios Daily Beta) | `apps/aios/static/` (icon-*, favicon-*, apple-touch-icon, brand-circle-*) | Shipped · Daily Beta rebuilt |
| **iOS** | `clients/apple/Apps/iOS/Assets.xcassets/AppIcon.appiconset/` | Shipped · device build `202607211143` |
| **macOS** | `clients/apple/Apps/macOS/Assets.xcassets/AppIcon.appiconset/` | Shipped · `KenosMac` build OK |
| **watchOS** (companion) | `clients/apple/Apps/watchOS/Assets.xcassets/AppIcon.appiconset/` | Shipped · embedded in iOS install |

Re-generate web derivatives after master change:

```bash
python3 scripts/generate-life-os-brand-icons.py --app aios
```
