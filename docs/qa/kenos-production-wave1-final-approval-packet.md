---
title: KENOS PRODUCTION WAVE 1 FINAL APPROVAL PACKET
owner: kenpan
last_verified: 2026-07-19
status: WAVE_1_APPROVAL_BLOCKED
---

# KENOS PRODUCTION WAVE 1 FINAL APPROVAL PACKET

**Final status: `WAVE_1_APPROVAL_BLOCKED`**

Authorized task phrase received: `APPROVE_KENOS_AUTHORITATIVE_PUSH_AND_HOSTED_STAGING_VALIDATION`.

**Not performed:** production migration apply, writer canary/cutover, Portal switch, production Executor, legacy retirement, Apple distribution, production client deploy, or `git push` (blocked — see §4 / §24).

## 1. Authoritative origin/master HEAD

**Not updated.** `origin/master` still lacks the Wave 1 baseline.

Marker remains: `PRODUCTION_APPLY_BLOCKED_UNTIL_AUTHORITATIVE_COMMIT_PUSHED`

Local tip at audit time: `0c6b79a0a106a4fc241276cdb5f40afe9172e308`

## 2. Migration checksum baseline

`197d69a09dc04bd2f60e63be11ac0b0e3e8c3b19` (ancestor of local HEAD; migrations unchanged through docs tip)

| File | sha256 |
| --- | --- |
| `20260719130100_kenos_wave1_plan_create_task_command.sql` | `b7cb2296e9bd426a089a0ff6ec9c1c627803151bba449ce74033bdf0beb37dac` |
| `20260719130200_kenos_wave1_plan_privilege_model.sql` | `6d3e59c0401c74183b707b0c6057658f873aed3936e7ca4867b086792d4ec0c6` |
| `20260719130300_kenos_wave1_action_approvals.sql` | `bc25f630238a5f5063a985c1001f4c07a89acfd9bae9aded52701ef3eafabbb9` |
| `20260719130400_kenos_wave1_focus_context.sql` | `d90d64aa4ad12315171816e169ff26781e8ed8c89fa6d01907d08899137c5134` |
| `20260719130500_kenos_wave1_work_domain.sql` | `ef334e64b96c10697aae7f13b76a971cfd4dca12c10cb3aaf4885eaa9f0b169d` |

## 3. Pushed commits

**None.** Push aborted before upload.

## 4. Commit scope audit (`origin/master..master`, 42 commits)

| Class | Count |
| --- | --- |
| `APPROVED_KENOS` | 17 |
| `DOCS_TIP_FOR_APPROVED_KENOS` | 25 |
| `UNRELATED_BUT_ALREADY_APPROVED` | 0 |
| `UNAUTHORIZED_OR_UNRELATED` | 0 |

Scope audit **passed** (no Finance UI / UI gallery / usage-audit / wikilinks commits).

### Push side-effect gate (blocking)

Status: **`PUSH_HAS_UNAPPROVED_PRODUCTION_SIDE_EFFECT`**

Pushing this range would auto-trigger production Netlify Git builds because the diff includes:

- `packages/contracts/**` → rebuilds every app whose ignore watch includes contracts (planner, fitness, finance, music, portal, home, aios)
- `apps/aios/**`, `apps/planner/**` (MCP/server), `apps/finance/supabase/migrations/**`
- UIUX Gallery workflow `on.push` paths `apps/**` + `packages/**`

No GitHub Action applies DB migrations on push (CI only / `deploy-netlify.yml` is `workflow_dispatch`). The Netlify client redeploy is still an unapproved production side effect under this task’s exclusions.

**Safe options (owner choose one):**

1. Explicit override phrase authorizing Kenos push **with** Netlify client redeploy of affected sites.
2. Split / path-filter strategy (separate Owner decision; this task will not reset/rebase/cherry-pick).
3. Temporarily disable Netlify auto-builds (Owner ops) then push.

## 5. Dirty WIP confirmation

Uncommitted dirty WIP **left untouched** (Finance CSS/components, Planner TaskEditorSheet, UI gallery, roadmap/usage-audit docs, platform-web wikilinks, etc.). Not staged. Not pushed.

## 6. Staging project

| Field | Value |
| --- | --- |
| Name | `kenos-wave1-staging-202607` |
| Ref | `prrytaemdsksblwmufei` |
| Region | `us-east-2` |
| Created | `2026-07-19T17:30:40.672893Z` |
| Size | `micro` (paid-plan minimum) |
| CLI | Supabase CLI `2.109.0` |
| DB | Postgres 17.x (hosted) |
| Secrets | local only: `~/.config/life-os/kenos-wave1-staging-202607.env` (mode 600; **not in repo**) |
| Retention | delete after Wave 1 production apply or within ~30 days |
| Isolation | separate from production `iueozzuctstwvzbcxcyh`; no prod domains / APNs / OAuth / connectors |

## 7. Hosted restore evidence

Status: **`HOSTED_RESTORE_VERIFIED`** (logical dump → new staging; not empty-schema-only). Prior local drill remains **`LOCAL_LOGICAL_RESTORE_VERIFIED`**.

- Production remained read-only.
- Method: `supabase db dump --linked` from production; `psql` restore via staging pooler as `postgres`.
- Auth/storage managed-schema statements returned many `permission denied` errors (expected on hosted); **public critical tables + row data restored**.
- After restore, `planner_tasks` had RLS enabled but **zero policies** (dump gap). Staging validation recreated production-shaped `*_own` policies before legacy-write proof (staging-only; production untouched).

## 8. Restore duration / RTO / RPO

| Metric | Value |
| --- | --- |
| Schema restore | ~122 s |
| Data restore | ~3 s |
| Total restore window | ~125 s |
| RTO (observed, critical tables) | ~2 minutes to usable counts on staging |
| RPO | dump timestamp ≈ inventory `2026-07-19T17:34:23.19736Z` |

