-- Review-only production privilege proposal. Never auto-applied.
-- A production migration must receive database-owner and security review first.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kenos_outbox_worker') then
    create role kenos_outbox_worker nologin noinherit nobypassrls;
  end if;
end;
$$;

revoke all on public.kenos_plan_action_idempotency from kenos_outbox_worker;
revoke all on public.kenos_plan_activity from kenos_outbox_worker;
revoke all on public.kenos_plan_outbox from kenos_outbox_worker;
revoke all on public.planner_tasks from kenos_outbox_worker;

create or replace function private.kenos_transition_plan_outbox(
  outbox_id uuid,
  expected_status text,
  next_status text,
  error_class text default null,
  visible_reason text default null,
  next_available_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.kenos_plan_outbox%rowtype;
  v_allowed boolean := false;
begin
  if expected_status not in ('pending', 'processing', 'retry') then
    raise exception 'outbox_expected_status_not_mutable';
  end if;
  if next_status not in ('processing', 'published', 'retry', 'dead_letter') then
    raise exception 'outbox_status_not_supported';
  end if;
  v_allowed := case expected_status
    when 'pending' then next_status in ('processing', 'dead_letter')
    when 'processing' then next_status in ('published', 'retry', 'dead_letter')
    when 'retry' then next_status in ('processing', 'dead_letter')
    else false
  end;
  if not v_allowed then
    raise exception 'invalid_outbox_transition';
  end if;
  if next_status = 'dead_letter' and nullif(btrim(visible_reason), '') is null then
    raise exception 'terminal_reason_required';
  end if;
  if error_class is not null and error_class not in ('transient', 'permanent') then
    raise exception 'invalid_error_class';
  end if;

  update public.kenos_plan_outbox
  set status = next_status,
      attempts = attempts + case when next_status in ('retry', 'dead_letter') then 1 else 0 end,
      next_attempt_at = coalesce(next_available_at, next_attempt_at),
      last_error_class = case when next_status in ('retry', 'dead_letter') then error_class else null end,
      terminal_reason = case when next_status = 'dead_letter' then visible_reason else null end,
      updated_at = clock_timestamp()
  where id = outbox_id and status = expected_status
  returning * into v_record;

  if not found then
    raise exception 'outbox_compare_and_set_failed';
  end if;

  return jsonb_build_object(
    'id', v_record.id,
    'actionId', v_record.action_id,
    'actionType', v_record.action_type,
    'status', v_record.status,
    'attempts', v_record.attempts,
    'payload', v_record.payload,
    'correlationId', v_record.correlation_id
  );
end;
$$;

revoke all on schema private from public, anon, authenticated, kenos_outbox_worker;
grant usage on schema private to kenos_outbox_worker;
revoke all on function private.kenos_transition_plan_outbox(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role, kenos_outbox_worker;
grant execute on function private.kenos_transition_plan_outbox(uuid, text, text, text, text, timestamptz)
  to kenos_outbox_worker;

-- Explicitly restate client posture after the worker grant package.
revoke all on public.kenos_plan_action_idempotency from public, anon, authenticated;
revoke insert, update, delete on public.kenos_plan_activity from authenticated;
revoke insert, update, delete on public.kenos_plan_outbox from authenticated;
revoke all on function public.kenos_create_plan_task_action(jsonb) from public, anon;
grant execute on function public.kenos_create_plan_task_action(jsonb) to authenticated;
