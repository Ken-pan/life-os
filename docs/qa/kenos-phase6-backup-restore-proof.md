---
title: Kenos Phase 6 — Backup / restore proof
owner: kenpan
last_verified: 2026-07-19
status: LOCAL_LOGICAL_RESTORE_VERIFIED
---

# Backup / restore proof

## Gate status

| Claim                            | Status                                             |
| -------------------------------- | -------------------------------------------------- |
| `LOCAL_LOGICAL_RESTORE_VERIFIED` | **YES** — disposable Docker restore + Wave 1 apply |
| `HOSTED_RESTORE_VERIFIED`        | **NO** — isolated hosted staging unavailable       |

Wave 1 production apply remains blocked until hosted restore/staging Red gates close (see FINAL approval packet).

## Production snapshot

| Field                | Value                         |
| -------------------- | ----------------------------- |
| Project              | `iueozzuctstwvzbcxcyh`        |
| Inventory time       | `2026-07-19T15:57:30.774617Z` |
| `planner_tasks`      | 1664                          |
| `planner_projects`   | 50                            |
| `life_events`        | 21                            |
| `planner_user_state` | 1                             |

## Drill executed (local logical)

1. Read-only `supabase db dump --linked` schema → `/tmp/kenos-wave1-restore-drill/prod-schema.sql`
2. Read-only filtered data dump → `prod-data-critical.sql`
3. Restore into disposable Docker DB `kenos_restore_drill` (not production)
4. Verify counts; sample task checksum `4b7321390c659606717421b7efe5b817`
5. Apply formal Wave 1 migrations; counts unchanged
6. Dual-user checks on separate disposable bootstrap DB via `scripts/kenos-wave1-local-verify.mjs`

| Metric             | Before Wave 1 | After Wave 1 |
| ------------------ | ------------- | ------------ |
| planner_tasks      | 1664          | 1664         |
| planner_projects   | 50            | 50           |
| life_events        | 21            | 21           |
| planner_user_state | 1             | 1            |

Restore duration (script window): ~965 ms.
RTO observation (local logical): sub-minute for critical tables on disposable host.
RPO observation: point-in-time of dump ≈ inventory timestamp; PITR Dashboard confirmation still required before production apply.

## Storage limitation

DB dump does **not** restore Storage object bytes. Bucket object counts recorded at inventory time (finance-purchase-images 619, home-scan-photos 777, music 269, music-covers 266, planner-attachments 0).

## Exact restore runbook (local)

```bash
# 1) dumps (read-only, linked to production — never restore back to production)
cd apps/finance
supabase db dump --linked -f /tmp/kenos-wave1-restore-drill/prod-schema.sql \
  --schema public,home,aios,music,fitness,storage,auth
supabase db dump --linked --data-only -f /tmp/kenos-wave1-restore-drill/prod-data-critical.sql -s public \
  -x public.finance_transactions # …additional -x excludes as needed

# 2) verify + restore drill
cd ../..
node scripts/kenos-wave1-local-verify.mjs
```

## Rollback artifacts

Formal migrations under `apps/finance/supabase/migrations/2026071913*.sql`.
Revoke remains review-only under `apps/planner/supabase/review/20260719100000_*`.
