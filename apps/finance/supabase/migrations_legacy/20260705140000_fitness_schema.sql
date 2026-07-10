-- Life OS: Fitness 模块独立 schema（与 Finance public 表并存，共享 auth.users）
-- 来源: FitnessOS 项目 fitness_core_schema，表命名空间改为 fitness.*

create schema if not exists fitness;

-- 复用 private 工具函数（若已存在则跳过）
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists fitness.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fitness.profiles enable row level security;

drop policy if exists "profiles_select_own" on fitness.profiles;
create policy "profiles_select_own" on fitness.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on fitness.profiles;
create policy "profiles_insert_own" on fitness.profiles
  for insert with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on fitness.profiles;
create policy "profiles_update_own" on fitness.profiles
  for update using ((select auth.uid()) = id);

drop trigger if exists profiles_updated_at on fitness.profiles;
create trigger profiles_updated_at
  before update on fitness.profiles
  for each row execute function private.set_updated_at();

create or replace function private.fitness_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into fitness.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into fitness.user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists fitness_on_auth_user_created on auth.users;
create trigger fitness_on_auth_user_created
  after insert on auth.users
  for each row execute function private.fitness_handle_new_user();

create table if not exists fitness.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  rotation jsonb not null default '{}'::jsonb,
  program_overrides jsonb not null default '{}'::jsonb,
  active_program_id text,
  last_day text,
  schema_version int not null default 4,
  updated_at timestamptz not null default now()
);

alter table fitness.user_state enable row level security;

drop policy if exists "user_state_select_own" on fitness.user_state;
create policy "user_state_select_own" on fitness.user_state
  for select using ((select auth.uid()) = user_id);
drop policy if exists "user_state_insert_own" on fitness.user_state;
create policy "user_state_insert_own" on fitness.user_state
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "user_state_update_own" on fitness.user_state;
create policy "user_state_update_own" on fitness.user_state
  for update using ((select auth.uid()) = user_id);

drop trigger if exists user_state_updated_at on fitness.user_state;
create trigger user_state_updated_at
  before update on fitness.user_state
  for each row execute function private.set_updated_at();

create table if not exists fitness.exercise_weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  weight numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table fitness.exercise_weights enable row level security;

drop policy if exists "exercise_weights_select_own" on fitness.exercise_weights;
create policy "exercise_weights_select_own" on fitness.exercise_weights
  for select using ((select auth.uid()) = user_id);
drop policy if exists "exercise_weights_insert_own" on fitness.exercise_weights;
create policy "exercise_weights_insert_own" on fitness.exercise_weights
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "exercise_weights_update_own" on fitness.exercise_weights;
create policy "exercise_weights_update_own" on fitness.exercise_weights
  for update using ((select auth.uid()) = user_id);
drop policy if exists "exercise_weights_delete_own" on fitness.exercise_weights;
create policy "exercise_weights_delete_own" on fitness.exercise_weights
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists exercise_weights_updated_at on fitness.exercise_weights;
create trigger exercise_weights_updated_at
  before update on fitness.exercise_weights
  for each row execute function private.set_updated_at();

create table if not exists fitness.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  day_id text not null,
  program_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_date, day_id)
);

create index if not exists workout_sessions_user_date_idx
  on fitness.workout_sessions (user_id, session_date desc);

alter table fitness.workout_sessions enable row level security;

drop policy if exists "workout_sessions_select_own" on fitness.workout_sessions;
create policy "workout_sessions_select_own" on fitness.workout_sessions
  for select using ((select auth.uid()) = user_id);
drop policy if exists "workout_sessions_insert_own" on fitness.workout_sessions;
create policy "workout_sessions_insert_own" on fitness.workout_sessions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "workout_sessions_update_own" on fitness.workout_sessions;
create policy "workout_sessions_update_own" on fitness.workout_sessions
  for update using ((select auth.uid()) = user_id);
drop policy if exists "workout_sessions_delete_own" on fitness.workout_sessions;
create policy "workout_sessions_delete_own" on fitness.workout_sessions
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists workout_sessions_updated_at on fitness.workout_sessions;
create trigger workout_sessions_updated_at
  before update on fitness.workout_sessions
  for each row execute function private.set_updated_at();

create table if not exists fitness.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references fitness.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  done int not null default 0,
  sets jsonb not null default '[]'::jsonb,
  skipped jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id)
);

create index if not exists exercise_logs_user_ex_idx
  on fitness.exercise_logs (user_id, exercise_id);

alter table fitness.exercise_logs enable row level security;

drop policy if exists "exercise_logs_select_own" on fitness.exercise_logs;
create policy "exercise_logs_select_own" on fitness.exercise_logs
  for select using ((select auth.uid()) = user_id);
drop policy if exists "exercise_logs_insert_own" on fitness.exercise_logs;
create policy "exercise_logs_insert_own" on fitness.exercise_logs
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "exercise_logs_update_own" on fitness.exercise_logs;
create policy "exercise_logs_update_own" on fitness.exercise_logs
  for update using ((select auth.uid()) = user_id);
drop policy if exists "exercise_logs_delete_own" on fitness.exercise_logs;
create policy "exercise_logs_delete_own" on fitness.exercise_logs
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists exercise_logs_updated_at on fitness.exercise_logs;
create trigger exercise_logs_updated_at
  before update on fitness.exercise_logs
  for each row execute function private.set_updated_at();

-- PostgREST / Data API 暴露 fitness schema
grant usage on schema fitness to anon, authenticated, service_role;
grant all on all tables in schema fitness to anon, authenticated, service_role;
grant all on all sequences in schema fitness to anon, authenticated, service_role;
alter default privileges in schema fitness
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema fitness
  grant all on sequences to anon, authenticated, service_role;
