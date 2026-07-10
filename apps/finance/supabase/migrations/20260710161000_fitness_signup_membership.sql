-- DB-REPLAY-0 / AUTH-MEMBER-0:
-- Keep Supabase Auth signup enabled for FitnessOS onboarding, but make the
-- database boundary grant only fitness/member to any newly-created user.

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

  insert into public.core_user_app_settings (user_id, app_id)
  values (new.id, 'fitness')
  on conflict (user_id, app_id) do nothing;

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

  return new;
end;
$$;

revoke all on function private.core_handle_new_user() from public;

drop trigger if exists core_on_auth_user_created on auth.users;
create trigger core_on_auth_user_created
  after insert on auth.users
  for each row execute function private.core_handle_new_user();
