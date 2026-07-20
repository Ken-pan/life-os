---
title: KENOS PLAN LEGACY WRITER REVOKE INVENTORY
owner: kenpan
last_verified: 2026-07-20
status: INVENTORY — NO_REVOKE
---

# Legacy Plan writer revoke readiness

**Verdict: revoke nothing today.** Owner-limited Kenos writers are live; Legacy remains required for non-cohort, UI bypasses, MCP complete, uncovered fields, and sync upsert.

## Coverage vs Legacy

| Legacy path | Kenos replacement | Safe to revoke now? | Blocker |
| --- | --- | --- | --- |
| UI create | `kenos_create_plan_task_action` | No | Cohort-only; offline queue OFF |
| Title | `kenos_update_plan_task_title_action` | No | Observation window; cohort |
| Due | due writer | No | UI bypass: TaskRow / InsightCard |
| Schedule | schedule writer | No | UI bypass: DayTimeline / `applyTaskSchedule` |
| Project | project writer | No | Cohort observation |
| Complete / reopen | complete/reopen writers | No | MCP `complete_task` still Legacy upsert |
| Archive | archive writer | No | `restoreTask` still Legacy |
| Sync bulk upsert / DB DML | none complete | No | Uncovered fields + policies |

## Safe revoke order (future, one at a time)

1. Title → 2. Project → 3. Complete (after MCP) → 4. Reopen → 5. Archive (after restore policy) → 6. Due → 7. Schedule → 8. Create (after offline decision) → 9. Sync/DML

Rollback each step by unset writer flag / restore cohort — never delete user tasks.

## Pre-revoke work this program will do next

1. Route due/schedule UI bypasses through Kenos async writers
2. MCP `complete_task` → Kenos complete RPC (fail-closed, no Legacy fallback when flag On)
3. Capture → Plan convert client (explicit only)
4. Owner observation packet after Track B (separate from compat report)

## Explicitly not done

- No Legacy path disabled
- No RLS revoke SQL applied
- ProductionExecutor still disabled
- No `APPROVE_KENOS_LEGACY_WRITER_RETIREMENT` requested
