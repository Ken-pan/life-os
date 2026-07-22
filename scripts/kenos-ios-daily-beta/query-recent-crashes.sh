#!/usr/bin/env bash
# Query recent Kenos crash / hang / unclean-exit triage rows.
# Usage:
#   ./scripts/kenos-ios-daily-beta/query-recent-crashes.sh [hours]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOURS="${1:-24}"

SQL=$(cat <<SQL
select
  logged_at,
  level,
  event,
  kind,
  coalesce(signal_name, signal, '') as signal,
  coalesce(exception_name, exception_type, '') as exception,
  coalesce(crashed_binary, '') as binary,
  coalesce(ctx_domain, ctx_space, '') as domain,
  coalesce(ctx_host, '') as host,
  coalesce(app_build, session_build, build_version, '') as build,
  left(coalesce(top_frames, ''), 180) as top_frames,
  left(coalesce(ctx_trail, ''), 160) as trail,
  fingerprint
from public.kenos_crash_events
where logged_at > now() - interval '${HOURS} hours'
order by logged_at desc
limit 40;
SQL
)

echo "==> Kenos crash events (last ${HOURS}h)"
"$ROOT/scripts/supabase-sql.sh" "$SQL"
