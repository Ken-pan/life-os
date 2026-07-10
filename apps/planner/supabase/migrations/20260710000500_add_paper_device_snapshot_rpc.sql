-- PaperOS read fallback for Netlify Functions without service-role env access.
--
-- Runtime setup must insert:
--   key='token_sha256' -> sha256(PAPER_DEVICE_TOKEN)
--   key='user_id'      -> PAPER_DEVICE_USER_ID
--
-- The RPC is still protected by the Paper bearer token. Netlify verifies the
-- same token before calling this function, and the function verifies its hash
-- before returning any Planner rows.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.paper_device_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.paper_device_config enable row level security;
revoke all on public.paper_device_config from anon, authenticated, public;

create or replace function public.paper_device_snapshot(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_token_hash text;
  expected_user_id uuid;
  state_payload jsonb;
  task_payload jsonb;
begin
  select value into expected_token_hash
  from public.paper_device_config
  where key = 'token_sha256';

  select value::uuid into expected_user_id
  from public.paper_device_config
  where key = 'user_id';

  if expected_token_hash is null
    or expected_user_id is null
    or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> expected_token_hash
    or p_user_id <> expected_user_id then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select payload into state_payload
  from public.planner_user_state
  where user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data) order by updated_at desc), '[]'::jsonb)
    into task_payload
  from public.planner_tasks
  where user_id = p_user_id;

  return jsonb_build_object(
    'state_payload', coalesce(state_payload, 'null'::jsonb),
    'tasks', task_payload
  );
end;
$$;

revoke all on function public.paper_device_snapshot(text, uuid) from public;
grant execute on function public.paper_device_snapshot(text, uuid) to anon, authenticated;
