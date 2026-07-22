import {
  healthReadinessToTodayPriority,
  healthReadinessToTodaySignal,
  isSafeHealthReadiness,
} from '@life-os/platform-web/kenos-health-readiness'
import { DOMAIN_ORIGINS } from './domainResume.core.js'
import { HOSTED_SPACES } from './spacesList.core.js'
import { freshnessState } from './readProjections.core.js'
import {
  ASK_SESSION_COPY,
  canClaimEmptyAttention,
} from './productSessionState.core.js'

const SPACE_URLS = Object.freeze({
  plan: DOMAIN_ORIGINS.plan,
  money: DOMAIN_ORIGINS.money,
  training: DOMAIN_ORIGINS.training,
  music: DOMAIN_ORIGINS.music,
  home: DOMAIN_ORIGINS.home,
  knowledge: DOMAIN_ORIGINS.knowledge,
  health: DOMAIN_ORIGINS.health,
})

/**
 * @deprecated Prefer TODAY_SPACE_SHORTCUTS / HOSTED_SPACES (in-app bridges).
 * Kept as hosted-bridge shortcuts so any leftover consumer does not bypass the shell.
 */
export const KENOS_SPACES = Object.freeze(
  HOSTED_SPACES.filter((space) =>
    ['plan', 'money', 'training', 'music', 'home', 'knowledge'].includes(
      space.id,
    ),
  ).map((space) => ({
    id: space.id,
    label: space.label,
    detail: space.detail,
    href: space.href,
  })),
)

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(finiteNumber(value))
}

/**
 * Portal today RPC -> Assistant Today read model.
 * This stays read-only: every action points back to its domain owner.
 * @param {object|null} summary
 * @param {{ now?: number, healthReadiness?: object|null }} [opts]
 */
