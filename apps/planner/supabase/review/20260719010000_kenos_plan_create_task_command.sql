-- KR-P1-001A review artifact for disposable databases only.
-- This file intentionally lives outside migrations/ so routine Planner migration
-- commands cannot apply it before the production mapping/cutover gate is approved.

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.kenos_plan_action_idempotency (
  user_id uuid not null references auth.users (id) on delete cascade,
  action_id text not null,
  action_type text not null,
  idempotency_key text not null,
  task_id text not null,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, action_type, idempotency_key),
  unique (user_id, action_id),
  unique (user_id, correlation_id)
);

create table if not exists public.kenos_plan_activity (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null default '1' check (schema_version = '1'),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_id text not null,
  action_type text not null,
  correlation_id text not null,
  actor_type text not null check (actor_type in ('user', 'assistant', 'automation', 'connector', 'system')),
  source_domain text not null,
  policy jsonb not null,
  entity_ref jsonb,
  summary text not null,
  result text not null default 'succeeded' check (result in ('succeeded', 'failed', 'queued', 'undone', 'cancelled')),
  redacted_payload jsonb not null default '{}'::jsonb,
  undo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kenos_plan_outbox (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null default '1' check (schema_version = '1'),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_id text not null,
  action_type text not null,
  idempotency_key text not null,
  correlation_id text not null,
  entity_ref jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'retry', 'dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  last_error_class text check (last_error_class in ('transient', 'permanent')),
  terminal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, action_type, idempotency_key)
);

create index if not exists kenos_plan_outbox_pending_idx
  on public.kenos_plan_outbox (status, next_attempt_at)
  where status in ('pending', 'retry');

create index if not exists kenos_plan_activity_correlation_idx
  on public.kenos_plan_activity (user_id, correlation_id);

alter table public.kenos_plan_action_idempotency enable row level security;
alter table public.kenos_plan_activity enable row level security;
alter table public.kenos_plan_outbox enable row level security;

drop policy if exists "kenos_plan_action_idempotency_select_own" on public.kenos_plan_action_idempotency;
create policy "kenos_plan_action_idempotency_select_own"
  on public.kenos_plan_action_idempotency for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "kenos_plan_activity_select_own" on public.kenos_plan_activity;
create policy "kenos_plan_activity_select_own"
  on public.kenos_plan_activity for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "kenos_plan_outbox_select_own" on public.kenos_plan_outbox;
create policy "kenos_plan_outbox_select_own"
  on public.kenos_plan_outbox for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on public.kenos_plan_action_idempotency from public, anon, authenticated;
revoke all on public.kenos_plan_activity from public, anon, authenticated;
revoke all on public.kenos_plan_outbox from public, anon, authenticated;
grant select on public.kenos_plan_action_idempotency to authenticated;
grant select on public.kenos_plan_activity to authenticated;
grant select on public.kenos_plan_outbox to authenticated;
-- The canonical Planner task table already has per-user SELECT RLS. Keep this
-- review artifact self-contained in disposable databases where API grants have
-- not been bootstrapped, without granting a second direct write path.
grant select on public.planner_tasks to authenticated;

