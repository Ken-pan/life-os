import { freshnessState } from './readProjections.core.js'

const SPACE_URLS = Object.freeze({
  plan: 'https://planner.kenos.space',
  money: 'https://finance.kenos.space',
  training: 'https://fitness.kenos.space',
  music: 'https://music.kenos.space',
  home: 'https://home.kenos.space',
})

export const KENOS_SPACES = Object.freeze([
  { id: 'plan', label: 'Plan', detail: '任务与时间', href: SPACE_URLS.plan },
  { id: 'money', label: 'Money', detail: '收支与决策', href: SPACE_URLS.money },
  { id: 'training', label: 'Training', detail: '训练与恢复', href: SPACE_URLS.training },
  { id: 'music', label: 'Music', detail: '播放与收藏', href: SPACE_URLS.music },
  { id: 'home', label: 'Home', detail: '空间与物品', href: SPACE_URLS.home },
])

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
 */
export function buildTodayReadModel(summary, { now = Date.now() } = {}) {
  if (!summary || summary.ok === false) {
    return {
      asOf: null,
      priorities: [],
      signals: [],
      emptyReason: '今日读模型尚未连接。各 Space 仍可独立使用。',
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
      detail: todayOpen > 0 ? `另有 ${todayOpen} 项今天到期` : '先确认仍然有效的任务',
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

  if (summary.fitness) {
    const workedOut = Boolean(summary.fitness.workedOutToday)
    signals.push({
      id: 'training',
      label: 'Training',
      value: workedOut ? '今天已训练' : '今天尚未训练',
      detail: workedOut
        ? summary.fitness.todayCompleted
          ? '训练已完成'
          : '训练进行中'
        : summary.fitness.lastSessionDate
          ? `上次 ${summary.fitness.lastSessionDate}`
          : '暂无近期训练记录',
      href: SPACE_URLS.training,
      ...projectionMeta('training', 'portal_today_summary.fitness'),
    })
  }

  if (summary.finance) {
    signals.push({
      id: 'money',
      label: 'Money',
      value: `${formatCurrency(summary.finance.monthSurplus)} 本月结余`,
      detail: `收入 ${formatCurrency(summary.finance.monthIncome)} · 支出 ${formatCurrency(summary.finance.monthExpense)}`,
      href: SPACE_URLS.money,
      ...projectionMeta('money', 'portal_today_summary.finance'),
    })
  }

  if (summary.music) {
    const title = String(summary.music.trackTitle ?? '').trim()
    const artist = String(summary.music.trackArtist ?? '').trim()
    signals.push({
      id: 'music',
      label: 'Music',
      value: title || '最近没有播放记录',
      detail: artist || '打开 Music 继续播放',
      href: SPACE_URLS.music,
      ...projectionMeta('music', 'portal_today_summary.music'),
    })
  }

  if (summary.home?.storageZoneCount != null) {
    const count = finiteNumber(summary.home.storageZoneCount)
    signals.push({
      id: 'home',
      label: 'Home',
      value: `${count} 个收纳分区`,
      detail: summary.home.reportedAt ? '空间清单已同步' : '等待最近一次同步',
      href: `${SPACE_URLS.home}/storage`,
      ...projectionMeta('home', 'portal_today_summary.home'),
    })
  }

  if (!priorities.length && planner) {
    priorities.push({
      id: 'plan-clear',
      tone: 'calm',
      eyebrow: '当前状态',
      title: '今天没有到期任务',
      detail: '可以从 Inbox 或 Assistant 开始',
      href: `${SPACE_URLS.plan}/inbox`,
      actionLabel: '查看 Inbox',
      ...projectionMeta('plan', 'portal_today_summary.planner'),
    })
  }

  return {
    asOf: typeof summary.asOf === 'string' ? summary.asOf : null,
    priorities,
    signals,
    emptyReason: null,
    source: 'public.portal_today_summary',
    status: freshness.stale ? 'stale' : 'ready',
  }
}

export function summarizeControlQueue({ inbox = [], approvals = [], activities = [] } = {}) {
  return {
    inboxOpen: inbox.filter((item) => item.status === 'open').length,
    approvalsOpen: approvals.filter((item) => item.status === 'pending').length,
    activityFailures: activities.filter((item) => item.status === 'failed').length,
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

export function buildLegacyTodayShadowProjection(summary, { now = Date.now() } = {}) {
  if (!summary || summary.ok === false) return []
  const freshness = freshnessState(summary.asOf, { now }).freshness
  const rows = []
  const add = (id, ownerDomain, deepLink) => rows.push({
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
  if (summary.home?.storageZoneCount != null) add('home', 'home', `${SPACE_URLS.home}/storage`)
  return rows
}

export function buildTodayShadowProjection(model) {
  const rows = []
  const seen = new Set()
  for (const item of [...(model?.priorities ?? []), ...(model?.signals ?? [])]) {
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
