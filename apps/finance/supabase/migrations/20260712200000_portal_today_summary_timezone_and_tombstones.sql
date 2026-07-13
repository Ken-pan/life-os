-- PLNR.CORE.4: Portal today summary timezone alignment and tombstone filtering.
-- Drops ambiguous function signatures and creates explicit authoritative overloads.

-- Drop any existing conflicting signatures explicitly to avoid PostgREST ambiguity
drop function if exists public.portal_today_summary();
drop function if exists public.portal_today_summary(text);

create or replace function public.portal_today_summary(p_timezone text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, fitness, music
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_today date;
  v_today_key text;
  v_month_start date;
  v_planner_today int := 0;
  v_planner_overdue int := 0;
  v_fin_income numeric := 0;
  v_fin_expense numeric := 0;
  v_fit_last_date date;
  v_fit_last_day text;
  v_fit_today_day text;
  v_fit_today_completed boolean := false;
  v_fit_worked_out_today boolean := false;
  v_music_title text;
  v_music_artist text;
  v_music_played_at timestamptz;
  v_home_zone_count int;
  v_home_reported_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false);
  end if;

  -- 1. Try explicit parameter
  v_tz := p_timezone;
  
  -- 2. Fallback to user profile timezone if invalid or null
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    select timezone into v_tz from public.core_profiles where id = v_uid;
  end if;

  -- 3. Ultimate safe fallback
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'America/Los_Angeles';
  end if;

  v_today := (timezone(v_tz, now()))::date;
  v_today_key := to_char(v_today, 'YYYY-MM-DD');
  v_month_start := date_trunc('month', v_today)::date;

  select
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
        and (data->>'deletedAt') is null
        and (data->>'dueDate') = v_today_key
    ),
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
        and (data->>'deletedAt') is null
        and (data->>'dueDate') is not null
        and (data->>'dueDate') < v_today_key
    )
  into v_planner_today, v_planner_overdue
  from public.planner_tasks
  where user_id = v_uid;

  select
    coalesce(sum(case when flow = 'income' then abs(amount) else 0 end), 0),
    coalesce(
      sum(
        case
          when flow = 'expense'
            then abs(coalesce(nullif(budget_impact, 0), amount))
          else 0
        end
      ),
      0
    )
  into v_fin_income, v_fin_expense
  from public.finance_transactions
  where user_id = v_uid
    and txn_date >= v_month_start
    and txn_date <= v_today;

  select s.session_date, s.day_id
  into v_fit_last_date, v_fit_last_day
  from fitness.fitness_workout_sessions s
  where s.user_id = v_uid
    and s.ended_at is not null
    and exists (
      select 1
      from fitness.fitness_exercise_logs l
      where l.session_id = s.id
        and l.done > 0
    )
  order by s.session_date desc, s.ended_at desc
  limit 1;

  select s.day_id, (s.ended_at is not null)
  into v_fit_today_day, v_fit_today_completed
  from fitness.fitness_workout_sessions s
  where s.user_id = v_uid
    and s.session_date = v_today
    and exists (
      select 1
      from fitness.fitness_exercise_logs l
      where l.session_id = s.id
        and l.done > 0
    )
  order by coalesce(s.ended_at, s.started_at, s.created_at) desc,
           s.created_at desc
  limit 1;

  v_fit_worked_out_today := v_fit_today_day is not null;

  select m.title, m.artist, pe.created_at
  into v_music_title, v_music_artist, v_music_played_at
  from music.play_events pe
  join music.music_track_meta m
    on m.user_id = pe.user_id
   and m.track_id = pe.track_id
  where pe.user_id = v_uid
  order by pe.created_at desc
  limit 1;

  select
    (s.settings->'portal_summary'->>'storage_zone_count')::int,
    (s.settings->'portal_summary'->>'reported_at')::timestamptz
  into v_home_zone_count, v_home_reported_at
  from public.core_user_app_settings s
  where s.user_id = v_uid
    and s.app_id = 'home'
    and s.settings ? 'portal_summary';

  return jsonb_build_object(
    'ok', true,
    'asOf', v_today_key,
    'planner', jsonb_build_object(
      'todayOpen', v_planner_today,
      'overdue', v_planner_overdue
    ),
    'finance', jsonb_build_object(
      'monthSurplus', round(v_fin_income - v_fin_expense, 2),
      'monthIncome', round(v_fin_income, 2),
      'monthExpense', round(v_fin_expense, 2)
    ),
    'fitness', jsonb_build_object(
      'workedOutToday', v_fit_worked_out_today,
      'todayCompleted', v_fit_worked_out_today and v_fit_today_completed,
      'todayDayId', v_fit_today_day,
      'lastSessionDate', v_fit_last_date,
      'lastDayId', v_fit_last_day,
      'sessionDate', v_fit_last_date,
      'dayId', v_fit_last_day
    ),
    'music', case
      when v_music_title is null then null
      else jsonb_build_object(
        'trackTitle', v_music_title,
        'trackArtist', coalesce(v_music_artist, ''),
        'playedAt', v_music_played_at
      )
    end,
    'home', case
      when v_home_reported_at is null then null
      else jsonb_build_object(
        'storageZoneCount', coalesce(v_home_zone_count, 0),
        'reportedAt', v_home_reported_at
      )
    end
  );
end;
$$;

revoke all on function public.portal_today_summary(text) from public;
grant execute on function public.portal_today_summary(text) to authenticated;

-- Compatibility Wrapper
create or replace function public.portal_today_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, fitness, music
as $$
  select public.portal_today_summary(null::text);
$$;

revoke all on function public.portal_today_summary() from public;
grant execute on function public.portal_today_summary() to authenticated;

notify pgrst, 'reload schema';
