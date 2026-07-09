-- G-P4b-M: Portal today summary — Music card (recent play_events).

create or replace function public.portal_today_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, fitness, music
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('America/Los_Angeles', now()))::date;
  v_today_key text := to_char(v_today, 'YYYY-MM-DD');
  v_month_start date := date_trunc('month', v_today)::date;
  v_planner_today int := 0;
  v_planner_overdue int := 0;
  v_fin_income numeric := 0;
  v_fin_expense numeric := 0;
  v_fit_date date;
  v_fit_day text;
  v_music_title text;
  v_music_artist text;
  v_music_played_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false);
  end if;

  select
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
        and (data->>'dueDate') = v_today_key
    ),
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
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
  into v_fit_date, v_fit_day
  from fitness.fitness_workout_sessions s
  where s.user_id = v_uid
    and s.ended_at is not null
  order by s.session_date desc, s.ended_at desc
  limit 1;

  select m.title, m.artist, pe.created_at
  into v_music_title, v_music_artist, v_music_played_at
  from music.play_events pe
  join music.music_track_meta m
    on m.user_id = pe.user_id
   and m.track_id = pe.track_id
  where pe.user_id = v_uid
  order by pe.created_at desc
  limit 1;

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
    'fitness', case
      when v_fit_date is null then null
      else jsonb_build_object(
        'sessionDate', v_fit_date,
        'dayId', v_fit_day
      )
    end,
    'music', case
      when v_music_title is null then null
      else jsonb_build_object(
        'trackTitle', v_music_title,
        'trackArtist', coalesce(v_music_artist, ''),
        'playedAt', v_music_played_at
      )
    end
  );
end;
$$;

revoke all on function public.portal_today_summary() from public;
grant execute on function public.portal_today_summary() to authenticated;
