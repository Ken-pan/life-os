// 本地演示数据（localhost）—— 一整套自洽的规划快照，全面点亮各核心页面：
// 今日 / 日历 / 接下来 / 项目 / 洞察 / 已完成 / 整理。仅 localhost 空库时灌入（见 demoMode.js）。
// 结构随 migrate() 归一化，写宽松即可。数值虚构。

const DAY = 86_400_000

/** 本地日期 YYYY-MM-DD（不能用 toISOString——那是 UTC，会把「今天」错排到相邻日，日历/今日分组全错）。 */
function dayIso(offsetDays) {
  const d = new Date(Date.now() - offsetDays * DAY)
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** @param {number} offsetDays */
function ts(offsetDays) {
  return Date.now() - offsetDays * DAY
}

const PROJECTS = [
  { id: 'demo-proj-refactor', title: '规划模块重构', slug: 'planner-refactor', status: 'active', priority: 'p1', summary: '把今日/日程页迁到统一 PageShell，收敛设计系统。', progressMode: 'automatic', roadmapRefs: ['PLNR.UIUX.0'], repoRefs: ['life-os'] },
  { id: 'demo-proj-launch', title: 'Q3 发布计划', slug: 'q3-launch', status: 'active', priority: 'p0', summary: '四个 OS 的季度发布：验收、文案、灰度。', progressMode: 'manual', manualProgress: 60 },
  { id: 'demo-proj-home', title: '搬家与整理', slug: 'moving', status: 'paused', priority: 'p2', summary: '打包、清单、家具复位。', progressMode: 'automatic' },
  { id: 'demo-proj-learn', title: '学习：系统设计', slug: 'system-design', status: 'active', priority: 'p2', summary: '每周两章 + 一次实操。', progressMode: 'automatic' },
]

const LISTS = [
  { id: 'work', title: '工作', icon: 'briefcase', color: '#0F66AE', sortOrder: 1, updatedAt: ts(30) },
  { id: 'life', title: '生活', icon: 'sparkles', color: '#e9a832', sortOrder: 2, updatedAt: ts(30) },
]

/** 生成一条 task（宽松字段，migrate 补默认）。 */
function task(o) {
  return { createdAt: ts(20), updatedAt: ts(1), completed: false, ...o }
}

function buildTasks() {
  /** @type {any[]} */
  const t = []

  // —— 今日：已排期 + 到期，含时间块（点亮 今日 / 日程 / 日历）——
  t.push(task({ id: 'd-t1', title: '写本周周报', listId: 'work', projectId: 'demo-proj-refactor', priority: 'P1', area: 'work', dueDate: dayIso(0), scheduledDate: dayIso(0), scheduledStart: '09:30', durationMinutes: 45, tags: ['work', 'weekly'], subtasks: [{ id: 's1', title: '收集四个 OS 进度', done: true }, { id: 's2', title: '整理数据图', done: false }] }))
  t.push(task({ id: 'd-t2', title: '评审 PLNR.UIUX.0 收口', listId: 'work', projectId: 'demo-proj-refactor', priority: 'P0', urgency: 'urgent', area: 'planner', dueDate: dayIso(0), scheduledDate: dayIso(0), scheduledStart: '11:00', durationMinutes: 60, tags: ['review'] }))
  t.push(task({ id: 'd-t3', title: '健身：胸 · 三头', listId: 'life', priority: 'P2', area: 'fitness', dueDate: dayIso(0), scheduledDate: dayIso(0), scheduledStart: '19:00', durationMinutes: 60, tags: ['health'] }))
  t.push(task({ id: 'd-t4', title: '回复合作邮件', listId: 'work', priority: 'P1', area: 'work', dueDate: dayIso(0), tags: ['inbox-zero'] }))

  // —— 接下来：未来 1-2 周（点亮 接下来 / 日历）——
  const upcoming = [
    ['u1', '季度发布彩排', 'demo-proj-launch', 2, 'P0', 'work'],
    ['u2', '预约牙医', null, 3, 'P2', 'life'],
    ['u3', '系统设计 第 4 章', 'demo-proj-learn', 4, 'P2', 'life'],
    ['u4', '灰度发布 Finance', 'demo-proj-launch', 5, 'P1', 'work'],
    ['u5', '整理旧家具清单', 'demo-proj-home', 8, 'P2', 'home'],
    ['u6', '季度复盘会', 'demo-proj-launch', 11, 'P1', 'work'],
  ]
  for (const [id, title, projectId, off, priority, area] of upcoming) {
    t.push(task({ id: `up-${id}`, title, listId: area === 'work' ? 'work' : 'life', projectId, priority, area, dueDate: dayIso(-off), tags: [area] }))
  }

  // —— 收集箱 / 待整理：无到期、无 triage 标记（点亮 收集箱 / 整理）——
  const inbox = ['把书房相机三脚架收纳', '研究本地 TTS 音色切换', '给画廊页加密码保护？', '整理 2026 报税材料', '读《Thinking in Systems》', '订下季度机票']
  inbox.forEach((title, i) => t.push(task({ id: `in-${i}`, title, listId: 'inbox', priority: 'P2', area: 'life', tags: i % 2 ? ['idea'] : ['errand'], createdAt: ts(i + 1) })))

  // —— 已完成：过去 ~16 天的历史，点亮 已完成 / 洞察 / 节奏连续达标 ——
  let cid = 0
  for (let d = 1; d <= 16; d++) {
    const n = [3, 2, 4, 1, 3, 2, 3, 0, 2, 3, 1, 4, 2, 3, 2, 3][d - 1] ?? 2
    for (let k = 0; k < n; k++) {
      const areas = ['work', 'life', 'planner', 'fitness', 'home']
      const area = areas[(d + k) % areas.length]
      t.push(task({
        id: `done-${cid++}`,
        title: `${['整理', '完成', '处理', '复盘', '修复'][(d + k) % 5]}${['接口文档', '训练记录', '设计走查', '周计划', '收纳清单'][(d + k) % 5]}`,
        listId: area === 'work' || area === 'planner' ? 'work' : 'life',
        projectId: k === 0 ? PROJECTS[(d + k) % PROJECTS.length].id : null,
        priority: ['P1', 'P2', 'P0', 'P3'][(d + k) % 4],
        area,
        tags: [area],
        completed: true,
        completedAt: ts(d) + k * 3_600_000,
        createdAt: ts(d + 2),
        updatedAt: ts(d),
      }))
    }
  }

  return t
}

/** 完整 AppState（raw，交给 migrate 归一化）。 */
export function buildDemoState() {
  return {
    schemaVersion: 3,
    tasks: buildTasks(),
    projects: PROJECTS.map((p) => ({ createdAt: ts(40), updatedAt: ts(1), ...p })),
    attachments: [],
    lists: [
      { id: 'inbox', title: '收件箱', system: true, sortOrder: 0, updatedAt: ts(40) },
      ...LISTS,
    ],
    settings: { theme: 'auto', locale: 'zh', defaultListId: 'inbox' },
  }
}
