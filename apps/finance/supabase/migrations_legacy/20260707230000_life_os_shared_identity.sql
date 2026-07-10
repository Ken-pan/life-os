-- Life OS P0: 跨 App 共享身份骨架（core_profiles + core_user_app_settings）
-- 不合并业务数据；各 App 仍保留独立 schema / 表。

-- ═══════════ core_profiles：全 Life OS 统一用户档案 ═══════════
create table if not exists public.core_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/Los_Angeles',
  locale text not null default 'en',
  default_app text check (default_app in ('finance', 'fitness', 'planner', 'music')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.core_profiles is 'Life OS 共享用户档案；id = auth.users.id';
comment on column public.core_profiles.default_app is 'Portal / 启动器默认打开的 App';

alter table public.core_profiles enable row level security;

drop policy if exists "core_profiles_select_own" on public.core_profiles;
create policy "core_profiles_select_own"
  on public.core_profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "core_profiles_insert_own" on public.core_profiles;
create policy "core_profiles_insert_own"
  on public.core_profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "core_profiles_update_own" on public.core_profiles;
create policy "core_profiles_update_own"
  on public.core_profiles for update
  using ((select auth.uid()) = id);

drop trigger if exists core_profiles_updated_at on public.core_profiles;
create trigger core_profiles_updated_at
  before update on public.core_profiles
  for each row execute function private.set_updated_at();

-- ═══════════ core_user_app_settings：按 App 的偏好与最近打开时间 ═══════════
create table if not exists public.core_user_app_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null check (app_id in ('finance', 'fitness', 'planner', 'music')),
  settings jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

comment on table public.core_user_app_settings is 'Life OS 各 App 用户设置（jsonb）与 last_opened_at';

alter table public.core_user_app_settings enable row level security;

drop policy if exists "core_user_app_settings_select_own" on public.core_user_app_settings;
create policy "core_user_app_settings_select_own"
  on public.core_user_app_settings for select
  using ((select auth.uid()) = user_id);

drop policy if exists "core_user_app_settings_insert_own" on public.core_user_app_settings;
create policy "core_user_app_settings_insert_own"
  on public.core_user_app_settings for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "core_user_app_settings_update_own" on public.core_user_app_settings;
create policy "core_user_app_settings_update_own"
  on public.core_user_app_settings for update
  using ((select auth.uid()) = user_id);

drop trigger if exists core_user_app_settings_updated_at on public.core_user_app_settings;
create trigger core_user_app_settings_updated_at
  before update on public.core_user_app_settings
  for each row execute function private.set_updated_at();

-- ═══════════ 新用户：自动建 core 档案 + 四 App 设置行 ═══════════
create or replace function private.core_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_app text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.core_profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  foreach v_app in array array['finance', 'fitness', 'planner', 'music']
  loop
    insert into public.core_user_app_settings (user_id, app_id)
    values (new.id, v_app)
    on conflict (user_id, app_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists core_on_auth_user_created on auth.users;
create trigger core_on_auth_user_created
  after insert on auth.users
  for each row execute function private.core_handle_new_user();

-- ═══════════ 回填已有用户 ═══════════
insert into public.core_profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    fp.display_name,
    mp.display_name,
    u.raw_user_meta_data ->> 'display_name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
left join fitness.fitness_profiles fp on fp.id = u.id
left join music.music_profiles mp on mp.id = u.id
on conflict (id) do update set
  display_name = coalesce(public.core_profiles.display_name, excluded.display_name),
  avatar_url = coalesce(public.core_profiles.avatar_url, excluded.avatar_url),
  updated_at = now();

insert into public.core_user_app_settings (user_id, app_id)
select u.id, app.slug
from auth.users u
cross join (
  values ('finance'), ('fitness'), ('planner'), ('music')
) as app(slug)
on conflict (user_id, app_id) do nothing;

-- ═══════════ 模块注册表：补 music ═══════════
insert into public.life_os_modules (slug, display_name, schema_name, description) values
  ('music', 'Music OS', 'music', '音乐库、标签、推荐与播放行为')
on conflict (slug) do update set
  display_name = excluded.display_name,
  schema_name = excluded.schema_name,
  description = excluded.description;

-- os_module 标记（Table Editor 识别）
alter table public.core_profiles
  add column if not exists os_module text not null default 'core';
alter table public.core_profiles drop constraint if exists core_profiles_os_module_check;
alter table public.core_profiles
  add constraint core_profiles_os_module_check check (os_module = 'core');

alter table public.core_user_app_settings
  add column if not exists os_module text not null default 'core';
alter table public.core_user_app_settings drop constraint if exists core_user_app_settings_os_module_check;
alter table public.core_user_app_settings
  add constraint core_user_app_settings_os_module_check check (os_module = 'core');
