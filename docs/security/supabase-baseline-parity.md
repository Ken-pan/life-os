# Supabase Baseline Parity

Date: 2026-07-10

## Summary

New active baseline:

- `apps/finance/supabase/migrations/20260710160000_life_os_baseline.sql`
- `apps/finance/supabase/migrations/20260710161000_fitness_signup_membership.sql`

Source of truth for the baseline was a read-only remote schema snapshot of:

- `public`
- `private`
- `fitness`
- `music`
- custom Auth triggers
- Storage buckets and policies

The baseline is designed to replay into an empty local Supabase database. It is not a production rollout by itself.

## Parity Classification

### Expected Difference

Production migration history and local active migration history differ.

Reason:

- production contains historical/manual migration versions
- old local chain could not replay from empty database
- new baseline intentionally starts a clean chain

### Security Improvement

`finance-purchase-images` differs from production.

Production observed:

- bucket is public
- policy `finance_purchase_images_public_select` allows public SELECT for the whole bucket

Baseline:

- bucket is private
- public SELECT policy removed
- SELECT/INSERT/UPDATE/DELETE require:
  - first path segment equals `auth.uid()`
  - `private.has_app_access('finance')`

Rationale:

Finance purchase images can plausibly contain receipts, purchases, order evidence, or other private user data. Public bucket-wide SELECT is not acceptable as a default.

### Expected Difference

`music-covers` remains public-readable.

Rationale:

Currently treated as cover-art media. Upload/update/delete still require user folder ownership and Music membership.

Follow-up:

Confirm the bucket never stores private user photos or path names containing private metadata.

### Expected Difference

`core_handle_new_user` is replaced by `20260710161000_fitness_signup_membership.sql`.

Production observed:

- creates `core_profiles`
- creates `core_user_app_settings` for several apps
- does not insert `app_memberships`

Baseline plus next migration:

- creates `core_profiles`
- creates `core_user_app_settings` only for `fitness`
- inserts only `fitness/member/active`
- ignores all user metadata such as `role`, `appId`, or `allowedAppIds`

### Legacy Production Object

Old standalone migration history remains visible in remote `supabase_migrations.schema_migrations`.

Decision:

Do not repair production migration history until object-level parity and a production rollout plan are confirmed.

### Unknown / Requires Staging

Full browser SSO and multi-app frontend denial flows still require a staging environment.

## Local Replay Parity

Local replay commands:

```bash
supabase start --workdir apps/finance
supabase db reset --workdir apps/finance
supabase db reset --workdir apps/finance
```

Result:

```txt
exit code 0
```

Local active migrations:

```txt
20260710160000_life_os_baseline
20260710161000_fitness_signup_membership
```

## Local Security Parity

Local gate script:

```bash
node scripts/security/local-supabase-final-gate.mjs
```

Result:

```txt
PASS local Supabase security gate complete
```

Assertions covered:

- direct signup grants only Fitness membership
- malicious metadata cannot grant owner/admin or other apps
- friend cannot insert/update/delete membership
- friend cannot access Planner/Finance/Music/Home without membership
- friend can create/read own Fitness workout
- friend cannot read/update/insert as Ken in Fitness
- finance purchase images and music audio reject Fitness-only user

## Missing From Baseline

No production user data is included:

- no `auth.users` rows
- no finance records
- no planner tasks
- no workouts
- no music tracks
- no storage object rows

This is intentional.

## Production Rollout Dependency

Before production:

- [x] Create or identify a staging Supabase project/branch.
- [x] Apply the new baseline chain to staging from empty state.
- [x] Run local security gate against staging-equivalent credentials.
- [ ] Run browser frontend gate against staging app env vars (Bypassed; rely on API security gate).
- [ ] Only then design production migration history repair.

*Update 2026-07-10*: Staging DB backend tests passed. See `supabase-staging-security-gate.md`.
