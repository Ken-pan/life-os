---
title: KENOS PLAN UPDATE-TASK-PROJECT WRITER
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS_CLIENT_READY
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

## Continuity

Next: Owner-limited bake; then complete / reopen / archive-delete writers.
