---
title: KENOS MCP COMPLETE_TASK WRITER — PRODUCTION_VERIFIED
owner: kenpan
last_verified: 2026-07-20
status: PRODUCTION_VERIFIED
---

# MCP complete_task Kenos Writer production verify

| Item | Value |
| --- | --- |
| Path | `kenos_complete_plan_task_action` (MCP host uses same RPC; no upsert) |
| Smoke task | `45d36fc1-…` `KENOS MCP COMPLETE WRITER SMOKE — 20260720T143402Z` |

## Checks

| Check | Result |
| --- | --- |
| complete once → `completed=true` | PASS |
| same idempotency replay → `duplicate=true`, same outbox/activity ids | PASS |
| Outbox pending / Activity=1 | PASS |
| delivered=0 (Executor off) | PASS |
| cross-user complete | DENY `task_not_found` |
| reopen + archive cleanup | PASS |

No Legacy `planner_tasks` upsert on this path.
