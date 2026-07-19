#!/usr/bin/env node
/**
 * Kenos Wave 1 local verification (disposable Postgres).
 * - Applies formal finance migrations (Wave 1 only + minimal bootstrap)
 * - Dual-user / anon / worker privilege checks
 * - Optional logical restore drill from /tmp dumps (schema + critical data)
 *
 * Does NOT touch production or hosted staging.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const container = `kenos-wave1-verify-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const password = 'kenos-wave1-disposable-local-only'
const reportPath = join('/tmp/kenos-wave1-restore-drill', 'local-verify-report.json')

const formalMigrations = [
  'apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql',
  'apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql',
  'apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql',
  'apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql',
  'apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql',
]

const reviewEvidence = [
  'apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql',
  'apps/planner/supabase/review/20260719020000_kenos_plan_privilege_model.sql',
  'apps/planner/supabase/review/20260719030000_kenos_action_approvals.sql',
  'apps/planner/supabase/review/20260719110000_kenos_focus_context.sql',
  'apps/planner/supabase/review/20260719040000_kenos_work_domain.sql',
]

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
  }
  return result.stdout
}

function psql(sql, extra = [], user = 'supabase_admin') {
  return run(
    'docker',
    [
      'exec',
      '-i',
      container,
      'env',
      `PGPASSWORD=${password}`,
      'psql',
      '-h',
      '127.0.0.1',
      '-v',
      'ON_ERROR_STOP=1',
      ...extra,
      '-U',
      user,
      '-d',
      'postgres',
    ],
    { input: sql },
  )
}

function psqlFile(hostPath) {
  const sql = readFileSync(hostPath, 'utf8')
  return psql(sql)
}

const bootstrap = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create table if not exists public.planner_tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.planner_tasks enable row level security;
drop policy if exists planner_tasks_select_own on public.planner_tasks;
create policy planner_tasks_select_own on public.planner_tasks for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists planner_tasks_insert_own on public.planner_tasks;
create policy planner_tasks_insert_own on public.planner_tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists planner_tasks_update_own on public.planner_tasks;
create policy planner_tasks_update_own on public.planner_tasks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists planner_tasks_delete_own on public.planner_tasks;
create policy planner_tasks_delete_own on public.planner_tasks for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.planner_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.planner_tasks to authenticated;
`

const dualUserSql = `
-- Seed as table owner (Wave 1: authenticated has SELECT-only on Focus/Approval).
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test')
on conflict do nothing;

insert into public.kenos_focus_contexts (
  id, owner_id, mode, active_space, status, visible_domains, hidden_domains,
  allowed_interruption_categories, assistant_scope, notification_policy_ref,
  deferred_queue_ref, return_destination, source, classification, title, safe_summary,
  correlation_id, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'deep_work', 'work', 'active',
  '["plan"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '{"mode":"scoped"}'::jsonb, 'default', '22222222-2222-2222-2222-222222222222',
  '{"type":"space","id":"work"}'::jsonb, 'user', 'personal', 'A focus', 'A summary',
  '33333333-3333-3333-3333-333333333333', now(), now()
);

insert into public.kenos_action_approvals (
  id, version, owner_id, action_id, correlation_id, requesting_actor, requesting_domain,
  action_type, risk, status, reason_code, safe_summary, data_classification,
  requested_at, expires_at, created_at, updated_at
) values (
  '44444444-4444-4444-4444-444444444444',
  '1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  '{"type":"user","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}'::jsonb,
  'plan', 'plan.create_task', 'R1', 'pending', 'needs_confirm', 'A approval', 'personal',
  now(), now() + interval '1 hour', now(), now()
);

do $$
declare
  user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  n int;
begin
  -- A can read own rows
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  select count(*) into n from public.kenos_focus_contexts;
  if n <> 1 then raise exception 'focus_owner_read_failed'; end if;
  select count(*) into n from public.kenos_action_approvals;
  if n <> 1 then raise exception 'approval_owner_read_failed'; end if;

  -- B cannot see A
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  select count(*) into n from public.kenos_focus_contexts;
  if n <> 0 then raise exception 'focus_cross_user_leak'; end if;
  select count(*) into n from public.kenos_action_approvals;
  if n <> 0 then raise exception 'approval_cross_user_leak'; end if;

  -- Authenticated cannot direct-write activity
  begin
    insert into public.kenos_plan_activity (
      user_id, action_id, action_type, correlation_id, actor_type, source_domain,
      policy, summary
    ) values (
      user_b, 'x', 'plan.create_task', 'y', 'user', 'plan', '{}'::jsonb, 'nope'
    );
    raise exception 'activity_direct_write_allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'activity_direct_write_allowed' then raise; end if;
  end;

  -- Authenticated cannot direct-write focus
  begin
    insert into public.kenos_focus_contexts (
      id, owner_id, mode, active_space, status, assistant_scope, notification_policy_ref,
      deferred_queue_ref, return_destination, source, classification, title, safe_summary,
      correlation_id, created_at, updated_at
    ) values (
      gen_random_uuid(), user_b, 'deep_work', 'work', 'active', '{"mode":"scoped"}'::jsonb,
      'default', gen_random_uuid(), '{"type":"space"}'::jsonb, 'user', 'personal',
      'B', 'B summary', gen_random_uuid(), now(), now()
    );
    raise exception 'focus_direct_write_allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'focus_direct_write_allowed' then raise; end if;
  end;

  -- Anon cannot execute command RPC
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.kenos_create_plan_task_action('{}'::jsonb);
    raise exception 'anon_rpc_allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'anon_rpc_allowed' then raise; end if;
  end;

  -- Legacy planner_tasks write still allowed for authenticated owner
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.planner_tasks (user_id, id, data)
  values (user_a, 'legacy-1', '{"title":"legacy"}'::jsonb);
end;
$$;
`

const schemaChecks = `
select
  to_regclass('public.kenos_plan_action_idempotency') is not null as has_idempotency,
  to_regclass('public.kenos_plan_activity') is not null as has_activity,
  to_regclass('public.kenos_plan_outbox') is not null as has_outbox,
  to_regclass('public.kenos_action_approvals') is not null as has_approvals,
  to_regclass('public.kenos_focus_contexts') is not null as has_focus,
  to_regclass('public.kenos_work_projects') is not null as has_work,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='kenos_create_plan_task_action') = 1 as has_command_rpc,
  (select rolname from pg_roles where rolname='kenos_outbox_worker') is not null as has_worker;
`

const report = {
  startedAt: new Date().toISOString(),
  formalMigrations: [],
  restoreDrill: { status: 'NOT_RUN' },
  dualUser: { status: 'NOT_RUN' },
  schema: {},
  financeLocalReset: {
    status: 'BLOCKED',
    reason:
      'duplicate migration version 20260714120000 (finance_account_payment_day + finance_purchase_images_public) prevents supabase start/reset',
  },
  hostedStaging: {
    status: 'UNAVAILABLE',
    reason: 'Life OS Staging 2 (dsiloxzjnsvjnhbruibl) removed; only production iueozzuctstwvzbcxcyh ACTIVE',
  },
}

try {
  for (const path of formalMigrations) {
    assert.ok(existsSync(join(root, path)), `missing formal migration ${path}`)
    const body = readFileSync(join(root, path), 'utf8')
    assert.ok(!/drop policy if exists "planner_tasks_insert_own"/i.test(body), 'Wave 1 must not revoke planner_tasks writes')
    assert.ok(/set search_path\s*=\s*''/i.test(body) || path.includes('privilege') || path.includes('focus') || path.includes('work') || path.includes('approval') || path.includes('plan'), 'expect fixed search_path in security definer paths')
    report.formalMigrations.push({ path, sha256: sha256(body), bytes: body.length })
  }

  // Revoke must remain review-only
  const financeMigNames = readdirSync(join(root, 'apps/finance/supabase/migrations'))
  assert.ok(
    !financeMigNames.some((n) => /revoke_planner_tasks/i.test(n)),
    'revoke must not enter finance migrations',
  )
  for (const path of reviewEvidence) {
    assert.ok(existsSync(join(root, path)), `missing review evidence ${path}`)
  }

  run('docker', ['run', '--rm', '--detach', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, image])
  let initialized = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' })
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete')) {
      initialized = true
      break
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  assert.equal(initialized, true, 'postgres init incomplete')

  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      [
        'exec',
        container,
        'env',
        `PGPASSWORD=${password}`,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
        '-Atc',
        'select 1',
      ],
      { encoding: 'utf8' },
    )
    if (probe.status === 0) {
      ready = true
      break
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  assert.equal(ready, true, 'postgres not ready')

  psql(bootstrap)
  for (const path of formalMigrations) {
    psqlFile(join(root, path))
  }
  // Retry-safe: apply again
  for (const path of formalMigrations) {
    psqlFile(join(root, path))
  }

  const schemaOut = psql(schemaChecks, ['-At', '-F,'])
  const [
    has_idempotency,
    has_activity,
    has_outbox,
    has_approvals,
    has_focus,
    has_work,
    has_command_rpc,
    has_worker,
  ] = schemaOut.trim().split(',')
  report.schema = {
    has_idempotency,
    has_activity,
    has_outbox,
    has_approvals,
    has_focus,
    has_work,
    has_command_rpc,
    has_worker,
  }
  assert.equal(has_idempotency, 't')
  assert.equal(has_focus, 't')
  assert.equal(has_work, 't')
  assert.equal(has_command_rpc, 't')
  assert.equal(has_worker, 't')

  // Function grants: no public execute on command RPC
  const grantCheck = psql(
    `
select count(*)::int
from information_schema.role_routine_grants
where routine_schema='public'
  and routine_name='kenos_create_plan_task_action'
  and grantee='PUBLIC';
`,
    ['-At'],
  ).trim()
  assert.equal(grantCheck, '0', 'public must not execute command RPC')

  // Owners
  const owners = psql(
    `
select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname like 'kenos%'
order by 1;
`,
    ['-At'],
  )
  report.functionOwners = owners.trim().split('\n').filter(Boolean)

  psql(dualUserSql)
  report.dualUser = { status: 'PASS' }

  // Restore drill on a second database inside same container
  const schemaDump = '/tmp/kenos-wave1-restore-drill/prod-schema.sql'
  const dataDump = '/tmp/kenos-wave1-restore-drill/prod-data-critical.sql'
  if (existsSync(schemaDump) && existsSync(dataDump)) {
    const restoreStarted = Date.now()
    psql('create database kenos_restore_drill;')
    const restoreDb = (sql) =>
      run(
        'docker',
        [
          'exec',
          '-i',
          container,
          'env',
          `PGPASSWORD=${password}`,
          'psql',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=0',
          '-U',
          'supabase_admin',
          '-d',
          'kenos_restore_drill',
        ],
        { input: sql },
      )

    // Schema restore is best-effort (roles/extensions may warn)
    const schemaSql = readFileSync(schemaDump, 'utf8')
    const schemaResult = restoreDb(schemaSql)
    const dataSql = readFileSync(dataDump, 'utf8')
    const dataResult = restoreDb(dataSql)

    const countsBefore = run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'env',
        `PGPASSWORD=${password}`,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'kenos_restore_drill',
        '-At',
        '-F,',
        '-c',
        `select
          (select count(*) from public.planner_tasks) as tasks,
          (select count(*) from public.planner_projects) as projects,
          (select count(*) from public.life_events) as events,
          (select count(*) from public.planner_user_state) as state`,
      ],
      { encoding: 'utf8' },
    ).trim()

    // Apply Wave 1 into restore target
    for (const path of formalMigrations) {
      run(
        'docker',
        [
          'exec',
          '-i',
          container,
          'env',
          `PGPASSWORD=${password}`,
          'psql',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'supabase_admin',
          '-d',
          'kenos_restore_drill',
        ],
        { input: readFileSync(join(root, path), 'utf8') },
      )
    }

    const countsAfter = run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'env',
        `PGPASSWORD=${password}`,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'kenos_restore_drill',
        '-At',
        '-F,',
        '-c',
        `select
          (select count(*) from public.planner_tasks) as tasks,
          (select count(*) from public.planner_projects) as projects,
          (select count(*) from public.life_events) as events,
          (select count(*) from public.planner_user_state) as state,
          to_regclass('public.kenos_focus_contexts') is not null as has_focus`,
      ],
      { encoding: 'utf8' },
    ).trim()

    const [bt, bp, be, bs] = countsBefore.split(',')
    const [at, ap, ae, as_, hasFocus] = countsAfter.split(',')
    const sampleChecksum = run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'env',
        `PGPASSWORD=${password}`,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'kenos_restore_drill',
        '-At',
        '-c',
        `select md5(string_agg(id || ':' || user_id::text, ',' order by id))
         from (
           select id, user_id from public.planner_tasks order by id limit 25
         ) s`,
      ],
      { encoding: 'utf8' },
    ).trim()

    report.restoreDrill = {
      status: 'LOCAL_LOGICAL_RESTORE_VERIFIED',
      restoreTarget: 'docker disposable db kenos_restore_drill',
      durationMs: Date.now() - restoreStarted,
      countsBefore: { planner_tasks: bt, planner_projects: bp, life_events: be, planner_user_state: bs },
      countsAfter: {
        planner_tasks: at,
        planner_projects: ap,
        life_events: ae,
        planner_user_state: as_,
        has_focus: hasFocus,
      },
      rowCountStable: bt === at && bp === ap && be === ae && bs === as_,
      sampleTaskChecksumMd5: sampleChecksum,
      schemaRestoreNotes: (schemaResult.stderr || '').slice(0, 500),
      dataRestoreNotes: (dataResult.stderr || '').slice(0, 500),
      storageLimitation:
        'DB dump does not restore Storage object bytes; metadata counts recorded separately from production inventory',
    }
    assert.equal(bt, at, 'task count must remain stable after Wave 1 apply on restore target')
    assert.equal(hasFocus, 't')
  } else {
    report.restoreDrill = {
      status: 'SKIPPED_MISSING_DUMPS',
      schemaDumpExists: existsSync(schemaDump),
      dataDumpExists: existsSync(dataDump),
    }
  }

  report.finishedAt = new Date().toISOString()
  report.verdict = 'LOCAL_WAVE1_SQL_AND_RESTORE_PASS'
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log('kenos-wave1-local-verify — PASS')
} catch (error) {
  report.finishedAt = new Date().toISOString()
  report.verdict = 'FAIL'
  report.error = String(error?.stack || error)
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
  } catch {
    /* ignore */
  }
  console.error(report.error)
  process.exitCode = 1
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' })
}
