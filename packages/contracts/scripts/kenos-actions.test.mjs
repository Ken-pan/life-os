import assert from 'node:assert/strict'
import {
  ACTION_REGISTRY,
  CANARY_ACTION_TYPES,
  LIFE_EVENT_TYPE_BY_ACTION,
  RETRY_SCHEDULE_MS,
  RISK_LEVELS,
  canonicalParametersJson,
  getAction,
  policyDecision,
  resolveEffectiveRisk,
  retryDelayMs,
} from '../src/kenos-actions.mjs'

// Every action declares the full required contract.
const REQUIRED = [
  'actionType', 'canonicalOwner', 'executor', 'riskLevel', 'reversible',
  'idempotencyStrategy', 'approvalPolicy', 'activityType',
  'outboxRequirement', 'timeoutMs', 'retryPolicy',
]
for (const [key, def] of Object.entries(ACTION_REGISTRY)) {
  assert.equal(def.actionType, key, `${key} actionType mismatch`)
  for (const field of REQUIRED) {
    assert.notEqual(def[field], undefined, `${key} missing ${field}`)
  }
  assert.ok(RISK_LEVELS.includes(def.riskLevel), `${key} invalid risk`)
  assert.ok(Object.isFrozen(def), `${key} must be frozen`)
  assert.match(key, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, `${key} invalid action_type format`)
}

// Registry size covers the canary requirement (>= 20 registered actions).
assert.ok(Object.keys(ACTION_REGISTRY).length >= 20,
  `registry has ${Object.keys(ACTION_REGISTRY).length} actions, expected >= 20`)

// Canary set: every canary type exists, is not frozen, and maps to a life event.
for (const type of CANARY_ACTION_TYPES) {
  const def = getAction(type)
  assert.ok(def, `canary ${type} not in registry`)
  assert.ok(!def.frozen, `canary ${type} must not be frozen`)
  assert.ok(LIFE_EVENT_TYPE_BY_ACTION[type], `canary ${type} missing life event mapping`)
  assert.match(LIFE_EVENT_TYPE_BY_ACTION[type], /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
}

// Risk floor: the model can raise but never lower a risk level.
assert.equal(resolveEffectiveRisk('plan.create_task', 'R0'), 'R1')
assert.equal(resolveEffectiveRisk('plan.create_task', 'R3'), 'R3')
assert.equal(resolveEffectiveRisk('plan.create_task', null), 'R1')
assert.equal(resolveEffectiveRisk('nope.nope', 'R0'), null)

// Policy matrix.
assert.equal(policyDecision('plan.create_task').mode, 'auto')
assert.equal(policyDecision('outbox.dead_letter').mode, 'confirm_diff')
assert.equal(policyDecision('plan.create_task', { requestedRisk: 'R3' }).mode, 'approval_required')
assert.equal(policyDecision('unknown.action').mode, 'deny')
// Frozen Work actions must be denied — no second project source of truth.
assert.equal(policyDecision('work.create_project').mode, 'deny')
assert.equal(policyDecision('work.archive_project').mode, 'deny')

// R2/R3 actions must not be auto-approved by declaration.
for (const def of Object.values(ACTION_REGISTRY)) {
  if (def.riskLevel === 'R2') assert.notEqual(def.approvalPolicy, 'auto', `${def.actionType} R2 cannot be auto`)
  if (def.riskLevel === 'R3') assert.equal(def.approvalPolicy, 'per_item_approval', `${def.actionType} R3 needs per-item approval`)
}

// Canonical parameter JSON is key-order independent and array-order preserving.
assert.equal(
  canonicalParametersJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } }),
  canonicalParametersJson({ a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 }),
)
assert.notEqual(
  canonicalParametersJson({ a: [1, 2] }),
  canonicalParametersJson({ a: [2, 1] }),
)
assert.equal(canonicalParametersJson(undefined), 'null')

// Retry schedule is exactly 30s / 2m / 10m / 1h / 6h and clamps.
assert.deepEqual([...RETRY_SCHEDULE_MS], [30_000, 120_000, 600_000, 3_600_000, 21_600_000])
assert.equal(retryDelayMs(1), 30_000)
assert.equal(retryDelayMs(5), 21_600_000)
assert.equal(retryDelayMs(99), 21_600_000)
assert.equal(retryDelayMs(0), 30_000)

console.log('kenos-actions.test.mjs OK')
