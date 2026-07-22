---
title: Kenos Core-Loop Operational Runbooks
owner: kenpan
last_verified: 2026-07-21
doc_role: ops-runbook
status: active
---

# Kenos Core-Loop Operational Runbooks (F5-06.9)

Executable diagnostics for the Capture→Plan→Today→Complete→Activity→Continue
loop. Every command is read-only unless marked **[WRITE — owner gate]**. Never
paste user content or secrets into a ticket. `DBURL` defaults to the local
clean-room; against production use a read-only connection and the
`scripts/supabase-sql.sh` management path (owner token required).

Quick health snapshot: `node scripts/kenos-health-check.mjs`

---

## 1. Task appears missing

- **Symptom**: user created a task; it is not on Today / not on the other client.
- **Evidence**:
  - Web console: `localStorage['kenos.plan.offlineIntentQueue.v1']` — is there a
    `pending`/`failed`/`dead_letter`/`rejected` intent for it?
  - `scripts/supabase-sql.sh "select id, data->>'title', updated_at from planner_tasks where user_id='<uid>' order by updated_at desc limit 20;"`
- **Likely causes**: intent still QUEUED (offline / never flushed); intent
  REJECTED (permanent error); LWW clobber by a stale client.
- **Recovery**: foreground the app (startup/visibility flush now drains the
  queue); if `rejected`, read `lastError` → fix input, re-submit; if LWW clobber,
  the newer `updated_at` won — check both clients' clocks.
- **Owner gate**: none (local diagnosis).
- **Verify**: task present in `planner_tasks` with expected title.

## 2. Duplicate task

- **Symptom**: two identical tasks.
- **Evidence**: `select id, data->>'title', (data->>'createdAt') from planner_tasks where user_id='<uid>' and data->>'title'='<title>';` — same idempotency lineage?
- **Likely causes**: two DISTINCT user clicks (each mints a fresh idempotency
  key — not deduped by design); NOT a retry (retries reuse one key → one task,
  proven FI-1/FI-3).
- **Recovery**: user deletes the extra (soft-delete, 30-day recoverable). If a
  retry produced a duplicate, that is a defect — capture the two rows' `action_id`
  and file it (idempotency should have collapsed them).
- **Verify**: `kenos_plan_action_idempotency` has one row per intended action.

## 3. Task stuck pending

- **Symptom**: task shows "pending sync" indefinitely.
- **Evidence**: the intent's `status` + `attempts` + `lastError` in the queue key.
- **Likely causes**: `auth_blocked` (session lost); `dead_letter` (5 retryable
  failures); `rejected` (permanent). Before this milestone these were invisible.
- **Recovery**: `auth_blocked` → re-login (auto-resumes); `dead_letter` →
  `retryDeadLetterOfflineIntent`; `rejected` → surfaced via `syncState.message`,
  needs user action.
- **Verify**: intent leaves the queue (SERVER_CONFIRMED) or shows an actionable
  failed state.

## 4. Activity missing

- **Symptom**: a completed/created action has no Activity entry.
- **Evidence**: `select action_type, summary, created_at from kenos_plan_activity where user_id='<uid>' order by created_at desc limit 20;`
- **Likely causes**: the mutation went through the **Legacy** path (repo.js sync
  or paperService) which does NOT emit Activity — only the Kenos RPC does.
- **Recovery**: confirm the writer flag/cohort; canonical RPC path emits Activity
  atomically (proven R3/FI-2). Legacy-only writes are a known convergence gap
  (see F5-04 report).
- **Verify**: new RPC-path action produces exactly one `kenos_plan_activity` row.

## 5. Continue points incorrectly / to nothing

- **Symptom**: "Continue" opens the wrong task or a dead link.
- **Evidence**: Web console `localStorage['kenos.spaceSwitcher.v1']` and
  `localStorage` keys `kenos.continue.v2.*` — the resume descriptor's `entityId`.
- **Likely causes**: the referenced task was deleted/unauthorized; owner-bind
  mismatch.
- **Recovery**: `fallbackResumeToHome` handles a missing object; RLS blocks a
  cross-user id. If it opens a stale object, the descriptor entityId is stale.
- **Verify**: Continue resolves a live, owner-visible task or falls back to home.

## 6. Realtime disconnected

- **Symptom**: other client's changes not appearing live.
- **Note**: Kenos core loop uses **no Realtime** — this is expected. Convergence
  is by canonical re-fetch (bidirectional pull on online / foreground / debounce).
- **Recovery**: trigger a pull (foreground the app / open settings → sync now).
- **Verify**: pull brings the other client's `updated_at` changes.

## 7. Client/server schema mismatch

- **Symptom**: writes fail with `schema_version_not_supported`.
- **Evidence**: health check `core_rpcs_present`; client build's contract version.
- **Likely cause**: client older/newer than the deployed RPC contract.
- **Recovery**: update the client. Mapped to `contract_mismatch` (non-retryable)
  → user sees "请更新到最新版本".
- **Owner gate**: deploying a new contract version.

## 8. Local queue corruption

- **Symptom**: queue JSON unparseable / app errors reading it.
- **Evidence**: `localStorage['kenos.plan.offlineIntentQueue.v1']`.
- **Recovery**: `loadOfflineQueue` already returns an empty queue on parse error
  (fail-safe). To hard-reset: `clearOfflineQueue(localStorage)` (loses unsent
  intents — communicate to the user first).
- **Verify**: queue reloads empty; new mutations enqueue cleanly.

## 9. Failed migration (clean-room / staging)

- **Symptom**: `replay.sh` reports a failing migration.
- **Evidence**: `bash scripts/kenos-cleanroom/replay.sh` output (per-file error).
- **Recovery**: fix the migration SQL; the full 6-app union is a known
  non-replayable set (F5-02 M2) — use the core-loop list.
- **Owner gate**: **[WRITE]** production apply — see F5-02 GATE A/B.

## 10. Auth refresh loop

- **Symptom**: repeated re-auth; queued work stuck `auth_blocked`.
- **Evidence**: app-logs (redacted) `category:session`; `syncState.phase`.
- **Recovery**: full logout+login clears/rebinds the user-scoped queue
  (`clearOfflineQueue`/`bindOfflineQueueToUser`); queued work never executes under
  a different user (proven FI-5).
- **Verify**: session stable; queue resumes for the correct user.

## 11. Supabase outage

- **Symptom**: all reads/writes fail.
- **Evidence**: `node scripts/kenos-health-check.mjs` → `db_reachable: FAIL`.
- **Recovery**: writes hold in the durable queue (RETRYABLE_FAILURE), reads show
  honest offline/unavailable states; both auto-recover on reachability.
- **Owner gate**: provider status / escalation.
- **Verify**: health check green; queue drains.

## 12. Knowledge ingestion / AI extraction failing (F5-07)

- **Symptom**: capture won't produce proposals.
- **Evidence**: source `processing_status`; app-logs `category:knowledge`
  (redacted — no source content).
- **Recovery**: mapped to `ai_extraction_failure` (retryable) — retry or manual
  entry; source + user edits preserved.
- **Owner gate**: local-vs-cloud AI policy (see F5-07 report).
- **Verify**: re-run extraction produces a source-linked proposal.
