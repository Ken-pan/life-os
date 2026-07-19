const DOMAIN_META = Object.freeze({
  plan: {
    label: 'Plan',
    href: 'https://planner.kenos.space/inbox',
    classification: 'personal',
  },
  money: {
    label: 'Money',
    href: 'https://finance.kenos.space/home/today',
    classification: 'sensitive',
  },
  training: {
    label: 'Training',
    href: 'https://fitness.kenos.space',
    classification: 'personal',
  },
  library: {
    label: 'Library',
    href: 'https://knowledge.kenos.space',
    classification: 'personal',
  },
  home: {
    label: 'Home',
    href: 'https://home.kenos.space',
    classification: 'personal',
  },
  music: {
    label: 'Music',
    href: 'https://music.kenos.space',
    classification: 'personal',
  },
  assistant: {
    label: 'Assistant',
    href: '/',
    classification: 'personal',
  },
  system: {
    label: 'System',
    href: null,
    classification: 'sensitive',
  },
})

const SENSITIVE_FIELD = /(token|secret|password|authorization|cookie|notes?|body|conversation|raw|amount)/i
const DEFAULT_STALE_AFTER_MS = 15 * 60_000
const INBOX_STALE_AFTER_MS = 24 * 60 * 60_000

function text(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 180) : fallback
}