export function buildTodayReadModel(
  summary,
  { now = Date.now(), healthReadiness = null } = {},
) {
  const safeHealth = isSafeHealthReadiness(healthReadiness)
    ? healthReadiness
    : null

  if (!summary || summary.ok === false) {
    if (safeHealth) {
      return buildTodayReadModel(
        { ok: true, asOf: safeHealth.asOf || new Date(now).toISOString() },
        { now, healthReadiness: safeHealth },
      )
    }
    return {
      asOf: null,
      priorities: [],
      signals: [],
      overview: null,
      emptyReason: '今日摘要尚未连接。各空间仍可独立使用。',
      source: 'public.portal_today_summary',
      status: 'unavailable',
    }
  }

  const priorities = []
  const signals = []
  const freshness = freshnessState(summary.asOf, { now })
  const projectionMeta = (ownerDomain, source) => ({
    ownerDomain,
    source,
    freshness: freshness.freshness,
    lastUpdated: freshness.lastUpdated,
    available: true,
    stale: freshness.stale,
    futureActionAllowed: false,
  })
  const planner = summary.planner ?? null
  const overdue = finiteNumber(planner?.overdue)
  const todayOpen = finiteNumber(planner?.todayOpen)

  if (overdue > 0) {
    priorities.push({
      id: 'plan-overdue',
      tone: 'critical',
      eyebrow: '需要处理',
      title: `${overdue} 项任务已逾期`,
      detail:
        todayOpen > 0 ? `另有 ${todayOpen} 项今天到期` : '先确认仍然有效的任务',
      href: `${SPACE_URLS.plan}/upcoming`,
      actionLabel: '打开 Plan',
      ...projectionMeta('plan', 'portal_today_summary.planner'),
    })
  } else if (todayOpen > 0) {
    priorities.push({
      id: 'plan-today',
      tone: 'attention',
      eyebrow: '下一步',
      title: `${todayOpen} 项任务今天到期`,
      detail: '从最重要的一项开始',
      href: SPACE_URLS.plan,
      actionLabel: '查看今天',
      ...projectionMeta('plan', 'portal_today_summary.planner'),
    })
  }

  if (safeHealth) {
    const priority = healthReadinessToTodayPriority(safeHealth, {
      href: SPACE_URLS.health,
    })
    if (priority) priorities.push(priority)
    const signal = healthReadinessToTodaySignal(safeHealth, {
      href: SPACE_URLS.health,
    })
    if (signal) signals.push(signal)
  }

  // Round 3: Plan always contributes a space-row signal (not only priorities).
  if (planner) {
    signals.push({
      id: 'plan',
      label: '计划',
      value:
        overdue > 0
          ? `${overdue} 项逾期`
          : todayOpen > 0
            ? `${todayOpen} 项今天到期`
            : '今天没有到期任务',
      detail:
        overdue > 0
          ? todayOpen > 0
            ? `另有 ${todayOpen} 项今天到期`
            : '先确认仍然有效的任务'
          : todayOpen > 0
            ? '从最重要的一项开始'
            : '可以从收件箱或助手开始',
      href: overdue > 0 ? `${SPACE_URLS.plan}/upcoming` : SPACE_URLS.plan,
      changed: overdue > 0 || todayOpen > 0,
      ...projectionMeta('plan', 'portal_today_summary.planner'),
    })
  }

  if (summary.fitness) {
    const workedOut = Boolean(summary.fitness.workedOutToday)
    const done = Boolean(summary.fitness.todayCompleted)
    if (workedOut && !done) {
      priorities.push({
        id: 'training-active',
        tone: 'attention',
        eyebrow: '进行中',
        title: '训练未完成',
        detail: '还有一组或收尾动作待完成',
        href: SPACE_URLS.training,
        actionLabel: '继续训练',
        ...projectionMeta('training', 'portal_today_summary.fitness'),
      })
    }
    signals.push({
      id: 'training',
      label: '训练',
      value: workedOut ? (done ? '今天已完成' : '进行中') : '今天尚未训练',
      detail: workedOut
        ? done
          ? '训练已完成'
          : '训练进行中'
        : summary.fitness.lastSessionDate
          ? `上次 ${summary.fitness.lastSessionDate}`
          : '暂无近期训练记录',
      href: SPACE_URLS.training,
      changed: workedOut ? !done : true,
      ...projectionMeta('training', 'portal_today_summary.fitness'),
    })
  }

  if (summary.finance) {
    signals.push({
      id: 'money',
      label: '财务',
      value: `${formatCurrency(summary.finance.monthSurplus)} 本月结余`,
      detail: `收入 ${formatCurrency(summary.finance.monthIncome)} · 支出 ${formatCurrency(summary.finance.monthExpense)}`,
      href: SPACE_URLS.money,
      changed: true,
      ...projectionMeta('money', 'portal_today_summary.finance'),
    })
  }

  if (summary.music) {
    const title = String(summary.music.trackTitle ?? '').trim()
    const artist = String(summary.music.trackArtist ?? '').trim()
    signals.push({
      id: 'music',
      label: '音乐',
      value: title || '最近没有播放记录',
      detail: artist || '打开音乐继续播放',
      href: SPACE_URLS.music,
      changed: Boolean(title),
      ...projectionMeta('music', 'portal_today_summary.music'),
    })
  }

  if (summary.home?.storageZoneCount != null) {
    const count = finiteNumber(summary.home.storageZoneCount)
    signals.push({
      id: 'home',
      label: '家',
      value: `${count} 个收纳分区`,
      detail: summary.home.reportedAt ? '空间清单已同步' : '等待最近一次同步',
      href: `${SPACE_URLS.home}/storage`,
      changed: count > 0,
      ...projectionMeta('home', 'portal_today_summary.home'),
    })
  }

  if (!priorities.length && planner) {
    priorities.push({
      id: 'plan-clear',
      tone: 'calm',
      eyebrow: '当前状态',
      title: '今天没有到期任务',
      detail: '可以从收件箱或助手开始',
      href: `${SPACE_URLS.plan}/inbox`,
      actionLabel: '查看收件箱',
      ...projectionMeta('plan', 'portal_today_summary.planner'),
    })
  }

  return {
    asOf: typeof summary.asOf === 'string' ? summary.asOf : null,
    priorities,
    signals,
    overview: buildTodayOverviewLine({ priorities, signals }),
    emptyReason: priorities.length ? null : '今天没有需要立即处理的事',
    source: 'public.portal_today_summary',
    status: freshness.stale ? 'stale' : 'ready',
  }
}

