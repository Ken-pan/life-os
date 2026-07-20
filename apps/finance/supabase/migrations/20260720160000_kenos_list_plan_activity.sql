-- Kenos Track D: authenticated Activity list (read). Append remains Writer-owned.
-- Prerequisites: tip >= 20260720150000.

create or replace function public.kenos_list_plan_activity(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,
  schema_version text,
  user_id uuid,
  action_id text,
  action_type text,
  correlation_id text,
  actor_type text,
  source_domain text,
  policy jsonb,
  entity_ref jsonb,
  summary text,
  result text,
  redacted_payload jsonb,
  undo jsonb,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    activity.id,
    activity.schema_version,
    activity.user_id,
    activity.action_id,
    activity.action_type,
    activity.correlation_id,
    activity.actor_type,
    activity.source_domain,
    activity.policy,
    activity.entity_ref,
    activity.summary,
    activity.result,
    activity.redacted_payload,
    activity.undo,
    activity.created_at
  from public.kenos_plan_activity activity
  where activity.user_id = (select auth.uid())
    and (p_before is null or activity.created_at < p_before)
  order by activity.created_at desc, activity.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.kenos_list_plan_activity(integer, timestamptz) from public, anon;
grant execute on function public.kenos_list_plan_activity(integer, timestamptz) to authenticated;
