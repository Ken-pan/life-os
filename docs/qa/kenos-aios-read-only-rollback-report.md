---
title: AIOS production client rollback
owner: kenpan
last_verified: 2026-07-19
status: AIOS_PRODUCTION_CLIENT_ROLLED_BACK
---

# AIOS_PRODUCTION_CLIENT_ROLLED_BACK

## Summary

Failed production read-only client deploy rolled back on **aios-kenos only**. Other six sites untouched. Auto-builds remain paused. Failed deploy retained for evidence.

## Rollback

| Item | Value |
| --- | --- |
| Site | `aios-kenos` (`5bfa64b2-7108-479d-b9e2-45f9c4d9f791`) |
| URL | https://aios-kenos.netlify.app |
| Failed published deploy (retained) | `6a5d3b8813e70ad66ebf2561` (SHA `f07944c9…` claimed at incident; deploy record kept `ready`) |
| Approved rollback deploy | `6a5c617ee8396b00089a6d2e` |
| Rollback commit | `be6f2612d3f374ac322c58813528b4bf8f98eeac` |
| Method | `netlify api restoreSiteDeploy` |
| Restored published_at | `2026-07-19T21:49:13.994Z` |

## Post-rollback checks

| Check | Result |
| --- | --- |
| Published deploy ID | `6a5c617ee8396b00089a6d2e` |
| AIOS `stop_builds` | **true** |
| Other six sites `stop_builds` | **true** (planner/fitness/finance/music/portal/home) |
| Other six published tip | still `be6f2612…` |
| Failed deploy deleted | **No** — `6a5d3b8813e70ad66ebf2561` still present |
| UIUX Gallery workflow | `disabled_manually` |
| Production DB tip | `20260719130500` |
| Kenos write tables (approvals/focus/work/outbox/deferred/suggestions) | all **0** rows |
| HTTP `/`, `/spaces`, `/inbox`, `/focus`, `/assistant` | **200** SPA shell |

## Not done in this slice

- No env/domain/DB changes
- No other-site deploy
- No auto-build restore
- No writer canary / Portal / Executor / Gallery restore

## Next

Continue blocker remediation on isolated canary / local (Spaces `each_key_duplicate`, route consistency, offline, Assistant scope, conversation persistence) per remediation prompt. Do **not** auto-redeploy AIOS production.
