-- App Attest storage + hangup-all audit events.

alter table public.core_allowed_devices
  add column if not exists attest_public_key_pem text,
  add column if not exists attest_sign_count integer not null default 0;

comment on column public.core_allowed_devices.attest_public_key_pem is
  'Apple App Attest device public key (PEM) from verifyAttestation';
comment on column public.core_allowed_devices.attest_sign_count is
  'Last verified App Attest assertion counter';

-- Expand event check to include hangup.
alter table public.core_device_auth_events drop constraint if exists core_device_auth_events_event_check;
alter table public.core_device_auth_events
  add constraint core_device_auth_events_event_check
  check (event in (
    'pair', 'pair_denied', 'challenge', 'exchange', 'exchange_denied',
    'revoke', 'revoke_denied', 'hangup', 'hangup_denied', 'attest', 'attest_denied'
  ));

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
  last_challenge_at,
  key_storage,
  attest_key_id,
  credential_version,
  attest_public_key_pem,
  attest_sign_count
from public.core_allowed_devices
where revoked_at is null;

-- Re-assert after create-or-replace: RLS passthrough + read-only grants.
alter view public.core_trusted_devices set (security_invoker = true);
revoke all on public.core_trusted_devices from anon;
revoke all on public.core_trusted_devices from authenticated;
grant select on public.core_trusted_devices to authenticated;
