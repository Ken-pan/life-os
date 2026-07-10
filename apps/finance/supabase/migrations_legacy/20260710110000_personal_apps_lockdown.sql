-- Phase 3: Personal Apps Lockdown

-- 1. Utility: user_has_app_access for non-auth contexts (like Paper device RPC)
create or replace function private.user_has_app_access(p_user_id uuid, requested_app_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = p_user_id
      and m.app_key = requested_app_key
      and m.status = 'active'
  );
$$;
grant execute on function private.user_has_app_access(uuid, text) to authenticated, service_role;

-- 2. Finance OS Lockdown
do $$
declare t text;
begin
  foreach t in array array['user_settings','accounts','holdings_snapshots','holding_positions','holding_price_trails','holding_daily_candles','cash_flows','scenarios','scenario_events','goals','transactions','scenario_snapshots','decision_records','scenario_apply_audits']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', 'finance_' || t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id and private.has_app_access(''finance''))', t || '_select', 'finance_' || t);
    
    execute format('drop policy if exists %I on public.%I', t || '_insert', 'finance_' || t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id and private.has_app_access(''finance''))', t || '_insert', 'finance_' || t);
    
    execute format('drop policy if exists %I on public.%I', t || '_update', 'finance_' || t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id and private.has_app_access(''finance'')) with check ((select auth.uid()) = user_id and private.has_app_access(''finance''))', t || '_update', 'finance_' || t);
    
    execute format('drop policy if exists %I on public.%I', t || '_delete', 'finance_' || t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id and private.has_app_access(''finance''))', t || '_delete', 'finance_' || t);
  end loop;
end $$;

drop policy if exists "own finance_data select" on public.finance_data;
drop policy if exists "finance_data_select" on public.finance_data;
create policy "finance_data_select" on public.finance_data for select using ((select auth.uid()) = user_id and private.has_app_access('finance'));

drop policy if exists "own finance_data insert" on public.finance_data;
drop policy if exists "finance_data_insert" on public.finance_data;
create policy "finance_data_insert" on public.finance_data for insert with check ((select auth.uid()) = user_id and private.has_app_access('finance'));

drop policy if exists "own finance_data update" on public.finance_data;
drop policy if exists "finance_data_update" on public.finance_data;
create policy "finance_data_update" on public.finance_data for update using ((select auth.uid()) = user_id and private.has_app_access('finance')) with check ((select auth.uid()) = user_id and private.has_app_access('finance'));

drop policy if exists "own finance_data delete" on public.finance_data;
drop policy if exists "finance_data_delete" on public.finance_data;
create policy "finance_data_delete" on public.finance_data for delete using ((select auth.uid()) = user_id and private.has_app_access('finance'));

-- 3. Planner OS Lockdown
do $$
declare t text;
begin
  foreach t in array array['planner_tasks', 'planner_lists', 'planner_projects', 'planner_user_state', 'planner_push_subscriptions', 'planner_reminder_push_log']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id and private.has_app_access(''planner''))', t || '_select_own', t);
    
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id and private.has_app_access(''planner''))', t || '_insert_own', t);
    
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id and private.has_app_access(''planner'')) with check ((select auth.uid()) = user_id and private.has_app_access(''planner''))', t || '_update_own', t);
    
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id and private.has_app_access(''planner''))', t || '_delete_own', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_device_actions') then
    execute 'drop policy if exists paper_device_actions_user_read on public.paper_device_actions';
    execute 'create policy paper_device_actions_user_read on public.paper_device_actions for select using ((select auth.uid()) = user_id and private.has_app_access(''planner''))';
  end if;
end $$;

-- Paper Device RPC Lockdown
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
    or p_user_id <> expected_user_id 
    or not private.user_has_app_access(p_user_id, 'paper') then
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

-- 4. Music OS Lockdown
do $$
declare t text;
begin
  foreach t in array array['track_tags', 'track_audio_features', 'track_embeddings', 'play_events', 'tag_review_queue', 'recommendation_events', 'music_user_state', 'music_track_meta', 'music_playlists', 'music_playlist_tracks']
  loop
    execute format('drop policy if exists %I on music.%I', t || '_select_own', t);
    execute format('create policy %I on music.%I for select using ((select auth.uid()) = user_id and private.has_app_access(''music''))', t || '_select_own', t);
    
    execute format('drop policy if exists %I on music.%I', t || '_insert_own', t);
    execute format('create policy %I on music.%I for insert with check ((select auth.uid()) = user_id and private.has_app_access(''music''))', t || '_insert_own', t);
    
    execute format('drop policy if exists %I on music.%I', t || '_update_own', t);
    execute format('create policy %I on music.%I for update using ((select auth.uid()) = user_id and private.has_app_access(''music'')) with check ((select auth.uid()) = user_id and private.has_app_access(''music''))', t || '_update_own', t);
    
    execute format('drop policy if exists %I on music.%I', t || '_delete_own', t);
    execute format('create policy %I on music.%I for delete using ((select auth.uid()) = user_id and private.has_app_access(''music''))', t || '_delete_own', t);
  end loop;
end $$;

drop policy if exists music_profiles_select_own on music.music_profiles;
create policy music_profiles_select_own on music.music_profiles for select using ((select auth.uid()) = id and private.has_app_access('music'));

drop policy if exists music_profiles_insert_own on music.music_profiles;
create policy music_profiles_insert_own on music.music_profiles for insert with check ((select auth.uid()) = id and private.has_app_access('music'));

drop policy if exists music_profiles_update_own on music.music_profiles;
create policy music_profiles_update_own on music.music_profiles for update using ((select auth.uid()) = id and private.has_app_access('music')) with check ((select auth.uid()) = id and private.has_app_access('music'));

-- 5. Core Settings and Bug Logs
drop policy if exists "core_user_app_settings_select_own" on public.core_user_app_settings;
create policy "core_user_app_settings_select_own" on public.core_user_app_settings for select using ((select auth.uid()) = user_id and private.has_app_access(app_id));

drop policy if exists "core_user_app_settings_insert_own" on public.core_user_app_settings;
create policy "core_user_app_settings_insert_own" on public.core_user_app_settings for insert with check ((select auth.uid()) = user_id and private.has_app_access(app_id));

drop policy if exists "core_user_app_settings_update_own" on public.core_user_app_settings;
create policy "core_user_app_settings_update_own" on public.core_user_app_settings for update using ((select auth.uid()) = user_id and private.has_app_access(app_id)) with check ((select auth.uid()) = user_id and private.has_app_access(app_id));

drop policy if exists bug_logs_select_own on public.bug_logs;
create policy bug_logs_select_own on public.bug_logs for select using ((select auth.uid()) = user_id and private.has_app_access(app));

drop policy if exists bug_logs_insert_own on public.bug_logs;
create policy bug_logs_insert_own on public.bug_logs for insert with check ((select auth.uid()) = user_id and private.has_app_access(app));

drop policy if exists bug_logs_update_own on public.bug_logs;
create policy bug_logs_update_own on public.bug_logs for update using ((select auth.uid()) = user_id and private.has_app_access(app)) with check ((select auth.uid()) = user_id and private.has_app_access(app));

drop policy if exists bug_logs_delete_own on public.bug_logs;
create policy bug_logs_delete_own on public.bug_logs for delete using ((select auth.uid()) = user_id and private.has_app_access(app));
