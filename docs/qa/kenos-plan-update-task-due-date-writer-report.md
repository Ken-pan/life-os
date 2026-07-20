---
title: KENOS PLAN UPDATE-TASK-DUE-DATE WRITER
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_DEPLOYED
---

# Plan Update-Task-Due-Date Writer

## Migration

| Item | Value |
| --- | --- |
| File | `apps/finance/supabase/migrations/20260720110000_kenos_plan_update_task_due_date_command.sql` |
| Tip | `20260720110000` |
| Backup dir | `/tmp/kenos-due-writer-backup-20260720T043101Z` |
| Auth EXECUTE | true |
| Anon EXECUTE | false |

## RPC canary (Owner authenticated)

| Step | Result |
| --- | --- |
| Create seed via `kenos_create_plan_task_action` | PASS |
| Due-date via `kenos_update_plan_task_due_date_action` | PASS `dueDate=2026-07-25` |
| Idempotency retry | PASS `duplicate=true` |
| Anon RPC | PASS denied |
| Tombstone cleanup | PASS |

Task id (tombstoned): `ea0b1b72-c100-4eb4-9c02-367adfe53ced`

## Client

- Guard denylist includes `kenos_update_plan_task_due_date_action`
- Flag: `VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER=1` (+ `VITE_KENOS_PROD_WRITES=1` + Owner email cohort)
- Modules: `planUpdateTaskDueDateWriter.core.js` / `.host.js`
- UI: TaskEditorSheet routes dueDate through `updateTaskDueDateAsync`


## Production Owner-limited bake (create + title + due)

| Item | Value |
| --- | --- |
| SHA | `72409a56bdc8a35cdb2f7915898f06ec41ecf28d` |
| Prod deploy | `6a5da59abaef82dd7d107618` |
| Writer canary deploy | `6a5da5b2196bfd3af9751ed7` |
| URL | https://planner.kenos.space |
| Rollback | `6a5da4193cdc6237e224c868` / `6a5da2eaedadacd1b63ad3e5` |
| Seven sites stop_builds | true (unchanged except Planner deploy tip) |

Bake flags: PROD_WRITES + CREATE + UPDATE_TITLE + UPDATE_DUE_DATE + Owner email cohort.

## Owner UI canary (production)

| Step | Result |
| --- | --- |
| Login Owner | PASS |
| Quick-add create via Kenos | PASS task `c8212268-d8e1-4cd5-872d-7515b126fb9b` |
| Editor due → `2026-07-28` via Kenos | PASS `plan.update_task_due_date` |
| Tombstone | PASS |

Note: first due-only save also emitted an unchanged-title title write; client now skips unchanged title/due writers.

## Continuity

Next: Plan scheduling writer Owner-limited bake, then project-relation.
