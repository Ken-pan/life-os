#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql'), 'utf8')
for (const token of [
  'kenos_plan_action_idempotency',
  'primary key (user_id, action_type, idempotency_key)',
  'unique (user_id, action_type, idempotency_key)',
  "status in ('pending', 'processing', 'delivered', 'retry', 'terminal')",
  'kenos_create_plan_task_action',
  'security invoker',
  'security definer',
  "set search_path = ''",
  'auth.uid()',
  'enable row level security',
  'to authenticated',
  'actor_user_mismatch',
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
console.log('check-kenos-phase1 — OK')
