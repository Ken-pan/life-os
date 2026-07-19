begin;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'kenos-a@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'kenos-b@example.test')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_action jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'actionId', 'act_db_001',
    'actionType', 'plan.create_task',
    'producer', 'assistant',
    'targetDomain', 'plan',
    'actor', jsonb_build_object('type', 'assistant', 'userId', '00000000-0000-4000-8000-000000000001'),
    'idempotencyKey', 'idem_db_001',
    'correlationId', 'corr_db_001',
    'securityDomain', 'personal',
    'classification', 'personal',
    'risk', 'R1',
    'approval', jsonb_build_object('state', 'not_required'),
    'payload', jsonb_build_object('title', 'Disposable DB task', 'notes', 'private note'),
    'createdAt', '2026-07-19T00:00:00.000Z',
    'expiresAt', '2099-07-19T00:00:00.000Z'
  );
  v_first jsonb;
  v_duplicate jsonb;
  v_count bigint;
begin
  select public.kenos_create_plan_task_action(v_action) into v_first;
  select public.kenos_create_plan_task_action(v_action || jsonb_build_object('actionId', 'act_db_002', 'correlationId', 'corr_db_002')) into v_duplicate;

  if coalesce((v_first ->> 'duplicate')::boolean, true) then
    raise exception 'first request was not created';
  end if;
  if not coalesce((v_duplicate ->> 'duplicate')::boolean, false) then
    raise exception 'duplicate request was not replayed';
  end if;
  if v_first ->> 'taskId' <> v_duplicate ->> 'taskId' then
    raise exception 'duplicate request returned a different task';
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

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('producer', 'work', 'idempotencyKey', 'idem_db_work'));
    raise exception 'expected work_source_excluded';
  exception when others then
    if sqlerrm not like '%work_source_excluded%' then
      raise;
    end if;
  end;

  begin
    perform public.kenos_create_plan_task_action(v_action || jsonb_build_object('expiresAt', '2020-01-01T00:00:00.000Z', 'idempotencyKey', 'idem_db_expired'));
    raise exception 'expected action_expired';
  exception when others then
    if sqlerrm not like '%action_expired%' then
      raise;
    end if;
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
