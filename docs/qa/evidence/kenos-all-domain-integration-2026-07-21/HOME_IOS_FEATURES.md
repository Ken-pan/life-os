# Home iOS Feature Coverage — Kenos Domain Continuity

**Date:** 2026-07-21  
**Canonical iOS product:** `ios/home-scan` (HomeScan companion)  
**Web product:** `apps/home` (Home OS spatial / storage / tidy)  
**Kenos shell:** `clients/apple` Domain Mode Continuity (embedded web + companion bridge)

## Inventory — what “原本的 iOS app 功能” means in code

| Surface | Path / module | Capability |
| ------- | ------------- | ---------- |
| HomeScan home | `HomeView.swift` | Pending upload, start full/partial scan, find item, scan history, cabinet entry, account |
| RoomPlan scan | `ScanView` + `ScanSessionController` | Multi-room LiDAR scan, auto viewpoints, object shots, evidence guide |
| Review / upload | `ReviewView` / `UploadView` | Convert → preview → `home.scans` + private photo bucket |
| AR find | `FindItemView` + `ARLocateController` | Locate item/furniture with AR arrows |
| Cabinet scan | `ContainerScanView` + `ContainerScanController` | Interior dimensions / shelves → container JSON |
| Web Rooms | `/plan` | Floor plan browse/edit (508 / wall graph) |
| Web Items | `/storage` | Storage zones, item CRUD/search (`?zone=` deep link) |
| Web Organize | `/tidy`, `/tidy/go` | Tidy plan + focus session |
| Web Settings | `/settings` | Cloud scan pull, structure lock, theme |

Architecture decision (Phase 4A inventory): **HomeScan stays a separate companion** — not merged into the Kenos shell. Kenos reaches native scan/AR via `homescan://` deep links.

## Wired into Kenos Continuity (this slice)

| Feature | How Continuity exposes it | Status |
| ------- | ------------------------- | ------ |
| Rooms (floor plan) | Dock **Rooms** → `/plan`; domain `homePath` `/plan` | Wired |
| Items (storage) | Dock **Items** → `/storage` (+ resume `?zone=` / `?item=`) | Wired |
| Organize | Dock **Organize** → `/tidy` | Wired |
| Organize focus | `/tidy/go` hides Domain Dock (immersive) | Wired |
| Cloud scan pull | More → **Cloud scans** / Settings → web picker | Wired |
| RoomPlan full/partial scan | More → **Scan** → `homescan://scan` | Wired (companion) |
| AR Find | More → **Find** → `homescan://find` | Wired (companion) |
| Cabinet / container AR | More → **Cabinet** → `homescan://container` | Wired (companion) |
| Continue / Shelf / Quick Switch | `homeSpaceAdapter` text-only resume (Rooms/Items/Organize + entity) | Wired |
| Shelf privacy | `privacy: sensitive` + shelf `hide_interior_images`; no photoRef in descriptors | Wired |
| Single Domain Dock | Web BottomNav hidden under `iosNativeShell`; no Safari | Wired |

## PARTIAL / not in Kenos process

| Gap | Honest status | Why |
| --- | ------------- | --- |
| RoomPlan / ARKit inside Kenos WKWebView | **PARTIAL** | Physically requires LiDAR companion; architecture keeps HomeScan separate |
| Plan immersive-edit dock hide without URL change | **PARTIAL** | In-page `getPlanImmersiveEdit()` state; no Continuity URL signal yet |
| HomeScan missing on device | Soft fail alert → Settings / Cloud scans | Companion must be installed for Scan/Find/Cabinet |
| Editable spatial project cross-device sync | Pre-existing PARTIAL | Local `homeos_spatial_v1` still source of truth |

## Dock IA (≤5 chrome)

Spaces chip + **Rooms · Items · Organize · More**  
More: Scan · Find · Cabinet · Cloud scans · Settings

## Smoke path (device)

1. Spaces → Home (lands `/plan`)  
2. Dock Items → storage list / zone  
3. More → Scan (opens HomeScan if installed) **or** Cloud scans → pull  
4. Spaces / Kenos return — dock pill + motion intact  

**Build installed:** `CURRENT_PROJECT_VERSION=202607210753` → Ken’s 17 Pro (`8097F071-…`) — see `logs/home-ios-device-build.txt` + `logs/home-ios-device-install.txt`.

## Files touched

- `ios/home-scan` — `homescan://` URL types + deep-link handler  
- `clients/apple/Apps/Shared/KenosHomeScanBridge.swift`  
- `KenosDomainRegistry.swift` / `KenosDomainShell.swift` / `KenosAppModel.swift`  
- `apps/aios/.../domainIntegration.core.js` (+ aggregation privacy)  
- `apps/home/.../homeSpaceAdapter.js` + layout Continuity persist  
