#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const container = `kenos-phase1-db-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const password = 'kenos-disposable-local-only'
const reviewSql = readFileSync(join(root, 'apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql'), 'utf8')
const privilegeSql = readFileSync(join(root, 'apps/planner/supabase/review/20260719020000_kenos_plan_privilege_model.sql'), 'utf8')
const dbTest = readFileSync(join(root, 'apps/planner/supabase/tests/kenos_plan_create_task_command.sql'), 'utf8')
const privilegeTest = readFileSync(join(root, 'apps/planner/supabase/tests/kenos_plan_privileges.sql'), 'utf8')
const corpus = JSON.parse(readFileSync(join(root, 'packages/contracts/fixtures/kenos/v1/corpus.json'), 'utf8'))
const action = corpus.valid.find(({ id }) => id === 'action-create-task-r1').value

const roleBootstrap = String.raw`
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
`
const authBootstrap = String.raw`
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`
const plannerBootstrap = String.raw`
create table if not exists public.planner_tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.planner_tasks enable row level security;
drop policy if exists planner_tasks_select_own on public.planner_tasks;
create policy planner_tasks_select_own on public.planner_tasks for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.planner_tasks from public, anon, authenticated;
grant select on public.planner_tasks to authenticated;
`

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
  return run('docker', ['exec', '-i', container, 'env', `PGPASSWORD=${password}`, 'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1', ...extra, '-U', user, '-d', 'postgres'], { input: sql })
}

try {
  run('docker', ['run', '--rm', '--detach', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, image])
  let initialized = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' })
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete')) { initialized = true; break }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  assert.equal(initialized, true, 'disposable Supabase Postgres did not finish initialization')
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'env', `PGPASSWORD=${password}`, 'psql', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', 'select 1'], { encoding: 'utf8' })
    if (probe.status === 0) { ready = true; break }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  assert.equal(ready, true, 'disposable Supabase Postgres did not become ready after initialization')
  psql(roleBootstrap)
  psql(authBootstrap)
  psql(plannerBootstrap)
  psql(reviewSql)
  psql(privilegeSql)
  psql(dbTest, ['-v', `kenos_action_json=${JSON.stringify(action)}`])
  psql(privilegeTest, ['-v', `kenos_action_json=${JSON.stringify(action)}`])
  console.log('test-kenos-phase1-db — disposable transaction/RLS/privilege fixture PASS')
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' })
}
