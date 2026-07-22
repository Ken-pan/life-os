-- Kenos Productivity Spine — Phase A: outbox canary worker delivery surface.
-- Adds the missing delivery half of the Kenos command loop:
--   * service-role-only worker RPCs (claim / deliver / fail / requeue / metrics)
--   * idempotent projection into public.life_events (unique outbox_id dedupe)
--   * approvals parameter binding (normalized_parameters_hash)
--   * measurable iOS crash-free session rate (session-level dedupe + taxonomy)
-- Historical rows (created_at < worker epoch) are quarantined by epoch filter:
-- the worker never claims them. See docs/productivity/OUTBOX_SEMANTICS.md.
-- Retry-safe / additive. No existing row is mutated by this migration.

set lock_timeout = '5s';
set statement_timeout = '30s';

-- 1) Approval ↔ execution parameter binding ---------------------------------
alter table public.kenos_action_approvals
  add column if not exists normalized_parameters_hash text;

comment on column public.kenos_action_approvals.normalized_parameters_hash is
  'sha256 hex of canonical (sorted-key) JSON of the action parameters at request time. Executors must recompute and refuse on mismatch; a parameter change invalidates the approval.';

-- 2) Idempotent delivery target: life_events dedupe on outbox_id ------------
create unique index if not exists life_events_kenos_outbox_dedupe
  on public.life_events (user_id, ((payload ->> 'outbox_id')))
  where (payload ? 'outbox_id');

-- 3) Worker RPCs (service_role only; clients keep read-only posture) --------

-- Claim a batch with lease semantics. While status='processing',
-- next_attempt_at doubles as the lease deadline; stale processing rows
-- (lease expired) are reclaimable. Historical rows are excluded by p_epoch.
create or replace function public.kenos_outbox_worker_claim(
  p_epoch timestamptz,
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.kenos_plan_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_epoch is null then
    raise exception 'epoch_required';
  end if;
  return query
  with claimable as (
    select o.id
    from public.kenos_plan_outbox o
    where o.created_at >= p_epoch
      and (
        (o.status in ('pending', 'retry') and o.next_attempt_at <= clock_timestamp())
        or (o.status = 'processing' and o.next_attempt_at <= clock_timestamp())
      )
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  )
  update public.kenos_plan_outbox o
  set status = 'processing',
      next_attempt_at = clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 300), 30), 3600)),
      updated_at = clock_timestamp()
  from claimable c
  where o.id = c.id
  returning o.*;
end;
$$;

