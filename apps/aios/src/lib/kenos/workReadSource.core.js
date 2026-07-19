import {
  classifyReadError,
  freshnessState,
  sourceState,
} from './readProjections.core.js'
import { newCorrelationId, recordReadObservation } from './readObservability.core.js'
import { isProdWorkReadEnabled } from './prodReadFlags.core.js'

export const CANONICAL_WORK_PROJECTS_SOURCE = 'public.kenos_list_work_projects'
export const CANONICAL_WORK_PROPOSALS_SOURCE = 'public.kenos_list_work_action_proposals'

function text(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 180) : fallback
}

function projectProjects(rows = [], { now = Date.now() } = {}) {
  const projects = []
  let malformedCount = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      malformedCount += 1
      continue
    }
    const id = text(row.id)
    const ownerId = text(row.owner_id)
    if (!id || !ownerId) {
      malformedCount += 1
      continue
    }
    const freshness = freshnessState(row.updated_at || row.created_at, { now })
    projects.push({
      id,
      ownerId,
      ownerDomain: 'work',
      title: text(row.title, 'Work 项目'),
      safeSummary: text(row.safe_summary, '暂无摘要'),
      status: text(row.status, 'active'),
      priority: text(row.priority),
      lastUpdated: freshness.lastUpdated,
      stale: freshness.stale,
      deepLink: '/work',
      classification: text(row.data_classification, 'work_confidential'),
      entityRef: {
        id,
        type: 'work.project',
        ownerDomain: 'work',
        ownerId,
      },
      source: CANONICAL_WORK_PROJECTS_SOURCE,
    })
  }
  return { projects, malformedCount }
}

function projectProposals(rows = [], { now = Date.now() } = {}) {
  const proposals = []
  let malformedCount = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      malformedCount += 1
      continue
    }
    const id = text(row.id)
    const ownerId = text(row.owner_id)
    if (!id || !ownerId) {
      malformedCount += 1
      continue
    }
    const freshness = freshnessState(row.updated_at || row.created_at, { now })
    proposals.push({
      id,
      ownerId,
      ownerDomain: 'work',
      proposedTaskTitle: text(row.proposed_task_title, '提案'),
      safeContext: text(row.safe_context),
      status: text(row.status, 'proposed'),
      risk: text(row.risk, 'R2'),
      lastUpdated: freshness.lastUpdated,
      stale: freshness.stale,
      deepLink: '/work',
      classification: 'work_confidential',
      entityRef: row.work_entity_ref && typeof row.work_entity_ref === 'object'
        ? row.work_entity_ref
        : null,
      source: CANONICAL_WORK_PROPOSALS_SOURCE,
      // OPEN-002: never carry Work body into Plan projection fields
      body: undefined,
    })
  }
  return { proposals, malformedCount }
}

export function buildWorkReadTodayCards({ projects = [], proposals = [] } = {}) {
  /** @type {Array<Record<string, unknown>>} */
  const cards = []
  for (const project of projects.slice(0, 3)) {
    cards.push({
      id: `work-project:${project.id}`,
      kind: 'project',
      title: project.title,
      summary: project.safeSummary,
      ownerDomain: 'work',
      deepLink: project.deepLink,
      executorAvailable: false,
      entityRef: project.entityRef,
      classification: project.classification,
      source: project.source,
    })
  }
  for (const proposal of proposals.filter((p) => ['draft', 'proposed', 'accepted'].includes(p.status)).slice(0, 2)) {
    cards.push({
      id: `work-proposal:${proposal.id}`,
      kind: 'proposal',
      title: proposal.proposedTaskTitle,
      summary: proposal.safeContext || '待确认是否转为 Plan Task',
      ownerDomain: 'work',
      deepLink: proposal.deepLink,
      executorAvailable: false,
      entityRef: proposal.entityRef,
      classification: proposal.classification,
      source: proposal.source,
    })
  }
  return cards
}

