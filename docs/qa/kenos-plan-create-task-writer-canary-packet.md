---
title: KENOS PLAN CREATE-TASK WRITER CANARY PACKET
owner: kenpan
last_verified: 2026-07-19
status: KENOS PLAN CREATE-TASK WRITER CANARY PACKET — NOT_READY
---

# KENOS PLAN CREATE-TASK WRITER CANARY PACKET

**Prepare only. Do not enable writers. Do not call production commands.**

## Verdict

**`KENOS PLAN CREATE-TASK WRITER CANARY PACKET — NOT_READY`**

Blocked until Planner production compatibility observation PASS and fresh backup
gate revalidated under a dedicated Writer Canary approval.

## 1. Single writer owner (design)

| Cohort | Create intent owner |
| ------ | ------------------- |
| Owner session + explicit writer flag | Kenos `plan.create_task` command RPC only |
| Everyone else | Legacy `planner_tasks` / structured sync only |

Never: Legacy create + Kenos command for the same intent.

## 2. Cohort (proposed)

- Owner single account
- Single browser session
- Feature flag (exact name TBD at approval time; must default off)
- Tagged task only: `KENOS PLAN WRITER CANARY — <timestamp>`
- No offline queue, Assistant automation, or bulk import in cohort

## 3. Fresh backup gate

**Yellow / incomplete for this packet:**

- Must reconfirm physical/logical backup timestamp at Writer Canary T-0
- PITR=false remains risk Yellow
- Tip must still be `20260719130500` (or later only if separately approved)
- Restore method + deterministic checksum required before GO

## 4. Command contract (repo evidence)

Local Phase-1 adapter: `apps/planner/src/lib/domain/planTaskCommand.js`
(`executeCreateTaskCommand`). Production Kenos RPC:
`kenos_create_plan_task_action` (currently blocked by Planner
`prodWriteGuard`).

Required at canary time: actor, source, idempotency key, correlation ID,
authorization, Action/Outbox/Activity outputs, retry/error classes.

## 5. No-double-write strategy (design)

1. Flag on → Planner UI create in cohort routes to Kenos command only
2. Legacy upsert path explicitly bypassed for that intent
3. Command failure → user-visible retry; **no** automatic Legacy fallback dual-write
4. Retry uses same idempotency key
5. Flag off → restore Legacy create routing immediately

## 6. Canary smoke (future only)

`KENOS PLAN WRITER CANARY — <timestamp>`

- create once
- retry same idempotency
- read projection + Activity + Outbox
- duplicate audit
- disable flag

## 7. Rollback

Flag off → Legacy routing; retain already-created canary task as tagged row;
do not reverse-sync via dual-write; keep evidence.

## 8. Observability

correlation, actor, idempotency, RPC result, DB row, Action, Outbox, Activity,
legacy mutation count (=0 in cohort), duplicate count, latency.

## 9. Exact next approval phrase

`APPROVE_KENOS_PLAN_CREATE_TASK_WRITER_CANARY`

## 10. Why NOT_READY now

| Gate | Status |
| ---- | ------ |
| Planner Canary Owner read | Waiting Owner login |
| Dual-account isolation | Pending |
| Production Legacy smoke | Pending |
| Planner production deploy + observation | Not started |
| Fresh backup at Writer T-0 | Not revalidated |
| Writer flag + Legacy bypass wiring | Not implemented (correctly) |

Do not lower gates to mark Ready.
