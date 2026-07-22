-- Kenos crash / hang / unclean-exit events as a queryable first-class view.
-- Backed by kenos_app_logs diagnostics rows (schema kenos.crash.v2 + legacy MetricKit).

create or replace view public.kenos_crash_events as
select
  l.id,
  l.user_id,
  l.session_id,
  l.logged_at,
  l.created_at,
  l.level,
  l.message,
  coalesce(l.metadata->>'event', l.metadata->>'kind', 'unknown') as event,
  l.metadata->>'kind' as kind,
  l.metadata->>'fingerprint' as fingerprint,
  l.metadata->>'signalName' as signal_name,
  l.metadata->>'signal' as signal,
  l.metadata->>'exceptionName' as exception_name,
  l.metadata->>'exceptionType' as exception_type,
  l.metadata->>'crashedBinary' as crashed_binary,
  l.metadata->>'topFrames' as top_frames,
  l.metadata->>'buildVersion' as build_version,
  coalesce(l.metadata->>'ctxBuild', s.build) as app_build,
  l.metadata->>'ctxDomain' as ctx_domain,
  l.metadata->>'ctxSpace' as ctx_space,
  l.metadata->>'ctxHost' as ctx_host,
  l.metadata->>'ctxPath' as ctx_path,
  l.metadata->>'ctxShell' as ctx_shell,
  l.metadata->>'ctxNowPlaying' as ctx_now_playing,
  l.metadata->>'ctxTrail' as ctx_trail,
  l.metadata->>'schema' as schema_version,
  l.metadata,
  s.app_version as session_app_version,
  s.build as session_build,
  s.device_model,
  s.system_version
from public.kenos_app_logs l
left join public.kenos_app_log_sessions s on s.id = l.session_id
where l.category = 'diagnostics'
  and (
    l.metadata->>'schema' = 'kenos.crash.v2'
    or l.message ilike 'MetricKit%'
    or l.message = 'previous session exited uncleanly'
    or coalesce(l.metadata->>'kind', '') in (
      'crash',
      'hang',
      'cpuException',
      'memoryException',
      'unclean_exit'
    )
  );

comment on view public.kenos_crash_events is
  'Triage view for Kenos MetricKit / unclean-exit diagnostics (kenos.crash.v2).';

-- Inherit caller RLS from underlying kenos_app_logs / sessions.
alter view public.kenos_crash_events set (security_invoker = true);

revoke all on public.kenos_crash_events from public, anon;
grant select on public.kenos_crash_events to authenticated;

-- Fingerprint lookup for release-health / dedupe.
create index if not exists kenos_app_logs_diagnostics_fingerprint_idx
  on public.kenos_app_logs ((metadata->>'fingerprint'), logged_at desc)
  where category = 'diagnostics' and metadata ? 'fingerprint';

create index if not exists kenos_app_logs_diagnostics_event_idx
  on public.kenos_app_logs ((metadata->>'event'), logged_at desc)
  where category = 'diagnostics' and metadata ? 'event';
