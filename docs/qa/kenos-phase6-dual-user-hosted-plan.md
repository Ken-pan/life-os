---
title: Kenos Phase 6 — Dual-user hosted privilege plan
owner: kenpan
last_verified: 2026-07-19
status: stage-a-plan-not-executed
---

# Dual-user hosted privilege plan

Execute **after** Wave 1 apply approval. Stage A only defines the plan.

## Actors

| Actor | Expectation |
| --- | --- |
| User A (authenticated) | SELECT own Kenos rows; EXECUTE approved command RPCs; **cannot** INSERT other users' rows; **cannot** INSERT Focus/Approval/Activity/Outbox directly |
| User B (authenticated) | Cannot read User A rows (Focus, Approval, Activity, Work, idempotency) |
| Anonymous | Fail closed — no SELECT/EXECUTE on Kenos internals |
| Worker role (`kenos_outbox_worker` when present) | Outbox transition only; no broad domain write |
| Unauthorized / wrong JWT | Denied |

## Cases

1. Cross-user FocusContext SELECT → 0 rows / error  
2. Cross-user Approval SELECT → denied  
3. Authenticated INSERT into `kenos_plan_activity` → denied  
4. Authenticated INSERT into `planner_tasks` **before revoke** → still allowed (document); **after revoke** → denied  
5. Command RPC as User A creates Task with `owner = auth.uid()` only  
6. Spoofed payload `ownerId` ≠ auth uid → rejected by RPC  
7. Anon `kenos_list_focus_contexts` → denied  

## Evidence format

| Case | Result | Query id / screenshot ref | Operator | Time |
| --- | --- | --- | --- | --- |
| | ☐ pass / ☐ fail | | | |

Any cross-user success = **Red Gate** — stop Wave progression.
