---
title: KENOS PLAN CREATE-TASK WRITER CANARY PACKET
owner: kenpan
last_verified: 2026-07-20
status: APPROVED_UNDER_AUTONOMOUS_COMPLETION_PROGRAM — EXECUTING
---

# KENOS PLAN CREATE-TASK WRITER CANARY PACKET

**Prepare only. Do not enable writers. Do not call production commands.**

## Verdict

**`KENOS PLAN CREATE-TASK WRITER CANARY — EXECUTING_UNDER_AUTONOMOUS_PROGRAM`**

Authorized by `APPROVE_KENOS_AUTONOMOUS_PRODUCTION_COMPLETION_PROGRAM`. Internal packet gate passed; continuing to canary bake/deploy.

Planner production compatibility is deployed, smoke-cleaned, and observation-passed.
This packet is ready for the separate Writer Canary approval phrase. Writers remain
**off**.

## Closed NOT_READY reasons

| Prior gap                               | Closure                                             |
| --------------------------------------- | --------------------------------------------------- |
| Planner compat not production-verified  | Canary PASS + deploy `6a5d7bd5…` + observation PASS |
| Dual-account / logout isolation unknown | Live verified (same deploy window)                  |
| Smoke lifecycle incomplete              | create→edit→complete→reopen→delete + cleanup table  |
| Kenos mutation unknown                  | Domain tables audited **0**                         |
| Packet phrase mismatch                  | Now exact `READY_FOR_OWNER_APPROVAL`                |

## 1. Single Writer Owner

| Cohort                                  | Create intent owner                         |
| --------------------------------------- | ------------------------------------------- |
| Owner session + explicit writer flag ON | Kenos `plan.create_task` command RPC only   |
| Everyone else / flag OFF                | Legacy `planner_tasks` structured sync only |

Never: Legacy create + Kenos command for the same intent.

## 2. Cohort

- Owner single account
- Single browser session / single device
- Feature flag (default **off**): propose `VITE_KENOS_PROD_WRITES=1` **and**
  `VITE_KENOS_PLAN_CREATE_TASK_WRITER=1` (both required; either alone is no-op)
- Tagged task only: `KENOS PLAN WRITER CANARY — <UTC-timestamp>`
- No offline queue flush, Assistant automation, bulk import, or second device in cohort

## 3. Feature flag + Legacy bypass (execution design)

At canary GO (not now):

1. Bake flag ON only for Owner cohort build/session.
2. `createTask` UI path routes exclusively to hosted Kenos command RPC
   (`kenos_create_plan_task_action` / Wave 1 contract).
3. Legacy upsert path for that create intent is **explicitly bypassed** (no
   parallel `planner_tasks` insert from the same click).
4. Local Phase-1 adapter `executeCreateTaskCommand` remains the contract shape
   reference (`apps/planner/src/lib/domain/planTaskCommand.js`); production canary
   must not dual-write local outbox + Legacy + Kenos.

## 4. Failure / retry / no-fallback

| Case                | Required behavior                                                       |
| ------------------- | ----------------------------------------------------------------------- |
| Kenos command fails | User-visible error; **no** automatic Legacy create fallback             |
| Retry               | Same idempotency key; expect duplicate=false / already-created handling |
| Flag off mid-flight | Restore Legacy create routing; do not reverse-sync dual-write           |

## 5. Exact command contract

Required fields at canary time:

- actor / source (`plan_ui`)
- idempotency key
- correlation ID (UUID)
- authorization (Owner RLS)
- Action / Outbox / Activity outputs (transactional relationship per Wave 1)
- error classes: permanent vs retryable

Repo evidence: Wave 1 migrations tip `20260719130500`; local adapter tests in
`planTaskCommand.test.js`.

## 6. Action / Outbox / Activity

- Command success ⇒ Action recorded + Outbox row + Activity event in same
  logical unit (Wave 1 privilege model)
- Pending Outbox after partial failure ⇒ incident path below; **no** Legacy
  compensation create
- Activity is audit-only; not a second writer of task rows

## 7. Fresh backup gate (T-0 preflight — not waived)

Must reconfirm immediately before Writer Canary GO:

| Item                                              | Status now                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Latest production physical/WALG backup timestamp  | **Revalidate at T-0** (do not pretend Wave 1-era dump is fresh)          |
| Optional safe logical snapshot (no schema change) | Allowed under existing ops dump runbook; **not** restored in this packet |
| PITR                                              | **false** → remains **Yellow**                                           |
| Tip                                               | must still be `20260719130500` unless separately approved                |
| Deterministic checksum                            | record dump checksum + `planner_tasks` sample hash before GO             |
| Restore procedure                                 | local disposable restore drill only; never restore onto production       |

## 8. RLS / grants

- Owner-only execute on create-task command
- No anon / cross-user create
- No service-role from browser
- Grants unchanged unless a separate schema phrase is approved (this packet:
  **no schema change**)

## 9. Rollback runbook

1. Disable writer flags immediately
2. Confirm Kenos domain mutation stops
3. Retain tagged canary task row as evidence (do not dual-write reverse sync)
4. If client bake bad: Planner single-site rollback to `6a5c617e6e1b41000893a948`
   (or current pre-canary published ID confirmed live)
5. Keep seven-site `stop_builds=true`; do not restore Gallery/builds

## 10. Observability

Record (redacted): correlation, actor, idempotency, RPC status/latency, DB row id,
Action/Outbox/Activity ids, Legacy mutation count for cohort window (**must be 0
for create intent**), duplicate count, client errors.

## 11. Tagged future test task

`KENOS PLAN WRITER CANARY — <UTC-timestamp>`

Only after Owner phrase. Not created by this packet.

## 12. Pending Action / Outbox incident handling

- Detect pending/failed Outbox for canary correlation
- Do not auto-Legacy-create
- Pause canary; collect evidence; Owner decides repair vs abandon tagged row

## 13. Already-created task handling

- Same idempotency key retry returns existing task / duplicate=true
- UI must not create a second identity
- Cleanup only via product archive/delete after canary close (or Owner-approved DB)

## 14. Preconditions from Planner compat

| Gate                              | Status                           |
| --------------------------------- | -------------------------------- |
| Canary Owner read                 | PASS                             |
| Dual-account isolation            | PASS (same deploy window)        |
| Production Legacy smoke + cleanup | PASS                             |
| Observation                       | PASS                             |
| Kenos mutation audit              | PASS (0)                         |
| Fresh backup at Writer T-0        | **Yellow — revalidate at GO**    |
| Writer flag bake live             | **Off** (correct until approval) |

## 15. Exact approval phrase

`APPROVE_KENOS_PLAN_CREATE_TASK_WRITER_CANARY`

Do **not** enable writers, restore auto-builds, or touch Gallery without that phrase.