function timestamp(value) {
  const parsed = Date.parse(typeof value === 'string' ? value : '')
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function stableHash(value) {
  let hash = 2166136261
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function sourceDomain(eventType) {
  const prefix = text(eventType).split('.')[0]
  return {
    planner: 'plan',
    plan: 'plan',
    core: 'plan',
    finance: 'money',
    money: 'money',
    fitness: 'training',
    training: 'training',
    knowledge: 'library',
    library: 'library',
    home: 'home',
    music: 'music',
  }[prefix] ?? 'system'
}

function canonicalReference(row) {
  const payload = row?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  for (const key of ['capture_id', 'occurrence_id', 'session_id', 'action_id', 'correlation_id']) {
    const value = text(payload[key])
    if (value) return `${text(row?.type, 'unknown')}:${key}:${value}`
  }
  return null
}

function isSensitivePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  return Object.keys(payload).some((key) => SENSITIVE_FIELD.test(key))
}

function eventPresentation(row) {
  const eventType = text(row?.type, 'unknown')
  const ownerDomain = sourceDomain(eventType)
  const meta = DOMAIN_META[ownerDomain] ?? DOMAIN_META.system
  const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : null

  if (eventType === 'core.task_captured') {
    return {
      ownerDomain,
      sourceType: 'capture',
      title: text(payload?.title, '一条待分类的 Plan 输入'),
      summary: payload?.due_date
        ? `目标日期 ${text(payload.due_date, '未指定')}`
        : '等待 Plan 领域处理',
      classification: 'personal',
      deepLink: meta.href,
      actionHints: ['open_owner'],
    }
  }

  if (eventType === 'finance.bill_due') {
    return {
      ownerDomain,
      sourceType: 'domain_event',
      title: 'Money 有一条到期账单待处理',
      summary: '金额与账户信息已在统一 Inbox 中隐藏',
      classification: 'sensitive',
      deepLink: meta.href,
      actionHints: ['open_owner'],
    }
  }

  if (eventType === 'fitness.workout_logged') {
    return {
      ownerDomain,
      sourceType: 'domain_event',
      title: 'Training 记录等待同步',
      summary: payload?.session_date
        ? `训练日期 ${text(payload.session_date)}`
        : '打开 Training 查看原始记录',
      classification: 'personal',
      deepLink: meta.href,
      actionHints: ['open_owner'],
    }
  }

  return {
    ownerDomain: 'system',
    sourceType: 'unsupported_event',
    title: '一条暂不支持的系统事件',
    summary: eventType === 'unknown' ? '事件类型缺失，未展示原始内容' : `类型 ${eventType}`,
    classification: 'sensitive',
    deepLink: null,
    actionHints: [],
  }
}

export function sourceState(status, options = {}) {
  const allowed = new Set([
    'loading',
    'ready',
    'empty',
    'partial',
    'stale',
    'offline',
    'unavailable',
    'permission_denied',
    'unsupported',
  ])
  const normalized = allowed.has(status) ? status : 'unavailable'
  return {
    status: normalized,
    source: text(options.source, 'unknown'),
    message: text(options.message),
    lastUpdated: timestamp(options.lastUpdated),
    stale: normalized === 'stale' || Boolean(options.stale),
    retryable: Boolean(options.retryable),
    availableCount: Number.isFinite(options.availableCount) ? options.availableCount : 0,
    malformedCount: Number.isFinite(options.malformedCount) ? options.malformedCount : 0,
    duplicateCount: Number.isFinite(options.duplicateCount) ? options.duplicateCount : 0,
  }
}

export function classifyReadError(error, { online = true, source = 'unknown' } = {}) {
  if (!online) {
    return sourceState('offline', {
      source,
      message: '设备当前离线；保留已有只读内容，联网后可安全重试。',
      retryable: true,
    })
  }
  const code = text(error?.code)
  const message = text(error?.message, '读取来源失败')
  if (code === '42501' || /permission|row-level security|not authorized/i.test(message)) {
    return sourceState('permission_denied', {
      source,
      message: '当前身份无权读取此来源；其他来源仍可使用。',
      retryable: false,
    })
  }
  if (code === 'PGRST205' || code === '42P01') {
    return sourceState('unavailable', {
      source,
      message: '该只读来源尚未部署；没有创建替代数据副本。',
      retryable: false,
    })
  }
  return sourceState('unavailable', {
    source,
    message,
    retryable: true,
  })
}

export function projectInboxEvents(rows = [], { now = Date.now(), limit = 100 } = {}) {
  const items = []
  const seenIds = new Set()
  const seenRefs = new Set()
  let duplicateCount = 0
  let malformedCount = 0

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      malformedCount += 1
      items.push({
        id: `malformed:${stableHash(`${index}:${String(row)}`)}`,
        canonicalSourceId: null,
        ownerDomain: 'system',
        sourceType: 'malformed',
        title: '无法读取的收件项',
        safeSummary: '来源格式不完整；未展示原始内容。',
        receivedAt: null,
        status: 'inaccessible',
        classification: 'sensitive',
        actionHints: [],
        deepLink: null,
        stale: false,
        offline: false,
        sourceAvailable: false,
      })
      continue
    }

    const rawId = text(row.id)
    const ref = canonicalReference(row)
    if ((rawId && seenIds.has(rawId)) || (ref && seenRefs.has(ref))) {
      duplicateCount += 1
      continue
    }
    if (rawId) seenIds.add(rawId)
    if (ref) seenRefs.add(ref)

    const presentation = eventPresentation(row)
    const receivedAt = timestamp(row.created_at)
    const stale = receivedAt ? now - Date.parse(receivedAt) > INBOX_STALE_AFTER_MS : false
    if (!rawId || !receivedAt || !row.payload || typeof row.payload !== 'object') malformedCount += 1

    items.push({
      id: rawId ? `life_event:${rawId}` : `malformed:${stableHash(`${index}:${row.type}:${row.created_at}`)}`,
      canonicalSourceId: rawId || null,
      ownerDomain: presentation.ownerDomain,
      sourceType: presentation.sourceType,
      title: presentation.title,
      safeSummary: isSensitivePayload(row.payload) && presentation.classification !== 'personal'
        ? presentation.summary
        : presentation.summary,
      receivedAt,
      status: row.status === 'pending' ? 'open' : text(row.status, 'unknown'),
      classification: presentation.classification,
      actionHints: presentation.actionHints,
      deepLink: presentation.deepLink,
      stale,
      offline: false,
      sourceAvailable: Boolean(rawId && receivedAt),
      sourceReference: rawId || ref,
    })
  }

  items.sort((a, b) => (Date.parse(b.receivedAt ?? '') || 0) - (Date.parse(a.receivedAt ?? '') || 0))
  const truncatedCount = Math.max(0, items.length - limit)
  return {
    items: items.slice(0, limit),
    malformedCount,
    duplicateCount,
    truncatedCount,
  }
}

