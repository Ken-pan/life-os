---
title: KENOS PLAN UPDATE-TASK-TITLE WRITER — MIGRATION + RPC CANARY
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS_CLIENT_WIRING_IN_PROGRESS
---

# Plan Update-Task-Title Writer

## Migration

| Item | Value |
| --- | --- |
| File | `apps/finance/supabase/migrations/20260720100000_kenos_plan_update_task_title_command.sql` |
| Tip | `20260720100000` |
| Backup | `/tmp/kenos-edit-writer-backup-20260720T042554Z` schema sha `7ba05ac3…` |
| Auth EXECUTE | true |
| Anon EXECUTE | false |

## RPC canary (Owner authenticated)

| Step | Result |
| --- | --- |
| Create seed via `kenos_create_plan_task_action` | PASS |
| Edit title via `kenos_update_plan_task_title_action` | PASS |
| Idempotency retry | PASS `duplicate=true` |
| Tombstone cleanup | PASS |

Task id (tombstoned): `e63020cd-99ff-47d9-b773-c7470c2e5284`

## Client

- Guard denylist includes new RPC
- Flag: `VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER=1` (+ prod writes + Owner email cohort)
- Host/core modules added; UI `updateTask` routing next

## Continuity

Create writer remains Owner-limited on production Planner deploy `6a5da2ea…`.
