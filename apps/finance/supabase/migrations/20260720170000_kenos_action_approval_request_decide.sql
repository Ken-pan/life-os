-- Kenos Track D: Approval request + decision Writers (additive).
-- ProductionExecutor remains disabled; decide may enqueue Outbox pending only.
-- Prerequisites: tip >= 20260720160000; private approval store/transition present.

create or replace function private.kenos_request_action_approval_action(action_request jsonb)
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
  v_approval_id uuid;
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_expires_at timestamptz;
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_entity_ref jsonb;
  v_approval_record jsonb;
  v_risk text;
  v_safe_summary text;
  v_reason_code text;
  v_domain text;
  v_classification text;
  v_proposed_action_type text;
  v_proposed_action_id uuid;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'approval.request' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'assistant' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('assistant', 'system', 'plan') then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request #>> '{actor,type}', '') not in ('user', 'assistant', 'system') then raise exception 'actor_type_not_allowed'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal' or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then raise exception 'security_domain_not_allowed'; end if;
  if action_request ->> 'requestedRisk' not in ('R1', 'R2', 'R3') then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then raise exception 'requested_at_required'; end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;

  v_approval_id := coalesce(nullif(action_request #>> '{payload,approvalId}', '')::uuid, v_action_id::uuid);
  v_proposed_action_id := coalesce(nullif(action_request #>> '{payload,proposedActionId}', '')::uuid, v_approval_id);
  v_proposed_action_type := coalesce(nullif(btrim(action_request #>> '{payload,proposedActionType}'), ''), 'plan.create_task');
  if v_proposed_action_type !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then raise exception 'invalid_proposed_action_type'; end if;
  v_risk := coalesce(nullif(action_request #>> '{payload,risk}', ''), action_request ->> 'requestedRisk');
  if v_risk not in ('R0', 'R1', 'R2', 'R3', 'R4') then raise exception 'invalid_risk'; end if;
  v_safe_summary := coalesce(nullif(btrim(action_request #>> '{payload,safeSummary}'), ''), 'Approval required for proposed action');
  if length(v_safe_summary) > 500 or v_safe_summary ~* '\m(token|secret|password|authorization|cookie|bearer)\M' then raise exception 'invalid_safe_summary'; end if;
  v_reason_code := coalesce(nullif(btrim(action_request #>> '{payload,reasonCode}'), ''), 'policy_requires_approval');
  if v_reason_code !~ '^[a-z][a-z0-9_]*$' then raise exception 'invalid_reason_code'; end if;
  v_domain := coalesce(nullif(btrim(action_request #>> '{payload,requestingDomain}'), ''), 'assistant');
  v_classification := coalesce(nullif(btrim(action_request #>> '{payload,dataClassification}'), ''), 'personal');
  v_requested_at := (action_request ->> 'requestedAt')::timestamptz;
  v_expires_at := coalesce(nullif(action_request #>> '{payload,expiresAt}', '')::timestamptz, v_requested_at + interval '24 hours');
  if v_expires_at <= v_requested_at then raise exception 'invalid_expiry'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_approval_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'approvalId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id,
      'result', jsonb_build_object('approvalId', v_existing.task_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  v_entity_ref := jsonb_build_object(
    'id', v_approval_id::text,
    'type', 'approval.request',
    'ownerDomain', 'assistant',
    'ownerId', v_approval_id::text,
    'version', 1
  );

  v_approval_record := jsonb_build_object(
    'id', v_approval_id,
    'version', '1',
    'ownerId', v_user_id,
    'actionId', v_proposed_action_id,
    'correlationId', v_correlation_id::uuid,
    'requestingActor', jsonb_build_object(
      'type', coalesce(action_request #>> '{actor,type}', 'assistant'),
      'id', v_user_id
    ),
    'requestingDomain', v_domain,
    'actionType', v_proposed_action_type,
    'risk', v_risk,
    'status', 'pending',
    'reasonCode', v_reason_code,
    'safeSummary', v_safe_summary,
    'dataClassification', v_classification,
    'requestedAt', v_requested_at,
    'expiresAt', v_expires_at,
    'decidedAt', '',
    'decidedBy', '',
    'decisionReason', '',
    'supersedesApprovalId', '',
    'entityRefs', coalesce(action_request -> 'payload' -> 'entityRefs', '[]'::jsonb),
    'createdAt', v_now,
    'updatedAt', v_now
  );

  perform private.kenos_store_action_approval(v_approval_record);

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'assistant'),
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', v_risk,
      'policyVersion', 'kenos-track-d-2026-07-20',
      'reasons', jsonb_build_array('approval request writer'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Requested action approval',
    'succeeded',
    jsonb_build_object('approvalId', v_approval_id, 'proposedActionType', v_proposed_action_type, 'risk', v_risk),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'approvalId', v_approval_id, 'requestId', v_action_id,
    'activityId', v_activity_id,
    'result', jsonb_build_object('approvalId', v_approval_id, 'duplicate', false),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_request_action_approval_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_request_action_approval_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_request_action_approval_action(action_request);
$$;

revoke all on function public.kenos_request_action_approval_action(jsonb) from public, anon;
grant execute on function public.kenos_request_action_approval_action(jsonb) to authenticated;

create or replace function private.kenos_decide_action_approval_action(action_request jsonb)
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
  v_approval_id uuid;
  v_next_status text;
  v_decision_reason text;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_entity_ref jsonb;
  v_status text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'approval.decide' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'assistant' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('assistant', 'system', 'plan') then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request #>> '{actor,type}', '') <> 'user' then raise exception 'decision_actor_must_be_user'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal' or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then raise exception 'security_domain_not_allowed'; end if;
  if action_request ->> 'requestedRisk' not in ('R1', 'R2') then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then raise exception 'requested_at_required'; end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;

  v_approval_id := nullif(btrim(coalesce(action_request #>> '{payload,approvalId}', '')), '')::uuid;
  if v_approval_id is null then raise exception 'approval_id_required'; end if;
  v_next_status := nullif(btrim(coalesce(action_request #>> '{payload,nextStatus}', '')), '');
  if v_next_status not in ('approved', 'rejected', 'cancelled') then raise exception 'invalid_next_status'; end if;
  v_decision_reason := nullif(btrim(coalesce(action_request #>> '{payload,decisionReason}', '')), '');
  if v_decision_reason is null then raise exception 'decision_reason_required'; end if;
  if length(v_decision_reason) > 500 then raise exception 'decision_reason_too_long'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_approval_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'approvalId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('approvalId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  v_status := private.kenos_transition_action_approval(
    v_approval_id,
    'pending',
    v_next_status,
    v_user_id,
    v_decision_reason
  );

  v_entity_ref := jsonb_build_object(
    'id', v_approval_id::text,
    'type', 'approval.decision',
    'ownerDomain', 'assistant',
    'ownerId', v_approval_id::text,
    'version', 1
  );

  -- Outbox pending only — ProductionExecutor must remain disabled.
  insert into public.kenos_plan_outbox (
    user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload
  ) values (
    v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('approvalId', v_approval_id, 'status', v_status, 'executor', 'disabled')
  ) returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id, 'user',
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', action_request ->> 'requestedRisk',
      'policyVersion', 'kenos-track-d-2026-07-20',
      'reasons', jsonb_build_array('owner approval decision writer'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    case when v_status = 'approved' then 'Approved action' when v_status = 'rejected' then 'Rejected action' else 'Cancelled approval' end,
    'succeeded',
    jsonb_build_object('approvalId', v_approval_id, 'status', v_status),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'approvalId', v_approval_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('approvalId', v_approval_id, 'decisionStatus', v_status, 'outboxId', v_outbox_id, 'duplicate', false, 'executor', 'disabled'),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_decide_action_approval_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_decide_action_approval_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_decide_action_approval_action(action_request);
$$;

revoke all on function public.kenos_decide_action_approval_action(jsonb) from public, anon;
grant execute on function public.kenos_decide_action_approval_action(jsonb) to authenticated;
