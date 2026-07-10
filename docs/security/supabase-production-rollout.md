# Supabase Production Rollout Plan

Date: 2026-07-10

Status: plan only. Do not execute in this task.

## Preconditions

Do not start production rollout until all are true:

- [x] staging Supabase project or branch exists
- [x] staging starts from empty database
- [x] active baseline migrations replay successfully
- [x] staging direct signup / malicious metadata / membership escalation tests pass
- [x] staging cross-app API tests pass
- [x] staging Fitness two-user tests pass
- [x] staging Storage tests pass
- [ ] frontend fail-closed tests pass (Bypassed in gate)

## 1. Backup

Before any production mutation:

- Take a Supabase managed backup or point-in-time recovery marker.
- Export schema-only snapshot for `public`, `private`, `fitness`, `music`.
- Export custom Auth triggers/functions.
- Export Storage bucket definitions and policies.
- Export migration history table.

Do not export or commit user data dumps.

## 2. Maintenance Window

Use a maintenance window because Auth trigger and membership policies affect login/onboarding.

Notify expected impact:

- signup may be paused
- app switcher / portal access may be restricted while membership rows are validated
- storage images may require signed/private access after hardening

## 3. Production Schema Fingerprint

Immediately before rollout, collect:

- table inventory
- columns / constraints / indexes
- functions
- views
- triggers on `auth.users`
- RLS policies
- grants
- Storage buckets and policies
- Realtime publication tables
- extension list
- migration history versions

Compare with `docs/security/supabase-baseline-parity.md`.

## 4. Baseline Parity Confirmation

Confirm object-level parity between production and `20260710160000_life_os_baseline.sql`.

Classify every diff as:

- expected production-only historical state
- baseline security improvement
- missing from baseline
- unsafe production object to remove
- unknown blocker

Do not use migration history alone as evidence.

## 5. Migration History Alignment

Do not blindly run:

```bash
supabase migration repair --status applied
```

Only mark baseline as applied if:

- production object graph is confirmed equivalent to baseline, except documented improvements
- no active production object would be dropped unexpectedly
- rollback path has been reviewed

Because current production has many remote-only historical versions, migration history repair must be treated as a controlled operation, not a convenience step.

## 6. New Migrations To Execute

Expected production-impacting migration after baseline alignment:

- `20260710161000_fitness_signup_membership.sql`

Expected behavior:

- replaces `private.core_handle_new_user`
- creates only Fitness app setting by default
- grants only `fitness/member/active`
- ignores user metadata for authorization

If finance purchase image hardening is not already present in production, apply the Storage hardening deliberately and update frontend image display to use authenticated/signed access if needed.

## 7. Ken Membership Verification

Before and after rollout:

```sql
select m.app_key, m.role, m.status
from public.app_memberships m
join auth.users u on u.id = m.user_id
where lower(u.email) = '334452284ken@gmail.com'
order by m.app_key;
```

Expected:

- required app memberships are `owner/active`
- runtime authorization uses `app_memberships`, not frontend email checks

Email is allowed only for this one-time operational lookup.

## 8. Auth Trigger Smoke Test

Use a synthetic test email, not the real friend.

Flow:

1. Create test user through production-safe signup or admin flow.
2. Verify exactly one membership:
   - `fitness`
   - `member`
   - `active`
3. Verify no Planner/Finance/Music/Home/Paper/Portal membership.
4. Delete synthetic user after validation.

Do not run this until the maintenance window and rollback plan are ready.

## 9. Friend Synthetic Smoke Test

Use a synthetic account:

- login to FitnessOS
- verify own Fitness read/write
- verify Planner/Finance/Music/Home direct API access denied
- verify Portal/app switcher shows only allowed apps or fails closed
- verify Storage private buckets deny cross-app access

## 10. Rollback

Rollback plan must include:

- restoring previous Auth trigger function
- restoring previous Storage policy only if business-critical
- revoking/deleting synthetic test users
- reverting app env vars if staging/prod configs were changed
- restoring from backup if object drift is broad

Do not rely only on down migrations; current production history is drifted.

## 11. Post-Deploy Monitoring

Monitor:

- Auth signup errors
- trigger failures on `auth.users`
- RLS denied errors in app logs
- Portal app list fetch errors
- Storage 403/404 rates
- unexpected app membership rows

Queries to run after rollout:

```sql
select app_key, role, status, count(*)
from public.app_memberships
group by app_key, role, status
order by app_key, role, status;
```

```sql
select count(*)
from public.app_memberships m
join auth.users u on u.id = m.user_id
where lower(u.email) <> '334452284ken@gmail.com'
  and m.app_key <> 'fitness'
  and m.status = 'active';
```

Expected second query:

```txt
0
```