/**
 * Production Work read. Flag default Off. No writes. OPEN-002: no body mirroring.
 */
export async function readCanonicalWorkSource({
  client,
  authorized = true,
  online = true,
  now = Date.now(),
  env = import.meta.env,
} = {}) {
  const correlationId = newCorrelationId('work')
  const started = Date.now()
  const flagOn = isProdWorkReadEnabled(env)

  const finish = (payload) => {
    recordReadObservation({
      domain: 'work',
      source: CANONICAL_WORK_PROJECTS_SOURCE,
      status: payload.state.status,
      latencyMs: Date.now() - started,
      correlationId,
      flagOn,
      sourceOfTruth: flagOn ? CANONICAL_WORK_PROJECTS_SOURCE : 'kenos_work_local_projection',
    })
    return { ...payload, correlationId }
  }

  if (!flagOn) {
    return finish({
      projects: [],
      proposals: [],
      cards: [],
      state: sourceState('unsupported', {
        source: CANONICAL_WORK_PROJECTS_SOURCE,
        message: '生产 Work 读取默认关闭；本地演练不会被标成生产就绪。',
      }),
    })
  }
  if (!authorized) {
    return finish({
      projects: [],
      proposals: [],
      cards: [],
      state: sourceState('permission_denied', {
        source: CANONICAL_WORK_PROJECTS_SOURCE,
        message: '登录 Life OS 后才能读取你的 Work。',
      }),
    })
  }
  if (!online) {
    return finish({
      projects: [],
      proposals: [],
      cards: [],
      state: sourceState('offline', {
        source: CANONICAL_WORK_PROJECTS_SOURCE,
        message: '设备当前离线；Work 生产投影暂不可用。',
        retryable: true,
      }),
    })
  }

  try {
    const [projectsRes, proposalsRes] = await Promise.all([
      client.rpc('kenos_list_work_projects', { p_limit: 50, p_before: null }),
      client.rpc('kenos_list_work_action_proposals', { p_limit: 50, p_status: null }),
    ])
    if (projectsRes.error) throw projectsRes.error
    const projects = projectProjects(Array.isArray(projectsRes.data) ? projectsRes.data : [], { now })
    let proposals = { proposals: [], malformedCount: 0 }
    let partial = false
    if (proposalsRes.error) partial = true
    else proposals = projectProposals(Array.isArray(proposalsRes.data) ? proposalsRes.data : [], { now })

    const cards = buildWorkReadTodayCards({
      projects: projects.projects,
      proposals: proposals.proposals,
    })
    const stale = [...projects.projects, ...proposals.proposals].some((item) => item.stale)
    const total = projects.projects.length + proposals.proposals.length
    const status = projects.malformedCount || proposals.malformedCount || partial
      ? 'partial'
      : stale
        ? 'stale'
        : total
          ? 'ready'
          : 'empty'

    return finish({
      projects: projects.projects,
      proposals: proposals.proposals,
      cards,
      state: sourceState(status, {
        source: CANONICAL_WORK_PROJECTS_SOURCE,
        message:
          status === 'empty'
            ? '还没有 Work 项目。可从 Spaces → Work 开始整理目标与交付。'
            : partial
              ? 'Work 项目已读取；提案投影暂不可用。'
              : '',
        lastUpdated:
          [...projects.projects, ...proposals.proposals]
            .map((item) => item.lastUpdated)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        stale,
        retryable: true,
        availableCount: total,
        malformedCount: projects.malformedCount + proposals.malformedCount,
      }),
      shadowItems: projects.projects.map((item) => ({
        id: item.id,
        ownerDomain: item.ownerDomain,
        status: item.status,
        entityRef: item.entityRef,
        deepLink: item.deepLink,
      })),
    })
  } catch (error) {
    return finish({
      projects: [],
      proposals: [],
      cards: [],
      state: classifyReadError(error, { online, source: CANONICAL_WORK_PROJECTS_SOURCE }),
    })
  }
}
