# iOS Daily Beta — Acceptance

**Date:** 2026-07-21  
**Device:** Ken’s 17 Pro (`iPhone18,1`) · iOS 27.0 (24A5380h) · UDID `00008150-000C38C20AC0401C`  
**Bundle:** `space.kenos.app.ios` · version `1.0.0` · build `202607210221`  
**Git SHA (install):** `c4aa541d47953c4d24382d9771d623deab6ce29b`  
**Shell origin:** `http://10.20.202.15:5219` (Mac LAN; phone client `10.20.202.6`)  
**Install method:** `scripts/kenos-ios-daily-beta/device-build-install.sh` → `xcodebuild` + `devicectl device install/launch`

## Verdict

**IOS — NOT READY** for full Personal Daily Beta acceptance gate.

Core daily path on real iPhone is working (native shell + LAN Web surfaces + Planner/Fitness open). Remaining gaps are interactive accessibility / network-transition / multi-account checks that cannot be closed without Ken on-device confirmation.

Mac Web Daily Beta remains **READY** and **must not** be overturned.  
Overall Personal Daily Beta remains **HOLD**.

## Matrix

| Check | Result | Evidence |
| --- | --- | --- |
| IOS BUILD | **PASS** | `logs/device-build.log` BUILD SUCCEEDED |
| REAL DEVICE INSTALL | **PASS** | `devicectl install` + apps list |
| COLD LAUNCH | **PASS** | launch after SIGKILL; unlock required once |
| AUTH PERSISTENCE | **PARTIAL** | SecItem store wired; WKWebView `WebsiteDataStore.default` for web session — owner must confirm logged-in Supabase session survives relaunch |
| TODAY | **PASS** | phone `GET /` 200 |
| CONTINUE | **PARTIAL** | Native Continue section + Space Switcher wired; Web Continuity inside WKWebView; duplicate-tap / expired-target not re-automated on device |
| PLANNER | **PASS** | phone loaded Planner SPA assets from `:5188` |
| FITNESS | **PASS** | phone loaded Fitness SPA + exercise image from `:5190` |
| ACCOUNT ISOLATION | **PARTIAL** | inherits Mac Continuity A/B freeze; not re-run Account B on this phone |
| BACKGROUND / FOREGROUND | **PASS** | relaunch while installed |
| FORCE QUIT / REOPEN | **PASS** | SIGKILL → launch ec=0 |
| OFFLINE / RECOVERY | **PASS** | Mac `kenos-ctl stop` → start; phone refetched after recovery |
| WI-FI / CELLULAR | **NOT RUN** | owner toggle required |
| DARK MODE | **NOT RUN** | owner toggle required |
| DYNAMIC TYPE | **NOT RUN** | owner Larger Text required |
| VOICEOVER BASICS | **NOT RUN** | labels present in code; owner VO sweep required |
| P0/P1 product blockers | **NONE** known for home-LAN daily path | see `known-residuals.md` |

## Architecture (audit summary)

| Item | Value |
| --- | --- | --- |
| iOS target | `KenosIOS` (reuse only — no second app) |
| Min OS | iOS 17.0 |
| Bundle ID | `space.kenos.app.ios` |
| Signing | Automatic · Team `93NJ4CAU8B` · Apple Development: Pan Juncheng |
| Native | Tab shell, Space Switcher / Continue, Settings, Focus, Keychain |
| Web surface | WKWebView Daily Beta for Today / Assistant / Spaces / Inbox |
| Domain Plan/Training | External open to LAN `:5188` / `:5190` (or production when Daily Beta off) |
| Cloud shell | `aios.kenos.space` DNS **unresolved** — not used |
| PWA | Fallback only — not used as PASS |

## Owner actions to close READY

1. Unlock phone when launching; grant **Local Network** to Kenos if prompted.
2. Sign in inside the Web surface (same Kenos account as Mac).
3. Manual: Dark Mode, Larger Text, VoiceOver on Today/Continue/Spaces/Inbox buttons, Wi‑Fi→Cellular while app open.
4. Optional Account B: confirm Continue does not leak Account A resumes.
5. Away-from-home: keep Mac on + same LAN, or restore private `aios` origin DNS (no public deploy in this slice).

## Commands

```bash
# Mac LAN Daily Beta (Python static — Node LAN blocked by macOS firewall on this host)
export KENOS_STATIC_BIND=0.0.0.0
./scripts/kenos-daily-beta/kenos-ctl.sh restart

# Device build + install
export KENOS_DAILY_BETA_ORIGIN="http://$(ipconfig getifaddr en0):5219"
./scripts/kenos-ios-daily-beta/device-build-install.sh

# Smoke
./scripts/kenos-ios-daily-beta/real-device-smoke.sh
```

## Update — fix build on 17 Pro (2026-07-21T02:41Z)

- Installed build `202607210241` with ATS CIDR + native-shell hide + LAN domain hosts
- Phone `10.20.202.6` fetched `/spaces?iosNativeShell=1`, `/inbox?iosNativeShell=1`, Planner, Fitness
- Cold relaunch after SIGKILL: PASS
- 15 Pro: still not in provisioning profile; Xcode Accounts empty — OWNER ACTION unchanged
- Verdict remains **IOS — NOT READY** for full gate (a11y/cellular/Account B + 15 Pro signing); home-LAN path on 17 Pro is usable

