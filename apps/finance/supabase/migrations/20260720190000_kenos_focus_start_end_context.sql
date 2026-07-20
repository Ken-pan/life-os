-- Kenos Track E: FocusContext start/end Writers (additive).
-- Prerequisites: tip >= 20260720180000; kenos_focus_contexts present.
-- Does not open deferred release or proactive suggestions writers.

create or replace function private.kenos_start_focus_context_action(action_request jsonb)
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
  v_focus_id uuid;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_entity_ref jsonb;
  v_mode text;
  v_title text;
  v_safe_summary text;
  v_active_space text;
  v_deferred_queue_ref uuid;
  v_source text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'focus.start_context' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'assistant' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('assistant', 'system', 'plan') then raise exception 'producer_not_allowed'; end if;
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

  v_focus_id := coalesce(nullif(action_request #>> '{payload,focusId}', '')::uuid, v_action_id::uuid);
  v_mode := coalesce(nullif(btrim(action_request #>> '{payload,mode}'), ''), 'deep_work');
  if v_mode not in ('training', 'deep_work', 'meeting', 'reading', 'home_organizing', 'finance_review', 'wind_down', 'custom') then
    raise exception 'invalid_focus_mode';
  end if;
  v_title := coalesce(nullif(btrim(action_request #>> '{payload,title}'), ''), 'Focus session');
  if length(v_title) > 120 then raise exception 'invalid_title'; end if;
  v_safe_summary := coalesce(nullif(btrim(action_request #>> '{payload,safeSummary}'), ''), 'Owner-started Focus context');
  if length(v_safe_summary) > 500 or v_safe_summary ~* '\m(token|secret|password|authorization|cookie|bearer)\M' then raise exception 'invalid_safe_summary'; end if;
  v_active_space := coalesce(nullif(btrim(action_request #>> '{payload,activeSpace}'), ''), 'plan');
  v_source := coalesce(nullif(btrim(action_request #>> '{payload,source}'), ''), 'user');
  if v_source not in ('user', 'assistant_suggestion', 'apple_focus_suggestion', 'system', 'deep_link') then raise exception 'invalid_source'; end if;
  v_deferred_queue_ref := coalesce(nullif(action_request #>> '{payload,deferredQueueRef}', '')::uuid, gen_random_uuid());

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_focus_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'focusId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('focusId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  -- Single active focus: end any other active contexts for this owner first.
  update public.kenos_focus_contexts
  set status = 'completed',
      ended_at = coalesce(ended_at, v_now),
      updated_at = v_now
  where owner_id = v_user_id
    and status in ('starting', 'active', 'temporarily_left', 'paused', 'ending')
    and id <> v_focus_id;

  insert into public.kenos_focus_contexts (
    id, version, owner_id, mode, active_space, active_session_ref,
    started_at, expected_end_at, paused_at, ended_at, status,
    visible_domains, hidden_domains, allowed_interruption_categories,
    assistant_scope, notification_policy_ref, deferred_queue_ref, return_destination,
    source, classification, title, safe_summary, correlation_id, created_at, updated_at
  ) values (
    v_focus_id,
    '1',
    v_user_id,
    v_mode,
    v_active_space,
    coalesce(action_request -> 'payload' -> 'activeSessionRef', '{}'::jsonb),
    v_now,
    nullif(action_request #>> '{payload,expectedEndAt}', '')::timestamptz,
    null,
    null,
    'active',
    coalesce(action_request -> 'payload' -> 'visibleDomains', '["plan"]'::jsonb),
    coalesce(action_request -> 'payload' -> 'hiddenDomains', '[]'::jsonb),
    coalesce(action_request -> 'payload' -> 'allowedInterruptionCategories', '[]'::jsonb),
    coalesce(action_request -> 'payload' -> 'assistantScope', jsonb_build_object('scope', 'context', 'domains', jsonb_build_array(v_active_space))),
    coalesce(nullif(btrim(action_request #>> '{payload,notificationPolicyRef}'), ''), 'default'),
    v_deferred_queue_ref,
    coalesce(action_request -> 'payload' -> 'returnDestination', jsonb_build_object('type', 'space', 'id', v_active_space)),
    v_source,
    'personal',
    v_title,
    v_safe_summary,
    v_correlation_id::uuid,
    v_now,
    v_now
  )
  on conflict (id) do update
  set mode = excluded.mode,
      active_space = excluded.active_space,
      started_at = coalesce(public.kenos_focus_contexts.started_at, excluded.started_at),
      status = 'active',
      ended_at = null,
      title = excluded.title,
      safe_summary = excluded.safe_summary,
      updated_at = v_now
  where public.kenos_focus_contexts.owner_id = v_user_id;

  v_entity_ref := jsonb_build_object(
    'id', v_focus_id::text,
    'type', 'focus.context',
    'ownerDomain', 'assistant',
    'ownerId', v_focus_id::text,
    'version', 1
  );

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('focusId', v_focus_id, 'status', 'active', 'executor', 'disabled'))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id, 'user',
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-track-e-2026-07-20',
      'reasons', jsonb_build_array('focus start context writer'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Started Focus context',
    'succeeded',
    jsonb_build_object('focusId', v_focus_id, 'mode', v_mode, 'title', v_title),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'focusId', v_focus_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('focusId', v_focus_id, 'outboxId', v_outbox_id, 'duplicate', false, 'focusStatus', 'active'),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_start_focus_context_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_start_focus_context_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_start_focus_context_action(action_request);
$$;

revoke all on function public.kenos_start_focus_context_action(jsonb) from public, anon;
grant execute on function public.kenos_start_focus_context_action(jsonb) to authenticated;

create or replace function private.kenos_end_focus_context_action(action_request jsonb)
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
  v_focus_id uuid;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_entity_ref jsonb;
  v_row public.kenos_focus_contexts%rowtype;
  v_end_status text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'focus.end_context' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'assistant' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('assistant', 'system', 'plan') then raise exception 'producer_not_allowed'; end if;
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

  v_focus_id := nullif(btrim(coalesce(action_request #>> '{payload,focusId}', '')), '')::uuid;
  if v_focus_id is null then raise exception 'focus_id_required'; end if;
  v_end_status := coalesce(nullif(btrim(action_request #>> '{payload,endStatus}'), ''), 'completed');
  if v_end_status not in ('completed', 'cancelled') then raise exception 'invalid_end_status'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_focus_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'focusId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('focusId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  select * into v_row from public.kenos_focus_contexts where id = v_focus_id and owner_id = v_user_id for update;
  if not found then raise exception 'focus_not_found'; end if;

  update public.kenos_focus_contexts
  set status = v_end_status,
      ended_at = v_now,
      updated_at = v_now
  where id = v_focus_id and owner_id = v_user_id;

  v_entity_ref := jsonb_build_object(
    'id', v_focus_id::text,
    'type', 'focus.context',
    'ownerDomain', 'assistant',
    'ownerId', v_focus_id::text,
    'version', 1
  );

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('focusId', v_focus_id, 'status', v_end_status, 'executor', 'disabled'))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id, 'user',
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-track-e-2026-07-20',
      'reasons', jsonb_build_array('focus end context writer'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    case when v_end_status = 'cancelled' then 'Cancelled Focus context' else 'Ended Focus context' end,
    'succeeded',
    jsonb_build_object('focusId', v_focus_id, 'status', v_end_status),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'focusId', v_focus_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('focusId', v_focus_id, 'outboxId', v_outbox_id, 'duplicate', false, 'focusStatus', v_end_status),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_end_focus_context_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_end_focus_context_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_end_focus_context_action(action_request);
$$;

revoke all on function public.kenos_end_focus_context_action(jsonb) from public, anon;
grant execute on function public.kenos_end_focus_context_action(jsonb) to authenticated;