export function projectPlannerInboxTasks(rows = [], { now = Date.now() } = {}) {
  const items = []
  let malformedCount = 0
  for (const row of rows) {
    const task = row?.data
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      malformedCount += 1
      continue
    }
    if (task.completed === true || task.deletedAt != null) continue
    const ref = task.meta?.lifeEventRef
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue
    const taskId = text(task.id)
    if (!taskId) {
      malformedCount += 1
      continue
    }
    const sourceDomainId = ref.domain === 'finance' ? 'money' : sourceDomain(text(ref.type))
    const sourceMeta = DOMAIN_META[sourceDomainId] ?? DOMAIN_META.system
    const receivedAt = timestamp(task.createdAt ?? task.updatedAt)
    const sensitive = sourceDomainId === 'money' || sourceDomainId === 'system'
    items.push({
      id: `planner_task:${taskId}`,
      canonicalSourceId: taskId,
      ownerDomain: 'plan',
      sourceType: 'plan_task_projection',
      title: sensitive ? `${sourceMeta.label} 产生了一条 Plan 待办` : text(task.title, '一条 Plan 待办'),
      safeSummary: '正式对象仍由 Plan 管理；Assistant 只展示引用。',
      receivedAt,
      status: 'open',
      classification: sensitive ? 'sensitive' : 'personal',
      actionHints: ['open_owner'],
      deepLink: DOMAIN_META.plan.href,
      stale: receivedAt ? now - Date.parse(receivedAt) > INBOX_STALE_AFTER_MS : false,
      offline: false,
      sourceAvailable: Boolean(receivedAt),
      sourceReference: text(ref.id ?? ref.eventId) || null,
    })
  }
  items.sort((a, b) => (Date.parse(b.receivedAt ?? '') || 0) - (Date.parse(a.receivedAt ?? '') || 0))
  return { items, malformedCount }
}

export function mergeInboxProjections(...projections) {
  const items = []
  const seenIds = new Set()
  const seenRefs = new Set()
  let duplicateCount = 0
  let malformedCount = 0
  let truncatedCount = 0
  for (const projection of projections) {
    malformedCount += Number(projection?.malformedCount) || 0
    duplicateCount += Number(projection?.duplicateCount) || 0
    truncatedCount += Number(projection?.truncatedCount) || 0
    for (const item of projection?.items ?? []) {
      const ref = text(item.sourceReference)
      if (seenIds.has(item.id) || (ref && seenRefs.has(ref))) {
        duplicateCount += 1
        continue
      }
      seenIds.add(item.id)
      if (ref) seenRefs.add(ref)
      items.push(item)
    }
  }
  items.sort((a, b) => (Date.parse(b.receivedAt ?? '') || 0) - (Date.parse(a.receivedAt ?? '') || 0))
  return { items: items.slice(0, 100), malformedCount, duplicateCount, truncatedCount: truncatedCount + Math.max(0, items.length - 100) }
}

