/**
 * Planner MCP 侧的纯任务逻辑（无浏览器/无 $lib 依赖，node 可直测）。
 *
 * 任务对象形状与 `src/lib/domain/tasks.js` 的 createTask 对齐 —— MCP add_task 写进
 * `planner_tasks.data` 的行必须能被客户端 LWW 同步逐字消费（就像另一台设备加的任务）。
 * 这里不碰 Supabase / 不碰 AppState，只做「构建 / 过滤 / 完成 / 格式化」。
 */

const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const SYSTEM_LIST_INBOX = 'inbox'

/** 生成任务 id（与 planner `uid()` 同源：优先 crypto.randomUUID）。 */
export function newTaskId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** YYYY-MM-DD 校验（add_task 的 dueDate / today_agenda 的 today）。 */
export function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * 从 MCP 入参构建一个完整任务对象（补齐所有 createTask 字段，默认值一致）。
 * @param {{ title?: string, notes?: string, dueDate?: string, priority?: string, listId?: string }} input
 * @param {{ id?: string, now?: number }} [opts]
 */
export function buildTask(input = {}, { id = newTaskId(), now = Date.now() } = {}) {
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'P3'
  const dueDate = isIsoDate(input.dueDate) ? input.dueDate : null
  return {
    id,
    title: String(input.title ?? '').trim(),
    notes: String(input.notes ?? ''),
    listId: input.listId || SYSTEM_LIST_INBOX,
    priority,
    urgency: 'normal',
    size: 'medium',
    area: 'other',
    effortMin: null,
    nextAction: null,
    aiContext: null,
    projectId: null,
    dueDate,
    dueTime: null,
    scheduledDate: null,
    scheduledStart: null,
    durationMinutes: null,
    reminderMinutes: null,
    recurrence: null,
    tags: [],
    subtasks: [],
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sortOrder: now,
    meta: { kind: 'standard', source: 'mcp' },
  }
}

/** 未完成且未删除。 */
export function isOpen(t) {
  return Boolean(t) && !t.completed && !t.deletedAt
}

/** 是否「今天该做」：未完成，且已逾期 / 今天截止 / 今天排程。todayStr = YYYY-MM-DD。 */
export function isToday(t, todayStr) {
  if (!isOpen(t) || !isIsoDate(todayStr)) return false
  const dueToday = t.dueDate && t.dueDate <= todayStr
  const schedToday = t.scheduledDate && t.scheduledDate === todayStr
  return Boolean(dueToday || schedToday)
}

/** 标记完成，返回新任务对象（updatedAt 刷新 → LWW 让此变更胜出）。 */
export function completeTask(t, now = Date.now()) {
  return { ...t, completed: true, completedAt: now, updatedAt: now }
}

/** 人类可读的一行（MCP 文本输出）。 */
export function formatTaskLine(t) {
  const pri = t.priority && t.priority !== 'P3' ? `[${t.priority}] ` : ''
  const due = t.dueDate ? `（截止 ${t.dueDate}）` : ''
  const done = t.completed ? '✓ ' : ''
  return `${done}${pri}${t.title || '(无标题)'}${due}`
}

/**
 * 按范围/关键词/日期筛选并排序（sortOrder 升序）。
 * @param {object[]} tasks
 * @param {{ scope?: 'open'|'today'|'all', query?: string, today?: string, limit?: number }} [opts]
 */
export function selectTasks(tasks, { scope = 'open', query = '', today = '', limit = 50 } = {}) {
  let list = (tasks || []).filter((t) => t && !t.deletedAt)
  if (scope === 'open') list = list.filter(isOpen)
  else if (scope === 'today') list = list.filter((t) => isToday(t, today))
  const q = String(query || '').trim().toLowerCase()
  if (q) {
    list = list.filter(
      (t) =>
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.notes || '').toLowerCase().includes(q),
    )
  }
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  return limit > 0 ? list.slice(0, limit) : list
}

/**
 * 找一条待完成的任务：优先 id 精确；否则在未完成任务里按标题精确 → 包含匹配。
 * @returns {object|null}
 */
export function findTaskToComplete(tasks, { id = '', title = '' } = {}) {
  const list = tasks || []
  if (id) return list.find((t) => t.id === id && !t.deletedAt) || null
  const q = String(title || '').trim().toLowerCase()
  if (!q) return null
  const open = list.filter(isOpen)
  return (
    open.find((t) => String(t.title || '').toLowerCase() === q) ||
    open.find((t) => String(t.title || '').toLowerCase().includes(q)) ||
    null
  )
}

export function buildCreateTaskAction(input = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const correlationId = opts.correlationId || newTaskId()
  const idempotencyKey = opts.idempotencyKey || correlationId
  const task = buildTask(input, { id: opts.id || newTaskId(), now })
  task.meta = {
    ...task.meta,
    source: 'assistant_action',
    command: { actionType: 'plan.create_task', idempotencyKey, correlationId },
  }
  const entityRef = { domain: 'plan', type: 'task', id: task.id }
  return {
    action: {
      type: 'plan.create_task',
      source: 'assistant',
      userRequested: true,
      idempotencyKey,
      correlationId,
      risk: 'R1',
    },
    task,
    outbox: {
      actionType: 'plan.create_task',
      idempotencyKey,
      correlationId,
      entityRef,
      status: 'pending',
      payload: { title: task.title, dueDate: task.dueDate, listId: task.listId },
      createdAt: now,
      updatedAt: now,
    },
    activity: {
      actionType: 'plan.create_task',
      correlationId,
      actor: 'assistant',
      source: 'assistant',
      policy: { risk: 'R1', decision: 'allowed', approval: 'not_required' },
      entityRef,
      summary: `Created Plan task: ${task.title}`,
      redactedPayload: { title: task.title, dueDate: task.dueDate, notes: task.notes ? '[REDACTED_NOTES]' : '' },
      createdAt: now,
    },
  }
}


export async function executeAssistantCreateTaskCommand({ supabase, userId, input = {}, persistTask, opts = {} } = {}) {
  if (!supabase || !userId || typeof persistTask !== 'function') {
    return { ok: false, error: { code: 'missing_remote_command_dependency', message: 'Remote Plan create-task command requires supabase, userId, and persistTask.' } }
  }
  if (input.workSource) {
    return { ok: false, error: { code: 'work_source_excluded', message: 'Work-sourced task payloads are excluded from KR-P1-001.' } }
  }
  const title = String(input.title ?? '').trim()
  if (!title) return { ok: false, error: { code: 'title_required', message: 'Task title is required.' } }
  const command = buildCreateTaskAction({ ...input, title }, opts)
  try {
    await persistTask(supabase, userId, command.task)
  } catch (error) {
    return { ok: false, error: { code: 'remote_task_persist_failed', message: error?.message ?? String(error) }, command }
  }
  return { ok: true, ...command }
}
