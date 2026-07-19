---
title: Kenos Phase 1 plan.create_task writer cutover review
owner: kenpan
last_verified: 2026-07-19
doc_role: writer-cutover-simulation-package
status: local-simulation-only-cutover-prohibited
---

# Kenos Phase 1 writer cutover review

No writer was switched or removed. The production flag does not exist yet; the
local simulator models the proposed behavior and defaults to Off.

## Writer inventory

| Path | Current write | Cutover treatment |
| --- | --- | --- |
| Planner UI and `lifeEventsInbox`/template callers -> `createTask` -> `executeCreateTaskCommand` | local Task + local Outbox/Activity, later synced | Keep as canonical local-first UX; remote sync must be distinguished from a new command request. |
| `apps/planner/src/lib/repo.js` structured sync | bulk upsert/delete of `planner_tasks` rows for device reconciliation | Not an Action producer and cannot be disabled in this slice; future design must prevent it from minting untracked remote Tasks. |
| Planner MCP `add_task` -> `executeAssistantCreateTaskCommand` -> Netlify `upsertTask` | explicit Assistant envelope, then direct `planner_tasks` upsert | First remote create-task caller proposed for shadow/new command routing. Current path is not atomically writing server Outbox/Activity. |
| review RPC `public.kenos_create_plan_task_action` | disposable Task + idempotency + Outbox + Activity transaction | Candidate new writer; not deployed or called by production code. |
| `apps/planner/server/kenos/createTaskCommand.mjs` | in-memory reference implementation/tests | Contract oracle only, not a production Task truth. |
| Paper provider and device actions | Task reads and updates/completion plus action log | Outside create-task cutover; preserve and inventory separately before any complete/update migration. |
| legacy `planner_user_state` | settings/legacy backup | Not the canonical structured Task create writer; do not turn it into a second Task truth. |

Known direct Task writes are guarded by repository search for
`planner_tasks` insert/upsert/update/delete and `createTask` call sites. Any new
direct remote create path is a cutover blocker.

## Flag and local simulation

`DEFAULT_WRITER_CUTOVER_CONFIG` is `{ mode: 'off', source: 'server_config',
authorized: false }`. Only an authorized server configuration carrying the
local simulation capability can select `shadow` or `new_with_fallback`; client
requests, production context, missing capability, unknown modes, and an
unsigned/unauthorized config all resolve to Off.

The simulator proves:

- shadow receives the canonical request but writes only its disposable memory
  database; the legacy projection remains the sole simulated truth;
- repeated idempotency keys produce one legacy Task and one shadow candidate;
- normalized title/notes/completion parity is compared and mismatch telemetry
  is emitted;
- injected new-path failure falls back to legacy;
- rollback sets the model to Off, retains Tasks, and deletes zero rows.

Run `node apps/planner/server/kenos/writerCutoverSimulation.test.mjs`.

## Proposed cutover checklist (requires later approval)

1. Approve frozen v1, SQL owners/privileges, worker identity, and production
   migration; back up and record the rollback point.
2. Apply the reviewed migration in a separately authorized change window; keep
   writer mode Off and verify ACL/RLS/advisors with two real test users.
3. Deploy the server caller with mode Off. Confirm no client can set the mode.
4. Enable shadow for only explicit personal R1 MCP create-task requests. The
   shadow side must not persist canonical Tasks or publish Outbox events.
5. Observe an owner-approved sample/window. Reconcile every idempotency key and
   compare normalized results.
6. If and only if all thresholds pass, request a second explicit approval for
   `new_with_fallback`. Do not combine this approval with migration apply.
7. Verify one Task/Outbox/Activity per accepted key, retry/dead-letter visibility,
   latency, and client sync. Keep fallback and old code intact.
8. Start a separate observation/retirement slice. Old-path deletion is not part
   of cutover and requires proof of zero callers.

## Metrics and abort conditions

Track request count, producer, outcome/error code, duplicate replay rate, shadow
match/mismatch, RPC latency, fallback rate, Task/Outbox/Activity reconciliation,
Outbox age/retry/dead-letter, and direct-write audit detections. Do not log Task
notes or raw payloads.

Immediate abort conditions are any authorization/RLS breach, second Task for one
idempotency key, atomicity mismatch, unredacted Activity secret, shadow mismatch,
or unknown direct writer. Proposed early-window thresholds are fallback rate
greater than 1%, RPC p95 greater than 2 seconds, or any unexpected dead letter;
the owner must approve final thresholds and observation length.

## Rollback and blast radius

Set the server-owned flag Off, stop Outbox delivery, route the MCP create call to
the existing legacy writer, and reconcile accepted keys. Do not delete Tasks or
internal rows. A retry may use the same idempotency key after the old path is
confirmed authoritative. Blast radius is limited to explicit personal R1
`plan.create_task` from the approved remote caller; Work, proactive Assistant,
bulk, complete/reschedule/delete, Paper updates, and browser/device sync remain
outside the cutover.

Required approvals: Ken as product/data owner, database migration owner,
security/RLS reviewer, runtime/worker owner, and deployment/change-window owner.
No cutover date is selected by this package.
