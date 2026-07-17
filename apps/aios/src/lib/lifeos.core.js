/**
 * Life OS 读/写辅助（纯函数）。AIOS.20 快照格式化 · AIOS.21 收件箱 payload。
 */

const TZ = 'America/Los_Angeles'

/** @param {Date} date @param {string} [tz] */
export function ymd(date, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * @param {{ period?: string, from?: string, to?: string }} args
 * @param {string} today YYYY-MM-DD
 */
export function resolvePeriod(args = {}, today) {
  const { period, from, to } = args
  if (from || to) {
    return { from: from || '1970-01-01', to: to || today, label: `${from || '起'} ~ ${to || today}` }
  }
  const [y, m] = today.split('-').map(Number)
  const at = (yy, mm, dd) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const minusDays = (n) => {
    const base = new Date(`${today}T12:00:00Z`)
    base.setUTCDate(base.getUTCDate() - n)
    return ymd(base, 'UTC')
  }
  switch (period || 'this_month') {
    case 'today':
      return { from: today, to: today, label: '今天' }
    case 'yesterday': {
      const yd = minusDays(1)
      return { from: yd, to: yd, label: '昨天' }
    }
    case 'last_7_days':
      return { from: minusDays(6), to: today, label: '近 7 天' }
    case 'last_30_days':
      return { from: minusDays(29), to: today, label: '近 30 天' }
    case 'last_month': {
      const lm = m === 1 ? 12 : m - 1
      const ly = m === 1 ? y - 1 : y
      const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate()
      return { from: at(ly, lm, 1), to: at(ly, lm, lastDay), label: '上个月' }
    }
    case 'this_year':
      return { from: at(y, 1, 1), to: today, label: `${y} 年至今` }
    case 'all':
      return { from: '1970-01-01', to: today, label: '全部' }
    case 'this_month':
    default:
      return { from: at(y, m, 1), to: today, label: '本月至今' }
  }
}

/** @param {{ budget_impact?: number, amount?: number }} row */
export function expenseAmt(row) {
  const bi = Number(row.budget_impact) || 0
  const amt = Number(row.amount) || 0
  return Math.abs(bi !== 0 ? bi : amt)
}

/**
 * AIOS.20 — portal_today_summary → 可读快照文本。
 * @param {object | null | undefined} data
 */
export function formatLifeOsToday(data) {
  if (!data || data.ok === false) return '暂无今日数据。'
  const lines = [`Life OS 今日快照(${data.asOf}):`]
  if (data.planner) {
    const p = data.planner
    lines.push(
      `· 待办:今天到期 ${p.todayOpen ?? 0} 项` +
        (p.overdue ? `,逾期 ${p.overdue} 项` : ''),
    )
  }
  if (data.finance) {
    const f = data.finance
    lines.push(
      `· 财务(本月至今):支出 ¥${f.monthExpense ?? 0}、收入 ¥${f.monthIncome ?? 0}、结余 ¥${f.monthSurplus ?? 0}`,
    )
  }
  if (data.fitness) {
    const ft = data.fitness
    lines.push(
      ft.workedOutToday
        ? `· 健身:今天已训练${ft.todayCompleted ? '(已完成)' : '(进行中)'}${ft.todayDayId ? ` — ${ft.todayDayId}` : ''}`
        : `· 健身:今天还没训练${ft.lastSessionDate ? `,上次 ${ft.lastSessionDate}${ft.lastDayId ? ` (${ft.lastDayId})` : ''}` : ''}`,
    )
  }
  if (data.music) {
    lines.push(
      `· 音乐:最近在听《${data.music.trackTitle}》${data.music.trackArtist ? ` — ${data.music.trackArtist}` : ''}`,
    )
  }
  if (data.home?.storageZoneCount != null) {
    lines.push(`· 家务:收纳分区 ${data.home.storageZoneCount} 个`)
  }
  return lines.join('\n')
}

/**
 * AIOS.21 — life_events `core.task_captured` payload（不含 user_id / type）。
 * @param {{ title?: string, notes?: string, dueDate?: string }} args
 * @param {{ now?: () => string }} [opts] inject capture_id for tests
 */
export function buildTaskCapturePayload(args = {}, opts = {}) {
  const title = String(args.title ?? '').trim()
  if (!title) return { error: 'empty_title' }
  const captureId =
    typeof opts.now === 'function'
      ? opts.now()
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cap_${Date.now()}`
  const payload = { capture_id: captureId, title, source: 'aios' }
  if (args.notes && String(args.notes).trim()) payload.notes = String(args.notes).trim()
  if (args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) payload.due_date = args.dueDate
  return { payload }
}

/**
 * 早晨简报正文（AIOS.22；与 proactive 共用）。
 * @param {object | null | undefined} data
 * @param {Date} [now]
 */
export function buildBriefText(data, now = new Date()) {
  if (!data) return null
  const bits = []
  if (data.planner) {
    const { todayOpen = 0, overdue = 0 } = data.planner
    if (todayOpen || overdue) {
      bits.push(`${todayOpen} 项今日待办` + (overdue ? `、${overdue} 项逾期` : ''))
    } else {
      bits.push('今天暂无到期待办')
    }
  }
  if (data.finance) {
    bits.push(`本月支出 ¥${data.finance.monthExpense ?? 0}`)
  }
  if (data.fitness) {
    bits.push(data.fitness.workedOutToday ? '今天已训练' : '今天还没训练')
  }
  if (!bits.length) return null
  const title = `今日简报 · ${now.getMonth() + 1}月${now.getDate()}日`
  return { title, body: bits.join(' · ') }
}
