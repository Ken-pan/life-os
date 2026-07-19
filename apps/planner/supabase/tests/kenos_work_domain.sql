\if :{?work_project_a_json}
\else
  \echo 'work fixtures are required; use scripts/check-kenos-phase3-work-db.mjs'
  \quit 3
\endif

begin;

create temporary table kenos_work_test_context (
  project_a jsonb not null,
  project_b jsonb not null,
  proposal_a jsonb not null,
  proposal_conflict jsonb not null
) on commit drop;
insert into kenos_work_test_context values (
  :'work_project_a_json'::jsonb,
  :'work_project_b_json'::jsonb,
  :'work_proposal_a_json'::jsonb,
  :'work_proposal_conflict_json'::jsonb
);
grant select on kenos_work_test_context to authenticated, anon, kenos_work_writer;

insert into auth.users (id, email) values
  (((select project_a from kenos_work_test_context) ->> 'ownerId')::uuid, 'work-a@example.test'),
  (((select project_b from kenos_work_test_context) ->> 'ownerId')::uuid, 'work-b@example.test')
on conflict (id) do nothing;

do $$
begin
  if not has_table_privilege('authenticated', 'public.kenos_work_projects', 'select') then
    raise exception 'authenticated Work project select grant missing';
  end if;
  if has_table_privilege('authenticated', 'public.kenos_work_projects', 'insert,update,delete') then
    raise exception 'authenticated must not write Work projects directly';
  end if;
  if has_table_privilege('anon', 'public.kenos_work_projects', 'select') then
    raise exception 'anon must not read Work projects';
  end if;
  if has_table_privilege('service_role', 'public.kenos_work_projects', 'insert') then
    raise exception 'generic service_role must not write Work as a normal client';
  end if;
  if not has_function_privilege('authenticated', 'public.kenos_list_work_projects(integer,timestamp with time zone)', 'execute') then
    raise exception 'authenticated Work list RPC grant missing';
  end if;
  if has_function_privilege('anon', 'public.kenos_list_work_projects(integer,timestamp with time zone)', 'execute') then
    raise exception 'anon must not execute Work list RPC';
  end if;
  if has_function_privilege('authenticated', 'private.kenos_store_work_project(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'private.kenos_store_work_action_proposal(jsonb)', 'execute') then
    raise exception 'authenticated must not execute Work writer functions';
  end if;
  if has_function_privilege('service_role', 'private.kenos_store_work_project(jsonb)', 'execute') then
    raise exception 'generic service_role must not become the Work writer';
  end if;
end;
$$;

set local role kenos_work_writer;
select set_config('request.jwt.claim.sub', (select project_a ->> 'ownerId' from kenos_work_test_context), true);
select private.kenos_store_work_project((select project_a from kenos_work_test_context));
select private.kenos_store_work_action_proposal((select proposal_a from kenos_work_test_context));
-- idempotent replay returns the same proposal
select private.kenos_store_work_action_proposal((select proposal_a from kenos_work_test_context));

do $$
begin
  begin
    perform private.kenos_store_work_project((select project_b from kenos_work_test_context));
    raise exception 'expected owner binding rejection';
  exception when others then
    if sqlerrm not like '%work_owner_mismatch%' then raise; end if;
  end;
  begin
    perform private.kenos_store_work_action_proposal((select proposal_conflict from kenos_work_test_context));
    raise exception 'expected idempotency conflict';
  exception when others then
    if sqlerrm not like '%work_idempotency_conflict%' then raise; end if;
  end;
  begin
    insert into public.kenos_work_projects (
      id, version, owner_id, title, safe_summary, status, priority, data_classification,
      source_refs, library_refs, plan_task_refs, created_at, updated_at
    ) values (
      'a1000000-0000-4000-8000-000000009999', '1',
      ((select project_a from kenos_work_test_context) ->> 'ownerId')::uuid,
      'direct', 'direct insert', 'active', 'normal', 'work_confidential',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now()
    );
    raise exception 'expected writer table insert denial';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like '%permission denied%' then null; else raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', (select project_b ->> 'ownerId' from kenos_work_test_context), true);
select private.kenos_store_work_project((select project_b from kenos_work_test_context));

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select project_a ->> 'ownerId' from kenos_work_test_context), true);
do $$
declare
  project_count integer;
  foreign_count integer;
  proposal_count integer;
begin
  select count(*) into project_count from public.kenos_list_work_projects(100, null);
  if project_count <> 1 then raise exception 'expected exactly one Work project for user A, got %', project_count; end if;

  select count(*) into foreign_count
  from public.kenos_work_projects
  where owner_id = ((select project_b from kenos_work_test_context) ->> 'ownerId')::uuid;
  if foreign_count <> 0 then raise exception 'RLS leaked user B Work projects to user A'; end if;

  select count(*) into proposal_count from public.kenos_list_work_action_proposals(100, null);
  if proposal_count <> 1 then raise exception 'expected one WorkActionProposal for user A, got %', proposal_count; end if;

  begin
    insert into public.kenos_work_action_proposals (
      id, version, owner_id, work_entity_ref, proposed_task_title, safe_context, risk, status,
      data_classification, requested_at, correlation_id, idempotency_key, created_at, updated_at
    ) values (
      'a5000000-0000-4000-8000-000000009999', '1',
      ((select project_a from kenos_work_test_context) ->> 'ownerId')::uuid,
      '{"id":"a1000000-0000-4000-8000-000000000001","type":"work.project","ownerDomain":"work","ownerId":"20000000-0000-4000-8000-000000000001"}'::jsonb,
      'client write', 'must fail', 'R2', 'draft', 'work_confidential', now(),
      '40000000-0000-4000-8000-000000009999', 'client-write', now(), now()
    );
    raise exception 'authenticated must not insert WorkActionProposal';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like '%permission denied%' then null; else raise; end if;
  end;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform count(*) from public.kenos_work_projects;
    if found then null; end if;
  exception when insufficient_privilege then
    null;
  end;
  if has_table_privilege('anon', 'public.kenos_work_projects', 'select') then
    raise exception 'anon still has Work select privilege';
  end if;
end;
$$;

reset role;
commit;
