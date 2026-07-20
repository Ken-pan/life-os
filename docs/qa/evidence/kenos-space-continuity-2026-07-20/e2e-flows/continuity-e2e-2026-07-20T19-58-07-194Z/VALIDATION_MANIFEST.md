# Continuity Validation Manifest

**Run:** `continuity-e2e-2026-07-20T19-58-07-194Z`
**Overall Continuity Gate:** **NOT_PASSED**
**Owner Review:** NOT OPEN · **Visual Quality:** IN_PROGRESS

## Gate summary

| Gate | Status |
| ---- | ------ |
| Continuity Contract | IMPLEMENTED |
| Planner entity restore | NOT_PROVEN |
| Planner overall continuity | **PARTIAL** |
| Fitness continuity | **VALIDATED** |
| Account isolation | **VALIDATED** |
| Visual quality | IN_PROGRESS |
| Owner Review | NOT OPEN |
| Overall Continuity Gate | **NOT_PASSED** |

## Key assertions

| Assertion | Value |
| --------- | ----- |
| adminWriteUsed | null |
| mutationPersisted (user JWT) | null |
| kenosSeesMutatedTitle | null |
| reloadSeesTask | null |
| reloadSeesMutated | null |
| reloginSeesMutated | null |
| fitnessDbDone (want 2) | 2 |
| fitnessColdSet3 | false |
| fitnessColdNoPinSet3 | true |

## Screenshot bindings (P2)

| File | step | context | UID | sha256 |
| ---- | ---- | ------- | --- | ------ |
| `A01-planner-task-seed-open.png` | A01 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `e46b93c96e90…` |
| `A02-planner-task-restored.png` | A02 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `91dd4f4fb5d9…` |
| `B01-fitness-focus-set1.png` | B01 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `255ab56df242…` |
| `B01b-fitness-after-set1.png` | B01b | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `605481fb12a3…` |
| `B02-fitness-at-set2.png` | B02 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `64a2fabf1626…` |
| `B03-kenos-after-fitness-continue-set2.png` | B03 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `69964748ce8a…` |
| `B04-kenos-continue-sheet-set2.png` | B04 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `c8a2c1fa3746…` |
| `B05-fitness-resumed-set2.png` | B05 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `ad23df656e6e…` |
| `B06-fitness-after-complete-set2.png` | B06 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `1f607842fadc…` |
| `B07-kenos-continue-after-set2-push.png` | B07 | `ctx-A-browser-context@9539d85c0fcbb0249bc3d0bf0a26f87f` | …c42e | `ed8c365bf077…` |
| `B08-kenos-continue-fresh-before-fitness.png` | B08 | `ctx-A-cold-browser-context@470568bff398dfbf67cfff6cfa4c48e1` | …c42e | `93e42155461a…` |
| `B09-fitness-cold-resume-set3.png` | B09 | `ctx-A-cold-browser-context@470568bff398dfbf67cfff6cfa4c48e1` | …c42e | `369f80e8cba9…` |
| `B10-fitness-cold-no-kenosSet.png` | B10 | `ctx-A-cold-browser-context@470568bff398dfbf67cfff6cfa4c48e1` | …c42e | `6763df11e6cc…` |
| `C01-continue-account-A.png` | C01 | `ctx-A-cold-browser-context@470568bff398dfbf67cfff6cfa4c48e1` | …c42e | `1e54c0115b1f…` |
| `C02-continue-account-B.png` | C02 | `ctx-B-browser-context@2cbf0b9828ecab526ad26fd3a8e360b0` | …68fe | `d5bdd487a662…` |
| `C03-continue-after-switch-A-to-B.png` | C03 | `ctx-A-cold-browser-context@470568bff398dfbf67cfff6cfa4c48e1` | …68fe | `245c04783ed3…` |

## Blockers
- Flow A: #task-title missing — cannot UI-mutate

## Command
```bash
node scripts/qa/kenos-space-continuity-e2e-flows.mjs
```
