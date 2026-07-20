---
title: KENOS PLAN OFFLINE INTENT QUEUE — FOUNDATION
owner: kenpan
last_verified: 2026-07-20
status: FOUNDATION_READY_FLAG_OFF
---

# Plan Offline Intent Queue Foundation

- Module: `apps/planner/src/lib/kenos/planOfflineIntentQueue.core.js`
- Default: **OFF** (`VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE` unset)
- Guarantees designed: user bind, account-switch clear, idempotent enqueue, auth-gated flush, no Legacy dual-write
- Production bake does **not** enable this flag yet (Owner-limited online writers only)

## Host wiring (flag still OFF)

- `planCreateTaskWriter.host.js` enqueues when offline + flag ON (optimistic local materialize; provisional id = action id until flush remap)
- Logout clears offline queue via `clearOfflineQueue(localStorage)`
- Production bake does **not** set `VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE`

Next: reconnect flush worker + id remap + reconnect exactly-once tests exactly-once tests before any production enablement.


## Reconnect flush (2026-07-20)

- `flushOfflineCreateTaskQueue` remaps provisional id → server taskId
- Wired from `sync.js` `online` via dynamic import
- Production flag still OFF
