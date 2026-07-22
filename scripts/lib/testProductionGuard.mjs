// Test → production write guard (planner provenance protections).
//
// Root cause this module addresses: QA/E2E harnesses (Continuity, iOS daily-beta,
// FA/RPC seeders) authenticated AS the Owner against the *production* Supabase and
// wrote `planner_tasks` via raw service_role upsert — no provenance, no teardown —
// so test rows became indistinguishable from real tasks and accumulated as overdue
// clutter on the Owner account.
//
// Design goals (all default-DENY / fail-closed for production):
//   1. Production is denied by default for test writes; opt-in requires BOTH an env
//      flag AND a valid scoped G2 authorization artifact (reused from prodAuthorization).
//   2. Every test-created task must carry explicit, auto-expiring provenance.
//   3. Cleanup selectors may never be title-only, and must never touch a governed
//      row that lacks test provenance (i.e. real Owner tasks are structurally safe).
//   4. Teardown leakage is a hard, visible failure — not a silent pass.
//
// The core functions are pure (all inputs explicit, no fs/clock/network), so they are
// fully unit-testable. Thin side-effecting wrappers at the bottom compose them with
// the real filesystem/clock and the existing G2 gate.

import { evaluateAuthorization, readArtifact, readUsage } from './prodAuthorization.mjs'

// Known production project refs. Add refs here as new prod projects appear; there is
// deliberately no wildcard and no "assume non-prod" fallback for unknown-but-hosted refs.
export const PRODUCTION_REFS = Object.freeze(['iueozzuctstwvzbcxcyh'])

// Env flag a harness must set to even *attempt* a production target. Necessary but not
// sufficient — a valid G2 authorization is still required (see evaluateTestWriteGuard).
export const PROD_TEST_ENV_FLAG = 'KENOS_PROD_TEST_AUTHORIZED'

// Hard ceiling on how long a test-provenance canary task may live before the nightly
// sweep is entitled to archive it, regardless of any longer ttl a caller passes.
export const MAX_TEST_TASK_TTL_MS = 24 * 60 * 60 * 1000 // 24h

/**
 * Extract a Supabase project ref from a project ref or a project URL.
 * Returns null when nothing ref-shaped is present.
 * @param {{ ref?: string, url?: string }} p
 */
export function resolveRef({ ref, url } = {}) {
  if (typeof ref === 'string' && ref.trim()) return ref.trim()
  if (typeof url === 'string') {
    const m = url.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/i)
    if (m) return m[1]
  }
  return null
}

/**
 * Pure: is this target a known production project?
 * @param {{ ref?: string, url?: string }} p
 */
export function isProductionTarget(p = {}) {
  const ref = resolveRef(p)
  return ref != null && PRODUCTION_REFS.includes(ref)
}

/**
 * Pure decision for whether a TEST harness may write to the given target.
 * Non-production targets are always allowed. Production requires BOTH the env flag
 * AND a valid, in-scope G2 authorization for the `service_role_rpc_write` class.
 *
 * @param {object} p
 * @param {{ref?:string,url?:string}} p.target
 * @param {Record<string,string|undefined>} p.env       process.env (or a stub)
 * @param {any} p.authorization                          parsed G2 artifact (or null)
 * @param {number} p.priorUsage                          prior consumption of that authorizationId
 * @param {number} p.nowMs
 * @returns {{ok:boolean, reason:string, target:'production'|'non_production'}}
 */
export function evaluateTestWriteGuard({ target, env = {}, authorization = null, priorUsage = 0, nowMs }) {
  if (!isProductionTarget(target)) return { ok: true, reason: 'non_production_target', target: 'non_production' }

  // Production from here down — default DENY.
  if (env[PROD_TEST_ENV_FLAG] !== '1') {
    return { ok: false, reason: 'prod_test_env_flag_not_set', target: 'production' }
  }
  const ref = resolveRef(target)
  const decision = evaluateAuthorization({
    artifact: authorization,
    nowMs,
    requestedOperation: 'service_role_rpc_write',
    requestedProject: ref,
    priorUsage,
  })
  if (!decision.ok) return { ok: false, reason: `authorization_denied:${decision.reason}`, target: 'production' }
  return { ok: true, reason: 'authorized_production_test', target: 'production' }
}

/**
 * Pure: build the provenance stamp every test-created task must carry.
 * Throws on missing harness/runId so a harness cannot silently create unstamped rows.
 * @param {object} p
 * @param {string} p.harness   stable harness id, e.g. 'kenos-space-continuity'
 * @param {string} p.runId     unique per-invocation id
 * @param {number} p.nowMs
 * @param {number} [p.ttlMs]   time-to-live before the sweep may archive (capped at MAX_TEST_TASK_TTL_MS)
 */
export function buildTestProvenance({ harness, runId, nowMs, ttlMs = MAX_TEST_TASK_TTL_MS }) {
  if (typeof harness !== 'string' || harness.trim().length < 3) throw new Error('buildTestProvenance: harness required')
  if (typeof runId !== 'string' || runId.trim().length < 3) throw new Error('buildTestProvenance: runId required')
  if (!Number.isFinite(nowMs)) throw new Error('buildTestProvenance: nowMs required')
  const ttl = Math.min(Math.max(1, ttlMs | 0), MAX_TEST_TASK_TTL_MS)
  return Object.freeze({
    test: true,
    harness: harness.trim(),
    runId: runId.trim(),
    source: 'qa_harness',
    createdAt: nowMs,
    expiresAt: nowMs + ttl,
  })
}

/**
 * Pure: does a task's `meta` carry a valid test-provenance stamp?
 * @param {any} meta
 */
