# Supabase Baseline Audit

Date: 2026-07-10

## Scope

Canonical workdir: `apps/finance/supabase/`

Active migration chain after DB-BASELINE-0:

- `20260710160000_life_os_baseline.sql`
- `20260710161000_fitness_signup_membership.sql`

Legacy migration chain was moved to `apps/finance/supabase/migrations_legacy/` and is retained for audit history. It is no longer part of empty-database replay.

Other app migration directories still exist:

- `apps/planner/supabase/migrations`
- `apps/fitness/supabase/migrations`
- `apps/music/supabase/migrations`

These are historical app-local migration copies. `docs/ops/supabase.md` identifies `apps/finance/supabase/` as the Life OS shared Supabase canonical migration workdir.

## Startup Evidence

Recorded before baseline repair:

- Branch: `master`
- Remote: `origin https://github.com/Ken-pan/life-os.git`
- Worktree: dirty before this task; unrelated planner-device / PaperOS work was not reverted or edited.
- Linked remote migration history contained many remote-only pre-baseline timestamps and did not record the local July 10 entitlement migrations.

## First Empty Replay Failure

Command:

```bash
supabase start --workdir apps/finance
```

Failure:

```txt
Applying migration 20260705211305_life_os_module_tagging.sql
ERROR: relation "public.accounts" does not exist
At statement: select private.add_os_module_column('public', 'balance_assertions', 'finance')
```

Root cause:

- The old active chain assumed unprefixed Finance tables such as `public.accounts`.
- Current production/schema state uses prefixed Finance tables such as `public.finance_accounts`.
- The old chain also reflected manually-applied / drifted production state and could not be trusted as a deterministic empty-database replay source.

Decision:

```txt
CREATE_NEW_BASELINE
```

## Baseline Inputs

Read-only remote schema snapshot was captured to `.tmp/supabase-baseline/`:

- `public-private-fitness-music-schema.sql`
- `remote-object-inventory.json`
- `auth-customizations.json`
- `storage-buckets.json`
- `storage-policies.json`
- `realtime-publication.json`
- `extensions.json`

The `.tmp/` files are not intended for commit and contain no connection strings or JWT/service-role secrets.

## Production Object Inventory Summary

Core:

- `public.app_registry`
- `public.app_memberships`
- `public.core_profiles`
- `public.core_user_app_settings`

Authorization:

- `private.has_app_access(text)`
- `private.has_app_role(text, text[])`
- `private.user_has_app_access(uuid, text)`
- RLS enabled on `app_registry`, `app_memberships`, `core_user_app_settings`, Planner, Finance, Fitness, and Music user-data tables.

Auth triggers on `auth.users`:

- `core_on_auth_user_created` -> `private.core_handle_new_user`
- `fitness_on_auth_user_created` -> `private.fitness_handle_new_user`
- `music_on_auth_user_created` -> `private.music_handle_new_user`

Storage buckets:

- `bug-attachments`
- `finance-purchase-images`
- `music`
- `music-covers`

Realtime:

- No custom tables in `supabase_realtime` publication at audit time.

Extensions observed:

- `pgcrypto`
- `uuid-ossp`
- `vector`
- Supabase-managed extensions including `plpgsql`, `pg_stat_statements`, and `supabase_vault`

## Remote Drift

Before repair, remote migration history included many versions not present in local Git, and local Git included July 10 entitlement files not recorded remotely.

Important remote-only examples:

- May/June Finance migrations from standalone history
- Music migrations around `20260707010000`-`20260707010600`
- Several July 9 manually-applied versions

Important local-only examples before baseline:

- `20260710100000_app_entitlement_foundation.sql`
- `20260710110000_personal_apps_lockdown.sql`
- `20260710154203_fitness_signup_membership.sql`
- `apps/fitness/supabase/migrations/20260710120000_fitness_rls_upgrade.sql`

The active chain now intentionally replaces this drift with a new baseline.

## Storage Audit

`finance-purchase-images` was treated as private purchase evidence by default. The baseline changes it from public-readable production behavior to:

- bucket `public = false`
- no public SELECT policy
- path ownership: first folder segment must equal `auth.uid()`
- requires `private.has_app_access('finance')`

`music-covers` remains public-readable in the baseline because it is treated as album/artist cover media. Upload/update/delete still require path ownership and Music membership.

## Replay Evidence

After baseline repair:

```bash
supabase start --workdir apps/finance
supabase db reset --workdir apps/finance
supabase db reset --workdir apps/finance
```

Result:

```txt
Applying migration 20260710160000_life_os_baseline.sql
Applying migration 20260710161000_fitness_signup_membership.sql
Finished supabase db reset on branch master
```

Both resets completed with exit code 0.

Seed warning:

```txt
WARN: no files matched pattern: supabase/seed.sql
```

This is non-blocking because no `seed.sql` exists in `apps/finance/supabase/`.

## Local Security Gate Evidence

Command:

```bash
node scripts/security/local-supabase-final-gate.mjs
```

Covered:

- raw `supabase.auth.signUp()` with malicious metadata
- normal user signup membership
- membership read / insert / update / delete escalation
- revoked membership fail-closed app registry read
- Planner, Finance, Music, Home cross-app deny
- Fitness own workout allow
- Fitness Ken workout read/update/insert-as-Ken deny
- Storage deny for finance purchase images and music audio

Result:

```txt
PASS local Supabase security gate complete
```

## Remaining Blockers

- [x] ~~No independent staging project or Supabase branch was provided in this run.~~ (Resolved in SEC-STAGE-1)
- [ ] Production database was not mutated.
- [ ] Production migration history was not repaired.
- [ ] Full staging two-user browser flow remains pending.
