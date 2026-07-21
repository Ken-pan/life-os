-- Kenos native runtime logs (iOS/macOS dogfood telemetry) + bug_logs kenos support.
-- Prerequisites: tip >= 20260720230000.

-- ---------------------------------------------------------------------------
-- 1) bug_logs: allow Kenos shell app id + access via portal membership
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
        'kenos'::text
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
      or (app = 'kenos' and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_insert_own on public.bug_logs;
create policy bug_logs_insert_own
  on public.bug_logs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = 'kenos' and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_update_own on public.bug_logs;
create policy bug_logs_update_own
  on public.bug_logs for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = 'kenos' and private.has_app_access('portal'))
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = 'kenos' and private.has_app_access('portal'))
    )
  );

drop policy if exists bug_logs_delete_own on public.bug_logs;
create policy bug_logs_delete_own
  on public.bug_logs for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      private.has_app_access(app)
      or (app = 'kenos' and private.has_app_access('portal'))
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Sessions + events
-- ---------------------------------------------------------------------------
create table if not exists public.kenos_app_log_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  app_name text not null default 'Kenos',
  app_version text,
  build text,
  device_model text,
  system_version text,
  locale text,
  started_at timestamptz not null,
  last_event_at timestamptz,
  event_count integer not null default 0 check (event_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kenos_app_log_sessions_timestamps_check check (updated_at >= created_at)
);

create index if not exists kenos_app_log_sessions_user_started_idx
  on public.kenos_app_log_sessions (user_id, started_at desc);

create table if not exists public.kenos_app_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.kenos_app_log_sessions (id) on delete cascade,
  logged_at timestamptz not null,
  level text not null check (
    level = any (
      array[
        'trace'::text,
        'debug'::text,
        'info'::text,
        'notice'::text,
        'warning'::text,
        'error'::text,
        'fault'::text
      ]
    )
  ),
  category text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  source_file text,
  source_function text,
  source_line integer,
  bug_id uuid references public.bug_logs (id) on delete set null,
  batch_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists kenos_app_logs_user_logged_idx
  on public.kenos_app_logs (user_id, logged_at desc, id desc);

create index if not exists kenos_app_logs_user_session_idx
  on public.kenos_app_logs (user_id, session_id, logged_at desc);

create index if not exists kenos_app_logs_user_level_idx
  on public.kenos_app_logs (user_id, level, logged_at desc)
  where level in ('warning', 'error', 'fault');

create index if not exists kenos_app_logs_bug_idx
  on public.kenos_app_logs (bug_id)
  where bug_id is not null;

alter table public.kenos_app_log_sessions enable row level security;
alter table public.kenos_app_logs enable row level security;

drop policy if exists kenos_app_log_sessions_select_own on public.kenos_app_log_sessions;
create policy kenos_app_log_sessions_select_own
  on public.kenos_app_log_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists kenos_app_log_sessions_insert_own on public.kenos_app_log_sessions;
create policy kenos_app_log_sessions_insert_own
  on public.kenos_app_log_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists kenos_app_log_sessions_update_own on public.kenos_app_log_sessions;
create policy kenos_app_log_sessions_update_own
  on public.kenos_app_log_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists kenos_app_logs_select_own on public.kenos_app_logs;
create policy kenos_app_logs_select_own
  on public.kenos_app_logs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists kenos_app_logs_insert_own on public.kenos_app_logs;
create policy kenos_app_logs_insert_own
  on public.kenos_app_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.kenos_app_log_sessions from public, anon, authenticated;
