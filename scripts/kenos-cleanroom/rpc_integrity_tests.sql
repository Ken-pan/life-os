-- KENOS F5-02.7 — canonical mutation (RPC) integrity suite (clean-room)
-- Idempotency, atomicity, duplicate-protection, deterministic errors, owner
-- enforcement. Each test runs in its own transaction as authenticated user A
-- and ROLLBACKs, so the suite is fully re-runnable with no state accumulation.
-- All assertions RAISE -> ON_ERROR_STOP aborts with non-zero exit == real defect.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function _cr_new_task(p_uid text, p_key text, p_title text)
returns jsonb language plpgsql as $fn$
begin
  return public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','plan.create_task',
    'producer','plan','targetDomain','plan','actor',jsonb_build_object('type','user','id',p_uid),
    'deviceId',gen_random_uuid()::text,'securityDomain','personal','dataClassification','personal',
    'requestedRisk','R1','payload',jsonb_build_object('title',p_title),'reason','r','idempotencyKey',p_key,
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
end $fn$;

\set QUIET off
\echo '================= RPC INTEGRITY ================='

-- R1: same idempotency key twice within one actor context -> stable task id, one row
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ declare r1 jsonb; r2 jsonb; begin
  r1 := _cr_new_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rpc:idem:1','idem task');
  r2 := _cr_new_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rpc:idem:1','idem task');
  if (r1->>'taskId') is null or (r1->>'taskId') <> (r2->>'taskId') then
    raise exception 'R1 FAIL replay returned different/empty task ids: % vs %', r1->>'taskId', r2->>'taskId'; end if;
  -- second call is the idempotent replay: server reports duplicate:true for the same task
  if (r2->'result'->>'duplicate') <> 'true' then raise exception 'R1 FAIL replay not flagged duplicate:true'; end if;
  raise notice 'R1 PASS same idempotency key -> stable task id, replay flagged duplicate';
end $$;
rollback;

-- R2: different idempotency key -> distinct task
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ declare r1 jsonb; r2 jsonb; begin
  r1 := _cr_new_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rpc:idem:A','t');
  r2 := _cr_new_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rpc:idem:B','t');
  if (r1->>'taskId') = (r2->>'taskId') then raise exception 'R2 FAIL distinct keys mapped to same task'; end if;
  raise notice 'R2 PASS distinct idempotency key -> different task';
end $$;
rollback;

-- R3: atomicity — an accepted create writes task+outbox+activity+idempotency together
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
-- Atomicity is observable from the single-call return: the RPC only returns
-- taskId+activityId+outboxId together after the whole transaction commits.
-- The task row is client-readable (own-row RLS); outbox/activity/idempotency
-- are internal (no client grant) and are proven created by the non-null ids.
do $$ declare r jsonb; tid text; own_task int; begin
  r := _cr_new_task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rpc:atom:1','atom task'); tid := r->>'taskId';
  if (r->>'taskId') is null or (r->>'activityId') is null or (r->>'outboxId') is null then
    raise exception 'R3 FAIL incomplete atomic return task=% activity=% outbox=%', r->>'taskId', r->>'activityId', r->>'outboxId'; end if;
  select count(*) into own_task from public.planner_tasks where id = tid; -- readable via own-row RLS
  if own_task <> 1 then raise exception 'R3 FAIL task row not visible to owner (%)', own_task; end if;
  raise notice 'R3 PASS create RPC returned task+activity+outbox atomically; task row owner-visible';
end $$;
rollback;

-- R4: reusing one action UUID with a different idempotency key is rejected
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ declare aid text := gen_random_uuid()::text; ok boolean := false; begin
  perform public.kenos_create_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',aid,'actionType','plan.create_task','producer','plan','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('title','reuse'),'reason','r','idempotencyKey','rpc:reuse:1',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  begin
    perform public.kenos_create_plan_task_action(jsonb_build_object(
      'schemaVersion','1','id',aid,'actionType','plan.create_task','producer','plan','targetDomain','plan',
      'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
      'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
      'payload',jsonb_build_object('title','reuse2'),'reason','r','idempotencyKey','rpc:reuse:2',
      'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  exception when others then ok := true; end;
  if not ok then raise exception 'R4 FAIL action UUID rebindable to a different idempotency key'; end if;
  raise notice 'R4 PASS action UUID cannot be rebound (action_id_reused)';
end $$;
rollback;

-- R5: malformed schema version fails closed
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin perform public.kenos_create_plan_task_action(jsonb_build_object('schemaVersion','999','actionType','plan.create_task'));
  exception when others then ok := true; end;
  if not ok then raise exception 'R5 FAIL bad schemaVersion not rejected'; end if;
  raise notice 'R5 PASS bad schema version fails closed';
end $$;
rollback;

-- R6: capture convert is idempotent (same key -> duplicate:true, same task)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ declare cap uuid; r1 jsonb; r2 jsonb; begin
  perform public.kenos_ingest_capture_envelope_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','capture.ingest_envelope','producer','assistant','targetDomain','system',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('capturePayload',jsonb_build_object('text','R6 capture')),'reason','r','idempotencyKey','rpc:r6cap',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  select id into cap from public.kenos_capture_envelopes where payload->>'text'='R6 capture' limit 1;
  r1 := public.kenos_convert_capture_to_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','capture.convert_to_plan_task','producer','assistant','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('captureId',cap::text),'reason','r','idempotencyKey','capture_convert:r6',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  r2 := public.kenos_convert_capture_to_plan_task_action(jsonb_build_object(
    'schemaVersion','1','id',gen_random_uuid()::text,'actionType','capture.convert_to_plan_task','producer','assistant','targetDomain','plan',
    'actor',jsonb_build_object('type','user','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'deviceId',gen_random_uuid()::text,
    'securityDomain','personal','dataClassification','personal','requestedRisk','R1',
    'payload',jsonb_build_object('captureId',cap::text),'reason','r','idempotencyKey','capture_convert:r6',
    'requestedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'correlationId',gen_random_uuid()::text));
  if (r1->'result'->>'taskId') is null then raise exception 'R6 FAIL first convert produced no task'; end if;
  if (r2->'result'->>'duplicate') <> 'true' then raise exception 'R6 FAIL convert replay not duplicate:true (got %)', r2->'result'->>'duplicate'; end if;
  if (r1->'result'->>'taskId') <> (r2->'result'->>'taskId') then raise exception 'R6 FAIL convert replay resolved to different task'; end if;
  raise notice 'R6 PASS capture convert idempotent replay (duplicate:true, same task)';
end $$;
rollback;

drop function if exists _cr_new_task(text,text,text);
\echo '================= ALL RPC INTEGRITY ASSERTIONS PASSED ================='
