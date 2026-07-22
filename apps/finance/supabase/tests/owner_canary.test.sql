-- Owner-only canary RLS/RPC test (G3). Runs against a LOCAL supabase db that has
-- BOTH the spine migrations and PENDING_kenos_owner_canary.sql.notapplied applied.
-- NEVER run against production. Runner:
--   supabase start
--   psql "$LOCAL_DB_URL" -f apps/finance/supabase/migrations/<...>_kenos_owner_canary.sql
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f apps/finance/supabase/tests/owner_canary.test.sql
-- Expected: prints "OWNER CANARY SQL TEST: PASS". Any failure aborts with an error.
\set ON_ERROR_STOP on
begin;

-- two synthetic users
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ownerA@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'userB@test.local')
on conflict (id) do nothing;

-- owner A gets a production canary allowing project.set_context via the spine RPC
insert into public.kenos_owner_canary
  (owner_id, environment, allowed_action_types, allowed_rpcs, starts_at, expires_at, approving_reference)
values
  ('11111111-1111-4111-8111-111111111111', 'production',
   array['project.set_context'], array['kenos_project_spine_action'],
   now() - interval '1 minute', now() + interval '1 hour', 'sql test');

-- helper to run assert as a given uid
create or replace function pg_temp.try_assert(p_uid uuid, p_action text, p_rpc text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  begin
    perform public.kenos_assert_owner_canary(p_action, p_rpc);
    return 'allow';
  exception when others then
    return 'deny:' || sqlerrm;
  end;
end $$;

do $$
declare r text;
begin
  -- 1. owner A, allowlisted action+rpc → allow
  r := pg_temp.try_assert('11111111-1111-4111-8111-111111111111','project.set_context','kenos_project_spine_action');
  assert r = 'allow', 'owner A allowlisted should allow, got '||r;

  -- 2. SECOND user B (authenticated) → deny (no canary for owner)
  r := pg_temp.try_assert('22222222-2222-4222-8222-222222222222','project.set_context','kenos_project_spine_action');
  assert r like 'deny:%', 'user B must be denied, got '||r;

  -- 3. owner A, non-allowlisted action → deny
  r := pg_temp.try_assert('11111111-1111-4111-8111-111111111111','plan.archive_task','kenos_project_spine_action');
  assert r like 'deny:%', 'non-allowlisted action must deny, got '||r;

  -- 4. prohibited class even if it were allowlisted → deny
  r := pg_temp.try_assert('11111111-1111-4111-8111-111111111111','work.create_project','kenos_project_spine_action');
  assert r like 'deny:%prohibited%', 'work.* must be prohibited, got '||r;

  -- 5. emergency disable → deny
  update public.kenos_owner_canary set disabled = true where owner_id='11111111-1111-4111-8111-111111111111';
  r := pg_temp.try_assert('11111111-1111-4111-8111-111111111111','project.set_context','kenos_project_spine_action');
  assert r like 'deny:%', 'disabled canary must deny, got '||r;

  -- 6. B never gained access via RLS: cannot see A's row
  perform set_config('request.jwt.claims', json_build_object('sub','22222222-2222-4222-8222-222222222222','role','authenticated')::text, true);
  assert (select count(*) from public.kenos_owner_canary) = 0, 'RLS must hide owner A canary from user B';

  raise notice 'OWNER CANARY SQL TEST: PASS';
end $$;

rollback;  -- never persist test rows
