---
title: Kenos Phase 6 — Backup / restore proof template
owner: kenpan
last_verified: 2026-07-19
status: stage-a-template-incomplete-drill
---

# Backup / restore proof template

## Gate

Wave 1 hosted apply is **blocked** until this checklist is filled with real evidence (not “Supabase has backups”).

## Required coverage

| Asset | Snapshot method | Checksum / count | Restore target | Restored OK? | Operator | Timestamp |
| --- | --- | --- | --- | --- | --- | --- |
| schema (public Kenos + planner critical) | `pg_dump --schema-only` or Management export | | disposable/staging | ☐ | | |
| `planner_tasks` | logical export / count 1664 @ Stage A | | disposable | ☐ | | |
| `planner_projects` | export / count 50 | | disposable | ☐ | | |
| `planner_user_state` | export / count 1 | | disposable | ☐ | | |
| `life_events` | export / count 21 | | disposable | ☐ | | |
| auth.users mapping (IDs only) | count + sample non-PII | | disposable | ☐ | | |
| PITR capability | dashboard confirmation | RPO/RTO noted | N/A | ☐ | | |

## Rollback artifacts (prepared in repo)

| Artifact | Path |
| --- | --- |
| Plan command review SQL | `apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql` |
| Privilege model | `…/20260719020000_kenos_plan_privilege_model.sql` |
| Approval | `…/20260719030000_kenos_action_approvals.sql` |
| Work | `…/20260719040000_kenos_work_domain.sql` |
| Revoke + commented restore policies | `…/20260719100000_kenos_revoke_planner_tasks_direct_write.sql` |
| Focus Wave 1A draft | `…/20260719110000_kenos_focus_context.sql` |
| Feature-flag rollback | Portal/Kenos Vite flags Off; Apple FakeExecutor remains |

## Stage A status

- [x] Inventory of critical tables + approximate counts recorded
- [ ] Disposable/staging **restore drill executed**
- [ ] PITR window documented
- [ ] Worker shutdown procedure dry-run
- [ ] DNS/host rollback N/A for Wave 1 schema

**Honesty:** restore drill is **not** claimed complete in Stage A.
