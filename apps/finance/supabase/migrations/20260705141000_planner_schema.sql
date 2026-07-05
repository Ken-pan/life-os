-- Life OS: Planner 模块（public.planner_* 表，与 Finance / fitness 命名空间不冲突）

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

create table if not exists public.planner_tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.planner_lists (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists planner_tasks_user_updated_idx
  on public.planner_tasks (user_id, updated_at desc);

alter table public.planner_tasks enable row level security;
alter table public.planner_lists enable row level security;

drop policy if exists "planner_tasks_select_own" on public.planner_tasks;
create policy "planner_tasks_select_own"
  on public.planner_tasks for select
  using ((select auth.uid()) = user_id);
drop policy if exists "planner_tasks_insert_own" on public.planner_tasks;
create policy "planner_tasks_insert_own"
  on public.planner_tasks for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "planner_tasks_update_own" on public.planner_tasks;
create policy "planner_tasks_update_own"
  on public.planner_tasks for update
  using ((select auth.uid()) = user_id);
drop policy if exists "planner_tasks_delete_own" on public.planner_tasks;
create policy "planner_tasks_delete_own"
  on public.planner_tasks for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_lists_select_own" on public.planner_lists;
create policy "planner_lists_select_own"
  on public.planner_lists for select
  using ((select auth.uid()) = user_id);
drop policy if exists "planner_lists_insert_own" on public.planner_lists;
create policy "planner_lists_insert_own"
  on public.planner_lists for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "planner_lists_update_own" on public.planner_lists;
create policy "planner_lists_update_own"
  on public.planner_lists for update
  using ((select auth.uid()) = user_id);
drop policy if exists "planner_lists_delete_own" on public.planner_lists;
create policy "planner_lists_delete_own"
  on public.planner_lists for delete
  using ((select auth.uid()) = user_id);
