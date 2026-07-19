---
title: Kenos Phase 6 — Wave 1 migration package index
owner: kenpan
last_verified: 2026-07-19
status: stage-a-package-not-applied
---

# Wave 1 migration package index

**Status:** prepared artifacts only. Apply requires `APPROVE_KENOS_PRODUCTION_WAVE_1`.

All files live under `apps/planner/supabase/review/` (outside auto `migrations/`).

## Apply order (proposed)

### Wave 1A — Platform records (additive)

| Order | File | Objects |
| --- | --- | --- |
| 1 | `20260719010000_kenos_plan_create_task_command.sql` | idempotency, Activity, Outbox, `kenos_create_plan_task_action` |
| 2 | `20260719020000_kenos_plan_privilege_model.sql` | worker role / transition helpers |
| 3 | `20260719030000_kenos_action_approvals.sql` | Approval read model (+ writer role stub) |
| 4 | `20260719110000_kenos_focus_context.sql` | FocusContext, DeferredItem, ProactiveSuggestion, list RPC |

### Wave 1B — Work domain (additive, parallel-reviewable)

| Order | File | Objects |
| --- | --- | --- |
| 5 | `20260719040000_kenos_work_domain.sql` | Work Project/Deliverable/Meeting/Decision/Proposal |

### Wave 1C — Read RPCs / verification

- Existing list/read RPCs inside the above files
- Hosted advisors (security + performance)
- Dual-user isolation tests (`docs/qa/kenos-phase6-dual-user-hosted-plan.md`)
- Post-apply checksums: table exists, RLS on, anon denied, authenticated select own only

### Wave 1D — **NOT in Wave 1 apply** (separate approval)

| File | Gate |
| --- | --- |
| `20260719100000_kenos_revoke_planner_tasks_direct_write.sql` | Requires `APPROVE_KENOS_PRODUCTION_WRITER_CANARY` / cutover — **after** RPC live |

## Compatibility

- Old Planner clients keep working while direct-write policies remain
- Kenos tables additive; no drops
- Focus mutations not opened to authenticated clients in 1A (select + list only)

## Rollback

1. Feature flags / clients remain on legacy paths
2. Drop new Kenos objects only if empty and owner-approved (prefer leave additive tables)
3. Revoke SQL includes commented policy restore for emergency
4. Do **not** delete user Task rows to “undo”

## Verification SQL (post-apply sketch)

```sql
select to_regclass('public.kenos_plan_action_idempotency') is not null as has_idempotency;
select to_regclass('public.kenos_focus_contexts') is not null as has_focus;
select count(*) = 0 from pg_proc where proname = 'kenos_create_plan_task_action' and prosecdef = false;
-- adjust: expect SECURITY DEFINER where designed
```
