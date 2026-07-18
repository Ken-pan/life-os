/**
 * 知识库统计 → 图表数据（零依赖纯函数，记忆库「概览」+ 各页点缀复用）。
 *
 * 全部吃显式 `now`（ms）做时间分桶，确定性、可 node 直测。
 * 条目 KItem：{ type:'note'|'link'|'clip', tags:string[], createdAt, updatedAt, ... }
 */

const DAY = 86400000
const WEEK = 7 * DAY

/** 当天 00:00 的时间戳。 */
export function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "M/D" 数字标签（语言无关）。 */
export function monthDay(ms) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 类型分布：{ note, link, clip }（缺项为 0）。 */
export function typeBreakdown(items) {
  const counts = { note: 0, link: 0, clip: 0 }
  for (const it of items) counts[it.type] = (counts[it.type] ?? 0) + 1
  return counts
}

/** 高频标签 Top-n → [{ label, value }]（按次数降序）。 */
export function topTags(items, n = 12) {
  const counts = new Map()
  for (const it of items) for (const tag of it.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, value]) => ({ label, value }))
}

/**
 * 累计增长：最近 weeks 周每周末的累计条目数 → { labels:"M/D"[], values:number[] }。
 * 上扬曲线，直观呈现「第二大脑」的生长。
 */
export function growthSeries(items, { now, weeks = 12 } = {}) {
  const labels = []
  const values = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const boundary = now - i * WEEK
    labels.push(monthDay(boundary))
    values.push(items.filter((it) => it.createdAt <= boundary).length)
  }
  return { labels, values }
}

/** 最近 weeks 周每周「新增」条目数 → number[]（sparkline / 柱图用）。 */
export function weeklyCounts(items, { now, weeks = 8 } = {}) {
  const out = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const hi = now - i * WEEK
    const lo = hi - WEEK
    out.push(items.filter((it) => it.createdAt > lo && it.createdAt <= hi).length)
  }
  return out
}

/**
 * 活跃热力图（GitHub 式）：7 行(周日→周六) × weeks 列(周)。
 * 返回 { cols:"M/D"[], values:(number|null)[][] }；未来的格子为 null。
 * 消费方自备 rows（本地化的星期短标，须周日→周六顺序）。
 */
export function activityHeatmap(items, { now, weeks = 16 } = {}) {
  const today = startOfDay(now)
  const dow = new Date(today).getDay() // 0=周日 … 6=周六
  const lastCol = today + (6 - dow) * DAY // 本周周六
  const startDay = lastCol - (weeks * 7 - 1) * DAY

  const perDay = new Map()
  for (const it of items) {
    const d = startOfDay(it.createdAt)
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }

  const values = Array.from({ length: 7 }, () => Array(weeks).fill(0))
  for (let c = 0; c < weeks; c += 1) {
    for (let r = 0; r < 7; r += 1) {
      const day = startDay + (c * 7 + r) * DAY
      values[r][c] = day > today ? null : perDay.get(day) ?? 0
    }
  }
  const cols = Array.from({ length: weeks }, (_, c) => monthDay(startDay + c * 7 * DAY))
  return { cols, values }
}

/**
 * 笔记列表分组（Apple Notes 式）：置顶 → 今天 → 昨天 → 本周内 → 更早。
 * 输入需已排序（置顶在前、updatedAt 降序）；返回 [{ key, items }]，空组略去。
 */
export function groupNotes(items, { now } = { now: 0 }) {
  const today = startOfDay(now)
  const pinned = []
  const buckets = { today: [], yesterday: [], week: [], older: [] }
  for (const it of items) {
    if (it.pinned) { pinned.push(it); continue }
    const d = startOfDay(it.updatedAt || it.createdAt)
    if (d === today) buckets.today.push(it)
    else if (d === today - DAY) buckets.yesterday.push(it)
    else if (d > today - 7 * DAY) buckets.week.push(it)
    else buckets.older.push(it)
  }
  const out = []
  if (pinned.length) out.push({ key: 'pinned', items: pinned })
  for (const k of ['today', 'yesterday', 'week', 'older'])
    if (buckets[k].length) out.push({ key: k, items: buckets[k] })
  return out
}

/** 快照统计（KPI 磁贴）：总数 / 本周新增 / 标签数 / 各类型数。 */
export function snapshot(items, { now } = { now: 0 }) {
  const weekAgo = now - WEEK
  const types = typeBreakdown(items)
  const tags = new Set()
  for (const it of items) for (const tag of it.tags ?? []) tags.add(tag)
  return {
    total: items.length,
    week: items.filter((it) => it.createdAt > weekAgo).length,
    tags: tags.size,
    ...types,
  }
}

const WIKILINK_RE = /\[\[[^\]]+\]\]/

/** 是否像「轻捕获」：短、无双链，优先需要整理。 */
export function looksUnprocessed(item) {
  if (!item) return false
  const body = String(item.body || '')
  if (WIKILINK_RE.test(body)) return false
  const meta = item._meta ?? {}
  const fmTags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : []
  if (fmTags.map((x) => String(x).toLowerCase()).includes('project')) return false
  if (item.type === 'link') return true
  return body.length < 420
}

/**
 * 行动型首页信号（纯函数，可测）。
 * @returns {{ pending: any[], staleProjects: any[], orphans: any[], continueItems: any[], revisit: any[] }}
 */
export function actionSignals(items, { now = 0, isProject = () => false } = {}) {
  const weekAgo = now - WEEK
  const staleCut = now - 7 * DAY
  const sorted = [...items].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))

  const pending = sorted
    .filter((it) => it.createdAt > weekAgo && looksUnprocessed(it))
    .slice(0, 8)

  const staleProjects = sorted
    .filter((it) => {
      if (!isProject(it)) return false
      const status = String(it._meta?.status || '').toLowerCase()
      if (['completed', 'archived', 'done', 'shipped'].includes(status)) return false
      return (it.updatedAt || it.createdAt) < staleCut
    })
    .slice(0, 6)

  const orphans = sorted
    .filter((it) => {
      if (isProject(it)) return false
      if (it.createdAt < weekAgo) return false
      return !WIKILINK_RE.test(String(it.body || ''))
    })
    .slice(0, 6)

  const continueItems = sorted
    .filter((it) => (it.updatedAt || 0) > weekAgo && (it.updatedAt || 0) !== (it.createdAt || 0))
    .slice(0, 5)

  const threeMonths = now - 90 * DAY
  const revisit = sorted
    .filter((it) => {
      const ts = it.updatedAt || it.createdAt
      return ts < threeMonths && (it.pinned || (it.tags || []).length >= 2)
    })
    .slice(0, 4)

  return { pending, staleProjects, orphans, continueItems, revisit }
}
