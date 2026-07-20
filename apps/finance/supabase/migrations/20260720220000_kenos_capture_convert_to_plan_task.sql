-- Explicit Capture → Plan conversion (user-triggered; never silent).
-- Prerequisites: tip >= 20260720210000.

create or replace function private.kenos_convert_capture_to_plan_task_action(action_request jsonb)
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
  v_capture_id uuid;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_entity_ref jsonb;
  v_capture public.kenos_capture_envelopes%rowtype;
  v_title text;
  v_create_request jsonb;
  v_create_result jsonb;
  v_task_id text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'capture.convert_to_plan_task' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'plan' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('plan', 'assistant', 'system') then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request #>> '{actor,type}', '') <> 'user' then raise exception 'actor_type_not_allowed'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal' or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then raise exception 'security_domain_not_allowed'; end if;
  if action_request ->> 'requestedRisk' <> 'R1' then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then raise exception 'requested_at_required'; end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;

  v_capture_id := nullif(btrim(coalesce(action_request #>> '{payload,captureId}', '')), '')::uuid;
  if v_capture_id is null then raise exception 'capture_id_required'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_capture_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'captureId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('captureId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  select * into v_capture from public.kenos_capture_envelopes where id = v_capture_id and owner_id = v_user_id for update;
  if not found then raise exception 'capture_not_found'; end if;
  if v_capture.status not in ('needs_review', 'classified', 'safely_persisted') then raise exception 'capture_not_convertible'; end if;

  v_title := coalesce(
    nullif(btrim(action_request #>> '{payload,title}'), ''),
    nullif(btrim(v_capture.payload ->> 'text'), ''),
    nullif(btrim(v_capture.payload ->> 'title'), ''),
    'Captured item'
  );
  if length(v_title) > 500 then v_title := left(v_title, 500); end if;

  v_create_request := jsonb_build_object(
    'schemaVersion', '1',
    'id', gen_random_uuid()::text,
    'actionType', 'plan.create_task',
    'producer', 'plan',
    'targetDomain', 'plan',
    'actor', jsonb_build_object('type', 'user', 'id', v_user_id),
    'deviceId', action_request ->> 'deviceId',
    'securityDomain', 'personal',
    'dataClassification', 'personal',
    'requestedRisk', 'R1',
    'payload', jsonb_build_object(
      'title', v_title,
      'notes', coalesce('Converted from capture ' || v_capture_id::text, '')
    ),
    'reason', 'Explicit Capture → Plan conversion',
    'idempotencyKey', 'capture_convert:' || v_idempotency_key,
    'requestedAt', action_request ->> 'requestedAt',
    'correlationId', gen_random_uuid()::text
  );

  v_create_result := private.kenos_create_plan_task_action(v_create_request);
  v_task_id := coalesce(v_create_result ->> 'taskId', v_create_result #>> '{result,taskId}');

  update public.kenos_capture_envelopes
  set status = 'materialized',
      updated_at = v_now,
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'materialized', jsonb_build_object('domain', 'plan', 'taskId', v_task_id, 'at', v_now)
      )
  where id = v_capture_id and owner_id = v_user_id;

  v_entity_ref := jsonb_build_object(
    'id', v_capture_id::text,
    'type', 'capture.envelope',
    'ownerDomain', 'system',
    'ownerId', v_capture_id::text,
    'version', 1
  );

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('captureId', v_capture_id, 'taskId', v_task_id, 'autoConvert', false, 'executor', 'disabled'))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id, 'user', 'plan',
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-capture-2026-07-20',
      'reasons', jsonb_build_array('explicit capture to plan conversion'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Converted Capture to Plan task',
    'succeeded',
    jsonb_build_object('captureId', v_capture_id, 'taskId', v_task_id),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  -- Fix idempotency task_id to created plan task for audit clarity.
  update public.kenos_plan_action_idempotency
  set task_id = coalesce(v_task_id, task_id)
  where user_id = v_user_id and action_id = v_action_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'captureId', v_capture_id, 'taskId', v_task_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('captureId', v_capture_id, 'taskId', v_task_id, 'outboxId', v_outbox_id, 'duplicate', false, 'autoConvert', false),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_convert_capture_to_plan_task_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_convert_capture_to_plan_task_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_convert_capture_to_plan_task_action(action_request);
$$;

revoke all on function public.kenos_convert_capture_to_plan_task_action(jsonb) from public, anon;
grant execute on function public.kenos_convert_capture_to_plan_task_action(jsonb) to authenticated;