export function projectActivityEvents(rows = [], { limit = 100 } = {}) {
  const records = []
  const seen = new Set()
  let duplicateCount = 0
  let malformedCount = 0

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      malformedCount += 1
      continue
    }
    const rawId = text(row.id)
    const stableId = rawId || stableHash(`${index}:${row.type}:${row.created_at}`)
    if (seen.has(stableId)) {
      duplicateCount += 1
      continue
    }
    seen.add(stableId)

    const presentation = eventPresentation(row)
    const occurredAt = timestamp(row.created_at)
    const status = { pending: 'queued', processed: 'succeeded', failed: 'failed' }[row.status] ?? 'unknown'
    if (!rawId || !occurredAt || !text(row.type)) malformedCount += 1

    records.push({
      id: `life_event:${stableId}`,
      correlationId: canonicalReference(row),
      actor: { type: 'system', id: 'life-events' },
      ownerDomain: presentation.ownerDomain,
      actionType: text(row.type, 'unknown.event'),
      safeSummary: presentation.title,
      status,
      result: status,
      resultDetail: status === 'failed'
        ? '来源报告处理失败；未复制内部错误或敏感 payload。'
        : status === 'queued'
          ? '仍在原 Owner 的处理队列中。'
          : '原 Owner 已标记处理完成。',
      risk: 'R0',
      approvalReference: null,
      entityReference: canonicalReference(row),
      occurredAt,
      undoAvailable: false,
      classification: presentation.classification,
      sourceAvailable: Boolean(rawId && occurredAt),
      deepLink: presentation.deepLink,
    })
  }

  records.sort((a, b) => (Date.parse(b.occurredAt ?? '') || 0) - (Date.parse(a.occurredAt ?? '') || 0))
  const truncatedCount = Math.max(0, records.length - limit)
  return {
    records: records.slice(0, limit),
    malformedCount,
    duplicateCount,
    truncatedCount,
  }
}

export function projectApprovalRows(rows = [], { now = Date.now() } = {}) {
  const approvals = []
  let malformedCount = 0
  const seen = new Set()
  let duplicateCount = 0

  for (const row of rows) {
    const id = text(row?.id)
    const actionId = text(row?.action_id ?? row?.actionId ?? row?.action_request_id ?? row?.actionRequestId)
    if (!id || !actionId) {
      malformedCount += 1
      continue
    }
    if (seen.has(id)) {
      duplicateCount += 1
      continue
    }
    seen.add(id)
    const expiresAt = timestamp(row.expires_at ?? row.expiresAt)
    const requestedAt = timestamp(row.requested_at ?? row.requestedAt ?? row.created_at)
    const updatedAt = timestamp(row.updated_at ?? row.updatedAt ?? row.created_at)
    const expired = expiresAt ? Date.parse(expiresAt) <= now : false
    const allowedStatuses = ['pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded']
    const rawStatus = text(row.status, 'pending')
    const status = expired && rawStatus === 'pending'
      ? 'expired'
      : allowedStatuses.includes(rawStatus)
        ? rawStatus
        : 'unknown'
    if (!text(row.status) || !allowedStatuses.includes(rawStatus) || !requestedAt || !expiresAt || !updatedAt) malformedCount += 1
    const rawRequestingDomain = row.requesting_domain ?? row.requestingDomain ?? row.owner_domain ?? row.ownerDomain
    const requestingDomain = DOMAIN_META[rawRequestingDomain]
      ? rawRequestingDomain
      : 'system'
    const meta = DOMAIN_META[requestingDomain] ?? DOMAIN_META.system
    const actor = row.requesting_actor ?? row.requestingActor
    const requestingActor = actor && typeof actor === 'object' && !Array.isArray(actor)
      ? { type: text(actor.type, 'unknown'), id: text(actor.id) || null }
      : { type: text(actor, 'unknown'), id: null }
    const entityRefs = Array.isArray(row.entity_refs ?? row.entityRefs)
      ? (row.entity_refs ?? row.entityRefs).map((ref) => ({
          id: text(ref?.id),
          type: text(ref?.type, 'unknown.entity'),
          ownerDomain: DOMAIN_META[ref?.ownerDomain] ? ref.ownerDomain : 'system',
          ownerId: text(ref?.ownerId),
        })).filter((ref) => ref.id && ref.ownerId)
      : []
    const freshness = freshnessState(updatedAt, { now })
    approvals.push({
      id,
      actionId,
      correlationId: text(row.correlation_id ?? row.correlationId) || null,
      requestingActor,
      ownerDomain: 'system',
      requestingDomain,
      risk: ['R0', 'R1', 'R2', 'R3', 'R4'].includes(row.risk) ? row.risk : 'R4',
      requestedOperation: text(row.action_type ?? row.requestedOperation, 'unknown.action'),
      safeImpactSummary: text(row.safe_summary ?? row.safeImpactSummary, '影响摘要不可用'),
      requestedAt,
      expiresAt,
      status,
      reasonCode: text(row.reason_code ?? row.reasonCode, 'policy_confirmation_required'),
      whyApprovalNeeded: text(row.reason_code ?? row.reasonCode ?? row.reason ?? row.whyApprovalNeeded, '策略要求人工确认'),
      decisionReason: text(row.decision_reason ?? row.decisionReason) || null,
      entityReferences: entityRefs,
      deepLink: `/approvals#approval-${encodeURIComponent(id)}`,
      ownerDeepLink: meta.href,
      executorAvailable: false,
      classification: text(row.data_classification ?? row.classification, meta.classification),
      source: 'public.kenos_list_action_approvals',
      sourceFreshness: freshness.freshness,
      lastUpdated: freshness.lastUpdated,
      stale: freshness.stale,
    })
  }

  approvals.sort((a, b) => (Date.parse(b.requestedAt ?? '') || 0) - (Date.parse(a.requestedAt ?? '') || 0))
  return { approvals, malformedCount, duplicateCount }
}

