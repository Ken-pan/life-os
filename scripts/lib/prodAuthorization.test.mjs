import assert from 'node:assert/strict'
import { evaluateAuthorization, MAX_TTL_MS, OPERATION_CLASSES } from './prodAuthorization.mjs'

const T0 = Date.parse('2026-07-22T20:00:00Z')
function iso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') }

function validArtifact(over = {}) {
  return {
    authorizationId: 'auth-12345678',
    owner: 'owner@example.com',
    environment: 'production',
    project: 'iueozzuctstwvzbcxcyh',
    operations: ['apply_migration'],
    issuedAt: iso(T0),
    expiresAt: iso(T0 + 30 * 60000),
    maxExecutions: 2,
    approvingMessage: 'milestone G-test',
    ...over,
  }
}
const base = { nowMs: T0 + 60000, requestedOperation: 'apply_migration', requestedProject: 'iueozzuctstwvzbcxcyh', priorUsage: 0 }

// --- allow ---
const ok = evaluateAuthorization({ artifact: validArtifact(), ...base })
assert.equal(ok.ok, true)
assert.equal(ok.remaining, 1)

// --- default deny: missing / malformed ---
assert.equal(evaluateAuthorization({ artifact: null, ...base }).reason, 'missing_or_malformed')
assert.equal(evaluateAuthorization({ artifact: 'nope', ...base }).ok, false)
assert.equal(evaluateAuthorization({ artifact: validArtifact({ authorizationId: 'x' }), ...base }).reason, 'malformed_authorization_id')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ owner: '' }), ...base }).reason, 'malformed_owner')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ operations: [] }), ...base }).reason, 'malformed_operations')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ operations: ['hack'] }), ...base }).reason, 'unknown_operation_class')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ approvingMessage: '' }), ...base }).reason, 'missing_approving_reference')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ issuedAt: 'bad' }), ...base }).reason, 'malformed_timestamps')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ maxExecutions: 0 }), ...base }).reason, 'malformed_max_executions')

// --- deny: wrong environment ---
assert.equal(evaluateAuthorization({ artifact: validArtifact({ environment: 'staging' }), ...base }).reason, 'not_production_environment')

// --- deny: wrong project ---
assert.match(evaluateAuthorization({ artifact: validArtifact(), ...base, requestedProject: 'other' }).reason, /project_mismatch/)

// --- deny: wrong operation ---
assert.match(evaluateAuthorization({ artifact: validArtifact(), ...base, requestedOperation: 'prod_deploy' }).reason, /operation_not_authorized/)

// --- deny: expired ---
assert.equal(evaluateAuthorization({ artifact: validArtifact(), ...base, nowMs: T0 + 31 * 60000 }).reason, 'expired')
// --- deny: not yet valid ---
assert.equal(evaluateAuthorization({ artifact: validArtifact(), ...base, nowMs: T0 - 1000 }).reason, 'not_yet_valid')

// --- deny: exhausted (non-reusable) ---
assert.equal(evaluateAuthorization({ artifact: validArtifact({ maxExecutions: 2 }), ...base, priorUsage: 2 }).reason, 'executions_exhausted')
assert.equal(evaluateAuthorization({ artifact: validArtifact({ maxExecutions: 2 }), ...base, priorUsage: 1 }).ok, true)

// --- deny: TTL exceeds hard cap (no long-lived standing bypass) ---
assert.equal(
  evaluateAuthorization({ artifact: validArtifact({ expiresAt: iso(T0 + MAX_TTL_MS + 60000) }), ...base }).reason,
  'ttl_exceeds_max',
)
// exactly at the cap is allowed
assert.equal(evaluateAuthorization({ artifact: validArtifact({ expiresAt: iso(T0 + MAX_TTL_MS) }), ...base }).ok, true)

// --- deny: expiry not after issue ---
assert.equal(evaluateAuthorization({ artifact: validArtifact({ expiresAt: iso(T0 - 1000) }), ...base }).reason, 'expiry_not_after_issue')

// operation classes are a closed set (no wildcard)
assert.ok(!OPERATION_CLASSES.includes('*'))

console.log('prodAuthorization.test.mjs OK')
