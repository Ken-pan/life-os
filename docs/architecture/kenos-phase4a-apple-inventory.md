---
title: Kenos Phase 4A Apple native inventory
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4a-inventory
status: temporary-approved-for-phase-4a-native-daily-loop
---

# Kenos Phase 4A — Apple native client inventory

> Local/foundation only. No App Store, TestFlight, notarization, production auth, Executor, or watchOS product.

## Verdict

Canonical Apple foundation for Phase 4A lives under **`clients/apple/`**, starting from the existing **`KenosContracts`** package. There is **no** Kenos iOS/macOS product app yet. Existing native/hybrid assets remain domain companions or experimental shells and must **not** become a second Kenos product or second data truth.

## Existing assets

| Asset | Path | Role today | Phase 4A treatment |
| --- | --- | --- | --- |
| KenosContracts | `clients/apple/Packages/KenosContracts` | Frozen Phase 1–3 Codable contracts + parity tests | **Keep / extend** — canonical shared models |
| HomeScan | `ios/home-scan` | Home spatial scan companion | **Keep separate** — Home domain tool; not Kenos shell |
| Health companion | `apps/health/companion` | HealthKit iOS/watchOS prototype | **Evidence source** — do not wholesale merge; watchOS product remains Phase 4B |
| Music Capacitor | `apps/music/ios/App` | Music iOS shell + now-playing | **Keep until Music capability migrates** |
| AIOS Tauri | `apps/aios/src-tauri` | Mac Assistant experimental shell | **Retain**; Kenos Mac is strangler host for daily loop, not immediate Tauri deletion |
| Knowledge/Health Tauri | `apps/*/src-tauri` | Domain Mac shells | **Retain** until Kenos Mac replaces capabilities |
| PaperOS | sibling repo | Device product | **External** via contracts |

## Retain / extend / retire

| Decision | Item |
| --- | --- |
| Retain | All listed domain companions/shells; KenosContracts |
| Extend | `clients/apple/Packages/*` + new Kenos iOS/macOS apps under `clients/apple/Apps/` |
| Retire (later) | Domain shells only after Ledger capability replacement evidence |
| Experimental | Tauri shells, Health companion watch target, Music Capacitor |
| Canonical foundation | `clients/apple` packages + Kenos iOS/macOS product targets |

## OPEN-006 temporary freeze for Phase 4A

Status: `TEMPORARY_APPROVED_FOR_PHASE_4A_NATIVE_DAILY_LOOP`

- Workspace root: `clients/apple/`
- Product apps: `clients/apple/Apps/iOS`, `clients/apple/Apps/macOS`
- Packages: `KenosContracts`, `KenosClient`, `KenosStore`, `KenosActions`, `KenosDesign`
- Bundle ID **local/dev placeholders only**: `space.kenos.app.ios`, `space.kenos.app.macos` (not production distribution decisions)
- Team / App Group / production universal links / push credentials: **deferred distribution gates**
- watchOS product target: **out of Phase 4A scope** (shared package platforms may list watchOS for compile compatibility only)

## Non-goals confirmed by inventory

- No second Task/Approval/Work/Activity canonical store on Apple
- No production Keychain team/app-group cutover
- No Capacitor/Tauri rewrite as Kenos
- No App Store submission path in this slice
