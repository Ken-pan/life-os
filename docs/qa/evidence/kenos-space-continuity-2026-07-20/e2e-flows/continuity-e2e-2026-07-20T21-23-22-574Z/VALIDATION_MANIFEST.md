# Continuity Validation Manifest

**Run:** `continuity-e2e-2026-07-20T21-23-22-574Z`
**Overall Continuity Gate:** **PASSED**
**Owner Review:** NOT OPEN · **Visual Quality:** IN_PROGRESS

## Gate summary

| Gate | Status |
| ---- | ------ |
| Continuity Contract | IMPLEMENTED |
| Planner entity restore | VALIDATED |
| Planner overall continuity | **VALIDATED** |
| Fitness continuity | **VALIDATED** |
| Account isolation | **VALIDATED** |
| Visual quality | IN_PROGRESS |
| Owner Review | NOT OPEN |
| Overall Continuity Gate | **PASSED** |

## Key assertions

| Assertion | Value |
| --------- | ----- |
| adminWriteUsed | false |
| mutationPersisted (user JWT) | true |
| kenosSeesMutatedTitle | true |
| reloadSeesTask | true |
| reloadSeesMutated | true |
| reloginSeesMutated | true |
| fitnessDbDone (want 2) | 2 |
| fitnessColdSet3 | true |
| fitnessColdNoPinSet3 | true |

## Screenshot bindings (P2)

| File | step | context | UID | sha256 |
| ---- | ---- | ------- | --- | ------ |
| `A01-planner-task-seed-open.png` | A01 | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `5c42719826f1…` |
| `A02-planner-task-restored.png` | A02 | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `1edb454bc95b…` |
| `A03-planner-before-save.png` | A03 | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `1ff71b0f76b7…` |
| `A03b-planner-after-ui-save.png` | A03b | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `1f64e1d9948e…` |
| `A03c-planner-reopen-mutated.png` | A03c | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `c380a4202752…` |
| `A04-kenos-after-planner-continue.png` | A04 | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `16f92ccf08af…` |
| `A05-kenos-continue-sheet.png` | A05 | `ctx-A-browser-context@ebe15f6d2a7b7cd33125398d2c0d7531` | …c42e | `5fe4c13daa0b…` |
| `A07-planner-fresh-context-reload.png` | A07 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `4e56d4f37493…` |
| `A08-planner-relogin.png` | A08 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `84e8abb745ac…` |
| `B01-fitness-focus-set1.png` | B01 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `58f7628336b9…` |
| `B01b-fitness-after-set1.png` | B01b | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `809c435f65ae…` |
| `B02-fitness-at-set2.png` | B02 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `723d600a8bcb…` |
| `B03-kenos-after-fitness-continue-set2.png` | B03 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `50756a85fdbb…` |
| `B04-kenos-continue-sheet-set2.png` | B04 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `92de9b0c27a4…` |
| `B05-fitness-resumed-set2.png` | B05 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `dac1ece812d4…` |
| `B06-fitness-after-complete-set2.png` | B06 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `86631500e1e5…` |
| `B07-kenos-continue-after-set2-push.png` | B07 | `ctx-A-reload-browser-context@dc7868ffbc4797f17cfdbb61ab753f3c` | …c42e | `13f4d50893fd…` |
| `B08-kenos-continue-fresh-before-fitness.png` | B08 | `ctx-A-cold-browser-context@d186055cc622c7812d80024252656577` | …c42e | `e4f5569d4ed7…` |
| `B09-fitness-cold-resume-set3.png` | B09 | `ctx-A-cold-browser-context@d186055cc622c7812d80024252656577` | …c42e | `205b1f402e87…` |
| `B10-fitness-cold-no-kenosSet.png` | B10 | `ctx-A-cold-browser-context@d186055cc622c7812d80024252656577` | …c42e | `2b12a85f9295…` |
| `C01-continue-account-A.png` | C01 | `ctx-A-cold-browser-context@d186055cc622c7812d80024252656577` | …c42e | `a5c625a3becc…` |
| `C02-continue-account-B.png` | C02 | `ctx-B-browser-context@bcf346f43f4c98c99ec1c34efe8851f7` | …68fe | `a0d895662c29…` |
| `C03-continue-after-switch-A-to-B.png` | C03 | `ctx-B-switch-browser-context@d186055cc622c7812d80024252656577` | …68fe | `4ea6d672d09c…` |

## Blockers
- (none)

## Command
```bash
node scripts/qa/kenos-space-continuity-e2e-flows.mjs
```
