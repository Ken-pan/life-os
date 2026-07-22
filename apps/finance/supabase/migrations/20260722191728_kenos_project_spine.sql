-- Kenos Productivity Spine — Phase B: minimal Project Spine data model.
-- planner_projects stays the ONLY canonical Project store; planner_tasks stays
-- the ONLY canonical Task store; Vault stays the ONLY note-content owner.
-- This adds exactly two narrow models on top:
--   * kenos_project_context  — per-project orchestration state (outcome / status
--     / next action pointer / review date / context type)
--   * kenos_project_links    — typed references from a project to existing
--     objects (plan tasks, knowledge note titles, activity, external URLs).
--     Links store references + display metadata only, never object content.
-- Writes go through public.kenos_project_spine_action (same envelope,
-- idempotency, outbox and activity semantics as the plan.* command RPCs).
-- Retry-safe / additive.

set lock_timeout = '5s';
set statement_timeout = '30s';

create table if not exists public.kenos_project_context (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  outcome text not null default '',
  status text not null default 'active'
    check (status in ('active', 'paused', 'waiting', 'completed', 'archived')),
  next_action_task_id text,
  review_at date,
  context_type text not null default 'personal'
    check (context_type in ('personal', 'work', 'home', 'development')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table if not exists public.kenos_project_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  source_domain text not null
    check (source_domain in ('plan', 'knowledge', 'activity', 'external')),
  object_type text not null
    check (object_type in ('plan.task', 'knowledge.note', 'activity.event', 'url')),
  object_id text not null,
  relation text not null default 'reference'
    check (relation in ('reference', 'waiting_on', 'next', 'output')),
  display_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists kenos_project_links_live_unique
  on public.kenos_project_links (user_id, project_id, object_type, object_id)
  where deleted_at is null;

create index if not exists kenos_project_links_project_idx
  on public.kenos_project_links (user_id, project_id)
  where deleted_at is null;

alter table public.kenos_project_context enable row level security;
alter table public.kenos_project_links enable row level security;

drop policy if exists "kenos_project_context_select_own" on public.kenos_project_context;
create policy "kenos_project_context_select_own"
  on public.kenos_project_context for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "kenos_project_links_select_own" on public.kenos_project_links;
create policy "kenos_project_links_select_own"
  on public.kenos_project_links for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on public.kenos_project_context from public, anon, authenticated;
revoke all on public.kenos_project_links from public, anon, authenticated;
grant select on public.kenos_project_context to authenticated;
grant select on public.kenos_project_links to authenticated;

create or replace function private.kenos_project_spine_action(action_request jsonb)
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
  v_project_id text := nullif(btrim(coalesce(action_request #>> '{payload,projectId}', '')), '');
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_existing public.kenos_plan_action_idempotency%rowtype;
  v_entity_ref jsonb;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_link_id uuid;
  v_task_id text;
  v_summary text;
  v_outbox_payload jsonb;
  v_redacted jsonb;
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
  perform (action_request ->> 'deviceId')::uuid;
  if v_action_type not in ('project.set_context', 'project.set_next_action', 'project.link_object', 'project.unlink_object') then
    raise exception 'unsupported_action';
  end if;
  if action_request ->> 'targetDomain' <> 'plan' then
    raise exception 'wrong_owner';
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
  if nullif(action_request ->> 'requestedAt', '') is null
     or action_request ->> 'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then
    raise exception 'requested_at_required';
  end if;
  v_requested_at := (action_request ->> 'requestedAt')::timestamptz;
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
  if v_project_id is null then
    raise exception 'project_id_required';
  end if;
  if not exists (
    select 1 from public.planner_projects p
    where p.user_id = v_user_id and p.id = v_project_id
  ) then
    raise exception 'project_not_found';
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
    (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_project_id, v_correlation_id)
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
      'ok', true, 'duplicate', true, 'status', 'succeeded',
      'projectId', v_existing.task_id,
      'requestId', v_existing.action_id,
      'activityId', v_activity_id,
      'outboxId', v_outbox_id,
      'correlationId', v_existing.correlation_id
    );
  end if;

  v_entity_ref := jsonb_build_object(
    'id', v_project_id,
    'type', 'plan.project',
    'ownerDomain', 'plan',
    'ownerId', v_project_id,
    'version', 1
  );

  if v_action_type = 'project.set_context' then
    insert into public.kenos_project_context (user_id, project_id)
    values (v_user_id, v_project_id)
    on conflict (user_id, project_id) do nothing;

    update public.kenos_project_context c
    set outcome = case when action_request #> '{payload,outcome}' is not null
                       then coalesce(action_request #>> '{payload,outcome}', '') else c.outcome end,
        status = case when action_request #> '{payload,status}' is not null
                      then action_request #>> '{payload,status}' else c.status end,
        review_at = case when action_request -> 'payload' ? 'reviewAt'
                         then nullif(action_request #>> '{payload,reviewAt}', '')::date else c.review_at end,
        context_type = case when action_request #> '{payload,contextType}' is not null
                            then action_request #>> '{payload,contextType}' else c.context_type end,
        updated_at = v_now
    where c.user_id = v_user_id and c.project_id = v_project_id;

    v_summary := 'Updated project context';
    v_outbox_payload := jsonb_build_object('projectId', v_project_id,
      'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(action_request -> 'payload') k where k <> 'projectId'));
    v_redacted := v_outbox_payload;

  elsif v_action_type = 'project.set_next_action' then
    v_task_id := nullif(btrim(coalesce(action_request #>> '{payload,taskId}', '')), '');
    if v_task_id is not null and not exists (
      select 1 from public.planner_tasks t where t.user_id = v_user_id and t.id = v_task_id
    ) then
      raise exception 'task_not_found';
    end if;
    insert into public.kenos_project_context (user_id, project_id)
    values (v_user_id, v_project_id)
    on conflict (user_id, project_id) do nothing;
    update public.kenos_project_context c
    set next_action_task_id = v_task_id, updated_at = v_now
    where c.user_id = v_user_id and c.project_id = v_project_id;
    v_summary := case when v_task_id is null then 'Cleared project next action' else 'Set project next action' end;
    v_outbox_payload := jsonb_build_object('projectId', v_project_id, 'taskId', v_task_id);
    v_redacted := v_outbox_payload;

  elsif v_action_type = 'project.link_object' then
    if coalesce(action_request #>> '{payload,sourceDomain}', '') not in ('plan', 'knowledge', 'activity', 'external')
       or coalesce(action_request #>> '{payload,objectType}', '') not in ('plan.task', 'knowledge.note', 'activity.event', 'url')
       or nullif(btrim(coalesce(action_request #>> '{payload,objectId}', '')), '') is null then
      raise exception 'invalid_link';
    end if;
    if coalesce(action_request #>> '{payload,relation}', 'reference') not in ('reference', 'waiting_on', 'next', 'output') then
      raise exception 'invalid_link_relation';
    end if;

    select id into v_link_id
    from public.kenos_project_links
    where user_id = v_user_id and project_id = v_project_id
      and object_type = action_request #>> '{payload,objectType}'
      and object_id = action_request #>> '{payload,objectId}'
      and deleted_at is null;
    if v_link_id is null then
      insert into public.kenos_project_links
        (user_id, project_id, source_domain, object_type, object_id, relation, display_metadata)
      values (
        v_user_id, v_project_id,
        action_request #>> '{payload,sourceDomain}',
        action_request #>> '{payload,objectType}',
        action_request #>> '{payload,objectId}',
        coalesce(action_request #>> '{payload,relation}', 'reference'),
        coalesce(action_request #> '{payload,displayMetadata}', '{}'::jsonb)
      )
      returning id into v_link_id;
    else
      update public.kenos_project_links
      set relation = coalesce(action_request #>> '{payload,relation}', relation),
          display_metadata = coalesce(action_request #> '{payload,displayMetadata}', display_metadata)
      where id = v_link_id;
    end if;
    v_summary := 'Linked object to project';
    v_outbox_payload := jsonb_build_object('projectId', v_project_id, 'linkId', v_link_id,
      'objectType', action_request #>> '{payload,objectType}');
    v_redacted := v_outbox_payload;

  elsif v_action_type = 'project.unlink_object' then
    update public.kenos_project_links
    set deleted_at = v_now
    where user_id = v_user_id and project_id = v_project_id
      and id = nullif(action_request #>> '{payload,linkId}', '')::uuid
      and deleted_at is null
    returning id into v_link_id;
    if v_link_id is null then
      raise exception 'link_not_found';
    end if;
    v_summary := 'Unlinked object from project';
    v_outbox_payload := jsonb_build_object('projectId', v_project_id, 'linkId', v_link_id);
    v_redacted := v_outbox_payload;
  end if;

  insert into public.kenos_plan_outbox
    (user_id, action_id, action_type, idempotency_key, correlation_id, entity_ref, payload)
  values (v_user_id, v_action_id, v_action_type, v_idempotency_key, v_correlation_id, v_entity_ref, v_outbox_payload)
  returning id into v_outbox_id;

  insert into public.kenos_plan_activity
    (user_id, action_id, action_type, correlation_id, actor_type, source_domain, policy, entity_ref, summary, result, redacted_payload, undo)
  values (
    v_user_id, v_action_id, v_action_type, v_correlation_id,
    coalesce(action_request #>> '{actor,type}', 'user'),
    coalesce(action_request ->> 'producer', 'plan'),
    jsonb_build_object(
      'requestId', v_action_id,
      'outcome', 'allow',
      'evaluatedRisk', 'R1',
      'policyVersion', 'kenos-spine-2026-07-22',
      'reasons', jsonb_build_array('project spine command'),
      'decidedAt', v_now
    ),
    v_entity_ref, v_summary, 'succeeded', v_redacted,
    jsonb_build_object('supported', false)
  )
  returning id into v_activity_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'succeeded',
    'projectId', v_project_id,
    'linkId', v_link_id,
    'requestId', v_action_id,
    'activityId', v_activity_id,
    'outboxId', v_outbox_id,
    'completedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', v_idempotency_key,
    'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function private.kenos_project_spine_action(jsonb) from public, anon, authenticated;

create or replace function public.kenos_project_spine_action(action_request jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.kenos_project_spine_action(action_request);
$$;

revoke all on function public.kenos_project_spine_action(jsonb) from public, anon, authenticated;
grant execute on function public.kenos_project_spine_action(jsonb) to authenticated;
