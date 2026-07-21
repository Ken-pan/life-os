---
title: KENOS CURRENT PRODUCTION BASELINE — LIVE_REVALIDATED
owner: kenpan
last_verified: 2026-07-20T14:45:00Z
status: LIVE_REVALIDATED
---

# Live production baseline

| Item                                     | Value                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| local HEAD / origin/master (pre-commit)  | `be9a2cc8f3361cfb851943a4a4aac884116a4b40`                                        |
| Planner published deploy                 | `6a5e2f18f5e5050e35b63590`                                                        |
| Planner bake code SHA (artifact-proven)  | `9bc298c28a546f9e09dfbc27bfaeef457c3b5fd0`                                        |
| Artifact proof                           | prod `BKFmNH-g.js` sha1 = `c088901b2d971ddb4558c60a87c023867e11dd9b` = local bake |
| Rollback Planner                         | `6a5dab2cde48f1eed103ae1c`                                                        |
| AIOS published                           | `6a5e3298a269f920f5314a01`                                                        |
| Portal published                         | `6a5e347265864128941f0777` (Today soft-redirect Owner-limited)                    |
| Rollback Portal                          | `6a5c617eceda660008ee2583`                                                        |
| Migration tip                            | `20260721144405`（native app logs; prior Wave tip `20260720230000`）              |
| Wave1                                    | `20260719130100`–`20260719130500` present                                         |
| planner_tasks / projects                 | 1688 / 50                                                                         |
| outbox / activity / approvals / captures | 44 / 49 / 0 / 2                                                                   |
| Outbox delivered/published               | **0**                                                                             |
| Seven sites stop_builds                  | **true** (all seven)                                                              |
| Gallery workflow                         | `disabled_manually`                                                               |
| ProductionExecutor                       | **Off**                                                                           |
| Capture convert                          | Owner-limited On (AIOS bake)                                                      |
| Portal Today redirect                    | Owner-limited On (`/today` only)                                                  |
| Offline queue                            | Off                                                                               |

## Writer routing (Owner cohort)

Plan create/title/due/schedule/project/complete/reopen/archive → Kenos RPC. MCP complete → Kenos. Capture convert → Kenos. Legacy retained for non-cohort / uncovered fields / sync upsert.
