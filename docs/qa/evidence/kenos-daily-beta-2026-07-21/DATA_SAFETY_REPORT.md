# DATA_SAFETY_REPORT

## Pre-release snapshot

- Note: `~/.kenos-daily-beta/snapshots/snap-20260721T015321Z/`
- Contents: release meta pointer + README (no tokens / no email dumps)

## Write ownership

- Unchanged: one object → one long-term Writer
- No new dual-write paths
- Continuity descriptor schema frozen
- Auth / RLS unchanged; smoke used existing owner accounts via magic-link (ops machine only)

## Rollback

- Releases retained under `~/.kenos-daily-beta/releases/<shortSha>/`
- `kenos-rollback` swaps `current` ↔ `previous` without deleting build trees
- Cloud Planner/Fitness rows not deleted by rollback
- Rehearsal executed in smoke FLOW8 — **PASS**

## Failure containment

- FLOW5: Fitness process killed → Kenos Today still loaded
- Continue failures fall back via existing product empty/expired copy (Knife 6)
- Static server logs do not print auth tokens

## Residual risk (accepted for Personal Beta)

- Shared Supabase project (same as production apps) — A is local shell/release, not a separate DB
- Domains outside Plan/Training may still deep-link to production origins
