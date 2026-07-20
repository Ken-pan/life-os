---
title: KENOS PLAN UPDATE-TASK-PROJECT WRITER
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_DEPLOYED
---

# Plan Update-Task-Project Writer

## Migration

| Item | Value |
| --- | --- |
| File | `apps/finance/supabase/migrations/20260720130000_kenos_plan_update_task_project_command.sql` |
| Tip | `20260720130000` |
| Auth EXECUTE | true |
| Anon EXECUTE | false |

## RPC canary

| Step | Result |
| --- | --- |
| Create seed | PASS |
| Set projectId | PASS |
| Idempotency | PASS |
| Anon denied | PASS |
| Tombstone | PASS |

Task (tombstoned): `a29faab6-5baf-40fa-803d-b56f51ccbb65`

## Client

Flag `VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER=1` + TaskEditorSheet change-detected routing.

## Production Owner-limited bake

| Item | Value |
| --- | --- |
| SHA | `3248cacc8aeffddc32771d1d6c38319c3828cb3c` |
| Prod deploy | `6a5da8be98d354ec82096b28` |
| Rollback | `6a5da75720758f2b349bea6c` |

Bake: create + title + due + schedule + project; Owner cohort.

## Continuity


Next: Owner-limited bake; then complete / reopen / archive-delete writers.
