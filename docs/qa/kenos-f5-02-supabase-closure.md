---
title: KENOS F5-02 — Supabase Production Closure
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: F5_02_PASS_LOCAL_READY_FOR_PRODUCTION_GATE
---

# KENOS F5-02 — Supabase Production Closure

**Status: `F5_02_PASS_LOCAL_READY_FOR_PRODUCTION_GATE`**

The canonical CORE-LOOP data system is reproducible from migrations into an
empty environment, and enforces user isolation + mutation integrity under RLS.
Evidence: `scripts/kenos-cleanroom/replay.sh` — 32 migrations replay with 0
failures, then 12/12 RLS/authz + 6/6 RPC integrity assertions pass. Log:
`docs/qa/evidence/kenos-f5-02-supabase-closure/cleanroom-replay.log`.

## 1. Canonical data map (core loop)

| Entity | Owner table | PK | Owner col | Create path | Update path | Read projection | Activity source | Idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Capture | `kenos_capture_envelopes` | `id` | `owner_id` | `kenos_ingest_capture_envelope_action` (SECDEF) | status via convert | `kenos_list_capture_envelopes` (SECDEF) | RPC-internal | `kenos_plan_action_idempotency` |
| Plan Task | `planner_tasks` | `(user_id,id)` | `user_id` | `kenos_create_plan_task_action` (SECDEF) | `kenos_update_*`/`complete`/`reopen`/`archive` | Planner UI (own-row RLS) + `portal_today_summary` | `kenos_plan_activity` | same table |
| Activity | `kenos_plan_activity` (append-only) | `id` | `user_id` | Plan RPCs (in-txn) | none | `kenos_list_plan_activity` (SECDEF) | itself | n/a |
| Outbox | `kenos_plan_outbox` | `id` | `user_id` | Plan RPCs (in-txn) | worker (future) | `kenos_outbox_*` (SECDEF) | n/a | idempotency_key |
| Continue | client localStorage (`kenos.spaceSwitcher.v1`, `kenos.continue.v2.*`) | — | ownerId-bound | Continue CTA | — | AIOS sheet | — | — |
| Device | `core_allowed_devices` (+ `core_trusted_devices` view) | `id` | `user_id` | device-* Netlify fns (JWT-gated) | same | own-row RLS via `security_invoker` view | device auth events | device_id |
| Identity | `core_profiles` / `app_memberships` | `id`/`(user_id,app_key)` | `id`/`user_id` | auth trigger / membership grant | — | own-row | — | — |

**One long-term writer per entity.** Client tables (`planner_tasks`) accept
direct own-row writes for the legacy Planner sync path; all Kenos canonical
writes go through the SECURITY DEFINER RPCs. Internal tables (activity/outbox/
idempotency) have **no client SELECT/INSERT grant** — reachable only via RPCs
(least privilege, verified in clean-room: `permission denied` on direct read).

## 2. What is now proven by code + tests

Against a database **rebuilt from migrations** (not the live dev DB):
- Anon cannot read or write canonical tables (T1, T2).
- User B cannot SELECT / UPDATE / DELETE user A's task (T3–T5) — RLS `USING` scoping.
- User B cannot INSERT a row owned by A (T6) — RLS `WITH CHECK`.
- Create RPC rejects `actor.id != auth.uid()` (T7) — client cannot choose owner.
- Activity and Capture lists are caller-scoped (T8, T9) — no cross-user leak.
- RLS enabled on all 13 core-loop tables (T10).
- Every SECURITY DEFINER function pins `search_path` (T11).
- Anon cannot execute privileged write RPCs (T12).
- Idempotent replay returns the same task with `duplicate:true` (R1, R6).
- Distinct idempotency keys create distinct tasks (R2).
- Create is atomic: task+activity+outbox returned together (R3).
- One action UUID cannot be rebound to a new idempotency key (R4).
- Malformed input fails closed (R5).

## 3. Migration hygiene findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| M1 | `fitness_core_schema.sql` used `create policy if not exists` (18×) — **invalid PostgreSQL**; can never execute. Proves committed migration files drifted from how prod was actually built (management-API + dump-baseline). | P2 | **FIXED** — converted to idempotent `drop policy if exists; create policy`. |
| M2 | `life_os_baseline.sql` is a finance-centric squash dump placed mid-history (2026-07-10). It **overlaps** aios/home streams (later migrations re-create policies already in the dump → "already exists") and **omits** planner `paper_device_actions` (created 07-09, absent from dump). No single from-empty order replays all 6 apps. | P2 | **Characterized.** Owner-gated remediation: proper `supabase migration squash` per project (see §6 gate). Core-loop replay is clean and harnessed. |
| M3 | Drift: `kenos_crash_events` view exists in prod but its migration `20260721233300` is **not recorded** in `supabase_migrations.schema_migrations` (applied out-of-band). | P3 | Cutover package records the version (§6). |
| M4 | `20260721180000_kenos_app_logs_analyze_alert.sql` is **committed but never applied to prod** (`kenos_scan_app_log_alerts` fn absent in prod). | P3 | Cutover package applies it (§6). |

Core-loop canonical tables/RPCs are unaffected by M2–M4.

## 4. Auth / session, Realtime, secrets

