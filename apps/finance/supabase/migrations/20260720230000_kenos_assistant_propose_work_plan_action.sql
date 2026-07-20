-- Assistant proposed Work→Plan Action (no auto-execute / no ProductionExecutor).
-- Prerequisites: tip >= 20260720220000.

create or replace function private.kenos_propose_work_plan_action(action_request jsonb)
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
  v_proposal_id uuid;
  v_project_id uuid;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_entity_ref jsonb;
  v_title text;
  v_context text;
  v_risk text;
  v_proposal_record jsonb;
  v_project public.kenos_work_projects%rowtype;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'assistant.propose_work_plan_action' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'work' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') <> 'assistant' then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request #>> '{actor,type}', '') not in ('assistant', 'user') then raise exception 'actor_type_not_allowed'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if action_request -> 'payload' ? 'task' or action_request -> 'payload' ? 'canonicalTask' then raise exception 'work_must_not_embed_canonical_task'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal' or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then raise exception 'security_domain_not_allowed'; end if;
  if action_request ->> 'requestedRisk' not in ('R1', 'R2') then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then raise exception 'requested_at_required'; end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;

  v_proposal_id := coalesce(nullif(action_request #>> '{payload,proposalId}', '')::uuid, v_action_id::uuid);
  v_project_id := nullif(btrim(coalesce(action_request #>> '{payload,projectId}', '')), '')::uuid;
  if v_project_id is null then raise exception 'project_id_required'; end if;
  v_title := nullif(btrim(coalesce(action_request #>> '{payload,proposedTaskTitle}', '')), '');
  if v_title is null then raise exception 'proposed_task_title_required'; end if;
  v_context := coalesce(nullif(btrim(action_request #>> '{payload,safeContext}'), ''), 'Assistant proposed Plan action');
  v_risk := coalesce(nullif(btrim(action_request #>> '{payload,risk}'), ''), action_request ->> 'requestedRisk');

  select * into v_project from public.kenos_work_projects where id = v_project_id and owner_id = v_user_id;
  if not found then raise exception 'work_project_not_found'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_proposal_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'proposalId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id, 'outboxId', v_outbox_id,
      'result', jsonb_build_object('proposalId', v_existing.task_id, 'outboxId', v_outbox_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  v_proposal_record := jsonb_build_object(
    'id', v_proposal_id,
    'version', '1',
    'ownerId', v_user_id,
    'workEntityRef', jsonb_build_object(
      'id', v_project_id::text,
      'type', 'work.project',
      'ownerDomain', 'work',
      'ownerId', v_user_id::text,
      'version', 1
    ),
    'proposedTaskTitle', v_title,
    'safeContext', v_context,
    'suggestedDueAt', '',
    'suggestedPriority', coalesce(nullif(action_request #>> '{payload,suggestedPriority}', ''), 'normal'),
    'risk', v_risk,
    'status', 'proposed',
    'planActionId', '',
    'dataClassification', 'personal',
    'requestedAt', action_request ->> 'requestedAt',
    'resolvedAt', '',
    'correlationId', v_correlation_id,
    'idempotencyKey', v_idempotency_key,
    'createdAt', v_now,
    'updatedAt', v_now
  );

  perform private.kenos_store_work_action_proposal(v_proposal_record);

  v_entity_ref := jsonb_build_object(
    'id', v_proposal_id::text,
    'type', 'work.action_proposal',
    'ownerDomain', 'work',
    'ownerId', v_user_id::text,
    'version', 1
  );

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('proposalId', v_proposal_id, 'projectId', v_project_id, 'executor', 'disabled', 'autoExecute', false))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'assistant'),
    'assistant',
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', v_risk,
      'policyVersion', 'kenos-assistant-2026-07-20',
      'reasons', jsonb_build_array('assistant propose only; no executor'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Proposed Work→Plan action',
    'succeeded',
    jsonb_build_object('proposalId', v_proposal_id, 'projectId', v_project_id, 'proposedTaskTitle', v_title),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'proposalId', v_proposal_id, 'projectId', v_project_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('proposalId', v_proposal_id, 'projectId', v_project_id, 'outboxId', v_outbox_id, 'duplicate', false, 'autoExecute', false),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_propose_work_plan_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_propose_work_plan_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_propose_work_plan_action(action_request);
$$;

revoke all on function public.kenos_propose_work_plan_action(jsonb) from public, anon;
grant execute on function public.kenos_propose_work_plan_action(jsonb) to authenticated;
