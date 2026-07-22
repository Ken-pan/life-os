import assert from 'node:assert/strict'
import { evaluateOwnerCanary, isProhibitedCanaryAction } from '../src/kenos-owner-canary.mjs'

const OWNER = 'c2831538-94b0-4a57-b034-5e873a53c42e'
const OTHER = '8febdb83-ec49-467d-a9bf-d42620cc68fe'
const T0 = Date.parse('2026-07-22T20:00:00Z')

function canaryRow(over = {}) {
  return {
    owner_id: OWNER,
    environment: 'production',
    allowed_action_types: ['project.set_context', 'project.link_object', 'plan.create_task'],
    allowed_rpcs: ['kenos_project_spine_action', 'kenos_create_plan_task_action'],
    starts_at: '2026-07-22T19:00:00Z',
    expires_at: '2026-07-25T19:00:00Z',
    disabled: false,
    ...over,
  }
}
const req = { authUid: OWNER, actionType: 'project.set_context', rpc: 'kenos_project_spine_action', nowMs: T0 }

// --- allow: owner, active window, allowlisted action + rpc ---
assert.deepEqual(evaluateOwnerCanary({ ...req, canaryRows: [canaryRow()] }), { ok: true, reason: 'authorized' })

// --- deny by default: no rows ---
assert.equal(evaluateOwnerCanary({ ...req, canaryRows: [] }).reason, 'no_canary_for_owner')

// --- SECOND authenticated user is rejected (only owner's own rows count) ---
assert.equal(
  evaluateOwnerCanary({ ...req, authUid: OTHER, canaryRows: [canaryRow()] }).reason,
  'no_canary_for_owner',
  'a different authenticated user must not inherit the owner canary',
)
// even if the other user somehow has a row for the OWNER (RLS would hide it, but prove logic):
assert.equal(
  evaluateOwnerCanary({ ...req, authUid: OTHER, canaryRows: [canaryRow({ owner_id: OWNER })] }).reason,
  'no_canary_for_owner',
)

// --- unauthenticated ---
assert.equal(evaluateOwnerCanary({ ...req, authUid: null, canaryRows: [canaryRow()] }).reason, 'not_authenticated')

// --- disabled (emergency stop) ---
assert.equal(evaluateOwnerCanary({ ...req, canaryRows: [canaryRow({ disabled: true })] }).reason, 'no_active_window_or_disabled')

// --- outside time window ---
assert.equal(evaluateOwnerCanary({ ...req, nowMs: Date.parse('2026-07-26T00:00:00Z'), canaryRows: [canaryRow()] }).reason, 'no_active_window_or_disabled')
assert.equal(evaluateOwnerCanary({ ...req, nowMs: Date.parse('2026-07-22T18:00:00Z'), canaryRows: [canaryRow()] }).reason, 'no_active_window_or_disabled')

// --- action not allowlisted ---
assert.equal(evaluateOwnerCanary({ ...req, actionType: 'plan.archive_task', canaryRows: [canaryRow()] }).reason, 'action_or_rpc_not_allowlisted')
// --- rpc not allowlisted ---
assert.equal(evaluateOwnerCanary({ ...req, rpc: 'some_other_rpc', canaryRows: [canaryRow()] }).reason, 'action_or_rpc_not_allowlisted')

// --- non-production environment row is inert ---
assert.equal(evaluateOwnerCanary({ ...req, canaryRows: [canaryRow({ environment: 'staging' })] }).reason, 'no_active_window_or_disabled')

// --- prohibited classes rejected even if allowlisted ---
for (const bad of ['work.create_project', 'email.send', 'calendar.create', 'connector.push', 'native.run_applescript', 'plan.bulk_delete', 'url.fetch', 'http.post', 'tasks.delete_all']) {
  assert.equal(isProhibitedCanaryAction(bad), true, `${bad} must be prohibited`)
  const row = canaryRow({ allowed_action_types: [bad], allowed_rpcs: ['kenos_project_spine_action'] })
  assert.equal(
    evaluateOwnerCanary({ ...req, actionType: bad, canaryRows: [row] }).reason,
    'prohibited_action_class',
    `${bad} must be denied even when allowlisted`,
  )
}
// allowed classes are not prohibited
for (const good of ['project.set_context', 'plan.create_task', 'plan.complete_task']) {
  assert.equal(isProhibitedCanaryAction(good), false)
}

console.log('kenos-owner-canary.test.mjs OK')