- **Session storage**: single `life_os_auth` storageKey (localStorage) shared
  across web apps for SSO; iOS mirrors into Keychain vault (`sso.js`). Server
  clients use `persistSession:false`. Owner-gated cloud access
  (`isCloudAuthorized` restricts AIOS cloud to the owner email).
- **Realtime**: **none** in the core loop. Only Web Push (`pushSubscription.js`).
  Clients always re-fetch canonical state (portal_today_summary / list RPCs) —
  no correctness depends on a live channel. (F5-02.8 N/A by design.)
- **Service-role**: absent from every web `src/` bundle and all Swift
  (verified by grep). Confined to `apps/planner/server/*.mjs` via `process.env`,
  consumed only by Netlify server functions.
- **Secret scan** (tracked files, HEAD): no `sb_secret_*`, no `service_role`
  JWT, no private-key material. Only `sb_publishable_*` (safe) + project URL are
  hardcoded (`packages/sync/src/supabaseClient.js`, `KenosSupabaseConfig.swift`).
  `.env.example` templates only; no real `.env` committed.
- **Generated types**: none. `@life-os/contracts/kenos.ts` (Zod) is the type
  SSOT, cross-checked against Swift by `scripts/check-kenos-contract-parity.mjs`.

### Accepted / owner-noted (not blocking)

- **A1** `createLifeOsSupabaseClient(productionFallback:true)` makes **production
  the implicit default** when `PUBLIC_SUPABASE_*` is unset — local/test without
  env silently targets prod. Mitigated by `prodWriteGuard` (writes fail-closed
  unless `VITE_KENOS_PROD_WRITES=1`) and read-only client wrapping. Owner may
  prefer an explicit `local`/`test` env with no prod fallback for CI.
- **A2** `trustedDeviceAuth.mjs` reuses the service-role key as the HMAC secret
  when `DEVICE_AUTH_HMAC_SECRET` is unset; `paperService.mjs` falls back to anon
  key when service-role is unset (silent scope change). Set both env vars in
  prod (carried from the device-auth work; also in the trusted-device memory).

## 5. Commands run / evidence

```
supabase start            # local stack (Postgres 17, auth schema, roles, pgcrypto/pgvector)
scripts/kenos-cleanroom/replay.sh
  ==> Applied 32 migrations, 0 failures
  ==> RLS/authz suite: T1..T12 PASS
  ==> RPC integrity suite: R1..R6 PASS
  ==> CLEAN-ROOM REPLAY + SECURITY SUITE: PASS
```

## 6. Production approval gate (F5-02.10)

Prod migration tip: `20260722033536` (46 applied). **No production changes were
applied by this milestone** beyond the earlier owner-approved RLS hotfix.

### Preflight (read-only, safe to run now)
```bash
# 1. Confirm the unapplied migration's objects are absent
scripts/supabase-sql.sh "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='kenos_scan_app_log_alerts';"
# expect 0

# 2. Confirm crash view exists but is unrecorded
scripts/supabase-sql.sh "select (select count(*) from pg_views where schemaname='public' and viewname='kenos_crash_events') as view_exists, (select count(*) from supabase_migrations.schema_migrations where name='kenos_crash_events_view') as recorded;"
# expect view_exists=1 recorded=0
```

### Apply (owner-run; requires SUPABASE_ACCESS_TOKEN)
```bash
# GATE A — apply the committed-but-unapplied app-logs alert migration
scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260721180000_kenos_app_logs_analyze_alert.sql
scripts/supabase-sql.sh "insert into supabase_migrations.schema_migrations(version,name) values ('20260721180000','kenos_app_logs_analyze_alert') on conflict do nothing;"

# GATE B — record the out-of-band crash view migration (idempotent re-apply is safe: create-or-replace view)
scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260721233300_kenos_crash_events_view.sql
scripts/supabase-sql.sh "insert into supabase_migrations.schema_migrations(version,name) values ('20260721233300','kenos_crash_events_view') on conflict do nothing;"
```

- **Expected impact**: adds `kenos_scan_app_log_alerts`/`kenos_analyze_app_logs`
  functions + tightens `bug_logs` policies; re-asserts the crash view. No
  core-loop table or RPC changes. No data mutation.
- **Backup**: neither migration is destructive (add-only + `create or replace`).
  A Supabase PITR window covers rollback; no dump required.
- **Rollback**: `drop function if exists public.kenos_scan_app_log_alerts(...);`
  and restore prior `bug_logs` policies from git (`20260721144405`). Forward-fix
  preferred over PITR for these additive objects.
- **Abort conditions**: preflight #1 returns non-zero (already applied), or the
  file references an object absent in prod (unexpected drift) — stop and diff.
- **Post-apply verification**:
```bash
scripts/supabase-sql.sh "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='kenos_scan_app_log_alerts';"  # expect 1 row
node scripts/check-kenos-phase6.mjs   # phase-6 production packet guard
```
- **Client release ordering**: none required — these objects are used only by
  the QA alerting script (`npm run qa:app-logs`), not by shipped clients.

### Owner-gated (do NOT auto-execute) — M2 squash remediation
The full 6-app migration set is not from-empty replayable. Remediation is a
`supabase migration squash` per app (collapse pre-baseline granular migrations
into one baseline, fold in `paper_device_actions`), which rewrites migration
tracking. This must be owner-scheduled with a fresh prod schema dump as the new
baseline. Until then, the committable core-loop replay (`replay.sh`) is the
reproducibility proof and CI gate for the canonical loop.
