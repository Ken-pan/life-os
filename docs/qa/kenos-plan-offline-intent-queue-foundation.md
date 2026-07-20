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

Next: host wiring + reconnect exactly-once tests before any production enablement.
