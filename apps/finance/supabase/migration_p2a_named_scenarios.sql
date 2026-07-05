-- Finance OS P2A — Named scenarios foundation
-- Add scenario container, event ownership, and minimal snapshots.

begin;

alter table public.user_settings
  add column if not exists active_scenario_id text;

create table if not exists public.scenarios (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default 'Scenario',
  description text,
  scenario_type text not null default 'custom',
  status text not null default 'draft',
  comparison_color_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key (user_id, id)
);

create index if not exists scenarios_user_idx
  on public.scenarios (user_id, status, updated_at desc);

alter table public.scenario_events
  add column if not exists scenario_id text;

insert into public.scenarios (user_id, id, name, scenario_type, status)
select distinct se.user_id, 'scenario_baseline', 'Baseline', 'custom', 'saved'
from public.scenario_events se
where not exists (
  select 1
  from public.scenarios s
  where s.user_id = se.user_id
    and s.id = 'scenario_baseline'
);

update public.scenario_events
set scenario_id = 'scenario_baseline'
where scenario_id is null;

alter table public.scenario_events
  alter column scenario_id set not null;

create index if not exists scenario_events_user_scenario_idx
  on public.scenario_events (user_id, scenario_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenario_events_user_scenario_fk'
      and conrelid = 'public.scenario_events'::regclass
  ) then
    alter table public.scenario_events
      add constraint scenario_events_user_scenario_fk
      foreign key (user_id, scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.scenario_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id text not null,
  snapshot_type text not null check (snapshot_type in ('comparison_preview', 'decision_saved', 'review_completed')),
  assumptions_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scenario_snapshots_user_scenario_idx
  on public.scenario_snapshots (user_id, scenario_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['scenarios', 'scenario_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t || '_delete', t);
  end loop;
end $$;

commit;
