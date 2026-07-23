/**
 * Kenos Plan Activity read — canonical `kenos_plan_activity` rows via the
 * production `kenos_list_plan_activity` RPC (security invoker + own-rows).
 *
 * Read projection only: Activity append stays inside the Plan command RPCs.
 * Flag default Off (`VITE_KENOS_PROD_READ_PLAN_ACTIVITY`); when On the records
 * are merged with the legacy `life_events` compat feed — since 2026-07-22 the
 * outbox canary worker DOES deliver actions onto life_events, so the
 * correlation-based dedupe in the merge is load-bearing (one action must not
 * double-render from activity + delivered event).
 */

import { isProdPlanActivityReadEnabled } from './prodReadFlags.core.js'
import { classifyReadError, sourceState } from './readProjections.core.js'

export { isProdPlanActivityReadEnabled }

export const CANONICAL_PLAN_ACTIVITY_READ_SOURCE = 'public.kenos_list_plan_activity'

const PLAN_DEEP_LINK = 'https://plan.kenos.space/inbox'
const KNOWN_RESULTS = Object.freeze({
  succeeded: 'succeeded',
  failed: 'failed',
  pending: 'queued',
  queued: 'queued',
})
const RISK_LEVELS = new Set(['R0', 'R1', 'R2', 'R3', 'R4'])

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function record(row) {
  const id = text(row?.id)
  const occurredAt = text(row?.created_at)
  const actionType = text(row?.action_type, 'plan.unknown_action')
  const status = KNOWN_RESULTS[text(row?.result)] ?? 'unknown'
  const policyRisk = text(row?.policy?.risk).toUpperCase()
  const entityRef =
    row?.entity_ref && typeof row.entity_ref === 'object' && !Array.isArray(row.entity_ref)
      ? row.entity_ref
      : null
  const entityType = text(entityRef?.type)
  const entityId = text(entityRef?.id)
  return {
    id: `kenos_plan_activity:${id || `${actionType}:${occurredAt}`}`,
    correlationId: text(row?.correlation_id) || null,
    actor: { type: text(row?.actor_type, 'user'), id: 'plan-command' },
    ownerDomain: 'plan',
    actionType,
    safeSummary: text(row?.summary, 'Plan 记录了一次已授权的任务操作。'),
    status,
    result: status,
    resultDetail:
      status === 'failed'
        ? 'Plan 命令执行失败；错误详情保留在 Owner 域,未复制敏感 payload。'
        : status === 'queued'
          ? '命令已受理,仍在 Plan 处理队列中。'
          : status === 'succeeded'
            ? 'Plan 命令已原子完成(任务 + Outbox + Activity)。'
            : '来源返回了未知的结果状态;按只读展示,不做推断。',
    risk: RISK_LEVELS.has(policyRisk) ? policyRisk : 'R1',
    approvalReference: null,
    entityReference: entityType && entityId ? `${entityType}:${entityId}` : null,
    occurredAt: occurredAt || null,
    undoAvailable: false,
    classification: 'personal',
    sourceAvailable: Boolean(id && occurredAt),
    deepLink: PLAN_DEEP_LINK,
  }
}

/**
 * Project raw RPC rows into Assistant activity records (same shape as
 * `projectActivityEvents` records).
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ limit?: number }} [options]
 */
export function projectPlanActivityRows(rows = [], { limit = 100 } = {}) {
  const records = []
  const seen = new Set()
  let malformedCount = 0
  let duplicateCount = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      malformedCount += 1
      continue
    }
    const projected = record(row)
    if (!projected.sourceAvailable) malformedCount += 1
    if (seen.has(projected.id)) {
      duplicateCount += 1
      continue
    }
    seen.add(projected.id)
    records.push(projected)
  }
  records.sort((a, b) => (Date.parse(b.occurredAt ?? '') || 0) - (Date.parse(a.occurredAt ?? '') || 0))
  const truncatedCount = Math.max(0, records.length - limit)
  return { records: records.slice(0, limit), malformedCount, duplicateCount, truncatedCount }
}

/**
 * Merge canonical Plan activity with the legacy life_events compat feed.
 * Dedupe key: correlationId (both sides carry it when the same action is
 * mirrored), falling back to record id. Newest first, truncated to limit.
 * @param {Array<Record<string, unknown>>} legacyRecords
 * @param {Array<Record<string, unknown>>} kenosRecords
 * @param {{ limit?: number }} [options]
 */
export function mergeActivityRecords(legacyRecords = [], kenosRecords = [], { limit = 100 } = {}) {
  const merged = []
  const seenIds = new Set()
  const seenCorrelations = new Set()
  let duplicateCount = 0
  // Canonical Kenos records win the dedupe race over legacy mirrors.
  for (const item of [...kenosRecords, ...legacyRecords]) {
    if (!item || typeof item !== 'object') continue
    const correlation = typeof item.correlationId === 'string' && item.correlationId ? item.correlationId : null
    if (seenIds.has(item.id) || (correlation && seenCorrelations.has(correlation))) {
      duplicateCount += 1
      continue
    }
    seenIds.add(item.id)
    if (correlation) seenCorrelations.add(correlation)
    merged.push(item)
  }
  merged.sort((a, b) => (Date.parse(b.occurredAt ?? '') || 0) - (Date.parse(a.occurredAt ?? '') || 0))
  return { records: merged.slice(0, limit), duplicateCount, truncatedCount: Math.max(0, merged.length - limit) }
}

/**
 * Read canonical Plan activity rows. Fail-closed: any error returns an empty
 * result with a classified state — callers keep the legacy feed usable.
 * @param {{ client: any, authorized?: boolean, online?: boolean, limit?: number }} opts
 */
export async function readPlanActivitySource({ client, authorized = true, online = true, limit = 100 } = {}) {
  if (!authorized) {
    return {
      items: [],
      state: sourceState(online ? 'permission_denied' : 'offline', {
        source: CANONICAL_PLAN_ACTIVITY_READ_SOURCE,
        message: online ? '登录后才能读取 Plan Activity。' : '设备离线;恢复后可重试。',
        retryable: !online,
      }),
    }
  }
  if (!client) {
    return {
      items: [],
      state: sourceState('unavailable', {
        source: CANONICAL_PLAN_ACTIVITY_READ_SOURCE,
        message: 'Plan Activity 读取未配置。',
      }),
    }
  }
  try {
    const { data, error } = await client.rpc('kenos_list_plan_activity', { p_limit: limit })
    if (error) throw error
    const projected = projectPlanActivityRows(data ?? [], { limit })
    const status = projected.records.length
      ? projected.malformedCount
        ? 'partial'
        : 'ready'
      : 'empty'
    return {
      items: projected.records,
      state: sourceState(status, {
        source: CANONICAL_PLAN_ACTIVITY_READ_SOURCE,
        lastUpdated: projected.records[0]?.occurredAt,
        retryable: true,
        availableCount: projected.records.length,
        malformedCount: projected.malformedCount,
        duplicateCount: projected.duplicateCount,
      }),
      ...projected,
    }
  } catch (error) {
    return {
      items: [],
      state: classifyReadError(error, { online, source: CANONICAL_PLAN_ACTIVITY_READ_SOURCE }),
    }
  }
}
