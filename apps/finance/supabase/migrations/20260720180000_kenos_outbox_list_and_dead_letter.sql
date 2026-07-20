-- Kenos Track D: Outbox read + owner dead-letter (no ProductionExecutor / no publish).
-- Transition to processing/published remains private to kenos_outbox_worker only.
-- Prerequisites: tip >= 20260720170000.

create or replace function public.kenos_list_plan_outbox(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,
  schema_version text,
  user_id uuid,
  action_id text,
  action_type text,
  idempotency_key text,
  correlation_id text,
  entity_ref jsonb,
  status text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  next_attempt_at timestamptz,
  last_error_class text,
  terminal_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    outbox.id,
    outbox.schema_version,
    outbox.user_id,
    outbox.action_id,
    outbox.action_type,
    outbox.idempotency_key,
    outbox.correlation_id,
    outbox.entity_ref,
    outbox.status,
    outbox.payload,
    outbox.attempts,
    outbox.max_attempts,
    outbox.next_attempt_at,
    outbox.last_error_class,
    outbox.terminal_reason,
    outbox.created_at,
    outbox.updated_at
  from public.kenos_plan_outbox outbox
  where outbox.user_id = (select auth.uid())
    and (p_before is null or outbox.created_at < p_before)
  order by outbox.created_at desc, outbox.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.kenos_list_plan_outbox(integer, timestamptz) from public, anon;
grant execute on function public.kenos_list_plan_outbox(integer, timestamptz) to authenticated;

create or replace function private.kenos_dead_letter_plan_outbox_action(action_request jsonb)
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
  v_outbox_id uuid;
  v_reason text;
  v_now timestamptz := clock_timestamp();
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_activity_id uuid;
  v_row public.kenos_plan_outbox%rowtype;
  v_transition jsonb;
  v_entity_ref jsonb;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'outbox.dead_letter' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'system' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') <> 'system' then raise exception 'producer_not_allowed'; end if;
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

  v_outbox_id := nullif(btrim(coalesce(action_request #>> '{payload,outboxId}', '')), '')::uuid;
  if v_outbox_id is null then raise exception 'outbox_id_required'; end if;
  v_reason := nullif(btrim(coalesce(action_request #>> '{payload,terminalReason}', '')), '');
  if v_reason is null then raise exception 'terminal_reason_required'; end if;

  select * into v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then raise exception 'action_id_reused'; end if;

  insert into public.kenos_plan_action_idempotency (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_outbox_id::text, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing returning * into v_existing;

  if not found then
    select * into strict v_existing from public.kenos_plan_action_idempotency where user_id = v_user_id and action_type = v_action_type and idempotency_key = v_idempotency_key;
    select id into v_activity_id from public.kenos_plan_activity where user_id = v_user_id and correlation_id = v_existing.correlation_id limit 1;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'outboxId', v_existing.task_id, 'requestId', v_existing.action_id,
      'activityId', v_activity_id,
      'result', jsonb_build_object('outboxId', v_existing.task_id, 'duplicate', true),
      'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', v_idempotency_key, 'correlationId', v_existing.correlation_id
    );
  end if;

  select * into v_row from public.kenos_plan_outbox where id = v_outbox_id and user_id = v_user_id for update;
  if not found then raise exception 'outbox_not_found'; end if;
  if v_row.status not in ('pending', 'retry') then raise exception 'outbox_not_dead_letterable'; end if;

  v_transition := private.kenos_transition_plan_outbox(v_outbox_id, v_row.status, 'dead_letter', 'permanent', v_reason, null);

  v_entity_ref := jsonb_build_object(
    'id', v_outbox_id::text,
    'type', 'outbox.item',
    'ownerDomain', 'system',
    'ownerId', v_outbox_id::text,
    'version', 1
  );

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id, 'user', 'system',
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-track-d-2026-07-20',
      'reasons', jsonb_build_array('owner outbox dead-letter; executor still disabled'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Dead-lettered outbox item',
    'succeeded',
    jsonb_build_object('outboxId', v_outbox_id, 'status', 'dead_letter'),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'outboxId', v_outbox_id, 'requestId', v_action_id,
    'activityId', v_activity_id,
    'result', jsonb_build_object('outboxId', v_outbox_id, 'transition', v_transition, 'duplicate', false, 'executor', 'disabled'),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_dead_letter_plan_outbox_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_dead_letter_plan_outbox_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_dead_letter_plan_outbox_action(action_request);
$$;

revoke all on function public.kenos_dead_letter_plan_outbox_action(jsonb) from public, anon;
grant execute on function public.kenos_dead_letter_plan_outbox_action(jsonb) to authenticated;