-- Deliver one claimed message: idempotently project onto life_events and
-- mark published. The insert + transition happen in one transaction.
create or replace function public.kenos_outbox_worker_deliver(
  p_outbox_id uuid,
  p_event_type text,
  p_event_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kenos_plan_outbox%rowtype;
  v_event_id uuid;
  v_payload jsonb;
begin
  select * into v_row from public.kenos_plan_outbox where id = p_outbox_id for update;
  if not found then
    raise exception 'outbox_row_not_found';
  end if;
  if v_row.status <> 'processing' then
    raise exception 'outbox_not_claimed';
  end if;
  if nullif(btrim(p_event_type), '') is null
     or p_event_type !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then
    raise exception 'invalid_event_type';
  end if;
  if jsonb_typeof(p_event_payload) <> 'object' then
    raise exception 'invalid_event_payload';
  end if;

  v_payload := p_event_payload || jsonb_build_object(
    'outbox_id', v_row.id::text,
    'action_type', v_row.action_type,
    'correlation_id', v_row.correlation_id,
    'entity_ref', v_row.entity_ref
  );

  insert into public.life_events (user_id, type, payload, status)
  values (v_row.user_id, p_event_type, v_payload, 'processed')
  on conflict (user_id, ((payload ->> 'outbox_id'))) where (payload ? 'outbox_id')
  do nothing
  returning id into v_event_id;

  perform private.kenos_transition_plan_outbox(v_row.id, 'processing', 'published', null, null, null);

  return jsonb_build_object(
    'ok', true,
    'outboxId', v_row.id,
    'eventId', v_event_id,
    'duplicate', v_event_id is null,
    'correlationId', v_row.correlation_id
  );
end;
$$;

-- Record a failed attempt: retry with backoff until max_attempts, then dead-letter.
create or replace function public.kenos_outbox_worker_fail(
  p_outbox_id uuid,
  p_error_class text,
  p_reason text,
  p_next_attempt_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kenos_plan_outbox%rowtype;
begin
  select * into v_row from public.kenos_plan_outbox where id = p_outbox_id for update;
  if not found then
    raise exception 'outbox_row_not_found';
  end if;
  if v_row.status <> 'processing' then
    raise exception 'outbox_not_claimed';
  end if;
  if p_error_class = 'permanent' or v_row.attempts + 1 >= v_row.max_attempts then
    return private.kenos_transition_plan_outbox(
      v_row.id, 'processing', 'dead_letter', coalesce(p_error_class, 'transient'),
      coalesce(nullif(btrim(p_reason), ''), 'max attempts exhausted'), null);
  end if;
  return private.kenos_transition_plan_outbox(
    v_row.id, 'processing', 'retry', coalesce(p_error_class, 'transient'),
    null, coalesce(p_next_attempt_at, clock_timestamp() + interval '30 seconds'));
end;
$$;

-- Manual requeue of a dead-lettered message (operator action).
create or replace function public.kenos_outbox_worker_requeue(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kenos_plan_outbox%rowtype;
begin
  update public.kenos_plan_outbox
  set status = 'pending',
      next_attempt_at = clock_timestamp(),
      terminal_reason = null,
      last_error_class = null,
      updated_at = clock_timestamp()
  where id = p_outbox_id and status = 'dead_letter'
  returning * into v_row;
  if not found then
    raise exception 'outbox_requeue_requires_dead_letter';
  end if;
  return jsonb_build_object('ok', true, 'outboxId', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts);
end;
$$;

-- Queue metrics, split at the quarantine epoch.
create or replace function public.kenos_outbox_worker_metrics(p_epoch timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'asOf', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'epoch', to_char(p_epoch at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'new', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (select status, count(*) n from public.kenos_plan_outbox where created_at >= p_epoch group by status) s
    ),
    'historicalQuarantined', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (select status, count(*) n from public.kenos_plan_outbox where created_at < p_epoch group by status) s
    ),
    'oldestNewPendingAgeSeconds', (
      select floor(extract(epoch from (clock_timestamp() - min(next_attempt_at))))
      from public.kenos_plan_outbox
      where created_at >= p_epoch and status in ('pending', 'retry')
    )
  );
$$;

revoke all on function public.kenos_outbox_worker_claim(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.kenos_outbox_worker_deliver(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.kenos_outbox_worker_fail(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.kenos_outbox_worker_requeue(uuid) from public, anon, authenticated;
revoke all on function public.kenos_outbox_worker_metrics(timestamptz) from public, anon, authenticated;
grant execute on function public.kenos_outbox_worker_claim(timestamptz, integer, integer) to service_role;
grant execute on function public.kenos_outbox_worker_deliver(uuid, text, jsonb) to service_role;
grant execute on function public.kenos_outbox_worker_fail(uuid, text, text, timestamptz) to service_role;
grant execute on function public.kenos_outbox_worker_requeue(uuid) to service_role;
grant execute on function public.kenos_outbox_worker_metrics(timestamptz) to service_role;

-- 4) iOS telemetry: measurable crash-free session rate ----------------------
-- Session-level dedupe (a session counts once no matter how many events) and
-- taxonomy split: 'crash' = real crash; 'unclean_exit' = lifecycle kill
-- (jetsam/swipe), reported separately and NOT counted against crash-free.
create or replace view public.kenos_crash_free_daily
with (security_invoker = true)
as
select
  s.user_id,
  (s.started_at at time zone 'UTC')::date as day,
  count(distinct s.id) as sessions,
  count(distinct ce.session_id) filter (where ce.kind = 'crash') as crashed_sessions,
  count(distinct ce.session_id) filter (where ce.kind = 'unclean_exit') as unclean_exit_sessions,
  round(
    100.0 * (count(distinct s.id) - count(distinct ce.session_id) filter (where ce.kind = 'crash'))
      / nullif(count(distinct s.id), 0), 2
  ) as crash_free_pct
from public.kenos_app_log_sessions s
left join public.kenos_crash_events ce on ce.session_id = s.id
group by s.user_id, (s.started_at at time zone 'UTC')::date;

grant select on public.kenos_crash_free_daily to authenticated;
