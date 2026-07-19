---
title: KENOS PRODUCTION WAVE 1 FINAL APPROVAL PACKET
owner: kenpan
last_verified: 2026-07-19
status: WAVE_1_APPROVAL_BLOCKED
---

# KENOS PRODUCTION WAVE 1 FINAL APPROVAL PACKET

**Final status: `WAVE_1_APPROVAL_BLOCKED`**

Hard blockers remain (see §25). Do **not** issue `APPROVE_KENOS_PRODUCTION_WAVE_1` until every Red gate below is closed.

No production apply, writer/Portal cutover, deploy, or push was performed by this task.

## 1. Unique authoritative commit SHA

`197d69a09dc04bd2f60e63be11ac0b0e3e8c3b19`

This SHA is the unique approval baseline: it contains the formal Wave 1 migrations, checksums, FINAL packet, and local verify script. Subsequent tip-sync commits may update Execution State HEAD pointers only. **Sole approval baseline for production apply / checksum binding = this SHA** (not Stage A `e13e24566…` / `4f17d7b97…`, and not later docs tip commits).

**Git fact reconciliation (pre-tip):**

| SHA | Role |
| --- | --- |
| `4f17d7b978eae72155ead4c40eee6826bf192414` | Previous local HEAD (Stage A tip-sync) — **ancestor of this work** |
| `e13e245665ca7a6713bbd51bcf5670ee4630026a` | Stage A content pin — **ancestor of** `4f17d7b97…` |
| Relationship | `e13e24566` → `4f17d7b97` (docs tip sync only). Not contradictory tips; linear history. |

Approval baseline for Wave 1 migrations = the single tip SHA above (not either Stage A SHA alone).

## 2. origin/master status

Local `master` is **ahead of** `origin/master` (Stage A + Phase 5/4b/Nav + this Wave 1 formalization).

Marker: `PRODUCTION_APPLY_BLOCKED_UNTIL_AUTHORITATIVE_COMMIT_PUSHED`

## 3. Exact commits pending push

See `git log --oneline origin/master..master` at approve time. Stage A lineage included:

- `71b4d4038` Stage A approval packet
- `e13e24566` Stage A tip pin
- `4f17d7b97` Stage A tip sync
- Plus prior Phase 5 / Nav / Phase 4b commits already ahead of origin
- Plus this Wave 1 formalization + tip-sync commits

Unrelated dirty WIP must remain unstaged and **must not** be pushed with Wave 1.

## 4. Production read-only inventory timestamp

`2026-07-19T15:57:30.774617Z` (UTC) via `./scripts/supabase-sql.sh` on `iueozzuctstwvzbcxcyh`

Counts: `planner_tasks=1664`, `planner_projects=50`, `life_events=21`, `planner_user_state=1`.
`kenos_*` tables/functions: **0**.

## 5. Remote migration tip

**Confirmed:** `20260717220000` (still accurate).

Remote version/name skew (repo filename ≠ registered version; **no repair** without Decision Packet):

| Remote version | Remote name | Repo note |
| --- | --- | --- |
| `20260717204030` | `purchase_review_rpc_revoke_anon` | Repo file `20260717210000_*` |
| `20260717205329` | `home_storage_snapshots` | Repo also has `20260717220000_home_storage_snapshots` |
| `20260717210914` | `planner_attachments_table` | Repo `apps/planner/.../20260709232245_*` |
| `20260717220000` | (null/empty statements) | Tip marker |

Repo-not-on-remote (finance chain): `20260717210000`, `20260717230000`, Wave 1 `20260719130100`–`19130500`.

## 6. Formal migration filenames (apply source)

Canonical directory: `apps/finance/supabase/migrations/`

1. `20260719130100_kenos_wave1_plan_create_task_command.sql`
2. `20260719130200_kenos_wave1_plan_privilege_model.sql`
3. `20260719130300_kenos_wave1_action_approvals.sql`
4. `20260719130400_kenos_wave1_focus_context.sql`
5. `20260719130500_kenos_wave1_work_domain.sql`

