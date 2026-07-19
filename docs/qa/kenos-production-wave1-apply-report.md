---
title: KENOS PRODUCTION WAVE 1 APPLY REPORT
owner: kenpan
last_verified: 2026-07-19
status: STOPPED_OR_ROLLED_BACK
---

# KENOS PRODUCTION WAVE 1 APPLY REPORT

**Status: `KENOS PRODUCTION WAVE 1 — STOPPED_OR_ROLLED_BACK`**

Gate: **`PRODUCTION_WAVE1_PREFLIGHT_MISMATCH`**

Phrase received: `APPROVE_KENOS_PRODUCTION_WAVE_1`  
**No production migration was applied.** Production project `iueozzuctstwvzbcxcyh` remains at tip `20260717220000` with **0** `kenos_*` objects.

Netlify client auto-builds remain **paused**; UIUX Gallery remains **disabled_manually**.

## Preflight matrix

| Check | Result |
| --- | --- |
| `origin/master` HEAD | `ea55998217924511c45fa4eeedb5101be15bdab6` |
| local == origin | **OK** |
| Baseline `197d69a09…` ancestor of origin | **OK** |
| `b49b209ee…` → `ea559982…` | **OK — docs-only** (3 commits: READY packet / HEAD refs / execution-state tip; files under `docs/qa`, `docs/roadmap`, `scripts/check-kenos-phase6.mjs` only) |
| Migration SHA256 vs approval packet | **OK** (all five match) |
| Push CI completed **and PASS** | **FAIL** |
| Netlify 7 sites `stop_builds=true` | **OK** |
| UIUX Gallery `disabled_manually` | **OK** |
| Production tip `20260717220000` | **OK** |
| Production `kenos_*` absent | **OK** (tables 0, funcs 0) |
| Counts tasks/projects/events | **OK** 1664 / 50 / 21; sample md5 `4b7321390c659606717421b7efe5b817` |
| Staging `prrytaemdsksblwmufei` evidence | **OK** (`kenos_focus_contexts` present; Wave 1 versions previously registered) |

## CI mismatch detail (blocking)

Required: “push 对应 CI 已完成且 PASS”.

| SHA | CI run | Conclusion |
| --- | --- | --- |
| `ea5599821792` (current tip) | [29697949848](https://github.com/Ken-pan/life-os/actions/runs/29697949848) | **failure** |
| `ed7a41c3a932` | 29697946235 | failure |
| `b49b209ee1ff` | 29697926530 | failure |
| `c4819e9d38a4` (first paused push) | 29697861403 | failure |

Observed failing jobs (not migration SQL; not modified to “fix CI” in this task):

1. **integration-smoke** — `check:lifeos-styles` on `apps/aios/src` (raw-font-size / raw-hex / reserved-ds-class above baseline).  
2. **planner-e2e-desktop** — calendar/schedule selectors and related e2e flakes/failures.

`build` job on the paused-push run **succeeded**; overall workflow still **failure**.

Per Owner preflight rules: **do not apply** when CI is not PASS; do not edit migrations to resolve mismatch.

## Production snapshot at stop (read-only)

| Field | Value |
| --- | --- |
| UTC | `2026-07-19T18:06:17.815153Z` |
| tip | `20260717220000` |
| planner_tasks | 1664 |
| planner_projects | 50 |
| life_events | 21 |
| sample md5 | `4b7321390c659606717421b7efe5b817` |
| kenos objects | 0 |

Backup/PITR confirmation was **not** completed because apply was aborted at preflight (CI). No DDL started → no rollback required.

## Applied migration history

**None.** Production `schema_migrations` tip unchanged.

## Netlify / client status (unchanged)

Still paused: planner, fitness, finance, music, portal, home, aios.  
UIUX Gallery disabled. No client deploy. No writer cutover.

Restore clients still requires: `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`

## Remaining Red / Yellow

### Red

1. **`PRODUCTION_WAVE1_PREFLIGHT_MISMATCH`** — CI not PASS on authoritative tip(s).  
2. Production Wave 1 **not applied**.

### Yellow

- Storage object restore limitation (unchanged).  
- Staging validation remains valid for when apply is re-attempted after CI green.

## Exact next steps for Owner

1. Fix or explicitly waive CI failures on `origin/master` tip (aios style budget + planner e2e), **without** changing Wave 1 migration checksums.  
2. Re-issue apply only after a tip where CI is **completed + PASS** (or Owner issues a new phrase that waives the CI PASS preflight).  
3. Then re-run: `APPROVE_KENOS_PRODUCTION_WAVE_1` (or a clarified re-approve phrase).

## Report fields (apply not executed)

1–3. HEAD / baseline / checksums — recorded above (OK).  
4–22. Apply/verify sections — **N/A** (stopped before apply).  
23. Next phrase: after CI green, re-approve with `APPROVE_KENOS_PRODUCTION_WAVE_1`.

**Stopped. No production schema change.**