revoke all on public.kenos_app_logs from public, anon, authenticated;
grant select, insert, update on public.kenos_app_log_sessions to authenticated;
grant select, insert on public.kenos_app_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Batch ingest RPC (session upsert + event insert, idempotent on event id)
-- ---------------------------------------------------------------------------
create or replace function public.kenos_ingest_app_logs(
  p_session jsonb,
  p_events jsonb,
  p_bug_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_started_at timestamptz;
  v_event jsonb;
  v_event_id uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_batch_id uuid := gen_random_uuid();
  v_last_event_at timestamptz;
  v_max_events int := 200;
  v_rowcount int;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception 'p_session must be an object' using errcode = '22023';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) > v_max_events then
    raise exception 'p_events exceeds max %', v_max_events using errcode = '22023';
  end if;

  v_session_id := nullif(p_session ->> 'id', '')::uuid;
  if v_session_id is null then
    raise exception 'session.id required' using errcode = '22023';
  end if;

  v_started_at := coalesce(
    nullif(p_session ->> 'startedAt', '')::timestamptz,
    now()
  );

  insert into public.kenos_app_log_sessions as s (
    id,
    user_id,
    platform,
    app_name,
    app_version,
    build,
    device_model,
    system_version,
    locale,
    started_at,
    last_event_at,
    event_count,
    metadata
  ) values (
    v_session_id,
    v_user_id,
    coalesce(nullif(p_session ->> 'platform', ''), 'unknown'),
    coalesce(nullif(p_session ->> 'app', ''), 'Kenos'),
    nullif(p_session ->> 'appVersion', ''),
    nullif(p_session ->> 'build', ''),
    nullif(p_session ->> 'deviceModel', ''),
    nullif(p_session ->> 'systemVersion', ''),
    nullif(p_session ->> 'locale', ''),
    v_started_at,
    null,
    0,
    coalesce(p_session -> 'metadata', '{}'::jsonb)
  )
  on conflict (id) do update
    set
      platform = excluded.platform,
      app_name = excluded.app_name,
      app_version = excluded.app_version,
      build = excluded.build,
      device_model = excluded.device_model,
      system_version = excluded.system_version,
      locale = excluded.locale,
      metadata = s.metadata || excluded.metadata,
      updated_at = now()
  where s.user_id = v_user_id;

  if not exists (
    select 1 from public.kenos_app_log_sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    raise exception 'session not owned by caller' using errcode = '42501';
  end if;

  if p_bug_id is not null and not exists (
    select 1 from public.bug_logs b
    where b.id = p_bug_id and b.user_id = v_user_id
  ) then
    -- Soft-ignore unknown bug ids so log upload still succeeds.
    p_bug_id := null;
  end if;

  for v_event in
    select value from jsonb_array_elements(p_events)
  loop
    begin
      v_event_id := nullif(v_event ->> 'id', '')::uuid;
      if v_event_id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into public.kenos_app_logs (
        id,
        user_id,
        session_id,
        logged_at,
        level,
        category,
        message,
        metadata,
        source_file,
        source_function,
        source_line,
        bug_id,
        batch_id
      ) values (
        v_event_id,
        v_user_id,
        v_session_id,
        coalesce(nullif(v_event ->> 'loggedAt', '')::timestamptz, now()),
        coalesce(nullif(v_event ->> 'level', ''), 'info'),
        coalesce(nullif(v_event ->> 'category', ''), 'app'),
        left(coalesce(nullif(v_event ->> 'message', ''), '[empty]'), 2000),
        coalesce(v_event -> 'metadata', '{}'::jsonb),
        nullif(v_event ->> 'file', ''),
        nullif(v_event ->> 'function', ''),
        nullif(v_event ->> 'line', '')::integer,
        p_bug_id,
        v_batch_id
      )
      on conflict (id) do nothing;

      get diagnostics v_rowcount = row_count;
      if v_rowcount > 0 then
        v_inserted := v_inserted + 1;
        v_last_event_at := coalesce(
          nullif(v_event ->> 'loggedAt', '')::timestamptz,
          v_last_event_at,
          now()
        );
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  update public.kenos_app_log_sessions
  set
    event_count = event_count + v_inserted,
    last_event_at = coalesce(v_last_event_at, last_event_at, now()),
    updated_at = now()
  where id = v_session_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'batchId', v_batch_id,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'bugId', p_bug_id
  );
end;
$$;

revoke all on function public.kenos_ingest_app_logs(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.kenos_ingest_app_logs(jsonb, jsonb, uuid) to authenticated;

comment on table public.kenos_app_log_sessions is
  'Kenos native client sessions for dogfood / diagnostics telemetry.';
comment on table public.kenos_app_logs is
  'Kenos native runtime log events (redacted client-side before upload).';
comment on function public.kenos_ingest_app_logs(jsonb, jsonb, uuid) is
  'Batch upsert Kenos native log session + events for the authenticated user.';