Review evidence retained under `apps/planner/supabase/review/` (not apply source).
**Revoke** `20260719100000_kenos_revoke_planner_tasks_direct_write.sql` remains review-only / **out of Wave 1**.

## 7. Migration checksums (SHA-256 of formal files)

| File | sha256 |
| --- | --- |
| `…19130100…plan_create_task_command.sql` | `b7cb2296e9bd426a089a0ff6ec9c1c627803151bba449ce74033bdf0beb37dac` |
| `…19130200…plan_privilege_model.sql` | `6d3e59c0401c74183b707b0c6057658f873aed3936e7ca4867b086792d4ec0c6` |
| `…19130300…action_approvals.sql` | `bc25f630238a5f5063a985c1001f4c07a89acfd9bae9aded52701ef3eafabbb9` |
| `…19130400…focus_context.sql` | `d90d64aa4ad12315171816e169ff26781e8ed8c89fa6d01907d08899137c5134` |
| `…19130500…work_domain.sql` | `ef334e64b96c10697aae7f13b76a971cfd4dca12c10cb3aaf4885eaa9f0b169d` |

Checksums must be re-verified against the authoritative SHA tree before apply.

## 8. Schema diff

Additive only vs production inventory: new `kenos_*` tables/RPCs/roles; **no** drops; **no** `planner_tasks_*_own` policy revoke. Procedure: `docs/ops/kenos-phase6-schema-diff-procedure.md`.

## 9. Local reset result

| Check | Result |
| --- | --- |
| `apps/finance` `supabase db reset` | **PASS** — all migrations including Wave 1 applied; tip `20260719130500` |
| Duplicate version fix | Renamed local `20260714120000_finance_purchase_images_public.sql` → `20260714120100_*` (remote already registered only `finance_account_payment_day` at `20260714120000`) |
| Disposable verify script | `node scripts/kenos-wave1-local-verify.mjs` → `LOCAL_WAVE1_SQL_AND_RESTORE_PASS` |
| Dual-user / anon / legacy writer | **PASS** (disposable) |

## 10. Restore drill evidence

Status: **`LOCAL_LOGICAL_RESTORE_VERIFIED`** (not `HOSTED_RESTORE_VERIFIED`)

| Field | Value |
| --- | --- |
| Backup timestamp | Schema dump ~2026-07-19T15:57Z; data dump immediately after; inventory SQL `15:57:30Z` |
| Restore target | Disposable Docker DB `kenos_restore_drill` (Supabase Postgres 17 image) |
| Restore duration | ~965 ms apply window inside verify script (schema+data+Wave 1) |
| Row counts before/after Wave 1 | tasks 1664/1664, projects 50/50, life_events 21/21, user_state 1/1 |
| Sample checksum | `md5` of first 25 task id:user pairs = `4b7321390c659606717421b7efe5b817` |
| Report artifact | `/tmp/kenos-wave1-restore-drill/local-verify-report.json` (local only; not committed) |

## 11. Storage backup limitation

Logical DB dump **does not** restore Storage object bytes. Production bucket object counts (read-only): finance-purchase-images 619; home-scan-photos 777; music 269; music-covers 266; planner-attachments 0; aios-images 0; bug-attachments 0. Wave 1 does not depend on Storage object restore for schema apply, but RPO for attachments/media remains a **Yellow** ops gap until object-level backup drill exists.

## 12. Hosted staging project

**UNAVAILABLE.** `dsiloxzjnsvjnhbruibl` (Life OS Staging 2) removed. Accessible projects: production `iueozzuctstwvzbcxcyh` (ACTIVE), unrelated inactive `bxqpeujefreznoohclot`. **No isolated hosted staging apply performed.**

## 13. Hosted staging apply result

`NOT_RUN` — blocked by §12.

## 14. Dual-user / RLS result

