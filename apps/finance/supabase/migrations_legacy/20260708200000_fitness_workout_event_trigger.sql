-- INTG.EVENTS.1b / GYMS.EVENTS.1: Fitness 完练 → life_events (fitness.workout_logged)

begin;

create or replace function public.trg_fitness_workout_to_event()
returns trigger
language plpgsql
security definer
set search_path = public, fitness
as $$
begin
  if NEW.ended_at is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and OLD.ended_at is not distinct from NEW.ended_at then
    return NEW;
  end if;

  if exists (
    select 1
    from public.life_events e
    where e.user_id = NEW.user_id
      and e.type = 'fitness.workout_logged'
      and e.payload->>'session_id' = NEW.id::text
  ) then
    return NEW;
  end if;

  insert into public.life_events (
    user_id,
    type,
    payload
  ) values (
    NEW.user_id,
    'fitness.workout_logged',
    jsonb_build_object(
      'session_id', NEW.id,
      'day_id', NEW.day_id,
      'session_date', NEW.session_date,
      'ended_at', NEW.ended_at
    )
  );

  return NEW;
end;
$$;

drop trigger if exists fitness_workout_event_trigger on fitness.fitness_workout_sessions;
create trigger fitness_workout_event_trigger
  after insert or update of ended_at on fitness.fitness_workout_sessions
  for each row
  execute function public.trg_fitness_workout_to_event();

commit;
