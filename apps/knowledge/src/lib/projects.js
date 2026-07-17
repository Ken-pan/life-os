/**
 * 项目现状感知的纯函数层（零依赖，node 可直测）。
 *
 * 数据源三路汇合：
 * - Vault 项目笔记（frontmatter: status / path / last_updated）
 * - 真实工程目录的 git 活动（.git/logs/HEAD 最后一条提交时间）
 * - Planner 的项目与任务（planner_projects / planner_tasks，经 plannerBridge）
 * 输出：每个项目的归一化现状 + 漂移建议（笔记写的和实际不符时给一键更新）。
 */

/** 归一化状态全集（看板列顺序） */
export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived', 'reference']

const STATUS_ALIASES = new Map([
  ['active', 'active'],
  ['in-progress', 'active'],
  ['in progress', 'active'],
  ['wip', 'active'],
  ['doing', 'active'],
  ['ongoing', 'active'],
  ['discovery', 'active'],
  ['design in progress', 'active'],
  ['design review', 'active'],
  ['design qa', 'active'],
  ['ready for engineering', 'active'],
  ['paused', 'paused'],
  ['on-hold', 'paused'],
  ['on hold', 'paused'],
  ['hold', 'paused'],
  ['backlog', 'paused'],
  ['someday', 'paused'],
  ['done', 'completed'],
  ['completed', 'completed'],
  ['complete', 'completed'],
  ['shipped', 'completed'],
  ['launched', 'completed'],
  ['released', 'completed'],
  ['archived', 'archived'],
  ['archive', 'archived'],
  ['retired', 'archived'],
  ['deprecated', 'archived'],
  ['reference', 'reference'],
  ['ref', 'reference'],
])

/** 乱七八糟的手写 status（Done / Design QA / in-progress…）→ 归一化；识别不了返回 null。 */
export function normalizeStatus(raw) {
  if (!raw) return null
  return STATUS_ALIASES.get(String(raw).trim().toLowerCase()) ?? null
}

/** Planner 项目状态 → 笔记归一化状态。 */
export function fromPlannerStatus(status) {
  const map = { active: 'active', paused: 'paused', shipped: 'completed', archived: 'archived' }
  return map[status] ?? null
}

/**
 * 项目笔记判定：frontmatter tags 含 project，且不是索引/看板/清单类聚合页。
 * （目录派生标签不算 —— 避免把 Personal Project/ 下的说明文件全捞进来。）
 */
export function isProjectItem(item) {
  const meta = item._meta ?? {}
  const metaType = String(meta.type ?? '').toLowerCase()
  if (['index', 'dashboard', 'checklist', 'moc'].includes(metaType)) return false
  const fmTags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : []
  const tags = fmTags.map((t) => String(t).trim().replace(/^#/, '').toLowerCase())
  return tags.includes('project')
}

/** KItem → 项目记录（看板消费的形状）。 */
export function projectRecord(item) {
  const meta = item._meta ?? {}
  return {
    id: item.id,
    title: item.title,
    rawStatus: meta.status ? String(meta.status) : '',
    status: normalizeStatus(meta.status),
    path: meta.path ? String(meta.path) : '',
    lastUpdated: meta.last_updated ? String(meta.last_updated) : '',
    tags: item.tags,
    updatedAt: item.updatedAt,
  }
}

/** 标题归一化用于匹配：小写、去空白与标点（保留中日韩与字母数字）。 */
function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** path 尾段（"~/「Projects」/Photo Organizor" → "photo organizor" 归一键）。 */
function pathKey(p) {
  const seg = String(p ?? '').replace(/\/+$/, '').split('/').pop()
  return normKey(seg)
}

/**
 * 匹配 Planner 项目：标题/slug 归一相等，或 repoRefs 与笔记 path 尾段相同。
 * @param {{title: string, path?: string}} record
 * @param {Array<{id, title, slug, status, repoRefs?}>} plannerProjects
 */
export function matchPlannerProject(record, plannerProjects) {
  const titleKey = normKey(record.title)
  const pKey = pathKey(record.path)
  for (const p of plannerProjects) {
    if (p.deletedAt) continue
    const pTitle = normKey(p.title)
    const pSlug = normKey(p.slug)
    if (titleKey && (pTitle === titleKey || pSlug === titleKey)) return p
    if (pKey && (p.repoRefs ?? []).some((ref) => pathKey(ref) === pKey)) return p
  }
  return null
}

/** planner_tasks → 按 projectId 聚合 {open, done, doneRecently}（墓碑排除）。 */
export function plannerTaskStats(tasks, { now = Date.now(), recentDays = 14 } = {}) {
  const stats = new Map()
  const recentCut = now - recentDays * 86400000
  for (const t of tasks) {
    if (!t || t.deletedAt || !t.projectId) continue
    let s = stats.get(t.projectId)
    if (!s) {
      s = { open: 0, done: 0, doneRecently: 0 }
      stats.set(t.projectId, s)
    }
    if (t.completed) {
      s.done += 1
      if (t.completedAt && t.completedAt >= recentCut) s.doneRecently += 1
    } else {
      s.open += 1
    }
  }
  return stats
}

/** .git/logs/HEAD 文本 → 最后一次操作的时间戳（ms）；解析不了返回 0。 */
export function parseGitHeadLog(text) {
  const lines = String(text ?? '').trimEnd().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/>\s+(\d{9,11})\s+[+-]\d{4}/)
    if (m) return Number(m[1]) * 1000
  }
  return 0
}

