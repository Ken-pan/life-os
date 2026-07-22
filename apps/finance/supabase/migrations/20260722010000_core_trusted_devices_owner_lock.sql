-- Owner Device Lock: elevate core_allowed_devices to platform Trusted Devices.
-- Keeps table name for Finance compatibility; adds pairing / revoke columns + view alias.

alter table public.core_allowed_devices
  add column if not exists public_key text,
  add column if not exists platform text,
  add column if not exists paired_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_challenge_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'core_allowed_devices_platform_check'
  ) then
    alter table public.core_allowed_devices
      add constraint core_allowed_devices_platform_check
      check (platform is null or platform in ('ios', 'macos', 'web'));
  end if;
end $$;

comment on column public.core_allowed_devices.public_key is
  'Owner Device Lock: P-256 public key (X9.63 uncompressed, base64). Null for browser slot-only rows.';
comment on column public.core_allowed_devices.platform is
  'Owner Device Lock: ios | macos | web';
comment on column public.core_allowed_devices.paired_at is
  'When Apple shell completed device-pair with a public key.';
comment on column public.core_allowed_devices.revoked_at is
  'Soft revoke — exchange must fail; row retained for audit.';
comment on column public.core_allowed_devices.last_challenge_at is
  'Last successful device-challenge / exchange timestamp.';

create index if not exists core_allowed_devices_active_user_idx
  on public.core_allowed_devices (user_id)
  where revoked_at is null;

create index if not exists core_allowed_devices_pubkey_idx
  on public.core_allowed_devices (user_id, device_id)
  where public_key is not null and revoked_at is null;

-- Active trusted devices alias (SSOT name used by docs / Apple client).
create or replace view public.core_trusted_devices as
select
  id,
  user_id,
  label,
  user_agent,
  created_at,
  last_seen_at,
  device_class,
  device_id,
  os_module,
  public_key,
  platform,
  paired_at,
  revoked_at,
  last_challenge_at
from public.core_allowed_devices
where revoked_at is null;

-- security_invoker: without it the view runs with owner privileges and
-- bypasses core_allowed_devices RLS (cross-user read + updatable-view write).
alter view public.core_trusted_devices set (security_invoker = true);

comment on view public.core_trusted_devices is
  'Active Owner Device Lock slots (core_allowed_devices where revoked_at is null).';

revoke all on public.core_trusted_devices from anon;
revoke all on public.core_trusted_devices from authenticated;
grant select on public.core_trusted_devices to authenticated;
grant select on public.core_trusted_devices to service_role;
