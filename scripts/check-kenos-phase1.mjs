#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KenosActionResultSchema, KenosActivityRecordSchema, KenosOutboxRecordSchema } from '../packages/contracts/src/kenos.ts'
import { createMemoryCreateTaskDatabase, executeServerCreateTaskAction } from '../apps/planner/server/kenos/createTaskCommand.mjs'

const sql = readFileSync(join(process.cwd(), 'apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql'), 'utf8')
const privilegeSql = readFileSync(join(process.cwd(), 'apps/planner/supabase/review/20260719020000_kenos_plan_privilege_model.sql'), 'utf8')
const dbTest = readFileSync(join(process.cwd(), 'apps/planner/supabase/tests/kenos_plan_create_task_command.sql'), 'utf8')
const corpus = JSON.parse(readFileSync(join(process.cwd(), 'packages/contracts/fixtures/kenos/v1/corpus.json'), 'utf8'))
const fixture = corpus.valid.find(({ id }) => id === 'action-create-task-r1').value
for (const token of [
  'kenos_plan_action_idempotency',
  'primary key (user_id, action_type, idempotency_key)',
  'unique (user_id, action_id)',
  'unique (user_id, action_type, idempotency_key)',
  "status in ('pending', 'processing', 'published', 'retry', 'dead_letter')",
  'kenos_create_plan_task_action',
  'security definer',
  "set search_path = ''",
  'auth.uid()',
  'enable row level security',
  'to authenticated',
  'actor_user_mismatch',
  'action_id_reused',
  'producer_not_allowed',
  'schema_version_not_supported',
  "jsonb_typeof(action_request -> 'schemaVersion') <> 'string'",
  "action_request #>> '{actor,id}'",
  "action_request ->> 'deviceId'",
  "action_request ->> 'dataClassification'",
  "action_request ->> 'requestedRisk'",
  "'type', 'plan.task'",
  "'ownerId', v_task_id",
  'security_domain_not_allowed',
  'action_expired',
  'version_conflict',
  'insert into public.planner_tasks (user_id, id, data, updated_at)',
  'work_source_excluded',
  'redacted_payload',
]) {
  assert.ok(sql.includes(token), `missing ${token}`)
}
assert.ok(/function public\.kenos_create_plan_task_action[\s\S]*?security definer/i.test(sql), 'Public RPC wrapper must use a fixed-search-path SECURITY DEFINER to keep the private executor unreachable')
assert.ok(sql.includes('revoke usage on schema private from authenticated'), 'Authenticated clients must not reach the private executor schema')
assert.ok(sql.includes('revoke all on function private.kenos_create_plan_task_action(jsonb) from public, anon, authenticated'), 'Authenticated clients must not execute the private executor directly')
assert.ok(!/grant (insert|update|delete)[^;]* to authenticated/i.test(sql), 'Authenticated clients must not bypass the command boundary with direct table writes')
for (const token of ['kenos_outbox_worker', 'nologin noinherit nobypassrls', 'kenos_transition_plan_outbox', 'invalid_outbox_transition', 'revoke all on public.kenos_plan_outbox from kenos_outbox_worker']) {
  assert.ok(privilegeSql.includes(token), `privilege review artifact missing ${token}`)
}
assert.equal(fixture.schemaVersion, '1', 'shared fixture must use the canonical string major version')
assert.equal(fixture.actor?.id?.length, 36, 'shared fixture must carry a UUID actor id')
assert.equal(fixture.dataClassification, 'personal', 'shared fixture must use the canonical dataClassification field')
assert.ok(dbTest.includes("'kenos_action_json'"), 'disposable DB test must consume the canonical JSON action fixture through psql')
const integrationDb = createMemoryCreateTaskDatabase()
const integrationResult = executeServerCreateTaskAction(integrationDb, fixture, {
  authUserId: fixture.actor.id,
  now: Date.parse(fixture.requestedAt),
})
assert.equal(integrationResult.ok, true, 'shared fixture must execute through the Plan server boundary')
assert.equal(KenosOutboxRecordSchema.safeParse(integrationResult.outbox).success, true, 'server outbox must match the shared v1 schema')
assert.equal(KenosActivityRecordSchema.safeParse(integrationResult.activity).success, true, 'server activity must match the shared v1 schema')
assert.equal(KenosActionResultSchema.safeParse(integrationResult.actionResult).success, true, 'server command result must match the shared v1 schema')
execFileSync(process.execPath, ['scripts/check-kenos-contract-parity.mjs'], { cwd: process.cwd(), stdio: 'inherit' })
execFileSync(process.execPath, ['apps/planner/server/kenos/writerCutoverSimulation.test.mjs'], { cwd: process.cwd(), stdio: 'inherit' })
console.log('check-kenos-phase1 — OK')
