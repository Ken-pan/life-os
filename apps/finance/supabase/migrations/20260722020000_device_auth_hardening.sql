-- Owner Device Lock hardening: audit trail, challenge replay guard, key metadata.

create table if not exists public.core_device_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  device_row_id text,
  device_id text,
  event text not null check (event in (
    'pair', 'pair_denied', 'challenge', 'exchange', 'exchange_denied', 'revoke', 'revoke_denied'
  )),
  result text not null check (result in ('ok', 'error')),
  error_code text,
  platform text,
  key_storage text,
  attest_key_id text,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists core_device_auth_events_user_created_idx
  on public.core_device_auth_events (user_id, created_at desc);

create index if not exists core_device_auth_events_event_created_idx
  on public.core_device_auth_events (event, created_at desc);

alter table public.core_device_auth_events enable row level security;

-- Owner can read own audit; writes are service-role only.
drop policy if exists "own device auth events select" on public.core_device_auth_events;
create policy "own device auth events select"
  on public.core_device_auth_events
  for select
  using ((select auth.uid()) = user_id);

grant select on public.core_device_auth_events to authenticated;
grant all on public.core_device_auth_events to service_role;

-- One-time challenge nonces (replay protection).
create table if not exists public.core_device_challenge_nonces (
  nonce text primary key,
  device_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists core_device_challenge_nonces_expires_idx
  on public.core_device_challenge_nonces (expires_at);

alter table public.core_device_challenge_nonces enable row level security;
grant all on public.core_device_challenge_nonces to service_role;

alter table public.core_allowed_devices
  add column if not exists key_storage text,
  add column if not exists attest_key_id text,
  add column if not exists credential_version integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'core_allowed_devices_key_storage_check'
  ) then
    alter table public.core_allowed_devices
      add constraint core_allowed_devices_key_storage_check
      check (key_storage is null or key_storage in ('secure_enclave', 'software'));
  end if;
end $$;

comment on column public.core_allowed_devices.key_storage is
  'Owner Device Lock: secure_enclave | software';
comment on column public.core_allowed_devices.attest_key_id is
  'Apple App Attest keyId (optional; enforced when DEVICE_ATTEST_REQUIRED=1)';
comment on column public.core_allowed_devices.credential_version is
  'Bumped on key rotation / re-pair';

-- Per-user epoch: incremented on revoke so clients can detect stale vaults.
create table if not exists public.core_device_auth_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_epoch integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.core_device_auth_state enable row level security;
drop policy if exists "own device auth state select" on public.core_device_auth_state;
create policy "own device auth state select"
  on public.core_device_auth_state
  for select
  using ((select auth.uid()) = user_id);
grant select on public.core_device_auth_state to authenticated;
grant all on public.core_device_auth_state to service_role;
