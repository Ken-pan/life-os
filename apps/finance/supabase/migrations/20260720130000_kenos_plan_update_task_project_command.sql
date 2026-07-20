-- Kenos Plan update-task-project command (additive).
-- Track B project-relation slice: projectId (nullable).
-- Prerequisites: tip >= 20260720120000.

create or replace function private.kenos_update_plan_task_project_action(action_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_user_id uuid;
  v_action_id text := action_request ->> 'id';
  v_action_type text := action_request ->> 'actionType';
  v_idempotency_key text := action_request ->> 'idempotencyKey';
  v_correlation_id text := action_request ->> 'correlationId';
  v_task_id text := nullif(btrim(coalesce(action_request #>> '{payload,taskId}', '')), '');
  v_project_raw jsonb := action_request #> '{payload,projectId}';
  v_project_id text := null;
  v_now timestamptz := clock_timestamp();
  v_now_ms bigint;
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_task public.planner_tasks%rowtype;
  v_entity_ref jsonb;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_data jsonb;
  v_project_exists boolean := false;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string'
     or action_request ->> 'schemaVersion' <> '1' then
    raise exception 'schema_version_not_supported';
  end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'plan.update_task_project' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'plan' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('plan', 'assistant') then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request ->> 'producer', '') = 'plan'
     and coalesce(action_request #>> '{actor,type}', '') <> 'user' then raise exception 'plan_actor_required'; end if;
  if coalesce(action_request ->> 'producer', '') = 'assistant'
     and coalesce(action_request #>> '{actor,type}', '') <> 'assistant' then raise exception 'assistant_actor_required'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal'
     or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then
    raise exception 'security_domain_not_allowed';
  end if;
  if action_request ->> 'requestedRisk' <> 'R1' then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null
     or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then
    raise exception 'requested_at_required';
  end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;
  if v_task_id is null then raise exception 'task_id_required'; end if;
  if not (action_request -> 'payload' ? 'projectId') then raise exception 'project_id_required'; end if;

  if jsonb_typeof(v_project_raw) = 'null' then
    v_project_id := null;
  elsif jsonb_typeof(v_project_raw) = 'string' then
    v_project_id := nullif(btrim(v_project_raw #>> '{}'), '');
  else
    raise exception 'project_id_invalid';
  end if;

  if v_project_id is not null then
    select exists(
      select 1 from public.planner_projects p
      where p.user_id = v_user_id and p.id = v_project_id
        and coalesce(p.data->>'deletedAt', '') = ''
    ) into v_project_exists;
    if not v_project_exists then
      raise exception 'project_not_found';
    end if;
  end if;

  select * into v_existing from public.kenos_plan_action_idempotency
  where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then
    raise exception 'action_id_reused';
  end if;

  insert into public.kenos_plan_action_idempotency
    (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_task_id, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing
  returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency
    where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity
    where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox
    where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'taskId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('taskId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  select * into v_task from public.planner_tasks
  where user_id = v_user_id and id = v_task_id for update;
  if not found then raise exception 'task_not_found'; end if;

  v_now_ms := floor(extract(epoch from v_now) * 1000)::bigint;
  v_data := coalesce(v_task.data, '{}'::jsonb);
  if v_project_id is null then
    v_data := jsonb_set(v_data, '{projectId}', 'null'::jsonb, true);
  else
    v_data := jsonb_set(v_data, '{projectId}', to_jsonb(v_project_id), true);
  end if;
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(v_now_ms), true);
  v_data := jsonb_set(v_data, '{meta,command}', jsonb_build_object(
    'schemaVersion', '1', 'actionRequestId', v_action_id, 'actionType', v_action_type,
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  ), true);

  update public.planner_tasks set data = v_data, updated_at = v_now
  where user_id = v_user_id and id = v_task_id;

  v_entity_ref := jsonb_build_object('id', v_task_id, 'type', 'plan.task', 'ownerDomain', 'plan', 'ownerId', v_task_id, 'version', 1);

  insert into public.kenos_plan_outbox
    (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('taskId', v_task_id, 'projectId', to_jsonb(v_project_id)))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity
    (user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo)
  values (
    v_user_id, v_action_id, v_action_type, v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'user'),
    coalesce(action_request ->> 'producer', 'plan'),
    jsonb_build_object('requestId', v_action_id, 'outcome', 'allow', 'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-phase1-2026-07-20',
      'reasons', jsonb_build_array('explicit update-task-project command'), 'decidedAt', v_now),
    v_entity_ref, 'Updated Plan task project relation', 'succeeded',
    jsonb_build_object('taskId', v_task_id, 'projectId', to_jsonb(v_project_id)),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'taskId', v_task_id, 'requestId', v_action_id, 'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('taskId', v_task_id, 'outboxId', v_outbox_id, 'duplicate', false),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_update_plan_task_project_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_update_plan_task_project_action(action_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select private.kenos_update_plan_task_project_action(action_request);
$$;

revoke all on function public.kenos_update_plan_task_project_action(jsonb) from public, anon, authenticated;
grant execute on function public.kenos_update_plan_task_project_action(jsonb) to authenticated;
