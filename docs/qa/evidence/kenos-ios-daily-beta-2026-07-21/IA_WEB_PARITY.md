# IA Web parity — Continue / Switch / Quick Switch

**Date:** 2026-07-21  
**Canonical:** `docs/qa/kenos-ios-ia-model-2026-07-21.md`

## Shipped

| Mode | Web API | Entry |
| --- | --- | --- |
| Continue (Recent only) | `openContinueSheet()` | SystemBar / AppBar Continue · ⌘. |
| Switch Space | `openSwitchSpaceSheet()` | Sidebar **All** |
| Quick Switch | `openQuickSwitchSheet()` | SystemBar search · AppBar Search · ⌘⇧. |

Continue no longer dumps All Domains / System tabs.

## Focus

`temporarilyLeft` already keeps global tabs + return banner (Music-style browse while away). Active Focus remains immersive full-screen.

## Tests

`node --test apps/aios/src/lib/kenos/spaceSwitcher.core.test.js` → 19/19 pass.

## Verification (2026-07-21)

| Surface | Result | Evidence |
| --- | --- | --- |
| LAN Web Continue / Quick Switch / Switch Space | **PASS** | `logs/ia-web-parity-verify.json` · screenshots `screenshots/ia-web-parity/` |
| Daily Beta release | `886994baf1d2` | `~/.kenos-daily-beta/current` |
| iOS native Continue / Quick Switch toolbar | **BLOCKED_LOCKED** | 17 Pro launch denied (device Locked) — Owner unlock to re-verify |

Script: `scripts/kenos-ios-daily-beta/ia-web-parity-verify.mjs`

LAN checks (all true): Continue=`continueRecent` no All Domains / no search; Quick Switch searchable Spaces; Switch Space=`switchSpace` with All Domains.
