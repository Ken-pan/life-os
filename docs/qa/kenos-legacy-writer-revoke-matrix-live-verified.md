---
title: KENOS LEGACY WRITER REVOKE MATRIX — LIVE_VERIFIED
owner: kenpan
last_verified: 2026-07-20
status: LIVE_VERIFIED — NO_REVOKE_YET
---

# Legacy Writer revoke readiness (live)

Inventory was COMPLETE earlier; this matrix is the live gate. **Revoke nothing yet.**

| Operation | New Writer verified | Owner cohort | All active clients switched | Rollback | Revoke readiness |
| --- | --- | --- | --- | --- | --- |
| schedule | PRODUCTION_VERIFIED | Yes | Web Owner path yes; offline queue Off; Apple read-only | Flag unset + prior deploy | **NOT_READY** — keep Legacy for non-cohort / offline / old clients |
| complete (MCP) | PRODUCTION_VERIFIED | Yes (MCP→Kenos) | MCP host switched; UI complete cohort | Flag / functions rollback | **NOT_READY** — UI non-cohort + sync upsert remain |
| project | Owner writer live | Yes | Cohort only | Flag unset | **NOT_READY** |
| create | Owner writer live | Yes | Cohort only; offline Off | Flag unset | **NOT_READY** |
| complete/reopen (UI) | Owner writer live | Yes | Cohort only | Flag unset | **NOT_READY** |
| archive/delete | Owner writer live | Yes | restore still Legacy | Flag unset | **NOT_READY** |

## Priority when ready (one at a time)

1. schedule旁路 → 2. MCP complete旁路 → 3. project → 4. create → 5. complete/reopen → 6. archive/delete

Each revoke: route disable → smoke → observation → grant revoke → keep rollback → record last legacy write.

## Explicit

- No Legacy path disabled this round
- No RLS/DML revoke SQL
- `ACTIVE_COMPATIBILITY_DEPENDENCY` remains for non-Owner clients + sync upsert
