# Migration History Reconciliation (G1)

> Goal: production `schema_migrations` history matches repository history, so a future
> `supabase db push` never attempts duplicate DDL and `migration repair` is never needed.
> Root cause: migrations applied via the Supabase MCP `apply_migration` tool receive a
> **fresh wall-clock version stamp**, which differs from the committed filename stamp for
> the same DDL. The shared project accumulates a union of per-app migration dirs, which
> makes this drift easy to miss (see memory `supabase-shared-project-migration-divergence`).

## Current vs desired state

| Migration | repo filename stamp (before) | production `schema_migrations.version` | status after G1 |
|---|---|---|---|
| aios_code_bridge_endpoints | 20260722160000 | **20260722151619** | **RECONCILED — renamed** (this milestone) |
| kenos_outbox_worker_delivery | 20260722190000 | **20260722191520** | **RECONCILED — renamed** |
| kenos_project_spine | 20260722200000 | **20260722191728** | **RECONCILED — renamed** |
| kenos_approval_parameter_binding | 20260722210000 | **20260722192300** | **RECONCILED — renamed** |
| aios_shell_state | 20260722090000 | 20260722142831 | baselined (prior session) |
| purchase_review_rpc_revoke_anon | 20260717210000 | 20260717204030 | baselined (prior session) |
| core_trusted_devices_owner_lock | 20260722010000 | 20260722015455 | baselined (prior session) |
| device_auth_hardening | 20260722020000 | 20260722015504 | baselined (prior session) |
| device_auth_attest_hangup | 20260722030000 | 20260722015516 | baselined (prior session) |
| core_trusted_devices_view_rls_passthrough | 20260722040000 | 20260722033536 | baselined (prior session) |

**Desired state:** every committed migration's filename stamp equals its production version, so `supabase migration list` shows all as synced.

## Recommended strategy — local git rename (zero production ops)

Because every one of these migrations is **fully idempotent** (`create or replace function`,
`create table if not exists`, `create … index if not exists`, `add column if not exists`,
`drop policy if exists` + `create policy`, `create or replace view` — 0 bare/destructive DDL),
renaming the **repository** file to the production stamp reconciles history with **no production
command at all**: no object recreated, no object dropped, no `migration repair`, generated types
unchanged (objects are byte-identical). This is done for the 4 milestone-owned migrations above.

The 6 baselined pairs were introduced by prior sessions (at/before baseline commit `23cb21e14`);
this milestone does not rewrite another session's committed migration filenames. They are recorded
in `scripts/migration-drift-baseline.json` so the drift detector fails only on **new** drift.

## Owner-approved reconciliation for the 6 baselined pairs (OPTIONAL — see OWNER ACTION REQUIRED)

Two safe options; **Option A is preferred** (no production op):

### Option A — local rename (preferred, reversible via `git mv` back)
```bash
cd apps/finance/supabase/migrations
git mv 20260717210000_purchase_review_rpc_revoke_anon.sql        20260717204030_purchase_review_rpc_revoke_anon.sql
git mv 20260722010000_core_trusted_devices_owner_lock.sql        20260722015455_core_trusted_devices_owner_lock.sql
git mv 20260722020000_device_auth_hardening.sql                  20260722015504_device_auth_hardening.sql
git mv 20260722030000_device_auth_attest_hangup.sql              20260722015516_device_auth_attest_hangup.sql
git mv 20260722040000_core_trusted_devices_view_rls_passthrough.sql 20260722033536_core_trusted_devices_view_rls_passthrough.sql
cd ../../../aios/supabase/migrations
git mv 20260722090000_aios_shell_state.sql                       20260722142831_aios_shell_state.sql
# then remove these 6 entries from scripts/migration-drift-baseline.json
node scripts/check-migration-drift.mjs   # expect: OK, no NEW drift, baselined 0
```
**Preflight:** confirm each idempotency (`grep -cE '^create table [^i]|^drop table|drop column|truncate'` = 0 per file); confirm target stamps unused (`git ls-files '**/<stamp>_*.sql'` empty).
**Expected output:** 6 renames; detector prints `baselined 0` and `OK`.
**Abort conditions:** any file is NOT idempotent; any target stamp already used; a concurrent session holds the migration dir.
**Verification:** `node scripts/check-migration-drift.mjs` exits 0 with `baselined (pre-existing…): 0`.
**Rollback:** `git mv` back to the original stamps (fully reversible; no production touched).

### Option B — production history repair (NOT recommended; requires production ops)
`supabase migration repair --status applied <repoStamp>` for each, **only if** you keep the repo
stamps. **Never** use `--status reverted` on the prod stamps — per project memory it deletes real
history. Because Option A avoids all of this, Option B is documented only for completeness.

## Preflight / expected / abort / verify / rollback for the 4 already-reconciled (this milestone)

- **Preflight (done):** verified all 4 idempotent (0 bare/destructive DDL); verified prod stamps
  `151619/191520/191728/192300` recorded in `supabase_migrations.schema_migrations`; verified target
  stamps had no colliding repo file.
- **Action taken:** `git mv` the 4 repo files to the prod stamps; updated in-repo doc references.
- **Expected/verified output:** `node scripts/check-migration-drift.mjs` → exit 0, `no NEW version-drift pairs`.
- **Clean-room replay determinism:** unaffected — replay reads committed files in version order; the
  renamed files carry identical content, and their new stamps preserve correct ordering
  (151619 < 191520 < 191728 < 192300, all after prior migrations).
- **`db push` behavior:** with repo stamps == prod versions, push sees them as already applied → no
  duplicate DDL.
- **Generated types:** unchanged (no object added/removed/altered by the rename).
- **Rollback:** `git mv` back (reversible); production is never touched by this reconciliation.

## Automated drift detection

`scripts/check-migration-drift.mjs` (unit test `scripts/check-migration-drift.test.mjs`):
compares committed migration filenames against production `schema_migrations`, flags
**drift pairs** (same migration name under a different version stamp), honors
`scripts/migration-drift-baseline.json`, and exits non-zero on any NEW drift. Skips gracefully
(exit 0) when no Supabase token is present (CI-safe). Wire it as a required check **before** any
`supabase db push` / `apply_migration`.
