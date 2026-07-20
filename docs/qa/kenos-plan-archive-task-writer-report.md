---
title: KENOS PLAN ARCHIVE-TASK WRITER
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS_CLIENT_READY
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

## Continuity

Track B Plan writers Owner-limited nearly complete. Next after bake: Track C offline; Track D Approval/Activity/Outbox.
