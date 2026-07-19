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
export function buildTodayReadModel(summary) {
  if (!summary || summary.ok === false) {
    return {
      asOf: null,
      priorities: [],
      signals: [],
      emptyReason: '今日读模型尚未连接。各 Space 仍可独立使用。',
    }
  }

  const priorities = []
  const signals = []
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
    })
  }

  if (summary.finance) {
    signals.push({
      id: 'money',
      label: 'Money',
      value: `${formatCurrency(summary.finance.monthSurplus)} 本月结余`,
      detail: `收入 ${formatCurrency(summary.finance.monthIncome)} · 支出 ${formatCurrency(summary.finance.monthExpense)}`,
      href: SPACE_URLS.money,
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
    })
  }

  return {
    asOf: typeof summary.asOf === 'string' ? summary.asOf : null,
    priorities,
    signals,
    emptyReason: null,
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