/**
 * One natural-language Today line — Round 3 product finish.
 * @param {{ priorities?: Array<{ id?: string, title?: string }>, signals?: Array<{ id?: string, value?: string, changed?: boolean }>, queue?: { inboxOpen?: number|null, approvalsOpen?: number|null }|null }} input
 */
export function buildTodayOverviewLine({
  priorities = [],
  signals = [],
  queue = null,
} = {}) {
  const parts = []
  const plan = priorities.find((p) => String(p.id || '').startsWith('plan-'))
  if (plan?.title) parts.push(plan.title.replace(/任务/g, '任务'))
  const training = signals.find((s) => s.id === 'training' && s.changed)
  if (training?.value) parts.push(`训练：${training.value}`)
  const inboxOpen = queue?.inboxOpen
  if (typeof inboxOpen === 'number' && inboxOpen > 0) {
    parts.push(`${inboxOpen} 项收件待处理`)
  }
  const approvalsOpen = queue?.approvalsOpen
  if (typeof approvalsOpen === 'number' && approvalsOpen > 0) {
    parts.push(`${approvalsOpen} 项待批准`)
  }
  if (!parts.length) {
    const calm = priorities.find((p) => p.id === 'plan-clear')
    if (calm) return '今天相对轻松。没有急需处理的到期任务。'
    return '打开下方空间动态，或向助手问一句今天该先做什么。'
  }
  if (parts.length === 1) return parts[0]
  return `${parts[0]}。${parts.slice(1).join('；')}`
}

/**
 * Prefer live signal copy for Today space rows (Shelf keeps catalog blurbs).
 * @param {string} spaceId
 * @param {{ signals?: Array<{ id?: string, value?: string, detail?: string }>, workCards?: Array<{ title?: string, summary?: string }>, fallback?: string }} [opts]
 */
export function resolveSpaceLiveDetail(
  spaceId,
  { signals = [], workCards = [], fallback = '' } = {},
) {
  if (spaceId === 'work') {
    const card = workCards[0]
    if (card?.title) {
      return card.summary ? `${card.title} · ${card.summary}` : card.title
    }
    return fallback || '暂无进行中的工作卡片'
  }
  const signalId =
    spaceId === 'knowledge' || spaceId === 'library' ? null : spaceId
  if (!signalId) return fallback
  const signal = signals.find((s) => s.id === signalId)
  if (!signal) return fallback
  if (signal.detail && signal.value && !String(signal.detail).includes(String(signal.value))) {
    return `${signal.value} · ${signal.detail}`
  }
  return signal.value || signal.detail || fallback
}

/**
 * Today shows Spaces with real movement — not a second launcher.
 * @template {{ id: string }} T
 * @param {T[]} spaces
 * @param {{ signals?: Array<{ id?: string, changed?: boolean }>, workCards?: unknown[], limit?: number }} [opts]
 * @returns {T[]}
 */
export function selectTodayDynamicSpaces(
  spaces = [],
  { signals = [], workCards = [], limit = 4 } = {},
) {
  const changedIds = new Set(
    signals.filter((s) => s.changed).map((s) => s.id).filter(Boolean),
  )
  if (workCards?.length) changedIds.add('work')
  const dynamic = spaces.filter((space) => changedIds.has(space.id))
  if (dynamic.length) return dynamic.slice(0, limit)
  // Soft fallback: any space that already has a live signal line.
  const liveIds = new Set(signals.map((s) => s.id).filter(Boolean))
  const live = spaces.filter((space) => liveIds.has(space.id))
  if (live.length) return live.slice(0, limit)
  // Round 3: never fall back to static catalog blurbs — Shelf owns navigation.
  return []
}

