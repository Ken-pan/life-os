-- Lock open registration to FitnessOS entitlements.
-- Supabase Auth signup remains enabled at project level so FitnessOS can onboard
-- users, but new users only receive Fitness membership by default.

create or replace function private.core_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.core_profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  insert into public.app_memberships (
    app_key,
    user_id,
    role,
    status,
    granted_by,
    activated_at
  )
  values (
    'fitness',
    new.id,
    'member',
    'active',
    null,
    now()
  )
  on conflict (app_key, user_id)
  do update set
    status = 'active',
    role = case
      when public.app_memberships.role in ('owner', 'admin') then public.app_memberships.role
      else 'member'
    end,
    activated_at = coalesce(public.app_memberships.activated_at, excluded.activated_at),
    revoked_at = null,
    updated_at = now();

  insert into public.core_user_app_settings (user_id, app_id)
  values (new.id, 'fitness')
  on conflict (user_id, app_id) do nothing;

  return new;
end;
$$;

insert into public.app_memberships (
  app_key,
  user_id,
  role,
  status,
  granted_by,
  activated_at
)
select
  'fitness',
  u.id,
  'member',
  'active',
  null,
  now()
from auth.users u
on conflict (app_key, user_id)
do update set
  status = 'active',
  role = case
    when public.app_memberships.role in ('owner', 'admin') then public.app_memberships.role
    else 'member'
  end,
  activated_at = coalesce(public.app_memberships.activated_at, excluded.activated_at),
  revoked_at = null,
  updated_at = now();

insert into public.app_memberships (
  app_key,
  user_id,
  role,
  status,
  granted_by,
  activated_at
)
select
  r.app_key,
  u.id,
  'owner',
  'active',
  u.id,
  now()
from auth.users u
cross join public.app_registry r
where lower(u.email) = '334452284ken@gmail.com'
on conflict (app_key, user_id)
do update set
  role = 'owner',
  status = 'active',
  granted_by = excluded.granted_by,
  activated_at = coalesce(public.app_memberships.activated_at, excluded.activated_at),
  revoked_at = null,
  updated_at = now();

update public.app_memberships m
set
  status = 'revoked',
  revoked_at = coalesce(m.revoked_at, now()),
  updated_at = now()
from auth.users u
where m.user_id = u.id
  and lower(u.email) <> '334452284ken@gmail.com'
  and m.app_key <> 'fitness'
  and m.status = 'active';
