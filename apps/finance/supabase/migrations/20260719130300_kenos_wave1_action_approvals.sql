-- Kenos Production Wave 1 formal migration (additive).
-- Canonical apply source after APPROVE_KENOS_PRODUCTION_WAVE_1.
-- Historical review evidence: apps/planner/supabase/review/20260719030000_kenos_action_approvals.sql
-- Prerequisites: remote tip > 20260717220000; backward-compatible; retry-safe.
-- Explicit exclusions: planner_tasks direct-write revoke; writer/Portal cutover; production seed.

create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kenos_approval_writer') then
    create role kenos_approval_writer nologin noinherit nobypassrls;
  end if;
end;
$$;

create table if not exists public.kenos_action_approvals (
  id uuid primary key,
  version text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  action_id uuid not null,
  correlation_id uuid not null,
  requesting_actor jsonb not null,
  requesting_domain text not null,
  action_type text not null,
  risk text not null,
  status text not null,
  reason_code text not null,
  safe_summary text not null,
  data_classification text not null,
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  supersedes_approval_id uuid references public.kenos_action_approvals (id),
  entity_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_action_approvals_version_check check (version = '1'),
  constraint kenos_action_approvals_requesting_actor_check check (
    jsonb_typeof(requesting_actor) = 'object'
    and requesting_actor ->> 'type' in ('user', 'assistant', 'automation', 'connector', 'system')
    and (requesting_actor ->> 'id')::uuid is not null
  ),
  constraint kenos_action_approvals_domain_check check (
    requesting_domain in ('core', 'assistant', 'work', 'plan', 'library', 'memory', 'training', 'money', 'health', 'home', 'music', 'paper', 'system', 'automation', 'notifications', 'integration')
  ),
  constraint kenos_action_approvals_action_type_check check (action_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  constraint kenos_action_approvals_risk_check check (risk in ('R0', 'R1', 'R2', 'R3', 'R4')),
  constraint kenos_action_approvals_status_check check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded')),
  constraint kenos_action_approvals_reason_code_check check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  constraint kenos_action_approvals_summary_check check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  constraint kenos_action_approvals_classification_check check (
    data_classification in ('public', 'personal', 'sensitive', 'work_confidential', 'restricted_local_only', 'ephemeral')
  ),
  constraint kenos_action_approvals_expiry_check check (expires_at > requested_at),
  constraint kenos_action_approvals_timestamps_check check (updated_at >= created_at),
  constraint kenos_action_approvals_decision_check check (
    (status = 'pending' and decided_at is null and decided_by is null and decision_reason is null)
    or
    (status <> 'pending' and decided_at is not null and decided_by is not null and nullif(btrim(decision_reason), '') is not null)
  ),
  constraint kenos_action_approvals_supersedes_check check (supersedes_approval_id is null or supersedes_approval_id <> id),
  constraint kenos_action_approvals_entity_refs_check check (jsonb_typeof(entity_refs) = 'array'),
  unique (owner_id, action_id, id)
);

create index if not exists kenos_action_approvals_owner_requested_idx
  on public.kenos_action_approvals (owner_id, requested_at desc, id desc);
create index if not exists kenos_action_approvals_owner_status_expiry_idx
  on public.kenos_action_approvals (owner_id, status, expires_at);
create index if not exists kenos_action_approvals_supersedes_idx
  on public.kenos_action_approvals (supersedes_approval_id)
  where supersedes_approval_id is not null;

alter table public.kenos_action_approvals enable row level security;
drop policy if exists kenos_action_approvals_select_own on public.kenos_action_approvals;
create policy kenos_action_approvals_select_own
  on public.kenos_action_approvals
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- The 2026 Data API default no longer guarantees automatic exposure. Grant the
-- one intended client capability explicitly; RLS remains the row boundary.
revoke all on public.kenos_action_approvals from public, anon, authenticated, kenos_approval_writer;
grant select on public.kenos_action_approvals to authenticated;

create or replace function public.kenos_list_action_approvals(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,
  version text,
  owner_id uuid,
  action_id uuid,
  correlation_id uuid,
  requesting_actor jsonb,
  requesting_domain text,
  action_type text,
  risk text,
  status text,
  reason_code text,
  safe_summary text,
  data_classification text,
  requested_at timestamptz,
  expires_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  supersedes_approval_id uuid,
  entity_refs jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    approval.id,
    approval.version,
    approval.owner_id,
    approval.action_id,
    approval.correlation_id,
    approval.requesting_actor,
    approval.requesting_domain,
    approval.action_type,
    approval.risk,
    case
      when approval.status = 'pending' and exists (
        select 1
        from public.kenos_action_approvals newer
        where newer.owner_id = approval.owner_id
          and newer.supersedes_approval_id = approval.id
      ) then 'superseded'
      when approval.status = 'pending' and approval.expires_at <= statement_timestamp() then 'expired'
      else approval.status
    end,
    approval.reason_code,
    approval.safe_summary,
    approval.data_classification,
    approval.requested_at,
    approval.expires_at,
    approval.decided_at,
    approval.decided_by,
    approval.decision_reason,
    approval.supersedes_approval_id,
    approval.entity_refs,
    approval.created_at,
    approval.updated_at
  from public.kenos_action_approvals approval
  where approval.owner_id = (select auth.uid())
    and (p_before is null or approval.requested_at < p_before)
  order by approval.requested_at desc, approval.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.kenos_list_action_approvals(integer, timestamptz) from public, anon;
grant execute on function public.kenos_list_action_approvals(integer, timestamptz) to authenticated;

create or replace function private.kenos_store_action_approval(approval_record jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_id uuid;
begin
  if v_owner_id is null then raise exception 'approval_auth_required'; end if;
  if approval_record ->> 'version' <> '1' then raise exception 'approval_version_not_supported'; end if;
  if (approval_record ->> 'ownerId')::uuid <> v_owner_id then raise exception 'approval_owner_mismatch'; end if;
  v_id := (approval_record ->> 'id')::uuid;

  insert into public.kenos_action_approvals (
    id, version, owner_id, action_id, correlation_id, requesting_actor,
    requesting_domain, action_type, risk, status, reason_code, safe_summary,
    data_classification, requested_at, expires_at, decided_at, decided_by,
    decision_reason, supersedes_approval_id, entity_refs, created_at, updated_at
  ) values (
    v_id,
    approval_record ->> 'version',
    v_owner_id,
    (approval_record ->> 'actionId')::uuid,
    (approval_record ->> 'correlationId')::uuid,
    approval_record -> 'requestingActor',
    approval_record ->> 'requestingDomain',
    approval_record ->> 'actionType',
    approval_record ->> 'risk',
    approval_record ->> 'status',
    approval_record ->> 'reasonCode',
    approval_record ->> 'safeSummary',
    approval_record ->> 'dataClassification',
    (approval_record ->> 'requestedAt')::timestamptz,
    (approval_record ->> 'expiresAt')::timestamptz,
    nullif(approval_record ->> 'decidedAt', '')::timestamptz,
    nullif(approval_record ->> 'decidedBy', '')::uuid,
    nullif(approval_record ->> 'decisionReason', ''),
    nullif(approval_record ->> 'supersedesApprovalId', '')::uuid,
    coalesce(approval_record -> 'entityRefs', '[]'::jsonb),
    (approval_record ->> 'createdAt')::timestamptz,
    (approval_record ->> 'updatedAt')::timestamptz
  );
  return v_id;
end;
$$;

create or replace function private.kenos_transition_action_approval(
  approval_id uuid,
  expected_status text,
  next_status text,
  decision_actor uuid,
  visible_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_record public.kenos_action_approvals%rowtype;
begin
  if v_owner_id is null then raise exception 'approval_auth_required'; end if;
  if expected_status <> 'pending' or next_status not in ('approved', 'rejected', 'expired', 'cancelled', 'superseded') then
    raise exception 'invalid_approval_transition';
  end if;
  if decision_actor is null or nullif(btrim(visible_reason), '') is null then
    raise exception 'approval_decision_metadata_required';
  end if;

  select * into v_record
  from public.kenos_action_approvals
  where id = approval_id and owner_id = v_owner_id and status = expected_status
  for update;
  if not found then raise exception 'approval_compare_and_set_failed'; end if;
  if exists (
    select 1 from public.kenos_action_approvals newer
    where newer.owner_id = v_owner_id and newer.supersedes_approval_id = v_record.id
  ) then raise exception 'approval_superseded'; end if;
  if next_status = 'approved' and v_record.expires_at <= statement_timestamp() then
    raise exception 'approval_expired';
  end if;

  update public.kenos_action_approvals
  set status = next_status,
      decided_at = clock_timestamp(),
      decided_by = decision_actor,
      decision_reason = visible_reason,
      updated_at = clock_timestamp()
  where id = v_record.id;
  return next_status;
end;
$$;

revoke all on schema private from public, anon, authenticated, service_role, kenos_approval_writer;
grant usage on schema private to kenos_approval_writer;
revoke all on function private.kenos_store_action_approval(jsonb) from public, anon, authenticated, service_role, kenos_approval_writer;
revoke all on function private.kenos_transition_action_approval(uuid, text, text, uuid, text) from public, anon, authenticated, service_role, kenos_approval_writer;
grant execute on function private.kenos_store_action_approval(jsonb) to kenos_approval_writer;
grant execute on function private.kenos_transition_action_approval(uuid, text, text, uuid, text) to kenos_approval_writer;
