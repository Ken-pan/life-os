-- KR-P1-001A non-production migration artifact only.
-- Do not apply to production until owner approves the production migration/cutover gate.

set lock_timeout = '5s';
set statement_timeout = '30s';

create table if not exists public.kenos_plan_action_idempotency (
  idempotency_key text primary key,
  user_id uuid not null,
  action_type text not null,
  task_id uuid not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kenos_plan_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action_id text not null,
  action_type text not null,
  correlation_id text not null,
  actor_type text not null check (actor_type in ('user', 'assistant', 'system')),
  source_domain text not null,
  policy jsonb not null,
  entity_ref jsonb,
  summary text not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  undo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kenos_plan_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action_id text not null,
  action_type text not null,
  idempotency_key text not null,
  correlation_id text not null,
  entity_ref jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'retry', 'terminal')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  last_error_class text check (last_error_class in ('transient', 'permanent')),
  terminal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_type, idempotency_key)
);

create index if not exists kenos_plan_outbox_pending_idx
  on public.kenos_plan_outbox (status, next_attempt_at)
  where status in ('pending', 'retry');

create index if not exists kenos_plan_activity_correlation_idx
  on public.kenos_plan_activity (correlation_id);

create or replace function public.kenos_create_plan_task_action(action_request jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := (action_request #>> '{actor,userId}')::uuid;
  v_action_id text := action_request ->> 'actionId';
  v_action_type text := action_request ->> 'actionType';
  v_idempotency_key text := action_request ->> 'idempotencyKey';
  v_correlation_id text := action_request ->> 'correlationId';
  v_title text := btrim(coalesce(action_request #>> '{payload,title}', ''));
  v_task_id uuid;
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_entity_ref jsonb;
  v_activity_id uuid;
  v_outbox_id uuid;
begin
  if v_action_type <> 'plan.create_task' then
    raise exception 'unsupported_action';
  end if;
  if action_request ->> 'targetDomain' <> 'plan' then
    raise exception 'wrong_owner';
  end if;
  if coalesce(action_request ->> 'producer', '') = 'work' or action_request #> '{payload,workSource}' is not null then
    raise exception 'work_source_excluded';
  end if;
  if coalesce(action_request ->> 'risk', '') <> 'R1' then
    raise exception 'risk_not_allowed';
  end if;
  if coalesce(action_request #>> '{approval,state}', '') <> 'not_required' then
    raise exception 'approval_state_not_allowed';
  end if;
  if v_idempotency_key is null or v_idempotency_key = '' then
    raise exception 'idempotency_key_required';
  end if;
  if v_correlation_id is null or v_correlation_id = '' then
    raise exception 'correlation_id_required';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;

  select * into v_existing
  from public.kenos_plan_action_idempotency
  where idempotency_key = v_idempotency_key
  for update;

  if found then
    select id into v_activity_id from public.kenos_plan_activity where correlation_id = v_existing.correlation_id limit 1;
    select id into v_outbox_id from public.kenos_plan_outbox where idempotency_key = v_idempotency_key limit 1;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'taskId', v_existing.task_id,
      'activityId', v_activity_id,
      'outboxId', v_outbox_id,
      'idempotencyKey', v_idempotency_key,
      'correlationId', v_existing.correlation_id
    );
  end if;

  -- This migration assumes the existing Planner task table remains the canonical Task truth.
  -- The exact production table/column mapping must be verified before applying this artifact.
  insert into public.planner_tasks (user_id, title, notes, completed, created_at, updated_at)
  values (v_user_id, v_title, coalesce(action_request #>> '{payload,notes}', ''), false, now(), now())
  returning id into v_task_id;

  v_entity_ref := jsonb_build_object(
    'domain', 'plan',
    'type', 'task',
    'id', v_task_id,
    'ownerDomain', 'plan',
    'version', 1,
    'securityDomain', coalesce(action_request ->> 'securityDomain', 'personal'),
    'classification', coalesce(action_request ->> 'classification', 'personal')
  );

  insert into public.kenos_plan_action_idempotency (idempotency_key, user_id, action_type, task_id, correlation_id)
  values (v_idempotency_key, v_user_id, v_action_type, v_task_id, v_correlation_id);

  insert into public.kenos_plan_outbox (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref, jsonb_build_object('taskId', v_task_id, 'title', v_title))
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity (user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, redacted_payload, undo)
  values (
    v_user_id,
    v_action_id,
    v_action_type,
    v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'user'),
    coalesce(action_request ->> 'producer', 'assistant'),
    jsonb_build_object('allowed', true, 'risk', 'R1', 'approvalState', 'not_required', 'reason', 'explicit create-task command'),
    v_entity_ref,
    'Created Plan task',
    jsonb_build_object('title', v_title, 'notes', case when action_request #>> '{payload,notes}' is null then '' else '[REDACTED_NOTES]' end),
    jsonb_build_object('supported', true, 'actionType', 'plan.delete_task')
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'taskId', v_task_id,
    'activityId', v_activity_id,
    'outboxId', v_outbox_id,
    'idempotencyKey', v_idempotency_key,
    'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function public.kenos_create_plan_task_action(jsonb) from public;