export function compareApprovalProjectionSets({
  canonicalItems = [],
  legacyItems = [],
  legacySourceSupported = true,
  comparedAt = new Date().toISOString(),
} = {}) {
  if (!legacySourceSupported) {
    return [{
      comparisonType: 'portal_badge_vs_canonical_approval_count',
      ownerDomain: 'system',
      oldValueFingerprint: fingerprint({ count: legacyItems.length }),
      newValueFingerprint: fingerprint({ count: canonicalItems.filter((item) => item.status === 'pending').length }),
      category: 'unsupported_legacy_source',
      timestamp: timestamp(comparedAt),
      sourceFreshness: canonicalItems.some((item) => item.stale) ? 'stale' : 'fresh',
      severity: 'expected',
      correlationId: null,
      redactedDiagnosticSummary: 'Portal action badge 不是 Approval 真源；仅比较脱敏计数，不自动迁移。',
    }]
  }

  const mismatches = []
  const canonicalById = new Map(canonicalItems.map((item) => [text(item.id), item]))
  const legacyById = new Map(legacyItems.map((item) => [text(item.id), item]))
  for (const [id, legacy] of legacyById) {
    const canonical = canonicalById.get(id)
    if (!canonical) {
      mismatches.push({
        comparisonType: 'approval_projection', ownerDomain: 'system',
        oldValueFingerprint: fingerprint(legacy), newValueFingerprint: 'none',
        category: 'missing_in_canonical', timestamp: timestamp(comparedAt), sourceFreshness: text(legacy.sourceFreshness, 'unknown'),
        severity: 'blocking', correlationId: text(legacy.correlationId) || null,
        redactedDiagnosticSummary: `Legacy Approval ${stableHash(id)} 未出现在 canonical projection。`,
      })
      continue
    }
    for (const [field, category, severity] of [
      ['actionId', 'action_mismatch', 'blocking'],
      ['correlationId', 'correlation_mismatch', 'blocking'],
      ['ownerDomain', 'owner_mismatch', 'blocking'],
      ['risk', 'risk_mismatch', 'blocking'],
      ['status', 'status_mismatch', 'blocking'],
      ['expiresAt', 'expiry_mismatch', 'warning'],
      ['classification', 'redaction_mismatch', 'blocking'],
      ['deepLink', 'deep_link_mismatch', 'warning'],
    ]) {
      if ((legacy[field] ?? null) !== (canonical[field] ?? null)) {
        mismatches.push({
          comparisonType: 'approval_projection', ownerDomain: 'system',
          oldValueFingerprint: fingerprint({ [field]: legacy[field] }),
          newValueFingerprint: fingerprint({ [field]: canonical[field] }),
          category, timestamp: timestamp(comparedAt), sourceFreshness: text(canonical.sourceFreshness, 'unknown'),
          severity, correlationId: text(canonical.correlationId) || null,
          redactedDiagnosticSummary: `${stableHash(id)} 的 Approval ${field} projection 不一致。`,
        })
      }
    }
  }
  for (const [id, canonical] of canonicalById) {
    if (legacyById.has(id)) continue
    mismatches.push({
      comparisonType: 'approval_projection', ownerDomain: 'system',
      oldValueFingerprint: 'none', newValueFingerprint: fingerprint(canonical),
      category: 'extra_in_canonical', timestamp: timestamp(comparedAt), sourceFreshness: text(canonical.sourceFreshness, 'unknown'),
      severity: 'warning', correlationId: text(canonical.correlationId) || null,
      redactedDiagnosticSummary: `Canonical Approval ${stableHash(id)} 没有可比较的 legacy candidate。`,
    })
  }
  return mismatches
}