## 9. Row counts and checksum evidence

Production snapshot (`iueozzuctstwvzbcxcyh`, read-only):

| Metric | Value |
| --- | --- |
| planner_tasks | 1664 |
| planner_projects | 50 |
| life_events | 21 |
| planner_user_state | 1 |
| migration tip | `20260717220000` |
| sample task md5 (first 25 id:user) | `4b7321390c659606717421b7efe5b817` |

Staging after restore (before Wave 1): **identical counts + identical sample md5**.

After Wave 1 apply: task/project/event counts unchanged (additive).

## 10. Storage limitations

DB logical dump does **not** restore Storage object bytes. Staging restore did not claim object-level media recovery. Production bucket object counts remain a separate ops concern (Yellow).

## 11. Staging migration history (Wave 1)

Registered in staging `supabase_migrations.schema_migrations`:

1. `20260719130100` … plan_create_task_command  
2. `20260719130200` … plan_privilege_model  
3. `20260719130300` … action_approvals  
4. `20260719130400` … focus_context  
5. `20260719130500` … work_domain  

Repeat apply of plan command: retry-safe (no duplicate-object failure).

## 12. Formal migration checksums

Unchanged vs §2 / baseline `197d69a09…` (no migration file edits in this task).

## 13. Hosted schema verification

All Wave 1 `kenos_*` tables present with **RLS on** and owner SELECT policies. Command + list RPCs present. Worker roles: `kenos_outbox_worker`, `kenos_approval_writer`, `kenos_work_writer` (nologin).

## 14. Dual-user / anon / worker results

**`HOSTED_DUAL_USER_SECURITY_PASS`** on staging with disposable users A/B (`wave1-*@staging.test` — not production users):

- A reads own Focus / Approval / Work; B sees 0 cross-user rows (incl. Activity/Outbox/Deferred/Suggestion when empty for B)
- Authenticated denied direct Activity / Focus writes; Approval terminal update denied
- Anon denied command + focus list RPC
- Spoofed actor path fail-closed
- Legacy `planner_tasks` insert for owner A allowed after staging policy restore
- Worker cannot login

## 15. Function owners / grants

- `kenos_create_plan_task_action`: EXECUTE to `authenticated` (+ postgres/service_role); **not** PUBLIC/anon
- List RPCs: authenticated only (not anon)
- Private store/transition helpers: writer/worker roles only
- Wave 1 functions use fixed `search_path = ''` where security-sensitive

## 16. Security Advisor result (staging post-apply)

12 WARN total. **Wave 1–related:**

| Finding | Disposition |
| --- | --- |
| `authenticated_security_definer_function_executable` on `kenos_create_plan_task_action` | **Accepted / by design** — intentional command RPC; auth.uid() bound; anon revoked; documented in Wave 1 scope |

Other WARN are **pre-existing restore/legacy** (paper_device_snapshot, finance/fitness triggers, mutable search_path on non-Kenos helpers, leaked-password protection disabled on fresh staging Auth). Not introduced by Wave 1 DDL; not used to ignore Kenos findings.

No Wave 1 table with RLS disabled.

## 17. Performance Advisor result

5 WARN, all `auth_rls_initplan` on restored legacy policies (e.g. `life_events`). **0 Kenos-related** performance findings.

## 18. CI production preflight

Prepared workflow doc: `docs/ops/kenos-phase6-production-deployment-workflow.md`.

Verified: no auto DB migrate on push; Netlify client redeploy **would** fire (blocked push). Production migrate job must remain manual environment-gated and was **not** triggered.

## 19. Exact Wave 1 scope

Additive Plan command + privilege foundation + Approval/Focus/Work persistence/read + hosted read RPCs.

## 20. Explicit exclusions

planner_tasks revoke; complete_task cutover; writer canary/cutover; Executor production; Portal switch; Apple distribution; connector external write; legacy deletion; production seed.

## 21. Rollback / disable procedure

```sql
revoke execute on function public.kenos_create_plan_task_action(jsonb) from authenticated;
revoke execute on function public.kenos_list_focus_contexts() from authenticated;
revoke execute on function public.kenos_list_action_approvals(integer, timestamptz) from authenticated;
-- Prefer leave tables; do not DROP user rows without separate approval.
```

## 22. Production blast radius (when later approved)

New empty Kenos tables/RPCs on shared DB; no Task policy revoke in Wave 1; legacy Planner continues.

## 23. Expected downtime

Near-zero additive DDL (lock/statement timeouts on Focus migration).

## 24. Unresolved Yellow / Red

### Red

1. **`PUSH_HAS_UNAPPROVED_PRODUCTION_SIDE_EFFECT`** — push not executed; origin/master missing baseline  
2. **`PRODUCTION_APPLY_BLOCKED_UNTIL_AUTHORITATIVE_COMMIT_PUSHED`**

### Yellow

1. Storage object-level restore not drilled  
2. Hosted schema dump could not rewrite managed `auth`/`storage` objects; planner_tasks policies required staging repair for legacy-write proof  
3. Security Advisor WARN on intentional Kenos SECURITY DEFINER command (accepted)  
4. Pre-existing non-Kenos Advisor WARNs on staging restore  
5. Dirty local WIP still present (must not ship with Wave 1)

## 25. Exact approval phrases

**Do not issue** `APPROVE_KENOS_PRODUCTION_WAVE_1` until Red gates close.

To unblock push only (owner choice):

`APPROVE_KENOS_PUSH_WITH_NETLIFY_CLIENT_REDEPLOY`

Then, after `origin/master` contains `197d69a09…` and this packet’s Red items are cleared:

`APPROVE_KENOS_PRODUCTION_WAVE_1`
