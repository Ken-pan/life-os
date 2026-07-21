-- Kenos app logs: web/app coverage + analysis RPCs + alert scan.
-- Prerequisites: tip >= 20260721170000 (kenos_app_logs already present).

-- ---------------------------------------------------------------------------
-- 1) bug_logs: allow aios / knowledge (portal membership gateway, like kenos)
-- ---------------------------------------------------------------------------
alter table public.bug_logs drop constraint if exists bug_logs_app_check;
alter table public.bug_logs
  add constraint bug_logs_app_check
  check (
    app = any (
      array[
        'portal'::text,
        'planner'::text,
        'fitness'::text,
        'music'::text,
        'finance'::text,
        'home'::text,
        'kenos'::text,
        'aios'::text,
        'knowledge'::text
      ]
    )
  );

drop policy if exists bug_logs_select_own on public.bug_logs;
create policy bug_logs_select_own
  on public.bug_logs for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = any (array['kenos'::text, 'aios'::text, 'knowledge'::text])
          and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_insert_own on public.bug_logs;
create policy bug_logs_insert_own
  on public.bug_logs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = any (array['kenos'::text, 'aios'::text, 'knowledge'::text])
          and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_update_own on public.bug_logs;
create policy bug_logs_update_own
  on public.bug_logs for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = any (array['kenos'::text, 'aios'::text, 'knowledge'::text])
          and private.has_app_access('portal'))
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = any (array['kenos'::text, 'aios'::text, 'knowledge'::text])
          and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_delete_own on public.bug_logs;
