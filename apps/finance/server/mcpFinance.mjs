/**
 * Finance MCP 纯逻辑（FINC.MCP.1）——无 Netlify / Supabase 依赖，可单测。
 *
 * 口径：
 * - month_summary：与 Portal `portal_today_summary.finance` 同源（本月收入/支出/结余）
 * - liquid_cash：checking/savings 且 liquid≠false 的账户余额合计（近似可用现金，非 STS）
 */

/**
 * @param {unknown} n
 * @returns {number}
 */
export function roundMoney(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

/**
 * @param {{ monthExpense?: unknown, monthIncome?: unknown, monthSurplus?: unknown } | null | undefined} finance
 * @param {{ label?: string }} [opts]
 * @returns {string}
 */
export function formatMonthSummary(finance, opts = {}) {
  if (!finance || typeof finance !== 'object') {
    return '还没有本月财务汇总。请先在 Finance 登录并同步交易。'
  }
  const expense = roundMoney(finance.monthExpense)
  const income = roundMoney(finance.monthIncome)
  const surplus = roundMoney(
    finance.monthSurplus != null ? finance.monthSurplus : income - expense,
  )
  const label = opts.label ? `（${opts.label}）` : ''
  const sign = surplus >= 0 ? '+' : ''
  return [
    `本月财务${label}：`,
    `· 支出 $${expense}`,
    `· 收入 $${income}`,
    `· 结余 ${sign}$${surplus}`,
  ].join('\n')
}

/**
 * @param {Array<{ balance?: unknown, type?: unknown, liquid?: unknown, name?: unknown } | null | undefined> | null | undefined} accounts
 * @returns {{ total: number, lines: string[] }}
 */
export function summarizeLiquidCash(accounts) {
  const rows = Array.isArray(accounts) ? accounts.filter(Boolean) : []
  /** @type {string[]} */
  const lines = []
  let total = 0
  for (const a of rows) {
    const type = String(a.type || '')
    if (type !== 'checking' && type !== 'savings') continue
    if (a.liquid === false) continue
    const bal = roundMoney(a.balance)
    total = roundMoney(total + bal)
    const name = String(a.name || type).trim() || type
    lines.push(`· ${name}：$${bal}`)
  }
  return { total, lines }
}

/**
 * @param {ReturnType<typeof summarizeLiquidCash>} summary
 * @returns {string}
 */
export function formatLiquidCash(summary) {
  if (!summary.lines.length) {
    return '没有可计入的流动账户（checking/savings）。请先在 Finance 添加账户并同步。'
  }
  return [
    `流动现金合计：$${summary.total}`,
    ...summary.lines,
    '（近似可用现金；「放心花 / STS」需打开 Finance Today 查看完整推演）',
  ].join('\n')
}

/**
 * @param {string | null | undefined} tz
 * @returns {boolean}
 */
export function isTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false
  const s = tz.trim()
  if (!s || s.length > 64) return false
  // 粗检：IANA 风格或常见别名，避免乱传
  return /^[A-Za-z0-9_+/-]+$/.test(s)
}
