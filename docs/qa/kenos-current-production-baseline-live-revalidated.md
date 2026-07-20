---
title: KENOS CURRENT PRODUCTION BASELINE — LIVE_REVALIDATED
owner: kenpan
last_verified: 2026-07-20T14:35:00Z
status: LIVE_REVALIDATED
---

# Live production baseline

| Item | Value |
| --- | --- |
| local HEAD / origin/master | `4ab95e0b4559883e6389bcdfc303cb151591f482` |
| Planner published deploy | `6a5e2f18f5e5050e35b63590` |
| Planner bake code SHA (artifact-proven) | `9bc298c28a546f9e09dfbc27bfaeef457c3b5fd0` |
| Artifact proof | prod `BKFmNH-g.js` sha1 = local bake sha1 `c088901b…` |
| Rollback Planner | `6a5dab2cde48f1eed103ae1c` |
| AIOS published | `6a5dbdbc196bfd8740751ee4` |
| Migration tip | `20260720230000` |
| Wave1 | `20260719130100`–`20260719130500` present |
| planner_tasks / projects | 1684 / 50 |
| outbox / activity / approvals / focus / work / captures | 23 / 27 / 0 / 0 / 0 / 0 |
| Outbox statuses | all sampled `pending` (Executor off) |
| Seven sites stop_builds | **true** (all seven) |
| Gallery workflow | `disabled_manually` |
| ProductionExecutor | Off |
| Capture convert flag | Off until Owner-limited canary bake |
| Offline queue | Off |

## Writer routing (Owner cohort)

Plan create/title/due/schedule/project/complete/reopen/archive → Kenos RPC (prod JS contains all `kenos_*_action` names). MCP complete → `kenos_complete_plan_task_action`. Legacy retained for non-cohort / uncovered fields.
