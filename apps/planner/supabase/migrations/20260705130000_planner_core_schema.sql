-- PLANNER.OS 云同步表（与 FitnessOS 共用 Supabase 项目）

create table if not exists public.planner_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  schema_version int not null default 2,
  updated_at timestamptz not null default now()
);

alter table public.planner_user_state enable row level security;

drop policy if exists "planner_state_select_own" on public.planner_user_state;
create policy "planner_state_select_own"
  on public.planner_user_state for select
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_state_insert_own" on public.planner_user_state;
create policy "planner_state_insert_own"
  on public.planner_user_state for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_state_update_own" on public.planner_user_state;
create policy "planner_state_update_own"
  on public.planner_user_state for update
  using ((select auth.uid()) = user_id);

create or replace function public.planner_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planner_user_state_updated_at on public.planner_user_state;
create trigger planner_user_state_updated_at
  before update on public.planner_user_state
  for each row execute function public.planner_touch_updated_at();
