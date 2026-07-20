---
title: KENOS PLAN ARCHIVE-TASK WRITER
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_DEPLOYED
---

# Plan Archive-Task Writer

## Migration

| Item | Value |
| --- | --- |
| File | `apps/finance/supabase/migrations/20260720150000_kenos_plan_archive_task_command.sql` |
| Tip | `20260720150000` |
| Auth EXECUTE | true |
| Anon EXECUTE | false |

## RPC canary

PASS create → archive → idempotency → anon denied. Task `f78de805-e7f6-4d51-a146-82a9a9f09462` (already soft-deleted).

## Client

Flag `VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER=1`; `deleteTaskAsync` wired in TaskEditorSheet / QuickAddBar / TaskRow / triage.

## Production Owner-limited bake

| Item | Value |
| --- | --- |
| SHA | `48552f31c5111948f80035bdcf6c7402ec64e87b` |
| Prod deploy | `6a5dab2cde48f1eed103ae1c` |
| Rollback | `6a5da9e6a1d60958ea61475f` |

Full Track B Owner-limited bake: create + title + due + schedule + project + complete + reopen + archive.

## Continuity


Track B Plan writers Owner-limited nearly complete. Next after bake: Track C offline; Track D Approval/Activity/Outbox.
