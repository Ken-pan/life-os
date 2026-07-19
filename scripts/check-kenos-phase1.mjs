#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KenosActivityRecordSchema, KenosOutboxRecordSchema } from '../packages/contracts/src/kenos.ts'
import { createMemoryCreateTaskDatabase, executeServerCreateTaskAction } from '../apps/planner/server/kenos/createTaskCommand.mjs'

const sql = readFileSync(join(process.cwd(), 'apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql'), 'utf8')
const dbTest = readFileSync(join(process.cwd(), 'apps/planner/supabase/tests/kenos_plan_create_task_command.sql'), 'utf8')
const fixture = JSON.parse(readFileSync(join(process.cwd(), 'packages/contracts/fixtures/kenos/create-task-action.json'), 'utf8'))
for (const token of [
  'kenos_plan_action_idempotency',
  'primary key (user_id, action_type, idempotency_key)',
  'unique (user_id, action_id)',
  'unique (user_id, action_type, idempotency_key)',
  "status in ('pending', 'processing', 'published', 'retry', 'dead_letter')",
  'kenos_create_plan_task_action',
  'security invoker',
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
assert.ok(!/function public\.kenos_create_plan_task_action[\s\S]*?security definer/i.test(sql), 'Public RPC wrapper must not use SECURITY DEFINER')
assert.ok(!/grant (insert|update|delete)[^;]* to authenticated/i.test(sql), 'Authenticated clients must not bypass the command boundary with direct table writes')
assert.equal(fixture.schemaVersion, '1', 'shared fixture must use the canonical string major version')
assert.equal(fixture.actor?.id?.length, 36, 'shared fixture must carry a UUID actor id')
assert.equal(fixture.dataClassification, 'personal', 'shared fixture must use the canonical dataClassification field')
for (const token of ["'schemaVersion', '1'", "'id', '10000000-0000-4000-8000-000000000001'", "'dataClassification', 'personal'", "'requestedRisk', 'R1'"]) {
  assert.ok(dbTest.includes(token), `disposable DB boundary fixture drift: missing ${token}`)
}
const integrationDb = createMemoryCreateTaskDatabase()
const integrationResult = executeServerCreateTaskAction(integrationDb, fixture, {
  authUserId: fixture.actor.id,
  now: Date.parse(fixture.requestedAt),
})
assert.equal(integrationResult.ok, true, 'shared fixture must execute through the Plan server boundary')
assert.equal(KenosOutboxRecordSchema.safeParse(integrationResult.outbox).success, true, 'server outbox must match the shared v1 schema')
assert.equal(KenosActivityRecordSchema.safeParse(integrationResult.activity).success, true, 'server activity must match the shared v1 schema')
console.log('check-kenos-phase1 — OK')
