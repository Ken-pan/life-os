\if :{?approval_a_old_json}
\else
  \echo 'approval fixtures are required; use scripts/check-kenos-phase2-approval-db.mjs'
  \quit 3
\endif

begin;

create temporary table kenos_approval_test_context (
  approval_a_old jsonb not null,
  approval_a_new jsonb not null,
  approval_a_expired jsonb not null,
  approval_b jsonb not null
) on commit drop;
insert into kenos_approval_test_context values (
  :'approval_a_old_json'::jsonb,
  :'approval_a_new_json'::jsonb,
  :'approval_a_expired_json'::jsonb,
  :'approval_b_json'::jsonb
);
grant select on kenos_approval_test_context to authenticated, anon, kenos_approval_writer;

insert into auth.users (id, email) values
  (((select approval_a_old from kenos_approval_test_context) ->> 'ownerId')::uuid, 'approval-a@example.test'),
  (((select approval_b from kenos_approval_test_context) ->> 'ownerId')::uuid, 'approval-b@example.test')
on conflict (id) do nothing;

do $$
begin
  if not has_table_privilege('authenticated', 'public.kenos_action_approvals', 'select') then
    raise exception 'authenticated Approval select grant missing';
  end if;
  if has_table_privilege('authenticated', 'public.kenos_action_approvals', 'insert,update,delete') then
    raise exception 'authenticated must not write canonical Approval directly';
  end if;
  if has_table_privilege('anon', 'public.kenos_action_approvals', 'select') then
    raise exception 'anon must not read canonical Approval';
  end if;
  if has_table_privilege('kenos_approval_writer', 'public.kenos_action_approvals', 'select,insert,update,delete') then
    raise exception 'writer must use the controlled private boundary';
  end if;
  if not has_function_privilege('authenticated', 'public.kenos_list_action_approvals(integer,timestamp with time zone)', 'execute') then
    raise exception 'authenticated read RPC grant missing';
  end if;
  if has_function_privilege('anon', 'public.kenos_list_action_approvals(integer,timestamp with time zone)', 'execute') then
    raise exception 'anon must not execute Approval read RPC';
  end if;
  if has_function_privilege('authenticated', 'private.kenos_store_action_approval(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'private.kenos_transition_action_approval(uuid,text,text,uuid,text)', 'execute') then
    raise exception 'authenticated must not execute Approval writer functions';
  end if;
  if has_function_privilege('service_role', 'private.kenos_store_action_approval(jsonb)', 'execute') then
    raise exception 'generic service_role must not become the Approval writer';
  end if;
end;
$$;

set local role kenos_approval_writer;
select set_config('request.jwt.claim.sub', (select approval_a_old ->> 'ownerId' from kenos_approval_test_context), true);
select private.kenos_store_action_approval((select approval_a_old from kenos_approval_test_context));
select private.kenos_store_action_approval((select approval_a_new from kenos_approval_test_context));
select private.kenos_store_action_approval((select approval_a_expired from kenos_approval_test_context));

do $$
begin
  begin
    perform private.kenos_store_action_approval((select approval_b from kenos_approval_test_context));
    raise exception 'expected owner binding rejection';
  exception when others then
    if sqlerrm not like '%approval_owner_mismatch%' then raise; end if;
  end;
  begin
    perform private.kenos_transition_action_approval(
      ((select approval_a_old from kenos_approval_test_context) ->> 'id')::uuid,
      'pending', 'approved',
      ((select approval_a_old from kenos_approval_test_context) ->> 'ownerId')::uuid,
      'must fail because a newer Approval supersedes it'
    );
    raise exception 'expected superseded Approval rejection';
  exception when others then
    if sqlerrm not like '%approval_superseded%' then raise; end if;
  end;
  begin
    perform private.kenos_transition_action_approval(
      ((select approval_a_expired from kenos_approval_test_context) ->> 'id')::uuid,
      'pending', 'approved',
      ((select approval_a_expired from kenos_approval_test_context) ->> 'ownerId')::uuid,
      'must fail because expiry has passed'
    );
    raise exception 'expected expired Approval rejection';
  exception when others then
    if sqlerrm not like '%approval_expired%' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', (select approval_b ->> 'ownerId' from kenos_approval_test_context), true);
select private.kenos_store_action_approval((select approval_b from kenos_approval_test_context));

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select approval_a_old ->> 'ownerId' from kenos_approval_test_context), true);

do $$
declare
  v_count integer;
  v_statuses text[];
begin
  select count(*) into v_count from public.kenos_action_approvals;
  if v_count <> 3 then raise exception 'user A must see exactly three own Approvals, got %', v_count; end if;
  select array_agg(status order by status) into v_statuses
  from public.kenos_list_action_approvals(100, null);
  if v_statuses <> array['expired', 'pending', 'superseded']::text[] then
    raise exception 'effective expired/pending/superseded projection mismatch: %', v_statuses;
  end if;
  if exists (
    select 1 from public.kenos_list_action_approvals(100, null)
    where owner_id <> (select auth.uid())
  ) then raise exception 'read RPC leaked another owner'; end if;

  begin
    insert into public.kenos_action_approvals (
      id, version, owner_id, action_id, correlation_id, requesting_actor,
      requesting_domain, action_type, risk, status, reason_code, safe_summary,
      data_classification, requested_at, expires_at, entity_refs, created_at, updated_at
    ) values (
      gen_random_uuid(), '1', (select auth.uid()), gen_random_uuid(), gen_random_uuid(),
      jsonb_build_object('type', 'user', 'id', (select auth.uid())),
      'plan', 'plan.reschedule_task', 'R2', 'pending', 'client_bypass', 'Must fail',
      'personal', now(), now() + interval '5 minutes', '[]'::jsonb, now(), now()
    );
    raise exception 'expected direct insert denial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.kenos_action_approvals set status = 'approved';
    raise exception 'expected direct update denial';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.kenos_action_approvals;
    raise exception 'expected direct delete denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.kenos_store_action_approval((select approval_a_old from kenos_approval_test_context));
    raise exception 'expected private schema denial';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', (select approval_b ->> 'ownerId' from kenos_approval_test_context), true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.kenos_action_approvals;
  if v_count <> 1 then raise exception 'user B must see exactly one own Approval, got %', v_count; end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform * from public.kenos_action_approvals;
    raise exception 'expected anonymous Approval read denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.kenos_list_action_approvals(100, null);
    raise exception 'expected anonymous RPC denial';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
