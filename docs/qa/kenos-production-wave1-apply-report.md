---
title: KENOS PRODUCTION WAVE 1 APPLY REPORT
owner: kenpan
last_verified: 2026-07-19
status: APPLIED_AND_VERIFIED
---

# KENOS PRODUCTION WAVE 1 APPLY REPORT

**Status: `KENOS PRODUCTION WAVE 1 — APPLIED_AND_VERIFIED`**

Phrase: `APPROVE_KENOS_PRODUCTION_WAVE_1`
Project: `iueozzuctstwvzbcxcyh`
Apply window (UTC): `2026-07-19T19:18:55Z` → `2026-07-19T19:19:11Z` (~16s wall)

## 1. Authoritative frozen SHA

`bb9a0e283bfc0ae6179c277862de59f17cefc0ce`
local master == origin/master == frozen SHA.

## 2. CI run / result

[GitHub Actions run 29699072443](https://github.com/Ken-pan/life-os/actions/runs/29699072443) — **success**
Jobs: build, integration-smoke, planner-e2e-desktop, design-catalog, portal-qa-smoke, finance-ia-routes, music-qa-rec-behavior — all success.
No publishing/deploy workflow for this SHA.

## 3. Migration baseline / checksums

Baseline ancestor: `197d69a09dc04bd2f60e63be11ac0b0e3e8c3b19` — **OK**
Files unchanged after CI green (no dirty/diff under Wave 1 paths).

| File                                                      | sha256                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260719130100_kenos_wave1_plan_create_task_command.sql` | `b7cb2296e9bd426a089a0ff6ec9c1c627803151bba449ce74033bdf0beb37dac` |
| `20260719130200_kenos_wave1_plan_privilege_model.sql`     | `6d3e59c0401c74183b707b0c6057658f873aed3936e7ca4867b086792d4ec0c6` |
| `20260719130300_kenos_wave1_action_approvals.sql`         | `bc25f630238a5f5063a985c1001f4c07a89acfd9bae9aded52701ef3eafabbb9` |
| `20260719130400_kenos_wave1_focus_context.sql`            | `d90d64aa4ad12315171816e169ff26781e8ed8c89fa6d01907d08899137c5134` |
| `20260719130500_kenos_wave1_work_domain.sql`              | `ef334e64b96c10697aae7f13b76a971cfd4dca12c10cb3aaf4885eaa9f0b169d` |

## 4. Pre-apply snapshot

| Field                                           | Value                                      |
| ----------------------------------------------- | ------------------------------------------ |
| UTC                                             | `2026-07-19T19:18:28Z`                     |
| origin/master                                   | `bb9a0e283bfc0ae6179c277862de59f17cefc0ce` |
| tip                                             | `20260717220000`                           |
| planner_tasks                                   | 1664                                       |
| planner_projects                                | 50                                         |
| life_events                                     | 21                                         |
| sample md5 (first 50 task id+updated_at)        | `5668cc813af7ebbef8b49e019c1e02fa`         |
| kenos tables / functions                        | 0 / 0                                      |
| Netlify stop_builds                             | true (7 sites)                             |
| UIUX Gallery                                    | `disabled_manually`                        |
| Staging Wave 1 history (`prrytaemdsksblwmufei`) | five `2026071913*` versions present        |

## 5. Backup / PITR confirmation

| Field                             | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| `pitr_enabled`                    | false                                                                     |
| `walg_enabled`                    | true                                                                      |
| Latest physical backup            | `2026-07-19T09:18:40.516Z` — **COMPLETED** (~10h before apply)            |
| Completed physical backups listed | 8                                                                         |
| Decision                          | **BACKUP_CONFIRM OK** (physical WALG backups available; PITR not enabled) |

## 6. Exact apply path / commands

Canonical files under `apps/finance/supabase/migrations/` only.
Executed via Management API helper (no Dashboard paste, no review-dir SQL):

```bash
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql
# register version in supabase_migrations.schema_migrations
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql
# register
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql
# register
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql
# register
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql
# register
```

Per-file SQL already sets `lock_timeout` / `statement_timeout` where present.
Order: Plan command → Privilege → Approvals → Focus → Work.
Log: `/tmp/kenos-wave1-apply/apply.log`

## 7. Applied migration history

Only these five added after `20260717220000`:

| version          | name                                                  |
| ---------------- | ----------------------------------------------------- |
| `20260719130100` | `20260719130100_kenos_wave1_plan_create_task_command` |
| `20260719130200` | `20260719130200_kenos_wave1_plan_privilege_model`     |
| `20260719130300` | `20260719130300_kenos_wave1_action_approvals`         |
| `20260719130400` | `20260719130400_kenos_wave1_focus_context`            |
| `20260719130500` | `20260719130500_kenos_wave1_work_domain`              |

Production tip now: **`20260719130500`**.

## 8. Timestamps and duration

| Step               | UTC start | duration |
| ------------------ | --------- | -------- |
| 30100 Plan command | 19:18:55Z | ~2s      |
| 30200 Privilege    | 19:18:58Z | ~0s      |
| 30300 Approvals    | 19:19:01Z | ~1s      |
| 30400 Focus        | 19:19:03Z | ~1s      |
| 30500 Work         | 19:19:08Z | ~1s      |
| **Overall**        |           | **~16s** |

No lock-wait failures; API bodies empty success arrays; no ERROR in apply log.

## 9. Affected objects

**Tables (12):**
`kenos_plan_action_idempotency`, `kenos_plan_activity`, `kenos_plan_outbox`,
`kenos_action_approvals`,
`kenos_focus_contexts`, `kenos_deferred_items`, `kenos_proactive_suggestions`,
`kenos_work_projects`, `kenos_work_deliverables`, `kenos_work_meetings`, `kenos_work_decisions`, `kenos_work_action_proposals`

**Public RPCs:**
`kenos_create_plan_task_action`, `kenos_list_action_approvals`, `kenos_list_focus_contexts`, `kenos_list_work_projects`, `kenos_list_work_action_proposals`

**Private helpers:** store/transition functions under `private.*`
**Roles (nologin, noinherit, nobypassrls):** `kenos_outbox_worker`, `kenos_approval_writer`, `kenos_work_writer`

## 10–11. Row counts / sample checksum

| Metric           | Before                             | After                              |
| ---------------- | ---------------------------------- | ---------------------------------- |
| planner_tasks    | 1664                               | 1664                               |
| planner_projects | 50                                 | 50                                 |
| life_events      | 21                                 | 21                                 |
| sample md5       | `5668cc813af7ebbef8b49e019c1e02fa` | `5668cc813af7ebbef8b49e019c1e02fa` |

No production seed. No user-data rewrite/delete observed.

## 12. RLS verification

All 12 `kenos_*` tables: **RLS enabled**.
Policies are owner-scoped `SELECT` only (`auth.uid() = owner_id` / `user_id`).
No INSERT/UPDATE/DELETE policies for `authenticated`/`anon` on these tables.

## 13. Grants / owners / search_path

- Public list RPCs: `authenticated` EXECUTE only; `anon` denied.
- `kenos_create_plan_task_action`: `authenticated` EXECUTE; `anon` denied; **SECURITY DEFINER**; `search_path=""`.
- Private `kenos_*` functions: neither `anon` nor `authenticated` EXECUTE.
- Function owners: `postgres`.
- Public Kenos function `def_md5` **byte-identical to staging** `prrytaemdsksblwmufei`.
- `authenticated` INSERT on outbox/activity/approvals/work/idempotency/focus: **false**.
- `planner_tasks` policies unchanged (`planner_tasks_{select,insert,update,delete}_own` + `has_app_access('planner')`).

**Yellow (staging-parity residual):** Focus tables still carry default `TRUNCATE`/`TRIGGER`/`REFERENCES` for `anon`/`authenticated` (INSERT/UPDATE/DELETE revoked). Identical on staging; not an Advisor Kenos Security Red; do **not** hand-patch in this wave.

## 14. Anon / authenticated security smoke

| Check                                                                            | Result                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Anon REST RPC list/create                                                        | HTTP 401 `permission denied for function …`               |
| Anon REST `kenos_plan_outbox` / approvals / work                                 | HTTP 401 privilege denied                                 |
| Anon REST `kenos_focus_contexts` SELECT                                          | HTTP 200 `[]` (SELECT grant + RLS empty) — staging-parity |
| Authenticated list Approvals/Focus/Work/Proposals (JWT claim + `SET LOCAL ROLE`) | empty counts **0/0/0/0**, no error                        |
| No command RPC write smoke                                                       | deferred to writer canary                                 |

## 15. Advisor findings

**Security:** one Kenos WARN — authenticated EXECUTE on SECURITY DEFINER `kenos_create_plan_task_action` — **accepted** (definition/grants/`search_path` match staging approval packet).
No Kenos RLS-disabled / PUBLIC execute / mutable `search_path` / privilege-escalation Advisor Red.
Other Advisor WARNs are pre-existing non-Kenos (`paper_*`, finance/fitness triggers, auth leaked-password, music bucket).

**Performance:** Kenos items are INFO only (unused indexes on empty tables; some unindexed FKs). No Kenos Performance Red.

## 16. Incidents / warnings

None during apply. Sample md5 differs from older restore packet (`4b732139…`) because live `updated_at` drifted before apply; pre/post apply sample **stable**.

## 17. Rollback / disable readiness

Wave 1 additive path remains valid:

1. Clients stay on legacy Task writers (policies not revoked).
2. Stop calling `kenos_create_plan_task_action` / feature-flag off.
3. `revoke execute on function public.kenos_create_plan_task_action(jsonb) from authenticated;`
4. Leave tables in place (prefer no DROP).
5. Workers remain nologin; no production worker process.

## 18. Netlify / UIUX pause confirmation (post-apply)

All seven sites still `stop_builds=true`: planner, fitness, finance, music, portal, home, aios.
UIUX Gallery: `disabled_manually`.
No client deploy performed.

## 19. Current writer status

Legacy `planner_tasks` authenticated write policies **intact**.
Kenos writers/workers: **nologin**, not cut over.
Command RPC exists but **not** canary-exercised for real Task writes.

## 20. Current client status

Production clients **not** switched to Kenos read-path. Auto-builds **paused**. Portal switch **not** done. Executor **not** enabled.

## 21. Remaining Red / Yellow gates

| Gate                                         | Level                       |
| -------------------------------------------- | --------------------------- |
| Client read-path integration                 | Yellow / next phase         |
| Writer canary (real Task write)              | Yellow / gated              |
| Writer cutover / planner_tasks revoke        | Red until separate approval |
| Portal switch / Executor / Netlify restore   | Red until separate approval |
| Focus table TRUNCATE default grants          | Yellow (staging parity)     |
| Performance INFO unused indexes / FK indexes | Yellow INFO                 |

## 22. Readiness for production read-path integration

**Ready for Owner-gated read-path work** (list RPCs + empty projections verified).
Still requires explicit client wiring approval — **not** `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY` unless Owner sends it.

## 23. Readiness for writer canary

**Schema/RPC ready.** Real Task creation via `kenos_create_plan_task_action` awaits:

`APPROVE_KENOS_PRODUCTION_WRITER_CANARY`

## 24. Exact next recommended phase

1. Optional: production read-path integration against list RPCs (clients still paused).
2. Then: **`APPROVE_KENOS_PRODUCTION_WRITER_CANARY`**.
3. Later (separate phrases): writer cutover, Portal switch, `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`, Netlify/UIUX restore.

---

**Stopped.** No automatic client deploy, writer canary, cutover, Portal switch, or Netlify/UIUX restoration.
