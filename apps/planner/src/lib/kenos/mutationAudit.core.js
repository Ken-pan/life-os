/**
 * Compatibility mutation audit helpers — classify Legacy vs Kenos writes.
 * Used by tests (and optional canary console probes) to prove no dual-write.
 */

import {
  KENOS_MUTATION_TABLE_DENYLIST,
  KENOS_WRITE_RPC_DENYLIST,
} from './prodWriteGuard.core.js'

export const LEGACY_MUTATION_TABLES = Object.freeze([
  'planner_tasks',
  'planner_lists',
  'planner_projects',
  'planner_attachments',
  'planner_user_state',
])

/**
 * @typedef {{ kind: 'rpc'|'from', name: string, op?: string }} MutationCall
 */

/**
 * @param {MutationCall[]} calls
 */
export function summarizeMutationCalls(calls) {
  const legacy = []
  const kenos = []
  const other = []
  for (const call of calls) {
    if (call.kind === 'rpc') {
      if (KENOS_WRITE_RPC_DENYLIST.includes(call.name)) kenos.push(call)
      else other.push(call)
      continue
    }
    if (LEGACY_MUTATION_TABLES.includes(call.name)) legacy.push(call)
    else if (KENOS_MUTATION_TABLE_DENYLIST.includes(call.name)) kenos.push(call)
    else other.push(call)
  }
  return {
    legacyCount: legacy.length,
    kenosCount: kenos.length,
    otherCount: other.length,
    legacy,
    kenos,
    other,
  }
}

/**
 * Create → sync must produce Legacy mutations only.
 * @param {MutationCall[]} calls
 * @param {{ minLegacy?: number }} [opts]
 */
export function assertNoKenosDoubleWrite(calls, opts = {}) {
  const summary = summarizeMutationCalls(calls)
  const minLegacy = opts.minLegacy ?? 1
  if (summary.kenosCount !== 0) {
    return {
      ok: false,
      code: 'KENOS_DOUBLE_WRITE',
      message: `Unexpected Kenos mutations: ${summary.kenos.map((c) => c.name).join(', ')}`,
      summary,
    }
  }
  if (summary.legacyCount < minLegacy) {
    return {
      ok: false,
      code: 'MISSING_LEGACY_MUTATION',
      message: `Expected ≥${minLegacy} legacy mutations, got ${summary.legacyCount}`,
      summary,
    }
  }
  return { ok: true, summary }
}
