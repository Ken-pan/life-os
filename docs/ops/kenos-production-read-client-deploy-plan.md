---
title: Kenos production read client deployment plan
owner: kenpan
last_verified: 2026-07-19
status: prepared-not-executed
---

# Read client vs writer deployment (separated approvals)

Do **not** use one broad phrase for read + write + cutover.

| Phase | Scope | Phrase | Writes production? |
| ----- | ----- | ------ | ------------------ |
| A | Preview / paused-build read-path canary (Today/Inbox/Focus/Work reads, flags opt-in) | `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY` | **No** |
| B | Broader production domain client publish while writers still legacy | `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` | **No** (reads only; Plan command / Approval decision / Focus·Work write remain Off) |
| C | Authenticated Plan command canary creating real Tasks | `APPROVE_KENOS_PRODUCTION_WRITER_CANARY` | **Yes** (scoped) |

## Flag matrix (default Off unless noted)

| Flag | Default | Effect |
| ---- | ------- | ------ |
| `VITE_KENOS_PROD_READ_APPROVALS` | On (set `0` to disable) | `kenos_list_action_approvals` |
| `VITE_KENOS_PROD_READ_FOCUS` | Off | `kenos_list_focus_contexts` + deferred/suggestions SELECT |
| `VITE_KENOS_PROD_READ_WORK` | Off | `kenos_list_work_projects` / proposals |
| `VITE_KENOS_PROD_READ_TODAY_OVERLAY` | Off | Today may show Kenos Work cards from production read |
| `VITE_KENOS_PROD_SHADOW` | Dev On / Prod Off unless `1` | Independent legacy vs Kenos shadow |

## Rollback / flag-disable

1. Set Focus/Work/Today overlay flags to Off (or omit).  
2. Keep Netlify `stop_builds=true` until Owner restores.  
3. Approvals remain readable; revoke RPC EXECUTE only if incident requires.  
4. Never delete Kenos tables to roll back reads.

## Non-goals for A/B

- No writer canary, cutover, `planner_tasks` revoke  
- No Portal switch, Executor, Apple distribution  
- No production seed
