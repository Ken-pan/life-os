---
title: KENOS F5-06 — Performance, Observability & Operational Readiness
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: F5_06_PASS_OBSERVABLE_AND_BUDGETED
---

# KENOS F5-06 — Performance, Observability & Operational Readiness

**Status: `F5_06_PASS_OBSERVABLE_AND_BUDGETED`**

## 1. Measured baselines (real, local)

Environment: PostgreSQL 17.6 (local Supabase clean-room, colima), commit on
branch `kenos-f5-05-07`, stress dataset (500 tasks / 2000 activity rows for one
user). Web bundles from `npm run build` output.

| Metric | Measured | Budget | Status |
| --- | --- | --- | --- |
| `portal_today_summary` (500 tasks) | 0.33 ms | ≤200 ms p50 | OK (far under) |
| today-count planner_tasks filter | 0.11 ms (bitmap index) | — | OK |
| **`kenos_list_plan_activity` (2000 rows) BEFORE** | **0.412 ms, scans all 2000 + sort** | — | bottleneck |
| **`kenos_list_plan_activity` AFTER covering index** | **0.041 ms, Index Scan of 100, no sort** | ≤200 ms p50 | **OK (~10× + O(limit))** |
| aios web total JS | 2.69 MB | ≤4 MB | OK |
| planner web total JS | 0.81 MB | ≤2 MB | OK |

The one real bottleneck found by profiling — an unindexed activity list read that
scanned all of a user's rows — was fixed with a covering index
(`kenos_plan_activity_user_created_idx`), turning it into an O(limit) index scan.
Capture list and outbox already had owner/status/pending indexes.

## 2. Performance regression protection (F5-06.10)

`scripts/check-kenos-perf-budgets.mjs` — bundle-size budgets (generous
tolerances, regression guard only) + required covering-index presence in
migration SQL. Non-flaky (no timing thresholds). Passes:
`aios 2.69/4MB, planner 0.81/2MB, 4/4 indexes`.

## 3. End-to-end command tracing (F5-06.5)

A stable **`correlationId`** (UUID, `contractUuid()`) is minted client-side per
mutation and flows: client writer → `idempotencyKey` (`plan_ui:${correlationId}`)
→ RPC `action_request` → `kenos_plan_outbox.correlation_id` →
`kenos_plan_activity.correlation_id` → aios read dedup by correlation. So a
command is traceable end-to-end in the DB:

```sql
-- did the DB commit? was Activity produced? (read-only, by correlation)
select 'idempotency' src, action_id, task_id from kenos_plan_action_idempotency where correlation_id='<cid>'
union all select 'outbox', id::text, idempotency_key from kenos_plan_outbox where correlation_id='<cid>'
union all select 'activity', id::text, action_type from kenos_plan_activity where correlation_id='<cid>';
```

Diagnostics can answer: client created the command (queue intent id) → queued
(localStorage) → sent (RPC) → auth ok (actor=auth.uid enforced) → DB committed
(idempotency row) → Activity produced (activity row) → client reconciled
(dedup by correlation). **Known gap**: the `kenosAppLogs` pipeline session/id is
disjoint from `correlationId`, so client-side LOGS can't yet be auto-joined to
the DB trace — documented enhancement (thread `correlationId` into mutation-log
metadata). The DB-side trace is complete today.

## 4. Structured logging + privacy (F5-06.6)

`packages/platform-web/src/kenosAppLogs.js`: structured records (timestamp,
level, category, app, appVersion, build, route, file/function/line, metadata),
ring buffer + redacted cloud upload. Redaction covers bearer/token/JWT/
`sb_*`/`sk-*` keys + email.

**Fixed this milestone**: the logged `route` was `pathname + search` and the
lifecycle log used full `location.href` — query strings carry note/task titles,
search terms and resume payloads (`?title=…`, `?q=…`, `?kenosResume=…`), uploaded
verbatim. `safeRoute()` now keeps pathname + param KEYS only (values
`«redacted»`). Redaction test added (`kenosAppLogs.test.mjs`).

Never logged: tokens, refresh tokens, service-role, full notes/emails/health/
finance, full AI prompts, connector tokens, query values.

## 5. Error taxonomy (F5-06.7)

`packages/platform-web/src/kenosErrorTaxonomy.js` — one canonical category set
(auth_expired, unauthorized, validation, conflict, duplicate_replay,
network_unavailable, request_timeout, server_unavailable, database_failure,
local_persistence, contract_mismatch, migration_mismatch, realtime_disconnected,
connector_failure, ai_extraction_failure, approval_required, action_prohibited,
unknown). Each has `retryable`, `needsAuth`, and a human `recovery` hint.
`toErrorCategory` maps raw RPC/network codes **and** the two existing classifiers'
outputs (write `classifyFlushError`, read `classifyReadError`) into it. Tested.

## 6. Health checks + runbooks (F5-06.8/.9)

- `scripts/kenos-health-check.mjs` (read-only): DB reachable, 7 core RPCs
  present, 3 covering indexes, RLS on canonical tables, migration tip. Green.
- `docs/ops/kenos-core-loop-runbooks.md`: 12 executable runbooks (missing/
  duplicate/stuck task, activity, continue, realtime, schema mismatch, queue
  corruption, migration, auth loop, outage, knowledge) — symptom → read-only
  evidence command → cause → recovery → owner gate → verify.

## 7. Honest boundaries

- **iOS cold/warm launch timing not automated here** — the existing
  `kenos-ios-stability/smoke.mjs` measures per-loop P50/P95 (last run p50 447 ms)
  but a dedicated cold-launch-to-usable-Daily benchmark on a real device is not
  wired; recorded as an owner gate (needs device automation).
- **AI vs deterministic timing** partially separated (`durationMs`/`thinkingMs`
  in chat state) but not fed into the log pipeline; documented.
- Perf numbers are **local clean-room measurements**, not production; labeled as
  such. Production p50/p95 require the owner-gated deploy + real traffic.

## 8. Local commits (this phase)
- `perf(db): covering index for kenos_plan_activity list read`
- `fix(privacy)+perf: redact query values from logged routes; perf budgets`
- `feat(observability): canonical error taxonomy + health check`
- `docs(ops): executable core-loop runbooks`
