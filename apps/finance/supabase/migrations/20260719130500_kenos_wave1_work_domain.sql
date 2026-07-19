-- Kenos Production Wave 1 formal migration (additive).
-- Canonical apply source after APPROVE_KENOS_PRODUCTION_WAVE_1.
-- Historical review evidence: apps/planner/supabase/review/20260719040000_kenos_work_domain.sql
-- Prerequisites: remote tip > 20260717220000; backward-compatible; retry-safe.
-- Explicit exclusions: planner_tasks direct-write revoke; writer/Portal cutover; production seed.

create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kenos_work_writer') then
    create role kenos_work_writer nologin noinherit nobypassrls;
  end if;
end;
$$;

create table if not exists public.kenos_work_projects (
  id uuid primary key,
  version text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  safe_summary text not null,
  status text not null,
  priority text not null,
  start_at timestamptz,
  target_at timestamptz,
  completed_at timestamptz,
  data_classification text not null,
  source_refs jsonb not null default '[]'::jsonb,
  library_refs jsonb not null default '[]'::jsonb,
  plan_task_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_work_projects_version_check check (version = '1'),
  constraint kenos_work_projects_status_check check (status in ('active', 'blocked', 'completed', 'archived')),
  constraint kenos_work_projects_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint kenos_work_projects_classification_check check (
    data_classification in ('public', 'personal', 'sensitive', 'work_confidential', 'restricted_local_only', 'ephemeral')
  ),
  constraint kenos_work_projects_summary_check check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_work_projects_title_check check (length(btrim(title)) between 1 and 200),
  constraint kenos_work_projects_timestamps_check check (updated_at >= created_at),
  constraint kenos_work_projects_completed_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint kenos_work_projects_refs_check check (
    jsonb_typeof(source_refs) = 'array'
    and jsonb_typeof(library_refs) = 'array'
    and jsonb_typeof(plan_task_refs) = 'array'
  )
);

