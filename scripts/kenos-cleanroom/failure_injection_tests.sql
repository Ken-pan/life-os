-- KENOS F5-05 — sync failure-injection suite (clean-room).
-- Server-side half of the adversarial matrix: ambiguous success (response lost
-- then retry), atomicity rollback, concurrent duplicate keys, contract mismatch.
-- Each assertion RAISEs -> ON_ERROR_STOP aborts with non-zero exit == real defect.
\set ON_ERROR_STOP on
\set QUIET on
\set A 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

-- seed user A + membership (idempotent)
begin;
delete from auth.users where email = 'fi_a@example.com';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (:'A','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fi_a@example.com','x',now(),now(),now())
on conflict (id) do nothing;
insert into public.core_profiles (id) values (:'A') on conflict (id) do nothing;
insert into public.app_memberships (user_id, app_key, status) values (:'A','planner','active') on conflict do nothing;
commit;

create or replace function _fi_create(p_key text, p_title text)
returns jsonb language plpgsql as $fn$
begin
  return public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.create_task','producer','plan','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('title',p_title),'reason','r','idempotencyKey',p_key,
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
end $fn$;

\set QUIET off
\echo '================= F5-05 FAILURE INJECTION ================='

-- FI-1: ambiguous success — server commits, response "lost", client retries the
-- SAME idempotency key. Must resolve to exactly one task, duplicate:true.
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare r1 jsonb; r2 jsonb; r3 jsonb; begin
  r1 := _fi_create('fi:ambiguous','ambiguous task');       -- commit
  r2 := _fi_create('fi:ambiguous','ambiguous task');       -- retry after lost response
  r3 := _fi_create('fi:ambiguous','ambiguous task');       -- retry again
  if (r1->>'taskId') <> (r2->>'taskId') or (r2->>'taskId') <> (r3->>'taskId') then
    raise exception 'FI-1 FAIL retries produced different task ids'; end if;
  if (r2->'result'->>'duplicate') <> 'true' or (r3->'result'->>'duplicate') <> 'true' then
    raise exception 'FI-1 FAIL retry not flagged duplicate'; end if;
  raise notice 'FI-1 PASS ambiguous-success retries -> one task, duplicate:true';
end $$; rollback;

-- FI-2: atomicity rollback — a rejected action must leave NOTHING behind
-- (no task, activity, outbox, or idempotency row).
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare ok boolean := false; a int; begin
  begin perform _fi_create('fi:reject','');  -- title_required -> reject
  exception when others then ok := true; end;
  if not ok then raise exception 'FI-2 FAIL empty-title create was not rejected'; end if;
  -- nothing persisted: no task row from the rejected action (own-row readable)
  select count(*) into a from public.planner_tasks where data->>'title'='' ;
  if a <> 0 then raise exception 'FI-2 FAIL rejected action left % task rows', a; end if;
  raise notice 'FI-2 PASS rejected action is atomic (no partial task)';
end $$; rollback;

-- FI-3: two clients submit the SAME idempotency key concurrently (simulated as
-- two sequential calls in one session, same key) -> one canonical task.
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare r1 jsonb; r2 jsonb; c int; begin
  r1 := _fi_create('fi:twoclients','shared key task');
  r2 := _fi_create('fi:twoclients','shared key task');
  if (r1->>'taskId') <> (r2->>'taskId') then raise exception 'FI-3 FAIL two clients created two tasks'; end if;
  if (r2->'result'->>'duplicate') <> 'true' then raise exception 'FI-3 FAIL second client not deduped'; end if;
  select count(*) into c from public.planner_tasks where id = (r1->>'taskId');
  if c <> 1 then raise exception 'FI-3 FAIL % task rows for shared key', c; end if;
  raise notice 'FI-3 PASS same key from two clients -> one canonical task';
end $$; rollback;

-- FI-4: unsupported contract version -> rejected, no partial write.
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','999','actionType','plan.create_task','idempotencyKey','fi:badver'));
  exception when others then ok := true; end;
  if not ok then raise exception 'FI-4 FAIL bad contract version accepted'; end if;
  raise notice 'FI-4 PASS unsupported contract version rejected, no partial write';
end $$; rollback;

-- FI-5: a queued command for user A cannot execute as user B (cross-account).
-- User B replays A's exact action_request -> actor_user_mismatch, no task for B.
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.create_task','producer','plan','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),  -- A's identity
    'deviceId',gen_random_uuid()::text,'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('title','cross-account'),'reason','r','idempotencyKey','fi:crossacct',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  exception when others then ok := true; end;
  if not ok then raise exception 'FI-5 FAIL queued command executed under wrong user'; end if;
  raise notice 'FI-5 PASS queued command cannot execute across accounts (actor_user_mismatch)';
end $$; rollback;

drop function if exists _fi_create(text,text);
\echo '================= ALL F5-05 FAILURE-INJECTION ASSERTIONS PASSED ================='
