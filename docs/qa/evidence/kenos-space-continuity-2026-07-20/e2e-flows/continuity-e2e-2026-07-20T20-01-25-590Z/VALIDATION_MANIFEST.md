# Continuity Validation Manifest

**Run:** `continuity-e2e-2026-07-20T20-01-25-590Z`
**Overall Continuity Gate:** **NOT_PASSED**
**Owner Review:** NOT OPEN · **Visual Quality:** IN_PROGRESS

## Gate summary

| Gate | Status |
| ---- | ------ |
| Continuity Contract | IMPLEMENTED |
| Planner entity restore | VALIDATED |
| Planner overall continuity | **PARTIAL** |
| Fitness continuity | **VALIDATED** |
| Account isolation | **VALIDATED** |
| Visual quality | IN_PROGRESS |
| Owner Review | NOT OPEN |
| Overall Continuity Gate | **NOT_PASSED** |

## Key assertions

| Assertion | Value |
| --------- | ----- |
| adminWriteUsed | false |
| mutationPersisted (user JWT) | true |
| kenosSeesMutatedTitle | true |
| reloadSeesTask | false |
| reloadSeesMutated | false |
| reloginSeesMutated | false |
| fitnessDbDone (want 2) | 2 |
| fitnessColdSet3 | true |
| fitnessColdNoPinSet3 | true |

## Screenshot bindings (P2)

| File | step | context | UID | sha256 |
| ---- | ---- | ------- | --- | ------ |
| `A01-planner-task-seed-open.png` | A01 | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `54231b7fa19f…` |
| `A02-planner-task-restored.png` | A02 | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `de2877de4fb0…` |
| `A03-planner-before-save.png` | A03 | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `13c63e0a79c7…` |
| `A03b-planner-after-ui-save.png` | A03b | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `b2b360dde882…` |
| `A03c-planner-reopen-mutated.png` | A03c | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `82e46a597f75…` |
| `A04-kenos-after-planner-continue.png` | A04 | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `8db7e72630a1…` |
| `A05-kenos-continue-sheet.png` | A05 | `ctx-A-browser-context@57fb33bfe588184e2aa5983e73333f5b` | …c42e | `7883f2652b6d…` |
| `A07-planner-fresh-context-reload.png` | A07 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `6e27f5423ee1…` |
| `A08-planner-relogin.png` | A08 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `2391b9b80763…` |
| `B01-fitness-focus-set1.png` | B01 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `5d928348374c…` |
| `B01b-fitness-after-set1.png` | B01b | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `6912a8e3a12c…` |
| `B02-fitness-at-set2.png` | B02 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `a329307da4f5…` |
| `B03-kenos-after-fitness-continue-set2.png` | B03 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `5577bf74e016…` |
| `B04-kenos-continue-sheet-set2.png` | B04 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `f351c29bfdcd…` |
| `B05-fitness-resumed-set2.png` | B05 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `a22ba96be8b3…` |
| `B06-fitness-after-complete-set2.png` | B06 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `8c7035dc8faf…` |
| `B07-kenos-continue-after-set2-push.png` | B07 | `ctx-A-reload-browser-context@45123d71fd1bb50cc806c12e6fc393c4` | …c42e | `d442f31a1c41…` |
| `B08-kenos-continue-fresh-before-fitness.png` | B08 | `ctx-A-cold-browser-context@9b028a471201af6714adc128ca90811b` | …c42e | `9675cbd9ccc0…` |
| `B09-fitness-cold-resume-set3.png` | B09 | `ctx-A-cold-browser-context@9b028a471201af6714adc128ca90811b` | …c42e | `dafa6f33cbdd…` |
| `B10-fitness-cold-no-kenosSet.png` | B10 | `ctx-A-cold-browser-context@9b028a471201af6714adc128ca90811b` | …c42e | `dc09b7be41a8…` |
| `C01-continue-account-A.png` | C01 | `ctx-A-cold-browser-context@9b028a471201af6714adc128ca90811b` | …c42e | `76c8499e1f4e…` |
| `C02-continue-account-B.png` | C02 | `ctx-B-browser-context@ac83bfe2806f3ab91c582c99a6f9440a` | …68fe | `b5ebb90a195b…` |
| `C03-continue-after-switch-A-to-B.png` | C03 | `ctx-A-cold-browser-context@9b028a471201af6714adc128ca90811b` | …68fe | `b2bdc7198ae2…` |

## Blockers
- Flow A partial: kenosSummary=true reloadMut=false reloginMut=false reloadSeesTask=false
- Continue Training row opened non-local Fitness — forced local cold deep link without kenosSet

## Command
```bash
node scripts/qa/kenos-space-continuity-e2e-flows.mjs
```
