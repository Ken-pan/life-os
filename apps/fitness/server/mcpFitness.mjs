/**
 * Fitness MCP 纯逻辑（GYMS.MCP.1）——无 Netlify / Supabase 依赖，可单测。
 */

const DAY_LABELS = {
  chest: '胸',
  back: '背',
  legs: '腿',
  arms: '臂',
  upper_a: '上肢 A',
  upper_b: '上肢 B',
  push: '推',
  pull: '拉',
  lower: '下肢',
}

/**
 * @param {unknown} dayId
 * @returns {string}
 */
export function dayLabel(dayId) {
  const id = String(dayId || '').trim()
  if (!id) return '—'
  return DAY_LABELS[id] || id
}

/**
 * @param {{
 *   workedOutToday?: unknown,
 *   todayCompleted?: unknown,
 *   todayDayId?: unknown,
 *   lastSessionDate?: unknown,
 *   lastDayId?: unknown,
 * } | null | undefined} fitness
 * @returns {string}
 */
export function formatTodayTraining(fitness) {
  if (!fitness || typeof fitness !== 'object') {
    return '还没有训练摘要。请先在 Fitness 登录并同步至少一次训练。'
  }
  const lines = ['今日训练：']
  if (fitness.workedOutToday) {
    const day = dayLabel(fitness.todayDayId)
    const done = fitness.todayCompleted ? '已完成' : '进行中'
    lines.push(`· 今天：${day}（${done}）`)
  } else {
    lines.push('· 今天：尚未开练')
  }
  if (fitness.lastSessionDate) {
    lines.push(`· 最近一次：${fitness.lastSessionDate} · ${dayLabel(fitness.lastDayId)}`)
  } else {
    lines.push('· 最近一次：暂无记录')
  }
  return lines.join('\n')
}

/**
 * @param {Array<{
 *   session_date?: unknown,
 *   day_id?: unknown,
 *   ended_at?: unknown,
 *   started_at?: unknown,
 * } | null | undefined> | null | undefined} sessions
 * @param {{ limit?: number }} [opts]
 * @returns {string}
 */
export function formatRecentSessions(sessions, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 7, 1), 30)
  const rows = (Array.isArray(sessions) ? sessions : [])
    .filter(Boolean)
    .slice(0, limit)
  if (!rows.length) {
    return '最近没有训练记录。在 Fitness 完成一组并同步后即可查询。'
  }
  const lines = [`最近 ${rows.length} 次训练：`]
  for (const s of rows) {
    const date = String(s.session_date || '—')
    const day = dayLabel(s.day_id)
    const status = s.ended_at ? '完成' : s.started_at ? '进行中' : '有记录'
    lines.push(`· ${date} · ${day} · ${status}`)
  }
  return lines.join('\n')
}

/**
 * 从云端 exercise_logs.sets（JSONB 数组）粗算近窗 RIR 提示。
 * 非客户端 readinessAssessment 全量复刻——只给 AIOS 可执行的短建议。
 *
 * @param {Array<{ sets?: unknown, done?: unknown } | null | undefined> | null | undefined} logs
 * @returns {string}
 */
export function formatReadinessHint(logs) {
  const rows = Array.isArray(logs) ? logs.filter(Boolean) : []
  /** @type {number[]} */
  const rirs = []
  for (const log of rows) {
    const sets = Array.isArray(log.sets) ? log.sets : []
    for (const set of sets) {
      if (!set || typeof set !== 'object') continue
      const rir = /** @type {{ rir?: unknown }} */ (set).rir
      const n = Number(rir)
      if (Number.isFinite(n)) rirs.push(n)
    }
  }
  if (rirs.length < 8) {
    return (
      '恢复度提示：近窗有效 RIR 组数不足（需 ≥8 组带 RIR 的记录）。' +
      '请在 Fitness Focus 里照常记 RIR，再问一次。'
    )
  }
  const avg = Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10
  const failurePct = Math.round((rirs.filter((r) => r <= 0).length / rirs.length) * 100)
  let level = '正常'
  let tip = '可按计划正常训练。'
  if (avg < 1 || failurePct >= 45) {
    level = '偏疲劳'
    tip = '建议今天少做 1 组，或工作重量降 5–10%，优先动作质量。'
  } else if (avg >= 2 && avg < 3.5 && failurePct <= 15) {
    level = '恢复充分'
    tip = '绿灯：可正常发力，状态好时可冲一组接近 PR。'
  }
  return [
    `恢复度提示（近窗 ${rirs.length} 组）：`,
    `· 平均 RIR ${avg} · 力竭占比 ${failurePct}% → ${level}`,
    `· ${tip}`,
  ].join('\n')
}
