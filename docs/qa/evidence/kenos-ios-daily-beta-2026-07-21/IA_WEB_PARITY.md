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
