---
title: KENOS TRACK D — ACTIVITY / APPROVAL / OUTBOX (NO EXECUTOR)
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS — CLIENT_FLAGS_OFF — EXECUTOR_DISABLED
---

# Track D: Activity · Approval · Outbox (ProductionExecutor still off)

## Backup

| Item | Value |
| --- | --- |
| Dir | `/tmp/kenos-approval-writer-backup-20260720T050947Z` |
| Pre tip | `20260720150000` |
| Approvals pre | 0 |
| Activity/outbox/idempotency pre | 22 each |

## Migrations applied

| Version | Capability |
| --- | --- |
| `20260720160000` | `kenos_list_plan_activity` (authenticated own rows) |
| `20260720170000` | `kenos_request_action_approval_action` + `kenos_decide_action_approval_action` |
| `20260720180000` | `kenos_list_plan_outbox` + `kenos_dead_letter_plan_outbox_action` |

Production tip: **`20260720180000`**

Grants: authenticated EXECUTE true; anon EXECUTE false for all new public RPCs.
`processing` / `published` outbox transitions remain private to `kenos_outbox_worker` only.

## RPC canaries (Owner `c2831538-…`)

| Step | Result |
| --- | --- |
| Approval request | PASS |
| Request idempotent retry | PASS `duplicate=true` |
| Approval decide (approved) | PASS; outbox `pending`, `executor=disabled` |
| Decide idempotent retry | PASS |
| Cross-user decide | PASS deny (`approval_compare_and_set_failed`) |
| Dead-letter owner recovery | PASS `status=dead_letter` |
| Cleanup | PASS (canary rows removed) |

## Client

- AIOS `approvalWriters.core.js` + unit tests
- Flags `VITE_KENOS_APPROVAL_REQUEST_WRITER` / `VITE_KENOS_APPROVAL_DECIDE_WRITER` default OFF
- Read canary fail-closed
- Planner + AIOS write RPC denylists updated
- **Not** baked into production AIOS (remains read-only maintenance)

## Explicitly not opened

- ProductionExecutor
- Outbox delivery worker / publish
- Assistant autonomous approve+execute
- AIOS production write bake for Approval UI

## Next

Track E FocusContext write (Owner-limited canary) while keeping Executor disabled.
