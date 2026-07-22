# Planner Task Provenance Audit — 2026-07-22

Read-only provenance audit of production `planner_tasks` for the Owner account
(`c2831538-94b0-4a57-b034-5e873a53c42e`, prod ref `iueozzuctstwvzbcxcyh`), followed
by an owner-approved reversible cleanup and a local prevention patch.

## Findings (74 overdue active tasks)

| classification | count | evidence |
|---|---|---|
| TEST_ARTIFACT | 37 | Continuity/preflight (`kenos-cont-*`,`kenos-preflight-*`, 16), iOS daily-beta (`ios-*`, 18), demo fixtures (`d-t1/d-t3/d-t4`, 3). Raw service_role upserts, **absent from the governed idempotency ledger**, deterministic run-id titles, test tags. |
| AGENT_DOGFOOD | 30 | `健身 · 胸/背/腿/臂` seeded workout program written via the governed `plan_ui:` writer in a single 0.7 s burst at 02:29 — 10 `(dueDate,muscle)` groups × **3 identical copies** (duplication bug: each copy a distinct correlationId, so idempotency could not dedupe). `lifeEventRef.sessionId` null → not from real logged workouts. |
| USER_ORGANIC | 7 | 4 plain organic tasks (no `meta`), 3 capture→convert tasks (`meta.command` idem `<uuid>:N:M`, real content). |
| UNKNOWN | 0 | — |

The 3 real Project Spine dogfood tasks are **current, not overdue** (governed RPC,
`meta.source='assistant_action'`, wired to projects Life OS · AIOS / Ingram · Search /
Photo Organizor at 19:27:52) — out of scope, KEEP. Clean-room `knowledge_to_action_e2e`
used throwaway users and left nothing on the Owner account.

**Active writes:** none in progress at audit time; last write (19:27:52) was the governed
dogfood wiring. Outbox has 149 stuck `pending` rows (worker not draining) + 1 dead_letter —
a reliability issue, not active test writing.

## Cleanup performed (reversible soft-delete)

57 rows soft-deleted via `data.deletedAt`, tagged `data.archivedReason='provenance-audit-2026-07-22:*'`:
- **37** TEST_ARTIFACT (`…:test-artifact`)
- **20** duplicate fitness copies (`…:fitness-duplicate`), keeping the earliest of each group of 3.

Overdue count: **74 → 17** (17 survivors = 7 USER_ORGANIC + 10 canonical fitness kept for owner review).

### Reversal (restore any archived row)
```sql
update public.planner_tasks
set data = (data - 'deletedAt') - 'archivedReason', updated_at = now()
where user_id = 'c2831538-94b0-4a57-b034-5e873a53c42e'
  and data->>'archivedReason' like 'provenance-audit-2026-07-22:%';
```
Scope the reversal by swapping the `like` for `= 'provenance-audit-2026-07-22:test-artifact'`
or `:fitness-duplicate` to restore just one class.

### Still needs owner review (not touched)
- 10 canonical `健身 · …` seed tasks — decide whether the seeded program stays.
- 3 capture→convert tasks (`工作 做pdp responsive`, `工作 检查课程`, `买3m claw hanger`) — confirm you recognize them.

## Prevention patch (this branch)

Root cause: QA harnesses authenticated as the Owner against production and raw-upserted
`planner_tasks` with no provenance and no teardown.

- `scripts/lib/testProductionGuard.mjs` — default-DENY production for test writes
  (requires both `KENOS_PROD_TEST_AUTHORIZED=1` and a scoped G2 authorization), mandatory
  auto-expiring test provenance stamp, cleanup partitioning that can never touch a governed
  row lacking test provenance, a title-only-selector rejector, and a hard teardown-leak assertion.
- `scripts/lib/testProductionGuard.test.mjs` — unit tests (pure core, no fs/clock), wired
  into `npm run test:governance`.
- `scripts/qa/kenos-space-continuity-e2e-flows.mjs` — adopts `assertTestWriteAllowed({ url })`
  before building its service_role client (reference adoption; remaining `scripts/kenos-ios-daily-beta/*`
  harnesses should adopt the same call + `buildTestProvenance` + `assertTeardownClean`).
