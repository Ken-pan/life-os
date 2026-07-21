# iOS Daily Beta — Acceptance

**Date:** 2026-07-21 (strict close)
**Device:** Ken’s 17 Pro (`iPhone18,1`) · CoreDevice `8097…D79E` · UDID `00008150-000C38C20AC0401C`
**Bundle:** `space.kenos.app.ios` · version `1.0.0` · build `202607210524`
**Web release SHA:** `3e49cf6c7da7fb4dd089adf88cfb34baddf7cb4c`
**Shell origin:** `http://10.20.202.15:5219` (Mac LAN; phone client `10.20.202.6`)
**Install method:** `scripts/kenos-ios-daily-beta/device-build-install.sh` → Continuity in-app WKWebView fix + `devicectl install/launch`

## Verdict

```text
IOS — PERSONAL DAILY BETA READY
REAL DEVICE: iPhone 17 Pro
INSTALL: PASS
COLD LAUNCH: PASS
AUTH: PASS
TODAY: PASS
ASSISTANT: IN-APP WEB
SPACES: PASS
INBOX: PASS
CONTINUE: PASS
PLANNER FLOW A: PASS
TRAINING FLOW B: PASS
ISOLATION: PASS
LIFECYCLE: PASS
OFFLINE / RECOVERY: PASS
ROLLBACK: PASS
NETWORK SCOPE: LAN-DEPENDENT
P0/P1: NONE
BUILD SHA: 3e49cf6c7da7fb4dd089adf88cfb34baddf7cb4c
APP VERSION: 1.0.0 (202607210524)

OVERALL PERSONAL DAILY BETA: READY
PHASE 4: EXIT_OPEN
```

Mac Web Daily Beta remains **READY**. Personal daily use requires Mac on + same Wi‑Fi (**LAN-DEPENDENT**). Phase 4 stays `EXIT_OPEN` (App Group / APNs / Focus entitlement / TestFlight / Watch·macOS cross-device / legacy shell retirement — not closed by this LAN daily slice).

Canonical machine report: `ios-daily-beta-results.json` · Flow A: `logs/ios-flow-a-final.json` · Matrix: `logs/ios-matrix-close-latest.json` · Isolation re-run: `logs/ios-isolation-rerun.json`.

## Flow A — Planner (strict)

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Task ID | `ios-fa-mru7x8jx` |
| UID (redacted) | `c283…c42e` |
| Expected / Actual | `FA Mut 3-801Z` / `FA Mut 3-801Z` |
| Editor | `#task-title` seen (`editorSeen:true`) |
| Persist | **User JWT PATCH** (not service_role); hosted title writer OFF in Daily Beta static |
| UI / verify beacons | ok |
| Force-quit / reopen | verify beacon ok + DB title still MUT |
| Process | Kenos Continuity **in-app WKWebView** (build `202607210524`) — not Safari |

## Flow B — Training (strict)

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Session ID | `2569404f-5600-43dd-90bf-2536741cfe47` |
| Exercise | `c_fly` |
| Completed set | 1 → persisted next **2** |
| Method | UI Complete Set 1 (`ui_set1_no_url_pin`) |
| Continue descriptor | `Set 2` |
| Cold reopen | **WITHOUT** `kenosSet=` URL pin — assert ok |

## Surface classification (native boundary)

| Surface | Class | Notes |
| --- | --- | --- |
| Today | in-app WKWebView | `KenosDailyBetaSurface` in TabView |
| Assistant | in-app WKWebView | **IN-APP WEB** — Kenos process; no Safari toolbar |
| Spaces | in-app WKWebView | same |
| Inbox | in-app WKWebView | same |
| Plan Continuity | in-app WKWebView cover | `continuityURL` + `stayInApp:true` (not Safari) |
| Training Continuity | in-app WKWebView cover | same |

Prior 10-panel “iOS · Assistant” with Safari chrome / `127.0.0.1` is **not** acceptance evidence (see `known-residuals.md`).

## Matrix

| Check | Result |
| --- | --- |
| INSTALL / COLD LAUNCH / AUTH | **PASS** |
| TODAY / SPACES / INBOX | **PASS** |
| ASSISTANT | **IN-APP WEB** |
| CONTINUE | **PASS** |
| PLANNER FLOW A / TRAINING FLOW B | **PASS** |
| ACCOUNT ISOLATION | **PASS** (real auth switch to `kenos-daily-beta-b@life-os.local`; A task not readable) |
| LIFECYCLE / LOCK·UNLOCK | **PASS** |
| OFFLINE / RECOVERY / ROLLBACK | **PASS** (`kenos-ctl` stop→start) |
| LIGHT/DARK · Reduce Motion · 44×44 · safe area | **PASS** (DOM probes) |
| Dynamic Type / VoiceOver full OS sweep | soft residual (labels+44 probed) |
| P0/P1 | **NONE** for home-LAN daily path |

## Architecture notes

| Item | Value |
| --- | --- |
| Bundle | `space.kenos.app.ios` |
| Daily Beta shell | WKWebView → Mac LAN `:5219` |
| Plan / Training Continuity | **In-app** Continuity cover (post-`202607210524`) |
| Network | **LAN-DEPENDENT** — `127.0.0.1` forbidden on phone |
| Cloud `aios.kenos.space` | unresolved — not used |
| PWA / Simulator / Safari | not used as PASS |

## Commands

```bash
export KENOS_STATIC_BIND=0.0.0.0
./scripts/kenos-daily-beta/kenos-ctl.sh restart
./scripts/kenos-ios-daily-beta/device-build-install.sh
node scripts/kenos-ios-daily-beta/ios-flow-a-final.mjs
node scripts/kenos-ios-daily-beta/ios-matrix-close.mjs
```
