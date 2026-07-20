---
title: KENOS PLANNER PRODUCTION COMPATIBILITY DEPLOY REPORT
owner: kenpan
last_verified: 2026-07-20
status: KENOS PLANNER PRODUCTION COMPATIBILITY CLIENT — DEPLOYED_AND_VERIFIED
---

# KENOS PLANNER PRODUCTION COMPATIBILITY DEPLOY REPORT

**Phrase:** `APPROVE_KENOS_PLANNER_PRODUCTION_COMPATIBILITY_DEPLOY`

## Status

**`KENOS PLANNER PRODUCTION COMPATIBILITY CLIENT — DEPLOYED_AND_VERIFIED`**

Production Planner redeployed from the Canary freeze SHA with Kenos writers
fail-closed and Legacy `planner_*` path preserved. Owner read, dual-account
isolation, Legacy smoke lifecycle + cleanup, offline→reconnect, observation
PASS, and Kenos mutation audit (0) closed. Auto-builds remain paused.

## 1. Exact deploy SHA

`PLANNER_COMPATIBILITY_DEPLOY_SHA=64b365ac8135dff9dda06cdde598310b1dac9e12`

Matches Canary archive (`PLANNER_COMPATIBILITY_CANARY_SHA`).

## 2. Production deploy

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| Site            | `planneros-ken` `82a6cadc-03f9-443c-85f7-26bd4a90f83f`               |
| Domain          | https://planner.kenos.space                                          |
| New deploy ID   | `6a5d7bd5b9334b8e0f03a902`                                           |
| Method          | `git archive` freeze SHA → bake → `netlify deploy --prod --no-build` |
| Rollback target | `6a5c617e6e1b41000893a948`                                           |
| stop_builds     | `true` (unchanged)                                                   |

## 3. Bake flags (live)

```text
VITE_KENOS_COMPAT_CANARY=1
VITE_KENOS_READ_CANARY=1
# VITE_KENOS_PROD_WRITES must NOT be 1
```

Bundle contains `KENOS_WRITE_BLOCKED`; Kenos create RPC remains denylisted.

## 4. Dual-track semantics (live)

| Track                 | Status                       |
| --------------------- | ---------------------------- |
| Legacy Planner Writer | Enabled (`planner_*` upsert) |
| Kenos writers         | Blocked                      |
| Dual-write            | Forbidden / not observed     |
| Browser service-role  | Absent                       |

## 5. Post-deploy verification

| Check                                           | Result                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Exact SHA match to Canary                       | PASS                                                                   |
| Owner read (~360 tasks / ~36 projects)          | PASS                                                                   |
| Dual-account (fitness-only → Portal)            | PASS — redirect `portal.kenos.space` (fitness-only)                    |
| Legacy smoke create→edit→complete→reopen→delete | PASS                                                                   |
| Kenos domain tables total                       | **0**                                                                  |
| Other six sites untouched                       | PASS                                                                   |
| Gallery                                         | `disabled_manually`                                                    |
| Migration tip                                   | `20260719130500` unchanged                                             |
| Offline → reconnect shell                       | PASS                                                                   |
| CI on deploy SHA                                | [success](https://github.com/Ken-pan/life-os/actions/runs/29709101185) |

### Legacy smoke evidence (production)

| Step     | Evidence                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| Create   | `2902f153-8b51-43e4-b660-2b919e62f96a` · `KENOS PLANNER COMPAT SMOKE — PROD — 2026-07-20T01-50-00Z` |
| Edit     | Title `… EDIT` durable on `planner_tasks`                                                           |
| Complete | `completedAt` observed then cleared on reopen                                                       |
| Reopen   | `completedAt=null` after completed-list toggle                                                      |
| Delete   | `deletedAt=1784513949772` durable after upload                                                      |
| Cleanup  | Orphan/test PROD smoke rows also tombstoned; Kenos tables remain 0                                  |

## 6. Observation

**`KENOS PLANNER PRODUCTION COMPATIBILITY — OBSERVATION_PASS`**

See `docs/qa/kenos-planner-production-observation-report.md`.
No Red / no double-write / no stop_builds regression during post-deploy window.
Prod AIOS still on pre-Focus-side-fix tip (`6a5d500302c73442caf47132`) — tracked
in AIOS maintenance packet only (not redeployed here).

## 7. Readiness

| Gate                          | Verdict                                   |
| ----------------------------- | ----------------------------------------- |
| Other domain clients          | **NO** automatic green light              |
| Kenos Writer canary           | Packet ready for separate approval phrase |
| Restore auto-builds / Gallery | **NO**                                    |

## 8. Exact next approval phrase

`APPROVE_KENOS_PLAN_CREATE_TASK_WRITER_CANARY`

Do **not** enable writers or restore builds without that phrase.
