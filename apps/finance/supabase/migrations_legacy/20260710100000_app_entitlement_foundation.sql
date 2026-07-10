-- Phase 2: App Entitlement Foundation
-- Creates app_registry, app_memberships, and internal authorization helper functions.

-- 1. App Registry
create table if not exists public.app_registry (
  app_key text primary key check (app_key ~ '^[a-z][a-z0-9_-]{1,31}$'),
  display_name text not null,
  app_url text,
  icon_key text,
  is_enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed initial apps
insert into public.app_registry (app_key, display_name, app_url, sort_order)
values
  ('portal',  'OS Portal', 'https://portal.kenos.space', 10),
  ('planner', 'PlannerOS', 'https://planner.kenos.space', 20),
  ('fitness', 'FitnessOS', 'https://fitness.kenos.space', 30),
  ('finance', 'FinanceOS', 'https://finance.kenos.space', 40),
  ('music',   'MusicOS',   'https://music.kenos.space', 50),
  ('home',    'HomeOS',    'https://home.kenos.space', 60),
  ('paper',   'PaperOS',   'https://paper.kenos.space', 70)
on conflict (app_key) do update
set
  display_name = excluded.display_name,
  app_url = excluded.app_url,
  sort_order = excluded.sort_order,
  updated_at = now();

-- 2. App Memberships
create table if not exists public.app_memberships (
  app_key text not null references public.app_registry(app_key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  primary key (app_key, user_id)
);

create index if not exists app_memberships_user_status_app_idx
  on public.app_memberships (user_id, status, app_key);

-- 3. RLS for Memberships and Registry
alter table public.app_registry enable row level security;
alter table public.app_memberships enable row level security;

revoke all on table public.app_registry from anon, authenticated;
revoke all on table public.app_memberships from anon, authenticated;
grant select on table public.app_registry to authenticated;
grant select on table public.app_memberships to authenticated;

-- Users read their own memberships
drop policy if exists "Users read own app memberships" on public.app_memberships;
create policy "Users read own app memberships"
on public.app_memberships for select
to authenticated
using ((select auth.uid()) = user_id);

-- Users see apps they have active access to
drop policy if exists "Users read accessible apps" on public.app_registry;
create policy "Users read accessible apps"
on public.app_registry for select
to authenticated
using (
  is_enabled = true
  and exists (
    select 1
    from public.app_memberships m
    where m.app_key = app_registry.app_key
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

-- 4. Internal Helper Functions (in private schema)
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Check if user has app access
create or replace function private.has_app_access(requested_app_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = (select auth.uid())
      and m.app_key = requested_app_key
      and m.status = 'active'
  );
$$;

revoke all on function private.has_app_access(text) from public;
grant execute on function private.has_app_access(text) to authenticated, service_role;

-- Check if user has specific role
create or replace function private.has_app_role(requested_app_key text, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = (select auth.uid())
      and m.app_key = requested_app_key
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.has_app_role(text, text[]) from public;
grant execute on function private.has_app_role(text, text[]) to authenticated, service_role;