create policy bug_logs_delete_own
  on public.bug_logs for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = any (array['kenos'::text, 'aios'::text, 'knowledge'::text])
          and private.has_app_access('portal'))
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Alert ledger (deduped by fingerprint per user)
-- ---------------------------------------------------------------------------
create table if not exists public.kenos_app_log_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  severity text not null check (severity = any (array['warning'::text, 'critical'::text])),
  app_name text,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  window_start timestamptz,
  window_end timestamptz,
  fingerprint text not null,
  status text not null default 'open'
    check (status = any (array['open'::text, 'acked'::text, 'resolved'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kenos_app_log_alerts_fingerprint_uidx unique (user_id, fingerprint)
);

create index if not exists kenos_app_log_alerts_user_created_idx
  on public.kenos_app_log_alerts (user_id, created_at desc);

create index if not exists kenos_app_log_alerts_user_status_idx
  on public.kenos_app_log_alerts (user_id, status, created_at desc)
  where status = 'open';

alter table public.kenos_app_log_alerts enable row level security;

drop policy if exists kenos_app_log_alerts_select_own on public.kenos_app_log_alerts;
create policy kenos_app_log_alerts_select_own
  on public.kenos_app_log_alerts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists kenos_app_log_alerts_update_own on public.kenos_app_log_alerts;
create policy kenos_app_log_alerts_update_own
  on public.kenos_app_log_alerts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.kenos_app_log_alerts from public, anon, authenticated;
grant select, update on public.kenos_app_log_alerts to authenticated;
grant all on public.kenos_app_log_alerts to service_role;
-- Inserts go through security-definer scan RPCs only.

-- ---------------------------------------------------------------------------
-- 3) Analysis summary (owner-scoped)
-- ---------------------------------------------------------------------------
create or replace function public.kenos_app_log_summary(
  p_hours integer default 24
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hours integer := greatest(1, least(coalesce(p_hours, 24), 168));
  v_since timestamptz := now() - make_interval(hours => v_hours);
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'ok', true,
    'hours', v_hours,
    'since', v_since,
    'byLevel', coalesce((
      select jsonb_object_agg(level, cnt)
      from (
        select l.level, count(*)::int as cnt
        from public.kenos_app_logs l
        where l.user_id = v_user_id
          and l.logged_at >= v_since
        group by l.level
      ) s
    ), '{}'::jsonb),
    'byApp', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.errors + t.faults desc, t.app_name)
      from (
        select
          s.app_name,
          count(*) filter (where l.level = 'warning')::int as warnings,
          count(*) filter (where l.level = 'error')::int as errors,
          count(*) filter (where l.level = 'fault')::int as faults,
          count(*)::int as total
        from public.kenos_app_logs l
        join public.kenos_app_log_sessions s on s.id = l.session_id
        where l.user_id = v_user_id
          and l.logged_at >= v_since
        group by s.app_name
      ) t
    ), '[]'::jsonb),
    'topCategories', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.cnt desc)
      from (
        select l.category, l.level, count(*)::int as cnt
        from public.kenos_app_logs l
        where l.user_id = v_user_id
          and l.logged_at >= v_since
          and l.level in ('warning', 'error', 'fault')
        group by l.category, l.level
        order by count(*) desc
        limit 20
      ) t
    ), '[]'::jsonb),
    'openAlerts', coalesce((
      select count(*)::int
      from public.kenos_app_log_alerts a
      where a.user_id = v_user_id
        and a.status = 'open'
    ), 0),
    'recentFaults', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.logged_at desc)
      from (
        select
          l.id,
          l.logged_at,
          l.level,
          l.category,
          left(l.message, 240) as message,
          s.app_name,
          s.platform
        from public.kenos_app_logs l
        join public.kenos_app_log_sessions s on s.id = l.session_id
        where l.user_id = v_user_id
          and l.logged_at >= v_since
          and l.level in ('error', 'fault')
        order by l.logged_at desc
        limit 30
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.kenos_app_log_summary(integer) from public, anon;
grant execute on function public.kenos_app_log_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Alert scan for current user (also called after web/iOS ingest of errors)
-- ---------------------------------------------------------------------------
create or replace function public.kenos_scan_app_log_alerts(
  p_window_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_minutes integer := greatest(5, least(coalesce(p_window_minutes, 30), 180));
  v_since timestamptz := now() - make_interval(mins => v_minutes);
  v_created int := 0;
  v_rowcount int;
  v_row record;
  v_fingerprint text;
  v_bucket text := to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  for v_row in
    select
      s.app_name,
      count(*) filter (where l.level = 'fault')::int as faults,
      count(*) filter (where l.level = 'error')::int as errors,
      count(*) filter (where l.level = 'warning')::int as warnings
    from public.kenos_app_logs l
    join public.kenos_app_log_sessions s on s.id = l.session_id
    where l.user_id = v_user_id
      and l.logged_at >= v_since
      and l.level in ('warning', 'error', 'fault')
    group by s.app_name
  loop
    if v_row.faults >= 1 then
      v_fingerprint := 'fault_spike:' || v_row.app_name || ':' || v_bucket;
      insert into public.kenos_app_log_alerts (
        user_id, kind, severity, app_name, title, detail,
        window_start, window_end, fingerprint
      ) values (
        v_user_id,
        'fault_spike',
        'critical',
        v_row.app_name,
        format('%s: %s fault log(s) in %s min', v_row.app_name, v_row.faults, v_minutes),
        jsonb_build_object(
          'faults', v_row.faults,
          'errors', v_row.errors,
          'warnings', v_row.warnings,
          'windowMinutes', v_minutes
        ),
        v_since,
        now(),
        v_fingerprint
      )
      on conflict (user_id, fingerprint) do nothing;
      get diagnostics v_rowcount = row_count;
      v_created := v_created + v_rowcount;
    end if;

    if v_row.errors >= 5 then
      v_fingerprint := 'error_burst:' || v_row.app_name || ':' || v_bucket;
      insert into public.kenos_app_log_alerts (
        user_id, kind, severity, app_name, title, detail,
        window_start, window_end, fingerprint
      ) values (
        v_user_id,
        'error_burst',
        'warning',
        v_row.app_name,
        format('%s: %s error log(s) in %s min', v_row.app_name, v_row.errors, v_minutes),
        jsonb_build_object(
          'errors', v_row.errors,
          'warnings', v_row.warnings,
          'windowMinutes', v_minutes
        ),
        v_since,
        now(),
        v_fingerprint
      )
      on conflict (user_id, fingerprint) do nothing;
      get diagnostics v_rowcount = row_count;
      v_created := v_created + v_rowcount;
    end if;

    if v_row.warnings >= 20 then
      v_fingerprint := 'warning_burst:' || v_row.app_name || ':' || v_bucket;
      insert into public.kenos_app_log_alerts (
        user_id, kind, severity, app_name, title, detail,
        window_start, window_end, fingerprint
      ) values (
        v_user_id,
        'warning_burst',
        'warning',
        v_row.app_name,
        format('%s: %s warning log(s) in %s min', v_row.app_name, v_row.warnings, v_minutes),
        jsonb_build_object(
          'warnings', v_row.warnings,
          'windowMinutes', v_minutes
        ),
        v_since,
        now(),
        v_fingerprint
      )
      on conflict (user_id, fingerprint) do nothing;
      get diagnostics v_rowcount = row_count;
      v_created := v_created + v_rowcount;
    end if;
  end loop;

  -- Crash / MetricKit style bug_logs in the same window
  for v_row in
    select b.app, count(*)::int as crash_bugs
    from public.bug_logs b
    where b.user_id = v_user_id
      and b.created_at >= v_since
      and (
        coalesce(b.severity, '') = 'high'
        or coalesce(b.notes, '') ilike '%metrickit%'
        or coalesce(b.title, '') ilike '%crash%'
      )
    group by b.app
  loop
    v_fingerprint := 'crash_bug:' || v_row.app || ':' || v_bucket;
    insert into public.kenos_app_log_alerts (
      user_id, kind, severity, app_name, title, detail,
      window_start, window_end, fingerprint
    ) values (
      v_user_id,
      'crash_bug',
      'critical',
      v_row.app,
      format('%s: %s crash/bug report(s) in %s min', v_row.app, v_row.crash_bugs, v_minutes),
      jsonb_build_object('crashBugs', v_row.crash_bugs, 'windowMinutes', v_minutes),
      v_since,
      now(),
      v_fingerprint
    )
    on conflict (user_id, fingerprint) do nothing;
    get diagnostics v_rowcount = row_count;
    v_created := v_created + v_rowcount;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'windowMinutes', v_minutes,
    'openAlerts', (
      select count(*)::int
      from public.kenos_app_log_alerts a
      where a.user_id = v_user_id and a.status = 'open'
    )
  );
end;
$$;

revoke all on function public.kenos_scan_app_log_alerts(integer) from public, anon;
grant execute on function public.kenos_scan_app_log_alerts(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Service-role / ops scan across all users (cron / supabase-sql.sh)
-- ---------------------------------------------------------------------------
create or replace function public.kenos_scan_app_log_alerts_all(
  p_window_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes integer := greatest(5, least(coalesce(p_window_minutes, 30), 180));
  v_since timestamptz := now() - make_interval(mins => v_minutes);
  v_bucket text := to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');
  v_created int := 0;
  v_rowcount int;
  v_users int := 0;
begin
  -- Block end-user JWT. Allow service_role PostgREST + Management API / SQL console
  -- (where auth.role() is null / not authenticated).
  if coalesce(auth.role(), '') = 'authenticated' then
    raise exception 'ops/service_role required' using errcode = '42501';
  end if;

  select count(distinct l.user_id)::int into v_users
  from public.kenos_app_logs l
  where l.logged_at >= v_since
    and l.level in ('warning', 'error', 'fault');

  insert into public.kenos_app_log_alerts (
    user_id, kind, severity, app_name, title, detail,
    window_start, window_end, fingerprint
  )
  select
    c.user_id,
    x.kind,
    x.severity,
    c.app_name,
    x.title,
    x.detail,
    v_since,
    now(),
    x.fingerprint
  from (
    select
      l.user_id,
      s.app_name,
      count(*) filter (where l.level = 'fault')::int as faults,
      count(*) filter (where l.level = 'error')::int as errors,
      count(*) filter (where l.level = 'warning')::int as warnings
    from public.kenos_app_logs l
    join public.kenos_app_log_sessions s on s.id = l.session_id
    where l.logged_at >= v_since
      and l.level in ('warning', 'error', 'fault')
    group by l.user_id, s.app_name
  ) c
  cross join lateral (
    select v.kind, v.severity, v.title, v.detail, v.fingerprint
    from (
      values
        (
          case when c.faults >= 1 then 'fault_spike' else null end,
          case when c.faults >= 1 then 'critical' else null end,
          case when c.faults >= 1 then format('%s: %s fault log(s) in %s min', c.app_name, c.faults, v_minutes) else null end,
          case when c.faults >= 1 then jsonb_build_object('faults', c.faults, 'errors', c.errors, 'warnings', c.warnings, 'windowMinutes', v_minutes) else null end,
          case when c.faults >= 1 then 'fault_spike:' || c.app_name || ':' || v_bucket else null end
        ),
        (
          case when c.errors >= 5 then 'error_burst' else null end,
          case when c.errors >= 5 then 'warning' else null end,
          case when c.errors >= 5 then format('%s: %s error log(s) in %s min', c.app_name, c.errors, v_minutes) else null end,
          case when c.errors >= 5 then jsonb_build_object('errors', c.errors, 'warnings', c.warnings, 'windowMinutes', v_minutes) else null end,
          case when c.errors >= 5 then 'error_burst:' || c.app_name || ':' || v_bucket else null end
        ),
        (
          case when c.warnings >= 20 then 'warning_burst' else null end,
          case when c.warnings >= 20 then 'warning' else null end,
          case when c.warnings >= 20 then format('%s: %s warning log(s) in %s min', c.app_name, c.warnings, v_minutes) else null end,
          case when c.warnings >= 20 then jsonb_build_object('warnings', c.warnings, 'windowMinutes', v_minutes) else null end,
          case when c.warnings >= 20 then 'warning_burst:' || c.app_name || ':' || v_bucket else null end
        )
    ) as v(kind, severity, title, detail, fingerprint)
    where v.kind is not null
  ) x
  on conflict (user_id, fingerprint) do nothing;
  get diagnostics v_rowcount = row_count;
  v_created := v_created + v_rowcount;

  insert into public.kenos_app_log_alerts (
    user_id, kind, severity, app_name, title, detail,
    window_start, window_end, fingerprint
  )
  select
    b.user_id,
    'crash_bug',
    'critical',
    b.app,
    format('%s: %s crash/bug report(s) in %s min', b.app, b.crash_bugs, v_minutes),
    jsonb_build_object('crashBugs', b.crash_bugs, 'windowMinutes', v_minutes),
    v_since,
    now(),
    'crash_bug:' || b.app || ':' || v_bucket
  from (
    select
      bl.user_id,
      bl.app,
      count(*)::int as crash_bugs
    from public.bug_logs bl
    where bl.created_at >= v_since
      and (
        coalesce(bl.severity, '') = 'high'
        or coalesce(bl.notes, '') ilike '%metrickit%'
        or coalesce(bl.title, '') ilike '%crash%'
      )
    group by bl.user_id, bl.app
  ) b
  on conflict (user_id, fingerprint) do nothing;
  get diagnostics v_rowcount = row_count;
  v_created := v_created + v_rowcount;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'usersScanned', coalesce(v_users, 0),
    'windowMinutes', v_minutes,
    'openAlerts', (
      select count(*)::int from public.kenos_app_log_alerts where status = 'open'
    )
  );
end;
$$;

revoke all on function public.kenos_scan_app_log_alerts_all(integer) from public, anon, authenticated;
grant execute on function public.kenos_scan_app_log_alerts_all(integer) to service_role;

comment on table public.kenos_app_log_alerts is
  'Deduped runtime log alerts (fault spike / error burst / crash bugs).';
comment on function public.kenos_app_log_summary(integer) is
  'Owner-scoped app log analysis for the last N hours (max 168).';
comment on function public.kenos_scan_app_log_alerts(integer) is
  'Scan current user logs and upsert open alerts.';
comment on function public.kenos_scan_app_log_alerts_all(integer) is
  'Ops/cron: scan all users with recent severity logs (service_role).';