const UNAVAILABLE_SOURCE_STATUSES = new Set([
  'unavailable',
  'offline',
  'permission_denied',
  'loading',
  'unsupported',
])

function sourceCountAvailable(source) {
  return source && !UNAVAILABLE_SOURCE_STATUSES.has(source.status)
}

/**
 * Queue counts for Today / badges.
 * Returns `null` when the source is unavailable so UI never shows a fake 0 or bare "—".
 */
export function summarizeControlQueue({
  inbox = [],
  approvals = [],
  activities = [],
  sources = {},
} = {}) {
  return {
    inboxOpen: sourceCountAvailable(sources.inbox)
      ? inbox.filter((item) => item.status === 'open').length
      : null,
    approvalsOpen: sourceCountAvailable(sources.approvals)
      ? approvals.filter((item) => item.status === 'pending').length
      : null,
    activityFailures: sourceCountAvailable(sources.activity)
      ? activities.filter((item) => item.status === 'failed').length
      : null,
    inboxAvailable: sourceCountAvailable(sources.inbox),
    approvalsAvailable: sourceCountAvailable(sources.approvals),
    activityAvailable: sourceCountAvailable(sources.activity),
  }
}

/** Raw count string, or `null` when unavailable (never `"—"`). */
export function formatQueueCount(value) {
  return value == null ? null : String(value)
}

/**
 * User-facing count label — Round 1: no bare em-dash.
 * @param {number | string | null | undefined} value
 * @param {{ unavailable?: string, zero?: string }} [opts]
 */
export function formatQueueCountLabel(
  value,
  { unavailable = '暂不可用', zero = '0' } = {},
) {
  if (value == null) return unavailable
  const n = Number(value)
  if (Number.isFinite(n) && n === 0) return zero
  return String(value)
}

/**
 * Assistant empty-state brief — Kenos steward summary, not generic AI demo prompts.
 * Distinguishes unavailable / syncing / truly empty — never claims "nothing urgent"
 * when cross-space data cannot be read.
 *
 * @param {{
 *   summary?: object|null,
 *   queue?: ReturnType<typeof summarizeControlQueue>|null,
 *   session?: ReturnType<typeof import('./productSessionState.core.js').resolveProductSessionState>|null,
 * }} input
 * @returns {{ bullets: string[], prompts: string[], ask: string, availability: 'ready'|'empty'|'syncing'|'unavailable' }}
 */