| Environment | Result |
| --- | --- |
| Disposable local | **PASS** (A/B Focus+Approval isolation; activity/focus direct-write denied; anon RPC denied; legacy `planner_tasks` write retained) |
| Hosted staging | **NOT_RUN** |

## 15. Function owners / grants

Local verify (disposable): Wave 1 functions owned by `supabase_admin`; command RPC `SECURITY DEFINER`; `PUBLIC` execute grant count on `kenos_create_plan_task_action` = 0; authenticated execute granted; worker role `kenos_outbox_worker` nologin/noinherit/nobypassrls.

## 16. Advisor results

Hosted staging Advisors: **NOT_RUN** (no staging). Production Advisors not used as Wave 1 post-apply substitute.

## 17. CI / deployment workflow

Prepared: `docs/ops/kenos-phase6-production-deployment-workflow.md`
Preferred: GitHub environment protection + manual approval + single migration job. **Workflow file not enabled** until blockers clear.

## 18. Production backup confirmation procedure

Before any apply:

1. Confirm PITR / daily backup window in Supabase Dashboard (screenshot/note timestamp).
2. Re-run read-only inventory counts + migration tip.
3. Retain logical schema dump path/operator note.
4. Set CI var / checklist `KENOS_WAVE1_BACKUP_CONFIRMATION`.
5. Only then run apply job on authoritative SHA.

## 19. Exact Wave 1 scope

- Additive Plan command objects + `kenos_create_plan_task_action`
- Privilege foundation (`kenos_outbox_worker` + transition helper)
- Approval persistence/read
- Focus persistence/read
- Work persistence/read
- Hosted read foundation (list RPCs)

## 20. Explicit exclusions

- `planner_tasks` direct-write revoke
- `complete_task` cutover
- Writer canary / writer cutover
- Executor production enable
- Portal default switch
- Apple distribution
- Connector external write
- Legacy deletion
- Production seed data

## 21. Rollback / disable commands

```sql
revoke execute on function public.kenos_create_plan_task_action(jsonb) from authenticated;
revoke execute on function public.kenos_list_focus_contexts() from authenticated;
revoke execute on function public.kenos_list_action_approvals(integer, timestamptz) from authenticated;
-- Prefer leave tables; do not DROP with user rows without separate approval.
```

Clients stay on legacy Task writers (Wave 1 does not revoke).

## 22. Blast radius

New empty Kenos tables + RPCs on shared Life OS DB. No Task policy change. Failure mode: RPC errors for new callers; legacy Planner continues.

## 23. Downtime expectation

Near-zero (additive DDL). Brief lock_timeout 5s / statement_timeout 30s on Focus migration.

## 24. User-visible impact

None by default until clients call new RPCs. No Portal/IA change in Wave 1 apply.

## 25. Unresolved Yellow / Red gates

### Red (block `APPROVE_KENOS_PRODUCTION_WAVE_1`)

1. **Authoritative commit not on `origin/master`** → `PRODUCTION_APPLY_BLOCKED_UNTIL_AUTHORITATIVE_COMMIT_PUSHED`
2. **No isolated hosted staging** → cannot complete hosted apply / dual-user / Advisors
3. **Hosted restore not verified** → only `LOCAL_LOGICAL_RESTORE_VERIFIED`

### Yellow

1. Storage object-level restore not drilled
2. Remote migration version/name skew vs repo (document-only; no repair)
3. CI migration workflow prepared but not wired/enabled
4. Unrelated local WIP dirty (must not ship with Wave 1)
5. Full `verify-kenos-refactor` / phase3 may fail on pre-existing Work UI “conversion flag Off” assertion unrelated to Wave 1 SQL (not modified in this packet)

## 26. Exact production apply commands

See `docs/ops/kenos-phase6-production-deployment-workflow.md`. **Do not run** until Red gates closed and Owner phrase received.

## 27. Exact approval phrase

When all Red gates closed:

`APPROVE_KENOS_PRODUCTION_WAVE_1`

Until then, status remains:

`WAVE_1_APPROVAL_BLOCKED`
