-- Kenos CaptureEnvelope ingest (additive). Stores raw capture; no silent domain conversion.
-- Prerequisites: tip >= 20260720200000.

create table if not exists public.kenos_capture_envelopes (
  id uuid primary key,
  schema_version text not null default '1' check (schema_version = '1'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  source jsonb not null,
  actor_id uuid not null,
  security_domain text not null,
  data_classification text not null,
  suggested_domains jsonb not null default '[]'::jsonb,
  context_refs jsonb not null default '[]'::jsonb,
  content_hash text,
  captured_at timestamptz not null,
  expires_at timestamptz,
  idempotency_key text not null,
  status text not null default 'safely_persisted' check (
    status in (
      'received', 'safely_persisted', 'classified', 'routed', 'materialized',
      'needs_review', 'failed_retryable', 'failed_terminal', 'quarantined', 'cancelled'
    )
  ),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  constraint kenos_capture_envelopes_timestamps_check check (updated_at >= created_at),
  constraint kenos_capture_envelopes_arrays_check check (
    jsonb_typeof(suggested_domains) = 'array' and jsonb_typeof(context_refs) = 'array'
  )
);

create index if not exists kenos_capture_envelopes_owner_created_idx
  on public.kenos_capture_envelopes (owner_id, created_at desc, id desc);
create index if not exists kenos_capture_envelopes_owner_status_idx
  on public.kenos_capture_envelopes (owner_id, status, created_at desc);

alter table public.kenos_capture_envelopes enable row level security;
drop policy if exists kenos_capture_envelopes_select_own on public.kenos_capture_envelopes;
create policy kenos_capture_envelopes_select_own
  on public.kenos_capture_envelopes for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.kenos_capture_envelopes from public, anon, authenticated;
grant select on public.kenos_capture_envelopes to authenticated;

create or replace function public.kenos_list_capture_envelopes(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns setof public.kenos_capture_envelopes
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.kenos_capture_envelopes capture
  where capture.owner_id = (select auth.uid())
    and (p_before is null or capture.created_at < p_before)
  order by capture.created_at desc, capture.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.kenos_list_capture_envelopes(integer, timestamptz) from public, anon;
grant execute on function public.kenos_list_capture_envelopes(integer, timestamptz) to authenticated;

create or replace function private.kenos_ingest_capture_envelope_action(action_request jsonb)
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
  v_kind text;
  v_payload jsonb;
  v_source jsonb;
  v_status text;
  v_captured_at timestamptz;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string' or action_request ->> 'schemaVersion' <> '1' then raise exception 'schema_version_not_supported'; end if;
  if nullif(action_request #>> '{actor,id}', '') is null then raise exception 'actor_id_required'; end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then raise exception 'actor_user_mismatch'; end if;
  if nullif(action_request ->> 'deviceId', '') is null then raise exception 'device_id_required'; end if;
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'capture.ingest_envelope' then raise exception 'unsupported_action'; end if;
  if action_request ->> 'targetDomain' <> 'system' then raise exception 'wrong_owner'; end if;
  if coalesce(action_request ->> 'producer', '') not in ('system', 'assistant', 'plan', 'work') then raise exception 'producer_not_allowed'; end if;
  if coalesce(action_request #>> '{actor,type}', '') not in ('user', 'assistant', 'connector', 'system') then raise exception 'actor_type_not_allowed'; end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then raise exception 'invalid_action_payload'; end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal' or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then raise exception 'security_domain_not_allowed'; end if;
  if action_request ->> 'requestedRisk' <> 'R1' then raise exception 'risk_not_allowed'; end if;
  if nullif(action_request ->> 'requestedAt', '') is null or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then raise exception 'requested_at_required'; end if;
  if v_action_id is null or v_action_id = '' then raise exception 'action_id_required'; end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  if v_correlation_id is null or v_correlation_id = '' then raise exception 'correlation_id_required'; end if;
  perform v_correlation_id::uuid;

  v_capture_id := coalesce(nullif(action_request #>> '{payload,captureId}', '')::uuid, v_action_id::uuid);
  v_kind := coalesce(nullif(btrim(action_request #>> '{payload,kind}'), ''), 'text');
  v_payload := coalesce(action_request -> 'payload' -> 'capturePayload', '{}'::jsonb);
  v_source := coalesce(action_request -> 'payload' -> 'source', jsonb_build_object('client', 'kenos-canary', 'deviceId', action_request ->> 'deviceId'));
  v_captured_at := coalesce(nullif(action_request #>> '{payload,capturedAt}', '')::timestamptz, (action_request ->> 'requestedAt')::timestamptz);
  -- Uncertain captures stay in Inbox needs_review; never silent Plan/Work convert.
  v_status := coalesce(nullif(btrim(action_request #>> '{payload,status}'), ''), 'needs_review');
  if v_status not in ('safely_persisted', 'classified', 'needs_review') then raise exception 'invalid_capture_status_for_ingest'; end if;

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

  insert into public.kenos_capture_envelopes (
    id, schema_version, owner_id, kind, payload, source, actor_id,
    security_domain, data_classification, suggested_domains, context_refs,
    content_hash, captured_at, expires_at, idempotency_key, status, correlation_id, created_at, updated_at
  ) values (
    v_capture_id,
    '1',
    v_user_id,
    v_kind,
    v_payload,
    v_source,
    v_user_id,
    'personal',
    'personal',
    coalesce(action_request -> 'payload' -> 'suggestedDomains', '[]'::jsonb),
    coalesce(action_request -> 'payload' -> 'contextRefs', '[]'::jsonb),
    nullif(action_request #>> '{payload,contentHash}', ''),
    v_captured_at,
    nullif(action_request #>> '{payload,expiresAt}', '')::timestamptz,
    coalesce(nullif(action_request #>> '{payload,envelopeIdempotencyKey}', ''), v_idempotency_key),
    v_status,
    v_correlation_id::uuid,
    v_now,
    v_now
  );

  v_entity_ref := jsonb_build_object(
    'id', v_capture_id::text,
    'type', 'capture.envelope',
    'ownerDomain', 'system',
    'ownerId', v_capture_id::text,
    'version', 1
  );

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref,
    jsonb_build_object('captureId', v_capture_id, 'status', v_status, 'autoConvert', false, 'executor', 'disabled'))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (
    user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo
  ) values (
    v_user_id, v_action_id, v_action_type, v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'user'),
    coalesce(action_request ->> 'producer', 'system'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-capture-2026-07-20',
      'reasons', jsonb_build_array('capture ingest; no silent conversion'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Ingested CaptureEnvelope',
    'succeeded',
    jsonb_build_object('captureId', v_capture_id, 'kind', v_kind, 'status', v_status),
    jsonb_build_object('supported', false)
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'captureId', v_capture_id, 'requestId', v_action_id,
    'activityId', v_activity_id, 'outboxId', v_outbox_id,
    'result', jsonb_build_object('captureId', v_capture_id, 'captureStatus', v_status, 'autoConvert', false, 'outboxId', v_outbox_id, 'duplicate', false),
    'affectedEntities', jsonb_build_array(v_entity_ref),
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key, 'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_ingest_capture_envelope_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_ingest_capture_envelope_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_ingest_capture_envelope_action(action_request);
$$;

revoke all on function public.kenos_ingest_capture_envelope_action(jsonb) from public, anon;
grant execute on function public.kenos_ingest_capture_envelope_action(jsonb) to authenticated;
