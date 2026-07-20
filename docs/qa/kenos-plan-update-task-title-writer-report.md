---
title: KENOS PLAN UPDATE-TASK-TITLE WRITER — MIGRATION + RPC CANARY
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_DEPLOYED
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
- Host/core modules + TaskEditorSheet title routing

## Production Owner-limited bake (create + edit)

| Item | Value |
| --- | --- |
| SHA | `082d0878843ed92dba24955f0e4cfb8f54b705b0` |
| Deploy | `6a5da4193cdc6237e224c868` |
| URL | https://planner.kenos.space |
| Rollback | `6a5da2eaedadacd1b63ad3e5` / `6a5d7bd5b9334b8e0f03a902` |

## Continuity

Create writer remains Owner-limited. Edit title writer Owner-limited live.
Next: Plan due-date / scheduling writer.
