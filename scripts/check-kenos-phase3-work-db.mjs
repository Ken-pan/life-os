#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const container = `kenos-phase3-work-db-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const password = 'kenos-work-disposable-local-only'
const reviewSql = readFileSync(join(root, 'apps/planner/supabase/review/20260719040000_kenos_work_domain.sql'), 'utf8')
const dbTest = readFileSync(join(root, 'apps/planner/supabase/tests/kenos_work_domain.sql'), 'utf8')
const corpus = JSON.parse(readFileSync(join(root, 'packages/contracts/fixtures/kenos/v1/corpus.json'), 'utf8'))
const valid = new Map(corpus.valid.map((fixture) => [fixture.id, fixture.value]))

const projectA = structuredClone(valid.get('work-project-active'))
const projectB = structuredClone(valid.get('work-project-completed'))
projectB.id = 'a1000000-0000-4000-8000-000000000099'
projectB.ownerId = '20000000-0000-4000-8000-000000000002'
const proposalA = structuredClone(valid.get('work-action-proposal-proposed'))
const proposalConflict = structuredClone(proposalA)
proposalConflict.id = 'a5000000-0000-4000-8000-000000000099'
proposalConflict.proposedTaskTitle = 'Conflicting replay title'

const roleBootstrap = String.raw`
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
`
const authBootstrap = String.raw`
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, kenos_work_writer;
grant execute on function auth.uid() to authenticated, kenos_work_writer;
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

function psql(sql, extra = []) {
  return run('docker', ['exec', '-i', container, 'env', `PGPASSWORD=${password}`, 'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1', ...extra, '-U', 'supabase_admin', '-d', 'postgres'], { input: sql })
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

  psql(roleBootstrap)
  psql('create schema if not exists auth; create table if not exists auth.users (id uuid primary key, email text);')
  psql(reviewSql)
  psql(authBootstrap)
  psql(dbTest, [
    '-v', `work_project_a_json=${JSON.stringify(projectA)}`,
    '-v', `work_project_b_json=${JSON.stringify(projectB)}`,
    '-v', `work_proposal_a_json=${JSON.stringify(proposalA)}`,
    '-v', `work_proposal_conflict_json=${JSON.stringify(proposalConflict)}`,
  ])
  console.log('check-kenos-phase3-work-db — disposable Work/RLS/privilege PASS')
} finally {
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' })
}