export function buildAssistantAttentionBrief({
  summary = null,
  queue = null,
  session = null,
  localMode = false,
} = {}) {
  if (
    session?.crossSpaceSummaryState === 'syncing' ||
    session?.inboxSyncState === 'syncing'
  ) {
    return {
      bullets: [ASK_SESSION_COPY.syncing],
      prompts: ['稍后再问今天的跨空间状态'],
      ask: '想从哪里开始？',
      availability: 'syncing',
    }
  }

  if (!canClaimEmptyAttention({ summary, queue, session })) {
    const locked =
      session?.needsSignIn ||
      session?.crossSpaceSummaryState === 'locked' ||
      session?.inboxSyncState === 'locked'
    // The user chose local mode — respect that instead of re-pitching "连接账户".
    if (locked && localMode) {
      return {
        bullets: ['本地模式：数据不出这台设备。想同步各空间时可随时连接账户。'],
        prompts: [],
        ask: '想从哪里开始？',
        availability: 'local',
      }
    }
    return {
      bullets: [ASK_SESSION_COPY.unavailable],
      prompts: locked
        ? ['连接账户后帮我看今天各空间的状态']
        : ['帮我扫一眼今天各空间的状态'],
      ask: '想从哪里开始？',
      availability: 'unavailable',
    }
  }

  /** @type {string[]} */
  const bullets = []
  /** @type {string[]} */
  const prompts = []

  const planner = summary?.planner ?? null
  const overdue = finiteNumber(planner?.overdue)
  const todayOpen = finiteNumber(planner?.todayOpen)
  if (overdue > 0) {
    bullets.push(`${overdue} 项计划任务已逾期`)
    prompts.push(`帮我处理计划里 ${overdue} 项逾期任务`)
  } else if (todayOpen > 0) {
    bullets.push(`${todayOpen} 项计划任务今天到期`)
    prompts.push('列出今天最值得先做的计划任务')
  }

  const fitness = summary?.fitness ?? null
  if (fitness) {
    const workedOut = Boolean(fitness.workedOutToday)
    const done = Boolean(fitness.todayCompleted)
    if (workedOut && !done) {
      bullets.push('训练进行中，还未收尾')
      prompts.push('继续今天的训练，告诉我下一组')
    } else if (!workedOut) {
      bullets.push('今天还没开始训练')
      prompts.push('帮我安排今天的训练')
    }
  }

  const inboxOpen = queue?.inboxOpen
  if (typeof inboxOpen === 'number' && inboxOpen > 0) {
    bullets.push(`收件箱有 ${inboxOpen} 项待确认`)
    prompts.push(`先看收件箱里这 ${inboxOpen} 项该怎么归位`)
  }

  const approvalsOpen = queue?.approvalsOpen
  if (typeof approvalsOpen === 'number' && approvalsOpen > 0) {
    bullets.push(`${approvalsOpen} 项审批待确认`)
    prompts.push('总结待我确认的审批')
  }

  if (!bullets.length) {
    bullets.push(ASK_SESSION_COPY.empty)
    prompts.push('帮我扫一眼今天各空间的状态')
    return {
      bullets: bullets.slice(0, 4),
      prompts: prompts.slice(0, 3),
      ask: '想从哪里开始？',
      availability: 'empty',
    }
  }

  return {
    bullets: bullets.slice(0, 4),
    prompts: prompts.slice(0, 3),
    ask: '你想先处理哪一项？',
    availability: 'ready',
  }
}

export function sortActivityNewestFirst(records = []) {
  return [...records].sort((a, b) => {
    const left = Date.parse(a.occurredAt ?? '') || 0
    const right = Date.parse(b.occurredAt ?? '') || 0
    return right - left
  })
}

function domainClassification(ownerDomain) {
  return ownerDomain === 'money' ? 'sensitive' : 'personal'
}

export function buildLegacyTodayShadowProjection(
  summary,
  { now = Date.now() } = {},
) {
  if (!summary || summary.ok === false) return []
  const freshness = freshnessState(summary.asOf, { now }).freshness
  const rows = []
  const add = (id, ownerDomain, deepLink) =>
    rows.push({
      id,
      ownerDomain,
      status: 'ready',
      freshness,
      deepLink,
      classification: domainClassification(ownerDomain),
    })
  if (summary.planner) {
    const overdue = finiteNumber(summary.planner.overdue)
    const todayOpen = finiteNumber(summary.planner.todayOpen)
    add(
      'plan',
      'plan',
      overdue > 0
        ? `${SPACE_URLS.plan}/upcoming`
        : todayOpen > 0
          ? SPACE_URLS.plan
          : `${SPACE_URLS.plan}/inbox`,
    )
  }
  if (summary.fitness) add('training', 'training', SPACE_URLS.training)
  if (summary.finance) add('money', 'money', SPACE_URLS.money)
  if (summary.music) add('music', 'music', SPACE_URLS.music)
  if (summary.home?.storageZoneCount != null)
    add('home', 'home', `${SPACE_URLS.home}/storage`)
  return rows
}

export function buildTodayShadowProjection(model) {
  const rows = []
  const seen = new Set()
  for (const item of [
    ...(model?.priorities ?? []),
    ...(model?.signals ?? []),
  ]) {
    const ownerDomain = item.ownerDomain
    if (!ownerDomain || seen.has(ownerDomain)) continue
    seen.add(ownerDomain)
    rows.push({
      id: ownerDomain,
      ownerDomain,
      status: item.available === false ? 'unavailable' : 'ready',
      freshness: item.freshness,
      deepLink: item.href,
      classification: domainClassification(ownerDomain),
    })
  }
  return rows
}