export function freshnessState(lastUpdated, { now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS } = {}) {
  const normalized = timestamp(lastUpdated)
  if (!normalized) return { lastUpdated: null, freshness: 'unknown', stale: true }
  const age = Math.max(0, now - Date.parse(normalized))
  return {
    lastUpdated: normalized,
    freshness: age > staleAfterMs ? 'stale' : 'fresh',
    stale: age > staleAfterMs,
  }
}

function fingerprint(value) {
  if (value == null) return 'none'
  if (Array.isArray(value)) return stableHash(value.map((item) => fingerprint(item)).sort().join('|'))
  if (typeof value !== 'object') return stableHash(String(value))
  const safe = Object.entries(value)
    .filter(([key]) => !SENSITIVE_FIELD.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${key}:${fingerprint(entry)}`)
    .join('|')
  return stableHash(safe)
}

export function compareProjectionSets({
  comparisonType,
  ownerDomain,
  oldItems = [],
  newItems = [],
  correlationId = null,
  timestamp: comparedAt = new Date().toISOString(),
  unsupported = false,
  oldSourceId = null,
  newSourceId = null,
} = {}) {
  const mismatches = []
  const resolvedOldSource = text(oldSourceId || oldItems[0]?.sourceIdentity, 'unknown_old')
  const resolvedNewSource = text(newSourceId || newItems[0]?.sourceIdentity, 'unknown_new')

  if (resolvedOldSource && resolvedNewSource && resolvedOldSource === resolvedNewSource) {
    return [{
      comparisonType: text(comparisonType, 'unknown'),
      ownerDomain: text(ownerDomain, 'system'),
      oldValueFingerprint: fingerprint({ source: resolvedOldSource, count: oldItems.length }),
      newValueFingerprint: fingerprint({ source: resolvedNewSource, count: newItems.length }),
      category: 'same_source_self_compare_invalid_evidence',
      timestamp: timestamp(comparedAt),
      sourceFreshness: 'unknown',
      severity: 'expected',
      correlationId,
      oldSourceId: resolvedOldSource,
      newSourceId: resolvedNewSource,
      redactedDiagnosticSummary: 'Old/new shadow inputs share the same source identity; self-compare is not cutover evidence.',
    }]
  }

  const oldById = new Map(oldItems.map((item) => [text(item.id), item]))
  const newById = new Map(newItems.map((item) => [text(item.id), item]))

  if (unsupported) {
    mismatches.push({
      comparisonType: text(comparisonType, 'unknown'),
      ownerDomain: text(ownerDomain, 'system'),
      oldValueFingerprint: fingerprint(oldItems),
      newValueFingerprint: fingerprint(newItems),
      category: 'unsupported_source',
      timestamp: timestamp(comparedAt),
      sourceFreshness: 'unknown',
      severity: 'expected',
      correlationId,
      oldSourceId: resolvedOldSource,
      newSourceId: resolvedNewSource,
      redactedDiagnosticSummary: '目标 read source 尚不存在；未创建替代存储。',
    })
    return mismatches
  }

  for (const [id, oldItem] of oldById) {
    const next = newById.get(id)
    if (!next) {
      mismatches.push({
        comparisonType: text(comparisonType, 'unknown'),
        ownerDomain: text(oldItem.ownerDomain ?? ownerDomain, 'system'),
        oldValueFingerprint: fingerprint(oldItem),
        newValueFingerprint: 'none',
        category: 'missing_in_new',
        timestamp: timestamp(comparedAt),
        sourceFreshness: text(oldItem.freshness, 'unknown'),
        severity: 'blocking',
        correlationId: text(oldItem.correlationId) || correlationId,
        oldSourceId: resolvedOldSource,
        newSourceId: resolvedNewSource,
        redactedDiagnosticSummary: `来源项 ${stableHash(id)} 未出现在新 projection。`,
      })
      continue
    }
    for (const [field, category, severity] of [
      ['ownerDomain', 'owner_mismatch', 'blocking'],
      ['status', 'status_mismatch', 'blocking'],
      ['freshness', 'freshness_mismatch', 'warning'],
      ['deepLink', 'deep_link_mismatch', 'warning'],
      ['classification', 'redaction_mismatch', 'blocking'],
    ]) {
      if ((oldItem[field] ?? null) !== (next[field] ?? null)) {
        mismatches.push({
          comparisonType: text(comparisonType, 'unknown'),
          ownerDomain: text(oldItem.ownerDomain ?? ownerDomain, 'system'),
          oldValueFingerprint: fingerprint({ [field]: oldItem[field] }),
          newValueFingerprint: fingerprint({ [field]: next[field] }),
          category,
          timestamp: timestamp(comparedAt),
          sourceFreshness: text(next.freshness, 'unknown'),
          severity,
          correlationId: text(next.correlationId) || correlationId,
          oldSourceId: resolvedOldSource,
          newSourceId: resolvedNewSource,
          redactedDiagnosticSummary: `${stableHash(id)} 的 ${field} projection 不一致。`,
        })
      }
    }
  }

  for (const [id, next] of newById) {
    if (oldById.has(id)) continue
    mismatches.push({
      comparisonType: text(comparisonType, 'unknown'),
      ownerDomain: text(next.ownerDomain ?? ownerDomain, 'system'),
      oldValueFingerprint: 'none',
      newValueFingerprint: fingerprint(next),
      category: 'extra_in_new',
      timestamp: timestamp(comparedAt),
      sourceFreshness: text(next.freshness, 'unknown'),
      severity: 'warning',
      correlationId: text(next.correlationId) || correlationId,
      oldSourceId: resolvedOldSource,
      newSourceId: resolvedNewSource,
      redactedDiagnosticSummary: `新 projection ${stableHash(id)} 在 legacy 样本中不存在。`,
    })
  }

  return mismatches
}

export function summarizeShadowMismatches(mismatches = []) {
  return mismatches.reduce(
    (summary, mismatch) => {
      if (mismatch.severity === 'blocking') summary.blocking += 1
      else if (mismatch.severity === 'warning') summary.warning += 1
      else summary.expected += 1
      return summary
    },
    { blocking: 0, warning: 0, expected: 0 },
  )
}

export const KENOS_READ_SOURCE_OWNERS = Object.freeze({
  today: Object.freeze(['plan', 'money', 'training', 'music', 'home']),
  inbox: Object.freeze(['plan', 'money', 'training', 'system']),
  approvals: Object.freeze(['system']),
  activity: Object.freeze(['plan', 'money', 'training', 'system']),
})

export async function settleReadSources(readers, onSettled = () => {}) {
  const entries = Object.entries(readers)
  const settled = await Promise.all(
    entries.map(async ([key, reader]) => {
      try {
        const value = await reader()
        onSettled(key, value)
        return [key, value]
      } catch (error) {
        const value = { error }
        onSettled(key, value)
        return [key, value]
      }
    }),
  )
  return Object.fromEntries(settled)
}
