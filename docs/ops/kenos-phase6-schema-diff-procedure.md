---
title: Kenos Phase 6 — Hosted schema diff procedure
owner: kenpan
last_verified: 2026-07-19
status: stage-a-procedure
---

# Hosted schema diff procedure

## Purpose

Compare repository Kenos **review** SQL + contracts against live hosted schema before any apply. Never auto-apply.

## Method

```bash
# Read-only via Management API (no secret printing)
./scripts/supabase-sql.sh "<sql>"
```

Checks:

1. `supabase_migrations.schema_migrations` tip vs expected Planner migrations
2. Presence/absence of `kenos_%` tables and functions
3. `planner_tasks` policies and RLS flag
4. Roles: `anon`, `authenticated`, `service_role`, `kenos_outbox_worker`
5. Grants on candidate RPCs (after staging apply only)
6. Advisors (security/performance) — post-apply in Wave 1, not Stage A apply

## Stage A result (2026-07-19, project `iueozzuctstwvzbcxcyh`)

| Expected from review package | Hosted today |
| --- | --- |
| `kenos_plan_action_idempotency` | **missing** |
| `kenos_plan_activity` | **missing** |
| `kenos_plan_outbox` | **missing** |
| `kenos_action_approvals` | **missing** |
| Work tables (`kenos_work_*` / review names) | **missing** |
| Focus tables (Wave 1A draft) | **missing** |
| `kenos_create_plan_task_action` | **missing** |
| `kenos_outbox_worker` | **missing** |
| `planner_tasks` direct write policies | **present** (`insert/update/delete/select_own`) |
| Latest remote migration version observed | `20260717220000` |

## Diff conclusion

Wave 1 is **fully additive** relative to hosted: introduce Kenos tables/functions/roles first; **revoke** authenticated direct Task writes only after RPC is live and clients proven.

## Do not

- Copy review SQL blindly into `migrations/` without owner Wave 1 approval
- Drop old Planner tables/columns in Wave 1
- Apply revoke before command RPC
