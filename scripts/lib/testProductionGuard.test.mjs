import assert from 'node:assert/strict'
import {
  PRODUCTION_REFS,
  PROD_TEST_ENV_FLAG,
  MAX_TEST_TASK_TTL_MS,
  resolveRef,
  isProductionTarget,
  evaluateTestWriteGuard,
  buildTestProvenance,
  hasTestProvenance,
  assertProvenanceStamped,
  partitionCleanupTargets,
  isTitleOnlySelector,
  evaluateTeardown,
} from './testProductionGuard.mjs'

const PROD = PRODUCTION_REFS[0]
const T0 = Date.parse('2026-07-22T20:00:00Z')
function iso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') }

// A structurally valid G2 authorization for service_role_rpc_write.
function validAuth(over = {}) {
  return {
    authorizationId: 'auth-12345678',
    owner: 'owner@example.com',
    environment: 'production',
    project: PROD,
    operations: ['service_role_rpc_write'],
    issuedAt: iso(T0),
    expiresAt: iso(T0 + 30 * 60000),
    maxExecutions: 2,
    approvingMessage: 'planner test canary',
    ...over,
  }
}

// --- resolveRef / isProductionTarget ---
assert.equal(resolveRef({ ref: PROD }), PROD)
assert.equal(resolveRef({ url: `https://${PROD}.supabase.co` }), PROD)
assert.equal(resolveRef({ url: 'http://127.0.0.1:54321' }), null)
assert.equal(resolveRef({}), null)
assert.equal(isProductionTarget({ ref: PROD }), true)
assert.equal(isProductionTarget({ url: `https://${PROD}.supabase.co/rest/v1` }), true)
assert.equal(isProductionTarget({ url: 'http://localhost:54321' }), false)
assert.equal(isProductionTarget({ ref: 'localdevref0000000000' }), false)

// --- evaluateTestWriteGuard: non-prod always allowed ---
assert.equal(evaluateTestWriteGuard({ target: { url: 'http://localhost:54321' }, env: {}, nowMs: T0 }).ok, true)
assert.equal(evaluateTestWriteGuard({ target: { ref: 'somelocalref00000000' }, env: {}, nowMs: T0 }).target, 'non_production')

// --- evaluateTestWriteGuard: prod default-deny ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: {}, nowMs: T0 })
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'prod_test_env_flag_not_set')
  assert.equal(d.target, 'production')
}

// --- prod: env flag set but NO authorization → deny ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: { [PROD_TEST_ENV_FLAG]: '1' }, authorization: null, nowMs: T0 + 60000 })
  assert.equal(d.ok, false)
  assert.match(d.reason, /^authorization_denied:/)
}

// --- prod: env flag + valid authorization → allow ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: { [PROD_TEST_ENV_FLAG]: '1' }, authorization: validAuth(), priorUsage: 0, nowMs: T0 + 60000 })
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'authorized_production_test')
}

// --- prod: valid authorization but for the WRONG operation class → deny ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: { [PROD_TEST_ENV_FLAG]: '1' }, authorization: validAuth({ operations: ['apply_migration'] }), nowMs: T0 + 60000 })
  assert.equal(d.ok, false)
  assert.match(d.reason, /operation_not_authorized/)
}

// --- prod: authorization exhausted → deny ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: { [PROD_TEST_ENV_FLAG]: '1' }, authorization: validAuth({ maxExecutions: 1 }), priorUsage: 1, nowMs: T0 + 60000 })
  assert.equal(d.ok, false)
  assert.match(d.reason, /executions_exhausted/)
}

// --- prod: expired authorization → deny (auto-expiring canary) ---
{
  const d = evaluateTestWriteGuard({ target: { ref: PROD }, env: { [PROD_TEST_ENV_FLAG]: '1' }, authorization: validAuth(), nowMs: T0 + 40 * 60000 })
  assert.equal(d.ok, false)
  assert.match(d.reason, /expired/)
}

