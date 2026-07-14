import { dateKeyOf } from '../persist/migrate.js'

const TRAILING_PROJECT_QUERY = /(?:^|\s)@([^@\s]*)$/

/** @param {string} value */
export function projectQueryFromTitle(value) {
  const match = value.match(TRAILING_PROJECT_QUERY)
  return match ? match[1].toLowerCase() : null
}

/** @param {string} value */
export function titleWithoutProjectQuery(value) {
  return value.replace(TRAILING_PROJECT_QUERY, '').trim()
}

/**
 * @param {import('../types.js').PlannerProject[]} projects
 * @param {string} query
 * @param {number} [limit]
 */
export function filterCaptureProjects(projects, query, limit = 5) {
  const needle = query.trim().toLocaleLowerCase()
  return projects
    .filter((project) => project.title.toLocaleLowerCase().includes(needle))
    .slice(0, limit)
}

/** 优先级词 → TaskPriority。P0=最高 … P3=最低 */
const PRIORITY_TOKENS = {
  '!p0': 'P0', '!p1': 'P1', '!p2': 'P2', '!p3': 'P3',
  '!急': 'P0', '!紧急': 'P0', '!最高': 'P0',
  '!高': 'P1', '!中': 'P2', '!低': 'P3',
}

/** 中文星期字 → ISO 周几（周一=1 … 周日=7） */
const WEEKDAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

/** @param {string} today YYYY-MM-DD @param {number} n */
function shiftDate(today, n) {
  const [y, m, d] = today.split('-').map(Number)
  return dateKeyOf(new Date(y, m - 1, d + n))
}

/**
 * 把一个空白分隔的 token 解析为日期，无法识别返回 null。
 * @param {string} token
 * @param {string} today YYYY-MM-DD
 * @returns {string|null}
 */
function matchDateToken(token, today) {
  switch (token) {
    case '今天':
    case '今日':
      return today
    case '明天':
    case '明日':
      return shiftDate(today, 1)
    case '后天':
      return shiftDate(today, 2)
    case '大后天':
      return shiftDate(today, 3)
  }
  const m = token.match(/^(下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])$/)
  if (!m) return null
  const target = WEEKDAYS[m[2]]
  const [y, mo, d] = today.split('-').map(Number)
  const dow = new Date(y, mo - 1, d).getDay()
  const cur = dow === 0 ? 7 : dow // 周一=1 … 周日=7
  if (m[1] === '下') {
    const toNextMonday = ((8 - cur) % 7) || 7
    return shiftDate(today, toNextMonday + (target - 1))
  }
  // 无前缀 / 本周 / 这周：本周内即将到来的那一天（含今天）
  return shiftDate(today, ((target - cur) % 7 + 7) % 7)
}

/** 把全角 ！＃ 归一化为半角，便于识别 */
function normalizeToken(token) {
  return token.replace(/^！/, '!').replace(/^＃/, '#')
}

/**
 * 轻量本地解析快速添加语法：日期（今天/明天/后天/大后天/周X/下周X）、
 * 优先级（!高/!中/!低 · !P0–P3 等）、标签（#标签）。识别到的 token 会从
 * 标题剥离；未识别的原样保留。仅解析空白分隔的独立 token，避免误伤正文。
 * @param {string} raw 已去掉 @项目 语法的标题
 * @param {string} today YYYY-MM-DD
 * @returns {{ title: string, dueDate: string|null, priority: import('../types.js').TaskPriority|null, tags: string[] }}
 */
export function parseQuickAddTokens(raw, today) {
  /** @type {string|null} */
  let dueDate = null
  /** @type {import('../types.js').TaskPriority|null} */
  let priority = null
  /** @type {string[]} */
  const tags = []
  const kept = []

  for (const part of raw.split(/\s+/)) {
    if (!part) continue
    const token = normalizeToken(part)
    if (priority == null && PRIORITY_TOKENS[token.toLowerCase()]) {
      priority = PRIORITY_TOKENS[token.toLowerCase()]
      continue
    }
    if (token.length > 1 && token.startsWith('#')) {
      const tag = token.slice(1)
      if (tag && !tags.includes(tag)) tags.push(tag)
      continue
    }
    if (dueDate == null) {
      const d = matchDateToken(token, today)
      if (d) {
        dueDate = d
        continue
      }
    }
    kept.push(part)
  }

  return { title: kept.join(' ').trim(), dueDate, priority, tags }
}

