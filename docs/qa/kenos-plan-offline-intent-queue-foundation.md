---
title: KENOS PLAN OFFLINE INTENT QUEUE — FOUNDATION
owner: kenpan
last_verified: 2026-07-21
status: PHASE3_WRITERS_READY_FLAG_OFF_IN_PROD
---

# Plan Offline Intent Queue

- Core: `apps/planner/src/lib/kenos/planOfflineIntentQueue.core.js`
- Host: `apps/planner/src/lib/kenos/planOfflineIntentQueue.host.js`
- Default: **OFF** (`VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE` unset)
- Guarantees: user bind, account-switch clear, idempotent enqueue, auth-gated flush, create→mutation id remap, dead-letter after 5 failures, no Legacy dual-write
- Production Netlify bake does **not** enable this flag (Owner/dev canary only)

## Enablement (Owner / dev canary)

Requires **both** flags at build time:

| Env | Purpose |
| --- | --- |
| `VITE_KENOS_PROD_WRITES=1` | Kenos writer master gate |
| `VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE=1` | Offline intent queue |

Per-writer flags also required for each offline path (create / complete / reopen / title / due / schedule / project / archive).

**Local dev example**

```bash
cd apps/planner
OWNER=you@example.com
VITE_KENOS_PROD_WRITES=1 \
VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE=1 \
VITE_KENOS_PLAN_CREATE_TASK_WRITER=1 \
VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS=$OWNER \
VITE_KENOS_PLAN_COMPLETE_TASK_WRITER=1 \
VITE_KENOS_PLAN_COMPLETE_TASK_WRITER_OWNER_EMAILS=$OWNER \
VITE_KENOS_PLAN_REOPEN_TASK_WRITER=1 \
VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER=1 \
npm run dev
```

**Daily Beta (iOS dogfood)** — `scripts/kenos-daily-beta/kenos-ctl.sh` bakes Planner with Owner writers + offline queue for local daily beta only; production sites stay flag-off.

## Host wiring (Phase 3)

| Writer host | Offline enqueue |
| --- | --- |
| `planCreateTaskWriter.host.js` | create + provisional id |
| `planCompleteReopenTaskWriter.host.js` | complete / reopen |
| `planUpdateTaskTitleWriter.host.js` | title |
| `planUpdateTaskDueDateWriter.host.js` | due date |
| `planUpdateTaskScheduleWriter.host.js` | schedule |
| `planUpdateTaskProjectWriter.host.js` | project |
| `planArchiveTaskWriter.host.js` | archive |

- `sync.js` `online` → `flushOfflinePlanIntentQueue()` (creates first, remap mutation `taskId`, then mutations)
- `auth.svelte.js` — logout clears queue; session bind clears on account switch
- Task rows show `Pending sync` while `meta.offlineQueued`

## Dead-letter

- After `OFFLINE_INTENT_MAX_ATTEMPTS` (5) failed flushes → `status: dead_letter` (skipped on auto flush)
- Core helpers: `listDeadLetterOfflineIntents`, `retryDeadLetterOfflineIntent`, `discardOfflineIntent`
- Settings UI for retry/cancel is still Phase 3b (helpers ready)

## Tests

Shared fixtures: `planOfflineIntentQueue.testUtils.js`

- `planOfflineIntentQueue.core.test.js` — flags, bind/switch, corrupt storage, flush, dead-letter skip/retry, remap Map/object
- `planCreateTaskWriter.host.test.js` — create offline + provisional remap flush
- `planOfflineIntentQueue.host.test.js` — complete/title/archive enqueue; create→complete remap; partial failure; auth_required; cross-account clear; dead_letter preserve
- `offlineReconnect.contract.test.js` — legacy sync + Kenos flush-on-online contract

## Apple native queue bridge (future — no dual-write)

Phase 4A ships `KenosOfflineActionQueue` in `clients/apple/Packages/KenosActions` (FakeActionExecutor, R1 drafts only). **Do not** dual-write to both Swift queue and `kenos.plan.offlineIntentQueue.v1`.

Until bridge exists, iOS WK Plan path uses Web `planOfflineIntentQueue` when baked with offline flag.

## Next

- Dead-letter Settings surface (retry / discard)
- Owner 真机 dogfood sign-off
- Production bake enablement (only after sign-off)
- Cross-device queue reconciliation
