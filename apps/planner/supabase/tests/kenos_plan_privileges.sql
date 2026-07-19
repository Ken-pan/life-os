\if :{?kenos_action_json}
\else
  \echo 'kenos_action_json psql variable is required; use scripts/test-kenos-phase1-db.mjs'
  \quit 3
\endif

begin;

create temporary table kenos_privilege_fixture (action_request jsonb not null, result jsonb) on commit drop;
insert into kenos_privilege_fixture (action_request) values (:'kenos_action_json'::jsonb);
grant select, update on kenos_privilege_fixture to authenticated;
grant select on kenos_privilege_fixture to kenos_outbox_worker;

insert into auth.users (id, email)
values (((select action_request from kenos_privilege_fixture limit 1) #>> '{actor,id}')::uuid, 'kenos-privilege@example.test')
on conflict (id) do nothing;

do $$
begin
  if not has_function_privilege('authenticated', 'public.kenos_create_plan_task_action(jsonb)', 'execute') then
    raise exception 'authenticated command RPC execute grant missing';
  end if;
  if has_function_privilege('anon', 'public.kenos_create_plan_task_action(jsonb)', 'execute') then
    raise exception 'anon must not execute command RPC';
  end if;
  if has_function_privilege('authenticated', 'private.kenos_create_plan_task_action(jsonb)', 'execute') then
    raise exception 'authenticated must not execute private command executor';
  end if;
  if has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'authenticated must not use private schema';
  end if;
  if has_table_privilege('authenticated', 'public.kenos_plan_action_idempotency', 'select') then
    raise exception 'authenticated must not read internal idempotency rows';
  end if;
  if not has_table_privilege('authenticated', 'public.kenos_plan_activity', 'select') then
    raise exception 'authenticated Activity read grant missing';
  end if;
  if not has_table_privilege('authenticated', 'public.kenos_plan_outbox', 'select') then
    raise exception 'authenticated Outbox read grant missing';
  end if;
  if has_table_privilege('authenticated', 'public.kenos_plan_outbox', 'insert,update,delete') then
    raise exception 'authenticated has direct Outbox write privilege';
  end if;
  if has_table_privilege('kenos_outbox_worker', 'public.kenos_plan_outbox', 'update') then
    raise exception 'worker must not update Outbox directly';
  end if;
  if not has_function_privilege('kenos_outbox_worker', 'private.kenos_transition_plan_outbox(uuid,text,text,text,text,timestamptz)', 'execute') then
    raise exception 'worker transition function grant missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select action_request #>> '{actor,id}' from kenos_privilege_fixture limit 1), true);
update kenos_privilege_fixture
set result = public.kenos_create_plan_task_action(action_request);

do $$
begin
  begin
    perform * from public.kenos_plan_action_idempotency;
    raise exception 'expected idempotency read denial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.kenos_plan_outbox set status = 'published';
    raise exception 'expected direct Outbox update denial';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role kenos_outbox_worker;

select private.kenos_transition_plan_outbox(
  ((select result from kenos_privilege_fixture limit 1) ->> 'outboxId')::uuid,
  'pending', 'processing'
);
select private.kenos_transition_plan_outbox(
  ((select result from kenos_privilege_fixture limit 1) ->> 'outboxId')::uuid,
  'processing', 'published'
);

do $$
begin
  begin
    perform private.kenos_transition_plan_outbox(
      ((select result from kenos_privilege_fixture limit 1) ->> 'outboxId')::uuid,
      'published', 'retry', 'transient', 'must fail'
    );
    raise exception 'expected immutable terminal Outbox state';
  exception when others then
    if sqlerrm not like '%outbox_expected_status_not_mutable%' then raise; end if;
  end;
  begin
    update public.kenos_plan_outbox set status = 'retry';
    raise exception 'expected worker direct update denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.kenos_plan_activity;
    raise exception 'expected worker Activity read denial';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
