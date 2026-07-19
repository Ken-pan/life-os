\if :{?kenos_action_json}
\else
  \echo 'kenos_action_json psql variable is required; use scripts/test-kenos-phase1-db.mjs'
  \quit 3
\endif

begin;

create temporary table kenos_contract_fixture (action_request jsonb not null) on commit drop;
insert into kenos_contract_fixture (action_request) values (:'kenos_action_json'::jsonb);
grant select on kenos_contract_fixture to authenticated;

insert into auth.users (id, email)
values
  (((select action_request from kenos_contract_fixture limit 1) #>> '{actor,id}')::uuid, 'kenos-a@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'kenos-b@example.test')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select action_request #>> '{actor,id}' from kenos_contract_fixture limit 1), true);

do $$
declare
  v_action jsonb := (select action_request from kenos_contract_fixture limit 1);
  v_user_id uuid := ((select action_request from kenos_contract_fixture limit 1) #>> '{actor,id}')::uuid;
  v_first jsonb;
  v_duplicate jsonb;
  v_count bigint;
begin
  select public.kenos_create_plan_task_action(v_action) into v_first;
  select public.kenos_create_plan_task_action(v_action || jsonb_build_object(
    'id', '10000000-0000-4000-8000-000000000002',
    'correlationId', '40000000-0000-4000-8000-000000000002'
  )) into v_duplicate;

  if coalesce((v_first ->> 'duplicate')::boolean, true) then
    raise exception 'first request was not created';
  end if;
  if not coalesce((v_duplicate ->> 'duplicate')::boolean, false) then
    raise exception 'duplicate request was not replayed';
  end if;
  if v_first ->> 'taskId' <> v_duplicate ->> 'taskId' then
    raise exception 'duplicate request returned a different task';
  end if;
  if v_first ->> 'status' <> 'succeeded'
     or jsonb_array_length(v_first -> 'affectedEntities') <> 1
     or nullif(v_first ->> 'activityId', '') is null
     or nullif(v_first ->> 'completedAt', '') is null then
    raise exception 'RPC result does not match the frozen ActionResult fields';
  end if;

  select count(*) into v_count
  from public.planner_tasks
  where user_id = auth.uid() and id = v_first ->> 'taskId';
  if v_count <> 1 then
    raise exception 'expected exactly one canonical Planner task';
  end if;

  select count(*) into v_count from public.kenos_plan_outbox;
  if v_count <> 1 then
    raise exception 'expected exactly one user-visible outbox record';
  end if;

  select count(*) into v_count from public.kenos_plan_activity;
  if v_count <> 1 then
    raise exception 'expected exactly one user-visible activity record';
  end if;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object(
      'idempotencyKey', 'idem_db_reused_action',
      'correlationId', '40000000-0000-4000-8000-000000000003'
    ));
    raise exception 'expected action_id_reused';
  exception when others then
    if sqlerrm not like '%action_id_reused%' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  select count(*) into v_count from public.kenos_plan_outbox;
  if v_count <> 0 then
    raise exception 'cross-user outbox rows were visible';
  end if;
  select count(*) into v_count from public.kenos_plan_activity;
  if v_count <> 0 then
    raise exception 'cross-user activity rows were visible';
  end if;

  begin
    perform public.kenos_create_plan_task_action(v_action);
    raise exception 'expected actor_user_mismatch';
  exception when others then
    if sqlerrm not like '%actor_user_mismatch%' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('producer', 'work', 'idempotencyKey', 'idem_db_work'));
    raise exception 'expected work_source_excluded';
  exception when others then
    if sqlerrm not like '%work_source_excluded%' then
      raise;
    end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('producer', 'integration', 'idempotencyKey', 'idem_db_integration'));
    raise exception 'expected producer_not_allowed';
  exception when others then
    if sqlerrm not like '%producer_not_allowed%' then
      raise;
    end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object(
      'requestedAt', '2020-01-01T00:00:00.000Z',
      'expiresAt', '2020-01-01T01:00:00.000Z',
      'idempotencyKey', 'idem_db_expired'
    ));
    raise exception 'expected action_expired';
  exception when others then
    if sqlerrm not like '%action_expired%' then
      raise;
    end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('schemaVersion', 1, 'idempotencyKey', 'idem_db_bad_version'));
    raise exception 'expected schema_version_not_supported';
  exception when others then
    if sqlerrm not like '%schema_version_not_supported%' then
      raise;
    end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('requestedRisk', 'R9', 'idempotencyKey', 'idem_db_bad_risk'));
    raise exception 'expected invalid_action_contract';
  exception when others then
    if sqlerrm not like '%invalid_action_contract%' then raise; end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('requestedAt', 'yesterday', 'idempotencyKey', 'idem_db_bad_time'));
    raise exception 'expected requested_at_required';
  exception when others then
    if sqlerrm not like '%requested_at_required%' then raise; end if;
  end;

  begin
    insert into public.kenos_plan_outbox
      (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref)
    values
      (auth.uid(), 'bypass', 'plan.create_task', 'bypass', 'bypass', '{}'::jsonb);
    raise exception 'expected direct write privilege denial';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