// --- buildTestProvenance ---
{
  const p = buildTestProvenance({ harness: 'kenos-space-continuity', runId: 'run-abc123', nowMs: T0 })
  assert.equal(p.test, true)
  assert.equal(p.harness, 'kenos-space-continuity')
  assert.equal(p.runId, 'run-abc123')
  assert.equal(p.expiresAt, T0 + MAX_TEST_TASK_TTL_MS)
  assert.equal(hasTestProvenance({ provenance: p }), true)
  // ttl is capped
  const capped = buildTestProvenance({ harness: 'h-x', runId: 'r-x', nowMs: T0, ttlMs: 999 * 24 * 60 * 60 * 1000 })
  assert.equal(capped.expiresAt, T0 + MAX_TEST_TASK_TTL_MS)
  // missing harness / runId throws
  assert.throws(() => buildTestProvenance({ runId: 'r', nowMs: T0 }), /harness required/)
  assert.throws(() => buildTestProvenance({ harness: 'kenos-x', nowMs: T0 }), /runId required/)
}

// --- hasTestProvenance rejects malformed ---
assert.equal(hasTestProvenance(null), false)
assert.equal(hasTestProvenance({ provenance: { test: true, harness: 'h' } }), false) // no runId/expiresAt
assert.equal(hasTestProvenance({ provenance: { test: false, harness: 'h', runId: 'r', expiresAt: 1 } }), false)

// --- assertProvenanceStamped ---
assert.doesNotThrow(() => assertProvenanceStamped({ task: { data: { meta: {} } }, target: { url: 'http://localhost:54321' } })) // non-prod exempt
assert.throws(
  () => assertProvenanceStamped({ task: { data: { meta: {} } }, target: { ref: PROD } }),
  /missing meta.provenance/,
)
assert.doesNotThrow(() =>
  assertProvenanceStamped({
    task: { data: { meta: { provenance: buildTestProvenance({ harness: 'h-x', runId: 'r-x', nowMs: T0 }) } } },
    target: { ref: PROD },
  }),
)

// --- partitionCleanupTargets: NEVER touch a governed/organic row lacking test provenance ---
{
  const runId = 'run-xyz'
  const stamped = { provenance: buildTestProvenance({ harness: 'harness-x', runId, nowMs: T0 }) }
  const otherRun = { provenance: buildTestProvenance({ harness: 'harness-x', runId: 'run-OTHER', nowMs: T0 }) }
  const rows = [
    { id: 'ios-ab-aaa', meta: stamped, inLedger: false },        // provenance run match → deletable
    { id: 'kenos-cont-bbb', meta: null, inLedger: false },       // allowlisted prefix, not governed → deletable
    { id: 'real-organic-1', meta: { kind: 'standard' }, inLedger: true }, // governed real task → PROTECTED
    { id: 'real-organic-2', meta: null, inLedger: false },       // no signal → PROTECTED
    { id: 'ios-ab-ccc', meta: otherRun, inLedger: false },       // different run's stamp → PROTECTED (not this run)
    { id: 'governed-but-stamped', meta: stamped, inLedger: true }, // governed AND this-run provenance → deletable
  ]
  const { deletable, protected: kept, reasons } = partitionCleanupTargets({ rows, runId, idPrefixAllowlist: ['kenos-cont-', 'ios-'] })
  const delIds = deletable.map((r) => r.id).sort()
  assert.deepEqual(delIds, ['governed-but-stamped', 'ios-ab-aaa', 'kenos-cont-bbb'])
  assert.ok(kept.some((r) => r.id === 'real-organic-1'))
  assert.ok(kept.some((r) => r.id === 'real-organic-2'))
  assert.ok(kept.some((r) => r.id === 'ios-ab-ccc'))
  assert.equal(reasons['real-organic-1'], 'protected_governed_without_test_provenance')
  assert.equal(reasons['ios-ab-ccc'], 'protected_other_run_provenance')
}

// --- isTitleOnlySelector: reject title-only cleanup ---
assert.equal(isTitleOnlySelector({ byTitle: true }), true)
assert.equal(isTitleOnlySelector({ byTitle: true, byRunId: true }), false)
assert.equal(isTitleOnlySelector({ byTitle: true, byProvenance: true }), false)
assert.equal(isTitleOnlySelector({ byTitle: true, byIdPrefix: true }), false)
assert.equal(isTitleOnlySelector({ byIdPrefix: true }), false)

// --- evaluateTeardown: leakage is a hard signal ---
assert.deepEqual(evaluateTeardown({ remaining: [] }), { clean: true, leaked: [] })
assert.deepEqual(evaluateTeardown({ remaining: [{ id: 'ios-ab-zzz' }] }), { clean: false, leaked: ['ios-ab-zzz'] })

console.log('testProductionGuard.test.mjs: all assertions passed')