create table if not exists public.kenos_work_deliverables (
  id uuid primary key,
  version text not null,
  project_id uuid not null references public.kenos_work_projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  safe_summary text not null,
  status text not null,
  target_at timestamptz,
  accepted_at timestamptz,
  data_classification text not null,
  source_refs jsonb not null default '[]'::jsonb,
  plan_task_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_work_deliverables_version_check check (version = '1'),
  constraint kenos_work_deliverables_status_check check (status in ('planned', 'in_progress', 'blocked', 'accepted', 'cancelled')),
  constraint kenos_work_deliverables_classification_check check (
    data_classification in ('public', 'personal', 'sensitive', 'work_confidential', 'restricted_local_only', 'ephemeral')
  ),
  constraint kenos_work_deliverables_summary_check check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_work_deliverables_timestamps_check check (updated_at >= created_at),
  constraint kenos_work_deliverables_accepted_check check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create table if not exists public.kenos_work_meetings (
  id uuid primary key,
  version text not null,
  project_id uuid not null references public.kenos_work_projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  occurred_at timestamptz,
  scheduled_at timestamptz,
  attendees jsonb not null default '[]'::jsonb,
  safe_summary text not null,
  data_classification text not null,
  decision_refs jsonb not null default '[]'::jsonb,
  action_proposal_refs jsonb not null default '[]'::jsonb,
  library_refs jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_work_meetings_version_check check (version = '1'),
  constraint kenos_work_meetings_time_check check (occurred_at is not null or scheduled_at is not null),
  constraint kenos_work_meetings_summary_check check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_work_meetings_timestamps_check check (updated_at >= created_at)
);

create table if not exists public.kenos_work_decisions (
  id uuid primary key,
  version text not null,
  project_id uuid not null references public.kenos_work_projects (id) on delete cascade,
  meeting_id uuid references public.kenos_work_meetings (id) on delete set null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  safe_summary text not null,
  status text not null,
  decided_at timestamptz,
  decided_by jsonb,
  supersedes_decision_id uuid references public.kenos_work_decisions (id),
  data_classification text not null,
  entity_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_work_decisions_version_check check (version = '1'),
  constraint kenos_work_decisions_status_check check (status in ('proposed', 'decided', 'superseded', 'cancelled')),
  constraint kenos_work_decisions_summary_check check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_work_decisions_timestamps_check check (updated_at >= created_at),
  constraint kenos_work_decisions_self_supersede_check check (supersedes_decision_id is null or supersedes_decision_id <> id),
  constraint kenos_work_decisions_decided_check check (
    (status = 'decided' and decided_at is not null and decided_by is not null)
    or (status = 'proposed' and decided_at is null and decided_by is null)
    or (status in ('superseded', 'cancelled'))
  )
);

create table if not exists public.kenos_work_action_proposals (
  id uuid primary key,
  version text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  work_entity_ref jsonb not null,
  proposed_task_title text not null,
  safe_context text not null,
  suggested_due_at timestamptz,
  suggested_priority text,
  risk text not null,
  status text not null,
  plan_action_id uuid,
  plan_task_ref jsonb,
  data_classification text not null,
  requested_at timestamptz not null,
  resolved_at timestamptz,
  correlation_id uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_work_action_proposals_version_check check (version = '1'),
  constraint kenos_work_action_proposals_status_check check (
    status in ('draft', 'proposed', 'accepted', 'rejected', 'expired', 'converted', 'cancelled')
  ),
  constraint kenos_work_action_proposals_risk_check check (risk in ('R0', 'R1', 'R2', 'R3', 'R4')),
  constraint kenos_work_action_proposals_context_check check (
    length(btrim(safe_context)) between 1 and 500
    and safe_context !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_work_action_proposals_title_check check (length(btrim(proposed_task_title)) between 1 and 200),
  constraint kenos_work_action_proposals_timestamps_check check (updated_at >= created_at),
  constraint kenos_work_action_proposals_converted_check check (
    (status = 'converted' and plan_task_ref is not null and plan_action_id is not null and resolved_at is not null)
    or (status <> 'converted')
  ),
  constraint kenos_work_action_proposals_terminal_check check (
    (status in ('rejected', 'expired', 'cancelled') and resolved_at is not null)
    or (status not in ('rejected', 'expired', 'cancelled'))
  ),
  constraint kenos_work_action_proposals_no_premature_task_check check (
    (status in ('draft', 'proposed', 'accepted') and plan_task_ref is null)
    or (status not in ('draft', 'proposed', 'accepted'))
  ),
  unique (owner_id, idempotency_key)
);

create index if not exists kenos_work_projects_owner_updated_idx
  on public.kenos_work_projects (owner_id, updated_at desc, id desc);
create index if not exists kenos_work_deliverables_owner_project_idx
  on public.kenos_work_deliverables (owner_id, project_id, updated_at desc);
create index if not exists kenos_work_meetings_owner_project_idx
  on public.kenos_work_meetings (owner_id, project_id, updated_at desc);
create index if not exists kenos_work_decisions_owner_project_idx
  on public.kenos_work_decisions (owner_id, project_id, updated_at desc);
create index if not exists kenos_work_action_proposals_owner_status_idx
  on public.kenos_work_action_proposals (owner_id, status, requested_at desc);

alter table public.kenos_work_projects enable row level security;
alter table public.kenos_work_deliverables enable row level security;
alter table public.kenos_work_meetings enable row level security;
alter table public.kenos_work_decisions enable row level security;
alter table public.kenos_work_action_proposals enable row level security;

drop policy if exists kenos_work_projects_select_own on public.kenos_work_projects;
create policy kenos_work_projects_select_own on public.kenos_work_projects
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists kenos_work_deliverables_select_own on public.kenos_work_deliverables;
create policy kenos_work_deliverables_select_own on public.kenos_work_deliverables
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists kenos_work_meetings_select_own on public.kenos_work_meetings;
create policy kenos_work_meetings_select_own on public.kenos_work_meetings
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists kenos_work_decisions_select_own on public.kenos_work_decisions;
create policy kenos_work_decisions_select_own on public.kenos_work_decisions
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists kenos_work_action_proposals_select_own on public.kenos_work_action_proposals;
create policy kenos_work_action_proposals_select_own on public.kenos_work_action_proposals
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.kenos_work_projects from public, anon, authenticated, kenos_work_writer, service_role;
revoke all on public.kenos_work_deliverables from public, anon, authenticated, kenos_work_writer, service_role;
revoke all on public.kenos_work_meetings from public, anon, authenticated, kenos_work_writer, service_role;
revoke all on public.kenos_work_decisions from public, anon, authenticated, kenos_work_writer, service_role;
revoke all on public.kenos_work_action_proposals from public, anon, authenticated, kenos_work_writer, service_role;
grant select on public.kenos_work_projects to authenticated;
grant select on public.kenos_work_deliverables to authenticated;
grant select on public.kenos_work_meetings to authenticated;
grant select on public.kenos_work_decisions to authenticated;
grant select on public.kenos_work_action_proposals to authenticated;

create or replace function public.kenos_list_work_projects(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns setof public.kenos_work_projects
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.kenos_work_projects project
  where project.owner_id = (select auth.uid())
    and (p_before is null or project.updated_at < p_before)
  order by project.updated_at desc, project.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.kenos_list_work_action_proposals(
  p_limit integer default 100,
  p_status text default null
)
returns setof public.kenos_work_action_proposals
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.kenos_work_action_proposals proposal
  where proposal.owner_id = (select auth.uid())
    and (p_status is null or proposal.status = p_status)
  order by proposal.requested_at desc, proposal.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.kenos_list_work_projects(integer, timestamptz) from public, anon;
revoke all on function public.kenos_list_work_action_proposals(integer, text) from public, anon;
grant execute on function public.kenos_list_work_projects(integer, timestamptz) to authenticated;
grant execute on function public.kenos_list_work_action_proposals(integer, text) to authenticated;

create or replace function private.kenos_store_work_project(project_record jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_id uuid;
begin
  if v_owner_id is null then raise exception 'work_auth_required'; end if;
  if project_record ->> 'version' <> '1' then raise exception 'work_version_not_supported'; end if;
  if (project_record ->> 'ownerId')::uuid <> v_owner_id then raise exception 'work_owner_mismatch'; end if;
  v_id := (project_record ->> 'id')::uuid;

  insert into public.kenos_work_projects (
    id, version, owner_id, title, safe_summary, status, priority,
    start_at, target_at, completed_at, data_classification,
    source_refs, library_refs, plan_task_refs, created_at, updated_at
  ) values (
    v_id,
    project_record ->> 'version',
    v_owner_id,
    project_record ->> 'title',
    project_record ->> 'safeSummary',
    project_record ->> 'status',
    project_record ->> 'priority',
    nullif(project_record ->> 'startAt', '')::timestamptz,
    nullif(project_record ->> 'targetAt', '')::timestamptz,
    nullif(project_record ->> 'completedAt', '')::timestamptz,
    project_record ->> 'dataClassification',
    coalesce(project_record -> 'sourceRefs', '[]'::jsonb),
    coalesce(project_record -> 'libraryRefs', '[]'::jsonb),
    coalesce(project_record -> 'planTaskRefs', '[]'::jsonb),
    (project_record ->> 'createdAt')::timestamptz,
    (project_record ->> 'updatedAt')::timestamptz
  );
  return v_id;
end;
$$;

create or replace function private.kenos_store_work_action_proposal(proposal_record jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_id uuid;
  v_existing public.kenos_work_action_proposals%rowtype;
  v_entity jsonb := proposal_record -> 'workEntityRef';
begin
  if v_owner_id is null then raise exception 'work_auth_required'; end if;
  if proposal_record ->> 'version' <> '1' then raise exception 'work_version_not_supported'; end if;
  if (proposal_record ->> 'ownerId')::uuid <> v_owner_id then raise exception 'work_owner_mismatch'; end if;
  if coalesce(v_entity ->> 'ownerDomain', '') <> 'work' then raise exception 'work_entity_owner_required'; end if;
  if coalesce(v_entity ->> 'type', '') not like 'work.%' then raise exception 'work_entity_type_required'; end if;
  if (v_entity ->> 'ownerId')::uuid <> v_owner_id then raise exception 'work_owner_mismatch'; end if;
  if proposal_record ? 'task' or proposal_record ? 'canonicalTask' then
    raise exception 'work_must_not_embed_canonical_task';
  end if;

  select * into v_existing
  from public.kenos_work_action_proposals
  where owner_id = v_owner_id and idempotency_key = proposal_record ->> 'idempotencyKey';
  if found then
    if v_existing.proposed_task_title <> proposal_record ->> 'proposedTaskTitle'
      or v_existing.safe_context <> proposal_record ->> 'safeContext'
      or v_existing.work_entity_ref <> v_entity then
      raise exception 'work_idempotency_conflict';
    end if;
    return v_existing.id;
  end if;

  v_id := (proposal_record ->> 'id')::uuid;
  insert into public.kenos_work_action_proposals (
    id, version, owner_id, work_entity_ref, proposed_task_title, safe_context,
    suggested_due_at, suggested_priority, risk, status, plan_action_id, plan_task_ref,
    data_classification, requested_at, resolved_at, correlation_id, idempotency_key,
    created_at, updated_at
  ) values (
    v_id,
    proposal_record ->> 'version',
    v_owner_id,
    v_entity,
    proposal_record ->> 'proposedTaskTitle',
    proposal_record ->> 'safeContext',
    nullif(proposal_record ->> 'suggestedDueAt', '')::timestamptz,
    nullif(proposal_record ->> 'suggestedPriority', ''),
    proposal_record ->> 'risk',
    proposal_record ->> 'status',
    nullif(proposal_record ->> 'planActionId', '')::uuid,
    case when proposal_record ? 'planTaskRef' and jsonb_typeof(proposal_record -> 'planTaskRef') <> 'null'
      then proposal_record -> 'planTaskRef' else null end,
    proposal_record ->> 'dataClassification',
    (proposal_record ->> 'requestedAt')::timestamptz,
    nullif(proposal_record ->> 'resolvedAt', '')::timestamptz,
    (proposal_record ->> 'correlationId')::uuid,
    proposal_record ->> 'idempotencyKey',
    (proposal_record ->> 'createdAt')::timestamptz,
    (proposal_record ->> 'updatedAt')::timestamptz
  );
  return v_id;
end;
$$;

revoke all on schema private from public, anon, authenticated, service_role, kenos_work_writer;
grant usage on schema private to kenos_work_writer;
revoke all on function private.kenos_store_work_project(jsonb) from public, anon, authenticated, service_role, kenos_work_writer;
revoke all on function private.kenos_store_work_action_proposal(jsonb) from public, anon, authenticated, service_role, kenos_work_writer;
grant execute on function private.kenos_store_work_project(jsonb) to kenos_work_writer;
grant execute on function private.kenos_store_work_action_proposal(jsonb) to kenos_work_writer;
