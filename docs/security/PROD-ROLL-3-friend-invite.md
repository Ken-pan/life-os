# PROD-ROLL-3 — Friend Invite Checklist

Date: 2026-07-10  
Status: **READY TO INVITE**

## Preconditions (all complete)

- [x] PROD-ROLL-1.5 — production DB delta applied (signup trigger + storage hardening)
- [x] PROD-ROLL-2 — frontend entitlement deploy + Ken regression
- [x] App switcher fix (`app_memberships` query) deployed (`9dc40434`)
- [x] Production test users cleaned (leftover gate `@example.com` accounts removed)
- [x] Monitoring: `unexpected_cross_app_members = 0` (non-Ken users with non-fitness active membership)

## Invite flow (friend)

1. Send friend to **https://fitness.kenos.space/auth** (only app with signup enabled)
2. Friend creates account (email confirmation may be required — check inbox)
3. Friend lands in FitnessOS only; Portal shows Fitness card only

## Post-invite verification (Ken runs)

```sql
-- Replace with friend's email after signup
select m.app_key, m.role, m.status
from public.app_memberships m
join auth.users u on u.id = m.user_id
where lower(u.email) = '<friend-email>'
order by m.app_key;
```

**Expected:** single row `fitness | member | active`

```sql
select count(*)::int as unexpected_cross_app_members
from public.app_memberships m
join auth.users u on u.id = m.user_id
where lower(u.email) <> '334452284ken@gmail.com'
  and m.app_key <> 'fitness'
  and m.status = 'active';
```

**Expected:** `0`

## Friend smoke (manual)

- [ ] Login Fitness → create/read own workout
- [ ] Open Portal → only Fitness launcher visible (or fail-closed)
- [ ] Direct URL to planner.kenos.space / finance.kenos.space → redirect or empty (no data leak)
- [ ] Cannot see Ken's Fitness rows

## Ken unchanged

```sql
select m.app_key, m.role, m.status
from public.app_memberships m
join auth.users u on u.id = m.user_id
where lower(u.email) = '334452284ken@gmail.com'
order by m.app_key;
```

**Expected:** 7 apps, all `owner/active`

## Rollback (if friend signup misbehaves)

1. Revoke friend: `update app_memberships set status='revoked', revoked_at=now() where user_id = '<friend-uuid>'`
2. Or delete test user via Supabase Auth dashboard
3. Do **not** roll back Ken memberships or storage hardening without explicit incident

## Notes

- New signups after PROD-ROLL-1.5 always receive fitness-only membership regardless of client metadata
- Email confirmation: production `mailer_autoconfirm = false` — friend may need to confirm email before first login
- Do not invite via Planner/Finance/Music/Home signup pages (registration disabled in UI + auth controller)
