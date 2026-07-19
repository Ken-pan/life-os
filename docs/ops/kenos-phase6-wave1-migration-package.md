---
title: Kenos Phase 6 — Wave 1 migration package index
owner: kenpan
last_verified: 2026-07-19
status: formal-migrations-ready-apply-blocked
---

# Wave 1 migration package index

**Apply source of truth:** `apps/finance/supabase/migrations/20260719130100` … `20260719130500`

**Historical review evidence:** `apps/planner/supabase/review/` (not for production apply)

**Status:** formalized; production apply blocked until FINAL packet Red gates close + `APPROVE_KENOS_PRODUCTION_WAVE_1`.

All formal timestamps are **after** remote tip `20260717220000`.

## Apply order

| Order | Formal file | Objects |
| --- | --- | --- |
| 1 | `20260719130100_kenos_wave1_plan_create_task_command.sql` | idempotency, Activity, Outbox, `kenos_create_plan_task_action` |
| 2 | `20260719130200_kenos_wave1_plan_privilege_model.sql` | `kenos_outbox_worker` / transition helper |
| 3 | `20260719130300_kenos_wave1_action_approvals.sql` | Approval read model + list RPC |
| 4 | `20260719130400_kenos_wave1_focus_context.sql` | Focus / Deferred / Suggestion + list RPC |
| 5 | `20260719130500_kenos_wave1_work_domain.sql` | Work domain tables + list RPCs |

## Explicitly NOT in Wave 1

| File | Gate |
| --- | --- |
| `apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql` | Writer canary/cutover — separate approval |

## Compatibility / safety properties

- Additive, retry-safe (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS`)
- Backward compatible: legacy `planner_tasks` authenticated writes remain
- No destructive DROP of user data
- Fixed `search_path = ''` on security-sensitive functions (Focus list RPC corrected in formal file)
- Precise grants; no broad `PUBLIC` execute on command RPC
- Owner from `auth.uid()` context (not spoofable payload owner)

## Checksums

See `docs/qa/kenos-production-wave1-final-approval-packet.md` §7 (bound to authoritative SHA).

## Rollback

1. Revoke execute on new RPCs; keep tables
2. Clients remain on legacy paths
3. Do not delete Task rows to “undo”
