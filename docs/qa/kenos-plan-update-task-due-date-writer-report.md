---
title: KENOS PLAN UPDATE-TASK-DUE-DATE WRITER
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS_CLIENT_READY
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

## Continuity

Next after Owner-limited production bake: Plan scheduling writer (scheduledDate / start / duration), then project-relation.
