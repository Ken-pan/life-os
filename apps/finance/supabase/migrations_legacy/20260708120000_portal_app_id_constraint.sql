-- I-P1: Expand core_* app_id / default_app constraints to include portal.

alter table public.core_user_app_settings drop constraint if exists core_user_app_settings_app_id_check;
alter table public.core_user_app_settings
  add constraint core_user_app_settings_app_id_check
  check (app_id in ('finance', 'fitness', 'planner', 'music', 'portal'));

alter table public.core_profiles drop constraint if exists core_profiles_default_app_check;
alter table public.core_profiles
  add constraint core_profiles_default_app_check
  check (default_app is null or default_app in ('finance', 'fitness', 'planner', 'music', 'portal'));

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

  foreach v_app in array array['finance', 'fitness', 'planner', 'music', 'portal']
  loop
    insert into public.core_user_app_settings (user_id, app_id)
    values (new.id, v_app)
    on conflict (user_id, app_id) do nothing;
  end loop;

  return new;
end;
$$;

insert into public.core_user_app_settings (user_id, app_id)
select u.id, 'portal'
from auth.users u
where not exists (
  select 1
  from public.core_user_app_settings s
  where s.user_id = u.id and s.app_id = 'portal'
);

insert into public.life_os_modules (slug, display_name, schema_name, description) values
  ('portal', 'Portal OS', 'public', 'Life OS 启动器与跨站入口')
on conflict (slug) do update set
  display_name = excluded.display_name,
  schema_name = excluded.schema_name,
  description = excluded.description;
