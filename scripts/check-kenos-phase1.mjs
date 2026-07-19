#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'apps/planner/supabase/migrations/20260719010000_kenos_plan_create_task_command.sql'), 'utf8')
for (const token of [
  'kenos_plan_action_idempotency',
  'unique (action_type, idempotency_key)',
  "status in ('pending', 'processing', 'delivered', 'retry', 'terminal')",
  'kenos_create_plan_task_action',
  'security invoker',
  'work_source_excluded',
  'redacted_payload',
]) {
  assert.ok(sql.includes(token), `missing ${token}`)
}
assert.ok(!/security\s+definer/i.test(sql), 'Phase 1 RPC artifact must not use SECURITY DEFINER')
console.log('check-kenos-phase1 — OK')
