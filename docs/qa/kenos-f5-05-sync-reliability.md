---
title: KENOS F5-05 — Sync Reliability & Failure Recovery
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: F5_05_PASS_SYNC_RELIABILITY_LOCAL
---

# KENOS F5-05 — Sync Reliability & Failure Recovery

**Status: `F5_05_PASS_SYNC_RELIABILITY_LOCAL`**

Branch `kenos-f5-05-07` (base `kenos-f5-02-04` → includes P5 Gate-1 + F5-02–04).

## 1. Architecture (as-built)

Two write systems: **(A)** Kenos hosted RPCs (server-authoritative, atomic,
idempotent) for Capture/Create/Complete/Update; **(B)** Legacy bidirectional
state sync (`sync.js`, whole-payload LWW). iOS Daily Beta runs the same web
bundle in WKWebView → identical path. **No Supabase Realtime** in the core loop;
clients converge by canonical re-fetch (bidirectional pull on online /
visibility / debounce).

## 2. Mutation lifecycle (new — F5-05.2)

`apps/planner/src/lib/kenos/mutationLifecycle.core.js` — one explicit state machine:

| State | Persisted | Visible | Editable | Retry | Survives kill |
| --- | --- | --- | --- | --- | --- |
| QUEUED | `pending` | yes (optimistic) | yes | auto (on flush window) | yes (localStorage) |
| SENDING | transient | yes | no | — | n/a |
| SERVER_CONFIRMED | removed | yes (canonical) | yes | — | yes |
| RETRYABLE_FAILURE | `failed` | yes | yes | auto until max=5 | yes |
| AUTH_BLOCKED | `auth_blocked` | yes | yes | after reauth (no attempt burned) | yes |
| CONFLICT | `conflict` | yes | yes | manual | yes |
| REJECTED | `rejected` | yes (flagged failed) | yes | manual only | yes |
| DEAD_LETTER | `dead_letter` | yes (flagged failed) | yes | manual (`retryDeadLetter`) | yes |
| CANCELLED | removed | no | — | — | — |

`classifyFlushError` routes permanent RPC rejections (wrong_owner,
schema_version_not_supported, capture_not_found, unsupported_action, …) to
**REJECTED immediately** instead of burning all 5 retries; auth errors →
AUTH_BLOCKED without consuming an attempt.

## 3. What is now trustworthy (proven by code + tests)

- **Durable pending ops** survive navigation/reload/relaunch/kill: localStorage
  key `kenos.plan.offlineIntentQueue.v1`, no tokens stored (only the action
  envelope). Queue is user-bound; account switch/logout drops or isolates it.
- **Relaunch no longer stalls queued writes** (F5-05.3 fix): `initAutoSync` now
  drains the queue at startup and on foreground (`visibilitychange→visible`),
  not only on `offline→online`.
- **Ambiguous success is idempotent** (FI-1): commit → lost response → retry same
  key → one task, `duplicate:true`. Same for capture convert (R6).
- **Permanent rejections stop retrying** and surface as actionable (lifecycle +
  `syncState.message`, replacing a silent `.catch(()=>{})`).
- **Same key + different payload is rejected** at the queue boundary
  (`offlineIntentPayloadFingerprint`) instead of silently dropping new data;
  server behavior (first-write-wins) documented.
- **Queued commands cannot cross accounts** (FI-5 + `bindOfflineQueueToUser`).
- **Atomicity**: a rejected action leaves no partial task/activity/outbox (FI-2,
  R3). Contract-version mismatch rejected with no partial write (FI-4).

## 4. Conflict policy (F5-05.5)

Whole-row **LWW by `updatedAt`** (`persist/migrate.js mergeTasksByUpdatedAt`),
with `coerceTimestamp` normalizing ISO (RPC) vs ms (local) so REST writes
participate correctly. **Deletes are soft (30-day tombstone TTL)** so a
"lost" delete is recoverable, not destructive — a newer edit revives an older
tombstone and vice-versa (tested: `propagates newer tombstones`,
`keeps a newer local edit over an older remote tombstone`). Acceptable for the
reversible core-loop fields (title/date/complete). No blind LWW on truly
destructive ops — deletes are recoverable by design.

## 5. Failure-injection evidence (20-scenario matrix)

| # | Scenario | Covered by | Result |
| --- | --- | --- | --- |
| 1 | create, kill app immediately | queue localStorage persistence + startup flush | PASS |
| 2 | complete, kill before response | same | PASS |
| 3 | network timeout after commit | FI-1, R1 (idempotent replay) | PASS |
| 4 | same command 3× | FI-1 (3 retries → 1 task) | PASS |
| 5 | duplicate from Web+iOS | FI-3 (same key two clients → 1) | PASS |
| 6 | Web+iOS concurrent edit | LWW (migrate.test.js) | PASS |
| 7 | delete vs complete | LWW tombstone tests | PASS (soft-delete recoverable) |
| 8 | expired token + queued | AUTH_BLOCKED (lifecycle test) + flush auth guard | PASS |
| 9 | logout with pending | `clearOfflineQueue` (queue host test) | PASS |
| 10 | second user login | `bindOfflineQueueToUser` wipes (host test) | PASS |
| 11 | Realtime disconnect | N/A (no realtime; re-fetch) | PASS by design |
| 12 | missed Realtime event | bidirectional pull | PASS by design |
| 13 | local cache wiped | pull from cloud (sync.js) | PASS |
| 14 | local schema upgrade | migrate.js migrations | PASS (existing) |
| 15 | Activity consumer failure | atomic RPC (FI-2, R3) | PASS |
| 16 | Continue update failure | Continue is independent localStorage | PASS (non-blocking) |
| 17 | Supabase unavailable | RETRYABLE_FAILURE, queue holds (lifecycle) | PASS |
| 18 | malformed response | classifyFlushError → retryable | PASS |
| 19 | unsupported contract version | REJECTED (FI-4, lifecycle) | PASS |
| 20 | relaunch + canonical re-fetch | startup flush + pull | PASS |

Commands: `scripts/kenos-cleanroom/replay.sh` (FI-1..5 + RLS + RPC);
`npx vitest run` in apps/planner (227 tests incl. lifecycle 6, queue 18, LWW).

## 6. Honest boundaries

- **Not full offline creation UI everywhere** — offline create/complete write an
  optimistic row flagged `offlineQueued`; on dead-letter/reject it now surfaces
  as failed (was silent). This is durable-retry + honest-pending, not a
  general offline-first product.
- **Double distinct clicks** (two independent create clicks) still generate two
  keys → two tasks: idempotency protects re-flush of one queued intent, not
  distinct user submissions. Mitigation is UI submit-disable (out of core scope);
  documented, not a silent-loss risk.
- **No optimistic-concurrency version check** on update RPCs — concurrent edits
  resolve by LWW, not a version conflict signal. Acceptable for core-loop fields.

## 7. Local commits (this phase)
- `feat(sync): explicit mutation lifecycle — permanent rejections stop retrying`
- `fix(sync): flush queue on relaunch/foreground + payload-mismatch guard`
- `test(sync): F5-05 DB failure-injection suite`
