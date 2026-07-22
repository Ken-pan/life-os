-- Hotfix (applied to production 2026-07-21 as core_trusted_devices_view_rls_passthrough):
-- core_trusted_devices was a definer view with anon/authenticated ALL grants,
-- bypassing core_allowed_devices RLS (cross-user read + updatable-view write).
alter view public.core_trusted_devices set (security_invoker = true);
revoke all on public.core_trusted_devices from anon;
revoke all on public.core_trusted_devices from authenticated;
grant select on public.core_trusted_devices to authenticated;
