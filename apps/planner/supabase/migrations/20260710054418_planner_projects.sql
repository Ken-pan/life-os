-- PLANNER.OS 结构化同步：项目分表（与 planner_tasks / planner_lists 同步模型一致）

create table if not exists public.planner_projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists planner_projects_user_updated_idx
  on public.planner_projects (user_id, updated_at desc);

alter table public.planner_projects enable row level security;

drop policy if exists "planner_projects_select_own" on public.planner_projects;
create policy "planner_projects_select_own"
  on public.planner_projects for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_projects_insert_own" on public.planner_projects;
create policy "planner_projects_insert_own"
  on public.planner_projects for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_projects_update_own" on public.planner_projects;
create policy "planner_projects_update_own"
  on public.planner_projects for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_projects_delete_own" on public.planner_projects;
create policy "planner_projects_delete_own"
  on public.planner_projects for delete
  to authenticated
  using ((select auth.uid()) = user_id);