export function hasTestProvenance(meta) {
  const p = meta && typeof meta === 'object' ? meta.provenance : undefined
  return !!(p && p.test === true && typeof p.harness === 'string' && typeof p.runId === 'string' && Number.isFinite(p.expiresAt))
}

/**
 * Pure: assert a task object destined for a PRODUCTION test write is properly stamped.
 * Non-production writes are exempt (caller passes target). Throws otherwise.
 * @param {object} p
 * @param {{data?:{meta?:any},meta?:any}} p.task   accepts either the task or its `data`
 * @param {{ref?:string,url?:string}} p.target
 */
export function assertProvenanceStamped({ task, target }) {
  if (!isProductionTarget(target)) return
  const meta = task?.data?.meta ?? task?.meta
  if (!hasTestProvenance(meta)) {
    throw new Error('assertProvenanceStamped: production test task missing meta.provenance {test,harness,runId,expiresAt}')
  }
}

/**
 * Pure: partition already-fetched rows into what a test-cleanup may delete vs. must
 * protect. A row is deletable ONLY if it carries this run's test provenance OR matches
 * an allowlisted harness id-prefix. A governed/organic row without test provenance is
 * always protected — so ordinary Owner tasks can never be swept by test cleanup, even
 * if a title happens to collide.
 *
 * @param {object} p
 * @param {Array<{id:string, meta?:any, inLedger?:boolean}>} p.rows
 * @param {string} p.runId                        only this run's rows are eligible
 * @param {string[]} [p.idPrefixAllowlist]        e.g. ['kenos-cont-','ios-']
 * @returns {{deletable:Array, protected:Array, reasons:Record<string,string>}}
 */
export function partitionCleanupTargets({ rows = [], runId, idPrefixAllowlist = [] }) {
  const deletable = []
  const kept = []
  const reasons = {}
  for (const row of rows) {
    const prov = row?.meta?.provenance
    const provMatchesRun = hasTestProvenance(row?.meta) && prov.runId === runId
    const prefixMatch = idPrefixAllowlist.some((pre) => typeof row.id === 'string' && row.id.startsWith(pre))
    if (row.inLedger && !hasTestProvenance(row?.meta)) {
      kept.push(row); reasons[row.id] = 'protected_governed_without_test_provenance'; continue
    }
    if (provMatchesRun) { deletable.push(row); reasons[row.id] = 'test_provenance_run_match'; continue }
    // A stamp for a *different* run belongs to that run's teardown — never sweep it here.
    if (hasTestProvenance(row?.meta)) { kept.push(row); reasons[row.id] = 'protected_other_run_provenance'; continue }
    // id-prefix fallback is only for legacy rows carrying no provenance at all.
    if (prefixMatch && !row.inLedger) { deletable.push(row); reasons[row.id] = 'allowlisted_id_prefix'; continue }
    kept.push(row); reasons[row.id] = 'protected_no_test_signal'
  }
  return { deletable, protected: kept, reasons }
}

/**
 * Pure: guard against title-only cleanup selectors. A selector descriptor must anchor
 * on at least one stable, provenance-bearing dimension (runId / provenance / id-prefix).
 * @param {{byTitle?:boolean, byRunId?:boolean, byProvenance?:boolean, byIdPrefix?:boolean}} descriptor
 */
export function isTitleOnlySelector(descriptor = {}) {
  const anchored = !!(descriptor.byRunId || descriptor.byProvenance || descriptor.byIdPrefix)
  return !!descriptor.byTitle && !anchored
}

/**
 * Pure: evaluate teardown completeness. `remaining` are rows still present after a
 * harness ran its own cleanup, already filtered to this run's provenance/prefix.
 * @param {object} p
 * @param {Array<{id:string}>} p.remaining
 * @returns {{clean:boolean, leaked:string[]}}
 */
export function evaluateTeardown({ remaining = [] } = {}) {
  const leaked = remaining.map((r) => r.id)
  return { clean: leaked.length === 0, leaked }
}

// ---------------------------------------------------------------------------
// Side-effecting wrappers (compose the pure core with real env / fs / clock).
// ---------------------------------------------------------------------------

/**
 * Throw unless this test process is allowed to write to `target`. Call this before a
 * harness constructs any service_role/anon client that will mutate production tables.
 * @param {{ref?:string,url?:string}} target
 * @param {{env?:object, now?:()=>number}} [opts]
 */
export function assertTestWriteAllowed(target, { env = process.env, now = Date.now } = {}) {
  const nowMs = now()
  let authorization = null
  let priorUsage = 0
  if (isProductionTarget(target) && env[PROD_TEST_ENV_FLAG] === '1') {
    authorization = readArtifact()
    if (authorization?.authorizationId) priorUsage = readUsage(authorization.authorizationId)
  }
  const decision = evaluateTestWriteGuard({ target, env, authorization, priorUsage, nowMs })
  if (!decision.ok) {
    throw new Error(
      `Refusing test write to ${decision.target} target (${resolveRef(target)}): ${decision.reason}. ` +
        `Point the harness at a local Supabase or a dedicated test user, or obtain a scoped G2 ` +
        `authorization and set ${PROD_TEST_ENV_FLAG}=1.`,
    )
  }
  return decision
}

/**
 * Hard, visible teardown assertion. `remaining` should be the harness's own re-query of
 * its run rows after cleanup. Throws (non-zero exit for the harness) when anything leaked.
 * @param {{remaining:Array<{id:string}>, runId:string}} p
 */
export function assertTeardownClean({ remaining, runId }) {
  const { clean, leaked } = evaluateTeardown({ remaining })
  if (!clean) {
    throw new Error(`Teardown leak for run ${runId}: ${leaked.length} test row(s) survived cleanup: ${leaked.join(', ')}`)
  }
}
