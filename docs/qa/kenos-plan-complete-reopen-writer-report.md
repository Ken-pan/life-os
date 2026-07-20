---
title: KENOS PLAN COMPLETE / REOPEN WRITERS
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_DEPLOYED
---

# Plan Complete / Reopen Writers

## Migration

| Item | Value |
| --- | --- |
| File | `apps/finance/supabase/migrations/20260720140000_kenos_plan_complete_reopen_task_commands.sql` |
| Tip | `20260720140000` |
| Auth EXECUTE | true |
| Anon EXECUTE | false |

## RPC canary

| Step | Result |
| --- | --- |
| Create seed | PASS |
| Complete + idempotency | PASS |
| Reopen + idempotency | PASS |
| Anon denied | PASS |
| Tombstone | PASS |

Task (tombstoned): `3e063fbb-7099-457d-bb40-9f5d89656025`

## Client

Flags: `VITE_KENOS_PLAN_COMPLETE_TASK_WRITER=1`, `VITE_KENOS_PLAN_REOPEN_TASK_WRITER=1`
Entry: `toggleCompleteAsync` via `taskUi.completeTask` / triage.

## Production Owner-limited bake

| Item | Value |
| --- | --- |
| SHA | `2e73dab0888b2d46f656fecde87b69778f379fde` |
| Prod deploy | `6a5da9e6a1d60958ea61475f` |
| Rollback | `6a5da8be98d354ec82096b28` |

Bake: create + title + due + schedule + project + complete + reopen; Owner cohort.

## Continuity


Next: Owner-limited bake; then archive/delete writer.
