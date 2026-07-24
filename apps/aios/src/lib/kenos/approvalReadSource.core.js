import {
  classifyReadError,
  projectApprovalRows,
  sourceState,
} from './readProjections.core.js'

export const CANONICAL_APPROVAL_READ_SOURCE = 'public.kenos_list_action_approvals'

export async function readCanonicalApprovalSource({
  client,
  authorized = true,
  online = true,
  now = Date.now(),
} = {}) {
  if (!authorized) {
    return { items: [], state: sourceState('permission_denied', {
      source: CANONICAL_APPROVAL_READ_SOURCE,
      message: '登录 Korben 后才能读取你的 Approval。',
    }) }
  }
  if (!online) {
    return { items: [], state: sourceState('offline', {
      source: CANONICAL_APPROVAL_READ_SOURCE,
      message: '设备当前离线；保留已读取投影，联网后可安全重试。',
      retryable: true,
    }) }
  }
  try {
    const { data, error } = await client.rpc('kenos_list_action_approvals', { p_limit: 100, p_before: null })
    if (error) throw error
    const projected = projectApprovalRows(Array.isArray(data) ? data : [], { now })
    const stale = projected.approvals.some((item) => item.stale)
    const status = projected.malformedCount
      ? 'partial'
      : stale
        ? 'stale'
        : projected.approvals.length
          ? 'ready'
          : 'empty'
    const lastUpdated = projected.approvals
      .map((item) => item.lastUpdated)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    return {
      items: projected.approvals,
      state: sourceState(status, {
        source: CANONICAL_APPROVAL_READ_SOURCE,
        message: projected.malformedCount
          ? `${projected.malformedCount} 项格式无法安全展示；其余 Approval 仍可读。`
          : stale
            ? 'Approval projection 已超过 freshness 阈值；未执行任何动作。'
            : '',
        lastUpdated,
        stale,
        retryable: true,
        availableCount: projected.approvals.length,
        malformedCount: projected.malformedCount,
        duplicateCount: projected.duplicateCount,
      }),
      shadowItems: projected.approvals.map((item) => ({
        id: item.id,
        actionId: item.actionId,
        correlationId: item.correlationId,
        ownerDomain: item.ownerDomain,
        risk: item.risk,
        status: item.status,
        expiresAt: item.expiresAt,
        classification: item.classification,
        deepLink: item.deepLink,
        sourceFreshness: item.sourceFreshness,
        stale: item.stale,
      })),
    }
  } catch (error) {
    return { items: [], state: classifyReadError(error, {
      online,
      source: CANONICAL_APPROVAL_READ_SOURCE,
    }) }
  }
}
