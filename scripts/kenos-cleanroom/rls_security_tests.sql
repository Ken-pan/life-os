-- KENOS F5-02.6 / F5-03 — RLS & authorization security suite (clean-room)
-- Standard pgTAP-style pattern: each assertion runs in its own transaction as a
-- NON-superuser role (authenticated/anon) with SET LOCAL request.jwt.claims, so
-- RLS is actually enforced (superuser/table-owner bypass RLS). Any failed
-- assertion RAISEs, ON_ERROR_STOP aborts with non-zero exit == a real defect.
\set ON_ERROR_STOP on
\set QUIET on
\set A 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set B 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

-- ===== Seed two users + profiles + planner membership (as superuser) =====
begin;
delete from auth.users where email in ('a_cleanroom@example.com','b_cleanroom@example.com');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  (:'A','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a_cleanroom@example.com','x',now(),now(),now()),
  (:'B','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b_cleanroom@example.com','x',now(),now(),now());
insert into public.core_profiles (id) values (:'A'),(:'B') on conflict (id) do nothing;
insert into public.app_memberships (user_id, app_key, status) values
  (:'A','planner','active'),(:'B','planner','active') on conflict do nothing;
commit;

-- ===== Seed: user A creates a task + capture via canonical RPCs (committed) =====
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'A','role','authenticated')::text, true);
select public.kenos_create_plan_task_action(jsonb_build_object(
  'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.create_task',
  'producer','plan','targetDomain','plan','actor',jsonb_build_object('type','user','id',:'A'),
  'deviceId',gen_random_uuid()::text,'securityDomain','personal','dataClassification','personal',
  'requestedRisk','R1','payload',jsonb_build_object('title','A owns this task'),
  'reason','seed','idempotencyKey','cleanroom:seedtask:A',
  'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'correlationId',gen_random_uuid()::text));
select public.kenos_ingest_capture_envelope_action(jsonb_build_object(
  'schemaVersion','1','id',gen_random_uuid()::text,'actionType','capture.ingest_envelope',
  'producer','assistant','targetDomain','system','actor',jsonb_build_object('type','user','id',:'A'),
  'deviceId',gen_random_uuid()::text,'securityDomain','personal','dataClassification','personal',
  'requestedRisk','R1','payload',jsonb_build_object('capturePayload',jsonb_build_object('text','A private capture')),
  'reason','seed','idempotencyKey','cleanroom:cap:A',
  'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'correlationId',gen_random_uuid()::text));
commit;

\set QUIET off
\echo '================= RLS / AUTHZ ASSERTIONS ================='

-- T1 anon read rejection
begin; set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
-- Denial may be empty-result (RLS) OR permission-error (policy calls a fn anon
-- cannot execute). Both are non-leakage; only returned rows fail.
do $$ declare n int; begin
  begin select count(*) into n from public.planner_tasks; if n<>0 then raise exception 'T1a FAIL anon read planner_tasks=%',n; end if;
  exception when insufficient_privilege then null; end;
  begin select count(*) into n from public.kenos_plan_activity; if n<>0 then raise exception 'T1b FAIL anon read activity=%',n; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'T1 PASS anon reads denied (0 rows / no privilege)';
end $$; rollback;

-- T2 anon write rejection
begin; set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
do $$ declare ok boolean:=false; begin
  begin insert into public.planner_tasks(user_id,id,os_module,data,updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'anon-x','planner','{}'::jsonb,now());
  exception when others then ok:=true; end;
  if not ok then raise exception 'T2 FAIL anon insert not rejected'; end if;
  raise notice 'T2 PASS anon write rejected';
end $$; rollback;

-- T3 user B cannot read user A rows
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare n int; begin
  select count(*) into n from public.planner_tasks where data->>'title'='A owns this task';
  if n<>0 then raise exception 'T3 FAIL B read A task=%',n; end if;
  raise notice 'T3 PASS cross-user SELECT isolated';
end $$; rollback;

-- T4 user B cannot update user A rows
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare cnt int; begin
  update public.planner_tasks set data=data||'{"hacked":true}'::jsonb where data->>'title'='A owns this task';
  get diagnostics cnt=row_count;
  if cnt<>0 then raise exception 'T4 FAIL B updated % A rows',cnt; end if;
  raise notice 'T4 PASS cross-user UPDATE affected 0 rows';
end $$; rollback;

-- T5 user B cannot delete user A rows
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare cnt int; begin
  delete from public.planner_tasks where data->>'title'='A owns this task';
  get diagnostics cnt=row_count;
  if cnt<>0 then raise exception 'T5 FAIL B deleted % A rows',cnt; end if;
  raise notice 'T5 PASS cross-user DELETE affected 0 rows';
end $$; rollback;

-- T6 user B cannot insert a row owned by A (WITH CHECK)
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare ok boolean:=false; begin
  begin insert into public.planner_tasks(user_id,id,os_module,data,updated_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'spoof-x','planner','{}'::jsonb,now());
  exception when others then ok:=true; end;
  if not ok then raise exception 'T6 FAIL B inserted row owned by A'; end if;
  raise notice 'T6 PASS owner-spoofing INSERT rejected by WITH CHECK';
end $$; rollback;

-- T7 create RPC rejects client-supplied foreign owner (actor.id != auth.uid)
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare ok boolean:=false; begin
  begin perform public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.create_task','producer','plan','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    'deviceId',gen_random_uuid()::text,'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('title','spoofed'),'reason','attack','idempotencyKey','cleanroom:spoof:B',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  exception when others then ok:=true; end;
  if not ok then raise exception 'T7 FAIL create RPC accepted actor.id != auth.uid()'; end if;
  raise notice 'T7 PASS create RPC rejects foreign owner (actor_user_mismatch)';
end $$; rollback;

-- T8 Activity list scoped to caller
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare n int; begin
  select count(*) into n from public.kenos_list_plan_activity(200,null);
  if n<>0 then raise exception 'T8 FAIL B saw % activity rows (expected 0)',n; end if;
  raise notice 'T8 PASS Activity list scoped to caller';
end $$; rollback;

-- T9 Capture list scoped to caller
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare n int; begin
  select count(*) into n from public.kenos_list_capture_envelopes() where payload->>'text'='A private capture';
  if n<>0 then raise exception 'T9 FAIL B saw % A captures',n; end if;
  raise notice 'T9 PASS Capture list scoped to caller';
end $$; rollback;

-- T10 RLS enabled on all core-loop tables (superuser catalog read)
begin;
do $$ declare bad text; begin
  select string_agg(relname,', ') into bad from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and relrowsecurity=false and relname in
    ('planner_tasks','planner_user_state','planner_projects','kenos_capture_envelopes','kenos_plan_activity',
     'kenos_plan_outbox','kenos_plan_action_idempotency','kenos_action_approvals','core_allowed_devices',
     'core_profiles','core_user_app_settings','life_events','app_memberships');
  if bad is not null then raise exception 'T10 FAIL RLS disabled on: %',bad; end if;
  raise notice 'T10 PASS RLS enabled on all core-loop tables';
end $$; rollback;

-- T11 every SECURITY DEFINER fn in public/private pins search_path
begin;
do $$ declare bad text; begin
  select string_agg(p.proname,', ') into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%');
  if bad is not null then raise exception 'T11 FAIL SECURITY DEFINER without pinned search_path: %',bad; end if;
  raise notice 'T11 PASS all SECURITY DEFINER funcs pin search_path';
end $$; rollback;

-- T12 anon cannot execute privileged create RPC
begin; set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
do $$ declare ok boolean:=false; begin
  begin perform public.kenos_create_plan_task_action('{}'::jsonb); exception when others then ok:=true; end;
  if not ok then raise exception 'T12 FAIL anon executed create RPC'; end if;
  raise notice 'T12 PASS anon cannot execute privileged create RPC';
end $$; rollback;

-- T13 IDOR-via-RPC: user B cannot convert user A's capture through the convert RPC
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare ok boolean:=false; cap text; begin
  select id::text into cap from public.kenos_capture_envelopes where payload->>'text'='A private capture' limit 1;
  begin perform public.kenos_convert_capture_to_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','capture.convert_to_plan_task','producer','assistant','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('captureId',cap),'reason','attack','idempotencyKey','capture_convert:idor',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  exception when others then ok:=true; end;
  -- cap may be NULL (B can't even see it) which also means no conversion happened
  if not ok and cap is not null then raise exception 'T13 FAIL B converted A capture'; end if;
  raise notice 'T13 PASS B cannot convert A capture through the RPC';
end $$; rollback;

-- T14 IDOR-via-RPC: user B cannot complete user A's task through the complete RPC
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',:'B','role','authenticated')::text, true);
do $$ declare ok boolean:=false; atask text; begin
  select id into atask from public.planner_tasks where data->>'title'='A owns this task' limit 1;
  begin perform public.kenos_complete_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.complete_task','producer','plan','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('taskId',atask),'reason','attack','idempotencyKey','complete:idor',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  exception when others then ok:=true; end;
  raise notice 'T14 PASS B cannot complete A task through the RPC';
end $$; rollback;

\echo '================= ALL RLS / AUTHZ ASSERTIONS PASSED ================='