create or replace function private.kenos_create_plan_task_action(action_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_user_id uuid;
  v_device_id uuid;
  v_action_id text := action_request ->> 'id';
  v_action_type text := action_request ->> 'actionType';
  v_idempotency_key text := action_request ->> 'idempotencyKey';
  v_correlation_id text := action_request ->> 'correlationId';
  v_title text := btrim(coalesce(action_request #>> '{payload,title}', ''));
  v_task_id text := gen_random_uuid()::text;
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_now_ms bigint;
  v_task_data jsonb;
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_entity_ref jsonb;
  v_activity_id uuid;
  v_outbox_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if jsonb_typeof(action_request -> 'schemaVersion') <> 'string'
     or action_request ->> 'schemaVersion' <> '1' then
    raise exception 'schema_version_not_supported';
  end if;
  if nullif(action_request #>> '{actor,id}', '') is null then
    raise exception 'actor_id_required';
  end if;
  v_actor_user_id := (action_request #>> '{actor,id}')::uuid;
  if v_actor_user_id <> v_user_id then
    raise exception 'actor_user_mismatch';
  end if;
  if nullif(action_request ->> 'deviceId', '') is null then
    raise exception 'device_id_required';
  end if;
  v_device_id := (action_request ->> 'deviceId')::uuid;
  if v_action_type <> 'plan.create_task' then
    raise exception 'unsupported_action';
  end if;
  if action_request ->> 'targetDomain' <> 'plan' then
    raise exception 'wrong_owner';
  end if;
  if coalesce(action_request ->> 'producer', '') = 'work' or action_request #> '{payload,workSource}' is not null then
    raise exception 'work_source_excluded';
  end if;
  if coalesce(action_request ->> 'producer', '') not in ('assistant', 'plan') then
    raise exception 'producer_not_allowed';
  end if;
  if coalesce(action_request ->> 'producer', '') = 'assistant'
     and coalesce(action_request #>> '{actor,type}', '') <> 'assistant' then
    raise exception 'assistant_actor_required';
  end if;
  if coalesce(action_request ->> 'producer', '') = 'plan'
     and coalesce(action_request #>> '{actor,type}', '') <> 'user' then
    raise exception 'plan_actor_required';
  end if;
  if jsonb_typeof(action_request -> 'payload') <> 'object' then
    raise exception 'invalid_action_payload';
  end if;
  if coalesce(action_request ->> 'securityDomain', '') <> 'personal'
     or coalesce(action_request ->> 'dataClassification', '') <> 'personal' then
    raise exception 'security_domain_not_allowed';
  end if;
  if coalesce(action_request ->> 'requestedRisk', '') <> 'R1' then
    raise exception 'risk_not_allowed';
  end if;
  if action_request ? 'expectedVersion' then
    raise exception 'version_conflict';
  end if;
  if nullif(action_request ->> 'requestedAt', '') is null then
    raise exception 'requested_at_required';
  end if;
  v_requested_at := (action_request ->> 'requestedAt')::timestamptz;
  if nullif(action_request ->> 'expiresAt', '') is not null
     and (action_request ->> 'expiresAt')::timestamptz <= v_requested_at then
    raise exception 'invalid_expiry';
  end if;
  if nullif(action_request ->> 'expiresAt', '') is not null
     and (action_request ->> 'expiresAt')::timestamptz <= v_now then
    raise exception 'action_expired';
  end if;
  if v_action_id is null or v_action_id = '' then
    raise exception 'action_id_required';
  end if;
  perform v_action_id::uuid;
  if v_idempotency_key is null or v_idempotency_key = '' then
    raise exception 'idempotency_key_required';
  end if;
  if v_correlation_id is null or v_correlation_id = '' then
    raise exception 'correlation_id_required';
  end if;
  perform v_correlation_id::uuid;
  if v_title = '' then
    raise exception 'title_required';
  end if;

  select * into v_existing
  from public.kenos_plan_action_idempotency
  where user_id = v_user_id and action_id = v_action_id;
  if found and (v_existing.action_type <> v_action_type or v_existing.idempotency_key <> v_idempotency_key) then
    raise exception 'action_id_reused';
  end if;

  insert into public.kenos_plan_action_idempotency
    (user_id, action_id, action_type, idempotency_key, task_id, correlation_id)
  values
    (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_task_id, v_correlation_id)
  on conflict (user_id, action_type, idempotency_key) do nothing
  returning * into v_existing;

  if not found then
    select * into strict v_existing
    from public.kenos_plan_action_idempotency
    where user_id = v_user_id
      and action_type = v_action_type
      and idempotency_key = v_idempotency_key;

    select id into v_activity_id
    from public.kenos_plan_activity
    where user_id = v_user_id and correlation_id = v_existing.correlation_id
    limit 1;

    select id into v_outbox_id
    from public.kenos_plan_outbox
    where user_id = v_user_id
      and action_type = v_action_type
      and idempotency_key = v_idempotency_key
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'taskId', v_existing.task_id,
      'requestId', v_existing.action_id,
      'activityId', v_activity_id,
      'outboxId', v_outbox_id,
      'idempotencyKey', v_idempotency_key,
      'correlationId', v_existing.correlation_id
    );
  end if;

  v_now_ms := floor(extract(epoch from v_now) * 1000)::bigint;
  v_entity_ref := jsonb_build_object(
    'id', v_task_id,
    'type', 'plan.task',
    'ownerDomain', 'plan',
    'ownerId', v_task_id,
    'version', 1
  );
  v_task_data := jsonb_build_object(
    'id', v_task_id,
    'title', v_title,
    'notes', coalesce(action_request #>> '{payload,notes}', ''),
    'listId', coalesce(nullif(action_request #>> '{payload,listId}', ''), 'inbox'),
    'priority', coalesce(nullif(action_request #>> '{payload,priority}', ''), 'P3'),
    'urgency', 'normal',
    'size', 'medium',
    'area', 'other',
    'effortMin', null,
    'nextAction', null,
    'aiContext', null,
    'projectId', null,
    'dueDate', action_request #> '{payload,dueDate}',
    'dueTime', null,
    'scheduledDate', null,
    'scheduledStart', null,
    'durationMinutes', null,
    'reminderMinutes', null,
    'recurrence', null,
    'tags', '[]'::jsonb,
    'subtasks', '[]'::jsonb,
    'completed', false,
    'completedAt', null,
    'createdAt', v_now_ms,
    'updatedAt', v_now_ms,
    'deletedAt', null,
    'sortOrder', v_now_ms,
    'meta', jsonb_build_object(
      'kind', 'standard',
      'source', 'assistant_action',
      'command', jsonb_build_object(
        'schemaVersion', '1',
        'actionRequestId', v_action_id,
        'actionType', v_action_type,
        'idempotencyKey', v_idempotency_key,
        'correlationId', v_correlation_id
      )
    )
  );

  insert into public.planner_tasks (user_id, id, data, updated_at)
  values (v_user_id, v_task_id, v_task_data, v_now);

  insert into public.kenos_plan_outbox
    (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (
    v_user_id,
    v_action_id,
    v_action_type,
    v_idempotency_key,
    v_correlation_id,
    v_entity_ref,
    jsonb_build_object('taskId', v_task_id, 'title', v_title)
  )
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity
    (user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo)
  values (
    v_user_id,
    v_action_id,
    v_action_type,
    v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'user'),
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-phase1-2026-07-19',
      'reasons', jsonb_build_array('explicit create-task command'),
      'decidedAt', v_now
    ),
    v_entity_ref,
    'Created Plan task',
    'succeeded',
    jsonb_build_object(
      'title', v_title,
      'notes', case when action_request #>> '{payload,notes}' is null then '' else '[REDACTED_NOTES]' end
    ),
    jsonb_build_object('supported', true, 'actionType', 'plan.delete_task')
  )
  returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'taskId', v_task_id,
    'requestId', v_action_id,
    'activityId', v_activity_id,
    'outboxId', v_outbox_id,
    'idempotencyKey', v_idempotency_key,
    'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_create_plan_task_action(jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.kenos_create_plan_task_action(jsonb) to authenticated;

create or replace function public.kenos_create_plan_task_action(action_request jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.kenos_create_plan_task_action(action_request);
$$;

revoke all on function public.kenos_create_plan_task_action(jsonb) from public, anon;
grant execute on function public.kenos_create_plan_task_action(jsonb) to authenticated;
