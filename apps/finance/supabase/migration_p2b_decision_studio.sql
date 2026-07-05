-- Finance OS P2B — Decision Studio foundation
-- Adds decision records and extends scenario constraints for compare/save/review loops.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenarios_status_check'
      and conrelid = 'public.scenarios'::regclass
  ) then
    alter table public.scenarios
      add constraint scenarios_status_check
      check (status in ('draft', 'saved', 'chosen', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenarios_type_check'
      and conrelid = 'public.scenarios'::regclass
  ) then
    alter table public.scenarios
      add constraint scenarios_type_check
      check (
        scenario_type in (
          'custom',
          'purchase',
          'recurring_cost',
          'rent_change',
          'travel',
          'career_break',
          'partner_contribution',
          'cash_vs_finance'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_events_type_check'
      and conrelid = 'public.scenario_events'::regclass
  ) then
    alter table public.scenario_events
      add constraint scenario_events_type_check
      check (
        event_type in (
          'one_time_expense',
          'recurring_expense_change',
          'income_change',
          'transfer',
          'goal_allocation_change',
          'partner_contribution',
          'financed_purchase',
          'custom',
          -- backward compatibility for existing P2A events
          'salary-change',
          'expense-change',
          'one-time-purchase',
          'windfall'
        )
      );
  end if;
end $$;

create table if not exists public.decision_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  scenario_id text not null,
  decision_status text not null check (decision_status in ('considering', 'chosen', 'declined', 'deferred', 'reviewed')),
  decision_summary text not null default '',
  reason text,
  expected_outcome_json jsonb,
  actual_outcome_json jsonb,
  decided_at timestamptz,
  review_on date,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists decision_records_user_scenario_idx
  on public.decision_records (user_id, scenario_id, created_at desc);

create table if not exists public.scenario_apply_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_scenario_id text not null,
  selected_event_ids jsonb not null default '[]'::jsonb,
  inserted_event_ids jsonb not null default '[]'::jsonb,
  applied_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists scenario_apply_audits_user_idx
  on public.scenario_apply_audits (user_id, applied_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenario_apply_audits_source_fk'
      and conrelid = 'public.scenario_apply_audits'::regclass
  ) then
    alter table public.scenario_apply_audits
      add constraint scenario_apply_audits_source_fk
      foreign key (user_id, source_scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'decision_records_user_scenario_fk'
      and conrelid = 'public.decision_records'::regclass
  ) then
    alter table public.decision_records
      add constraint decision_records_user_scenario_fk
      foreign key (user_id, scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

alter table public.decision_records enable row level security;
alter table public.scenario_apply_audits enable row level security;
drop policy if exists decision_records_select on public.decision_records;
create policy decision_records_select on public.decision_records
  for select using ((select auth.uid()) = user_id);
drop policy if exists decision_records_insert on public.decision_records;
create policy decision_records_insert on public.decision_records
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists decision_records_update on public.decision_records;
create policy decision_records_update on public.decision_records
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists decision_records_delete on public.decision_records;
create policy decision_records_delete on public.decision_records
  for delete using ((select auth.uid()) = user_id);

drop policy if exists scenario_apply_audits_select on public.scenario_apply_audits;
create policy scenario_apply_audits_select on public.scenario_apply_audits
  for select using ((select auth.uid()) = user_id);
drop policy if exists scenario_apply_audits_insert on public.scenario_apply_audits;
create policy scenario_apply_audits_insert on public.scenario_apply_audits
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists scenario_apply_audits_update on public.scenario_apply_audits;
create policy scenario_apply_audits_update on public.scenario_apply_audits
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists scenario_apply_audits_delete on public.scenario_apply_audits;
create policy scenario_apply_audits_delete on public.scenario_apply_audits
  for delete using ((select auth.uid()) = user_id);

create or replace function public.apply_scenario_to_plan_v1(payload jsonb)
returns table (
  applied_count integer,
  inserted_event_ids jsonb,
  applied_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  src_scenario text;
  selected_ids text[];
  inserted_ids jsonb := '[]'::jsonb;
  row_count integer := 0;
  audit_applied_at timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  src_scenario := nullif(payload ->> 'scenario_id', '');
  if src_scenario is null then
    raise exception 'scenario_id required';
  end if;
  if src_scenario = 'scenario_baseline' then
    raise exception 'baseline scenario cannot be applied to itself';
  end if;
  if not exists (
    select 1
    from public.scenarios s
    where s.user_id = uid
      and s.id = src_scenario
  ) then
    raise exception 'scenario not found';
  end if;
  if jsonb_typeof(payload -> 'selected_event_ids') <> 'array' then
    raise exception 'selected_event_ids must be an array';
  end if;

  select coalesce(array_agg(v), '{}') into selected_ids
  from jsonb_array_elements_text(payload -> 'selected_event_ids') as t(v);
  if cardinality(selected_ids) = 0 then
    raise exception 'at least one selected event required';
  end if;

  with source_events as (
    select e.*
    from public.scenario_events e
    where e.user_id = uid
      and e.scenario_id = src_scenario
      and e.id = any(selected_ids)
  ),
  inserted as (
    insert into public.scenario_events (
      user_id,
      id,
      scenario_id,
      name,
      event_type,
      enabled,
      month_offset,
      amount,
      date,
      percent,
      contribution_percent,
      expense_category,
      funding_source,
      reconciled
    )
    select
      uid,
      'evt_apply_' || replace(substr(gen_random_uuid()::text, 1, 8), '-', ''),
      'scenario_baseline',
      se.name,
      se.event_type,
      se.enabled,
      se.month_offset,
      se.amount,
      se.date,
      se.percent,
      se.contribution_percent,
      se.expense_category,
      se.funding_source,
      se.reconciled
    from source_events se
    returning id
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(id), '[]'::jsonb)
  into row_count, inserted_ids
  from inserted;

  if row_count = 0 then
    raise exception 'no events were applied';
  end if;

  insert into public.scenario_apply_audits (
    user_id,
    source_scenario_id,
    selected_event_ids,
    inserted_event_ids,
    applied_at
  ) values (
    uid,
    src_scenario,
    to_jsonb(selected_ids),
    inserted_ids,
    audit_applied_at
  );

  return query
  select row_count, inserted_ids, audit_applied_at;
end;
$$;

create or replace function public.undo_latest_scenario_apply_v1()
returns table (
  undone_count integer,
  undone_event_ids jsonb,
  undone_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  audit_id uuid;
  inserted_ids jsonb;
  ts timestamptz := now();
  rows_deleted integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  select a.id, a.inserted_event_ids
  into audit_id, inserted_ids
  from public.scenario_apply_audits a
  where a.user_id = uid
    and a.undone_at is null
  order by a.applied_at desc
  limit 1;

  if audit_id is null then
    raise exception 'no apply operation available to undo';
  end if;

  delete from public.scenario_events e
  where e.user_id = uid
    and e.scenario_id = 'scenario_baseline'
    and e.id in (
      select value::text
      from jsonb_array_elements_text(inserted_ids)
    );
  get diagnostics rows_deleted = row_count;

  update public.scenario_apply_audits
  set undone_at = ts
  where id = audit_id;

  return query
  select rows_deleted, inserted_ids, ts;
end;
$$;

revoke execute on function public.apply_scenario_to_plan_v1(jsonb) from public;
revoke execute on function public.apply_scenario_to_plan_v1(jsonb) from anon;
grant execute on function public.apply_scenario_to_plan_v1(jsonb) to authenticated;

revoke execute on function public.undo_latest_scenario_apply_v1() from public;
revoke execute on function public.undo_latest_scenario_apply_v1() from anon;
grant execute on function public.undo_latest_scenario_apply_v1() to authenticated;

commit;