const DAY = 86400000

/**
 * 现状感知：三路证据 → 建议状态 + 理由。
 * 优先级：Planner 状态 > git 活跃度启发（30 天内有提交=active，90 天无提交的 active=建议 paused）。
 * completed/archived/reference 只在 Planner 明确复活（active）时才建议改回。
 * @returns {{ suggested: string|null, reasons: string[], lastCommitAt: number, planner: object|null, stats: object|null }}
 */
export function senseProject(record, { planner = null, stats = null, lastCommitAt = 0, now = Date.now() } = {}) {
  const reasons = []
  let suggested = null

  if (planner) {
    const mapped = fromPlannerStatus(planner.status)
    if (mapped) {
      suggested = mapped
      reasons.push(`Planner:${planner.status}`)
    }
    if (stats && (stats.open > 0 || stats.doneRecently > 0) && suggested === 'active') {
      reasons.push(`任务 ${stats.open} 开放 / 近两周完成 ${stats.doneRecently}`)
    }
  }

  if (!suggested && lastCommitAt > 0) {
    const idleDays = Math.floor((now - lastCommitAt) / DAY)
    const settled = ['completed', 'archived', 'reference'].includes(record.status)
    if (idleDays <= 30 && !settled) {
      suggested = 'active'
      reasons.push(idleDays === 0 ? '今天有提交' : `${idleDays} 天前有提交`)
    } else if (idleDays > 90 && record.status === 'active') {
      suggested = 'paused'
      reasons.push(`${idleDays} 天没有提交`)
    }
  }

  const drift = Boolean(suggested && suggested !== record.status)
  return { suggested: drift ? suggested : null, reasons, drift, lastCommitAt, planner, stats }
}

/** YYYY-MM-DD（本地时区）。 */
export function todayYmd(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 自动现状报告（KnowledgeOS 全权拥有、幂等重生成的 .md 全文）。
 * @param {Array<{record, sense}>} rows
 */
export function buildStatusReport(rows, { generatedAt = new Date() } = {}) {
  const label = {
    active: '🟢 进行中',
    paused: '⏸️ 暂停',
    completed: '✅ 已完成',
    archived: '📦 已归档',
    reference: '📚 参考',
  }
  const lines = [
    '---',
    'type: dashboard',
    'tags: [project, dashboard, auto]',
    'generated_by: knowledgeos',
    `last_updated: ${todayYmd(generatedAt)}`,
    '---',
    '',
    '# 📡 项目现状（自动）',
    '',
    '> 由 KnowledgeOS 项目视图生成，手工修改会在下次生成时被覆盖。',
    '> 证据来源：项目笔记 frontmatter + 工程目录 git 活动 + Planner 项目/任务。',
    '',
    '| 项目 | 现状 | 证据 | 笔记 |',
    '|------|------|------|------|',
  ]
  const rank = new Map(PROJECT_STATUSES.map((s, i) => [s, i]))
  const sorted = [...rows].sort((a, b) => {
    const sa = a.sense.suggested ?? a.record.status ?? 'reference'
    const sb = b.sense.suggested ?? b.record.status ?? 'reference'
    return (rank.get(sa) ?? 9) - (rank.get(sb) ?? 9) || a.record.title.localeCompare(b.record.title)
  })
  for (const { record, sense } of sorted) {
    const eff = sense.suggested ?? record.status
    const status = (eff && label[eff]) ?? record.rawStatus ?? '—'
    const evidence = sense.reasons.length ? sense.reasons.join('；') : '—'
    const noteName = record.id.split('/').pop().replace(/\.md$/i, '')
    lines.push(`| ${record.title} | ${status} | ${evidence} | [[${noteName}]] |`)
  }
  lines.push('')
  return lines.join('\n')
}
