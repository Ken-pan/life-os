-- FITNESS.OS 核心数据表（Life OS 统一项目 · fitness schema）
-- 表名带 fitness_ 前缀，与 Life OS 远程库及 src/lib/supabaseTables.js 一致
-- 数据来源:本地 localStorage 状态(state.svelte.js)
--   settings/rotation/programOverrides → fitness_user_state(jsonb,结构由前端定义)
--   weights → fitness_exercise_weights(逐动作工作重量)
--   logs + sessionMeta → fitness_workout_sessions + fitness_exercise_logs(可查询,用于统计/纪录)

-- ═══════════ fitness schema ═══════════
create schema if not exists fitness;

grant usage on schema fitness to postgres, anon, authenticated, service_role;
grant all on all tables in schema fitness to anon, authenticated, service_role;
grant all on all routines in schema fitness to anon, authenticated, service_role;
grant all on all sequences in schema fitness to anon, authenticated, service_role;
alter default privileges in schema fitness grant all on tables to anon, authenticated, service_role;
alter default privileges in schema fitness grant all on routines to anon, authenticated, service_role;
alter default privileges in schema fitness grant all on sequences to anon, authenticated, service_role;

-- ═══════════ private schema:内部函数,不暴露给 Data API ═══════════
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

-- ═══════════ fitness_profiles ═══════════
create table if not exists fitness.fitness_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fitness.fitness_profiles enable row level security;

drop policy if exists "fitness_profiles_select_own" on fitness.fitness_profiles;
create policy "fitness_profiles_select_own" on fitness.fitness_profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "fitness_profiles_insert_own" on fitness.fitness_profiles;
create policy "fitness_profiles_insert_own" on fitness.fitness_profiles
  for insert with check ((select auth.uid()) = id);
drop policy if exists "fitness_profiles_update_own" on fitness.fitness_profiles;
create policy "fitness_profiles_update_own" on fitness.fitness_profiles
  for update using ((select auth.uid()) = id);

drop trigger if exists fitness_profiles_updated_at on fitness.fitness_profiles;
create trigger fitness_profiles_updated_at
  before update on fitness.fitness_profiles
  for each row execute function private.set_updated_at();

-- 注册时自动建 profile 与 user_state
create or replace function private.fitness_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into fitness.fitness_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into fitness.fitness_user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists fitness_on_auth_user_created on auth.users;
create trigger fitness_on_auth_user_created
  after insert on auth.users
  for each row execute function private.fitness_handle_new_user();

-- ═══════════ fitness_user_state:设置 / 轮换 / 计划自定义 ═══════════
create table if not exists fitness.fitness_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  rotation jsonb not null default '{}'::jsonb,
  program_overrides jsonb not null default '{}'::jsonb,
  active_program_id text,
  last_day text,
  schema_version int not null default 4,
  updated_at timestamptz not null default now()
);

alter table fitness.fitness_user_state enable row level security;

drop policy if exists "fitness_user_state_select_own" on fitness.fitness_user_state;
create policy "fitness_user_state_select_own" on fitness.fitness_user_state
  for select using ((select auth.uid()) = user_id);
drop policy if exists "fitness_user_state_insert_own" on fitness.fitness_user_state;
create policy "fitness_user_state_insert_own" on fitness.fitness_user_state
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "fitness_user_state_update_own" on fitness.fitness_user_state;
create policy "fitness_user_state_update_own" on fitness.fitness_user_state
  for update using ((select auth.uid()) = user_id);

drop trigger if exists fitness_user_state_updated_at on fitness.fitness_user_state;
create trigger fitness_user_state_updated_at
  before update on fitness.fitness_user_state
  for each row execute function private.set_updated_at();

-- ═══════════ fitness_exercise_weights:逐动作工作重量 ═══════════
create table if not exists fitness.fitness_exercise_weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  weight numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table fitness.fitness_exercise_weights enable row level security;

drop policy if exists "fitness_exercise_weights_select_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_select_own" on fitness.fitness_exercise_weights
  for select using ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_weights_insert_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_insert_own" on fitness.fitness_exercise_weights
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_weights_update_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_update_own" on fitness.fitness_exercise_weights
  for update using ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_weights_delete_own" on fitness.fitness_exercise_weights;
create policy "fitness_exercise_weights_delete_own" on fitness.fitness_exercise_weights
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists fitness_exercise_weights_updated_at on fitness.fitness_exercise_weights;
create trigger fitness_exercise_weights_updated_at
  before update on fitness.fitness_exercise_weights
  for each row execute function private.set_updated_at();

-- ═══════════ fitness_workout_sessions:一次训练(日期 × 训练日) ═══════════
create table if not exists fitness.fitness_workout_sessions (
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

create index if not exists fitness_workout_sessions_user_date_idx
  on fitness.fitness_workout_sessions (user_id, session_date desc);

alter table fitness.fitness_workout_sessions enable row level security;

drop policy if exists "fitness_workout_sessions_select_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_select_own" on fitness.fitness_workout_sessions
  for select using ((select auth.uid()) = user_id);
drop policy if exists "fitness_workout_sessions_insert_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_insert_own" on fitness.fitness_workout_sessions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "fitness_workout_sessions_update_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_update_own" on fitness.fitness_workout_sessions
  for update using ((select auth.uid()) = user_id);
drop policy if exists "fitness_workout_sessions_delete_own" on fitness.fitness_workout_sessions;
create policy "fitness_workout_sessions_delete_own" on fitness.fitness_workout_sessions
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists fitness_workout_sessions_updated_at on fitness.fitness_workout_sessions;
create trigger fitness_workout_sessions_updated_at
  before update on fitness.fitness_workout_sessions
  for each row execute function private.set_updated_at();

-- ═══════════ fitness_exercise_logs:单动作训练记录(组级明细存 jsonb) ═══════════
-- sets: [{reps, rir, weight, ts} | null, ...]  skipped: {reason, substituteId, ts} | null
create table if not exists fitness.fitness_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references fitness.fitness_workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  done int not null default 0,
  sets jsonb not null default '[]'::jsonb,
  skipped jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id)
);

create index if not exists fitness_exercise_logs_user_ex_idx
  on fitness.fitness_exercise_logs (user_id, exercise_id);

alter table fitness.fitness_exercise_logs enable row level security;

drop policy if exists "fitness_exercise_logs_select_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_select_own" on fitness.fitness_exercise_logs
  for select using ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_logs_insert_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_insert_own" on fitness.fitness_exercise_logs
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_logs_update_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_update_own" on fitness.fitness_exercise_logs
  for update using ((select auth.uid()) = user_id);
drop policy if exists "fitness_exercise_logs_delete_own" on fitness.fitness_exercise_logs;
create policy "fitness_exercise_logs_delete_own" on fitness.fitness_exercise_logs
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists fitness_exercise_logs_updated_at on fitness.fitness_exercise_logs;
create trigger fitness_exercise_logs_updated_at
  before update on fitness.fitness_exercise_logs
  for each row execute function private.set_updated_at();
