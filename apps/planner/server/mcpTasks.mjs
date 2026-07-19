/**
 * Planner MCP 侧的纯任务逻辑（无浏览器/无 $lib 依赖，node 可直测）。
 *
 * 读路径仍直接查询 `planner_tasks`。
 * 写路径（add_task）必须走 Kenos v1 Action + server command boundary；
 * 不得再经 upsert 旁路 canonical Task writer。
 */

import { randomUUID } from 'node:crypto'
import {
  createMemoryCreateTaskDatabase,
  executeServerCreateTaskAction,
} from './kenos/createTaskCommand.mjs'

const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const SYSTEM_LIST_INBOX = 'inbox'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 生成任务 id（与 planner `uid()` 同源：优先 crypto.randomUUID）。 */
export function newTaskId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : randomUUID()
}

function asUuid(value, fallback = () => randomUUID()) {
  return UUID_PATTERN.test(value || '') ? value : fallback()
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

/**
 * Build a frozen Kenos v1 CreateTaskAction from Assistant MCP input.
 * `requestedRisk` is a client hint only — server policy reclassifies.
 */
export function buildCreateTaskAction(input = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildCreateTaskAction requires authenticated authUserId UUID')
  }
  const correlationId = asUuid(opts.correlationId)
  const actionId = asUuid(opts.actionId)
  const deviceId = asUuid(opts.deviceId)
  const idempotencyKey = String(opts.idempotencyKey || `mcp:${correlationId}`)
  const title = String(input.title ?? '').trim()
  const notes = String(input.notes ?? '')
  const dueDate = isIsoDate(input.dueDate) ? input.dueDate : null

  const action = {
    schemaVersion: '1',
    id: actionId,
    actionType: 'plan.create_task',
    producer: 'assistant',
    targetDomain: 'plan',
    actor: { type: 'assistant', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: opts.requestedRiskHint || 'R1',
    payload: {
      title,
      notes,
      ...(dueDate ? { dueDate } : {}),
      ...(input.listId ? { listId: input.listId } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.workSource ? { workSource: input.workSource } : {}),
      ...(input.bulk != null ? { bulk: input.bulk } : {}),
      ...(input.externalSideEffect != null ? { externalSideEffect: input.externalSideEffect } : {}),
      ...(input.productionScope != null ? { productionScope: input.productionScope } : {}),
      ...(input.reversible != null ? { reversible: input.reversible } : {}),
    },
    reason: 'Explicit user-requested Assistant MCP create-task',
    idempotencyKey,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    correlationId,
  }

  return { action }
}

/**
 * Map command-boundary task into Planner client LWW shape for display only.
 * Does not write storage.
 */
export function materializePlannerTaskView(commandTask, input = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const view = buildTask(
    {
      title: commandTask.title,
      notes: commandTask.notes || input.notes || '',
      dueDate: input.dueDate,
      priority: input.priority,
      listId: input.listId,
    },
    { id: commandTask.id, now },
  )
  view.meta = {
    ...view.meta,
    source: 'assistant_action',
    command: {
      actionType: 'plan.create_task',
      idempotencyKey: opts.idempotencyKey,
      correlationId: opts.correlationId,
    },
  }
  view.createdAt = Date.parse(commandTask.createdAt) || now
  view.updatedAt = Date.parse(commandTask.updatedAt) || now
  return view
}

/**
 * Assistant MCP create-task — always via Kenos server command boundary.
 *
 * Remote production persistence requires hosted `kenos_create_plan_task_action` RPC.
 * Direct `planner_tasks` upsert is intentionally unreachable from this path.
 */
export async function executeAssistantCreateTaskCommand({
  authUserId,
  input = {},
  opts = {},
  db,
  remoteRpc,
  mode = 'authenticated',
  // Legacy parameter — rejected so old direct-write call sites fail closed.
  persistTask,
  supabase,
  userId,
} = {}) {
  if (typeof persistTask === 'function') {
    return {
      ok: false,
      error: {
        code: 'direct_task_write_forbidden',
        message: 'MCP create-task must not receive persistTask/upsert adapters; use the Plan command boundary or hosted RPC.',
        class: 'permanent',
        retryable: false,
      },
    }
  }
  const ownerId = authUserId || userId
  if (!ownerId || !UUID_PATTERN.test(ownerId)) {
    return {
      ok: false,
      error: {
        code: 'auth_required',
        message: 'Authenticated identity is required for Assistant create-task.',
        class: 'permanent',
        retryable: false,
      },
    }
  }
  if (input.workSource) {
    return {
      ok: false,
      error: {
        code: 'work_source_excluded',
        message: 'Work-sourced task payloads are excluded from KR-P1-001.',
        class: 'permanent',
        retryable: false,
      },
    }
  }
  const title = String(input.title ?? '').trim()
  if (!title) {
    return {
      ok: false,
      error: { code: 'title_required', message: 'Task title is required.', class: 'permanent', retryable: false },
    }
  }

  let actionEnvelope
  try {
    actionEnvelope = buildCreateTaskAction({ ...input, title }, { ...opts, authUserId: ownerId })
  } catch (error) {
    return {
      ok: false,
      error: { code: 'invalid_action_contract', message: error?.message ?? String(error), class: 'permanent', retryable: false },
    }
  }

  if (typeof remoteRpc === 'function') {
    try {
      const remote = await remoteRpc(actionEnvelope.action)
      if (!remote?.ok) {
        return {
          ok: false,
          error: remote?.error || { code: 'remote_rpc_failed', message: 'Hosted create-task RPC failed.', class: 'permanent', retryable: false },
          action: actionEnvelope.action,
        }
      }
      const taskView = materializePlannerTaskView(remote.task, { ...input, title }, {
        now: opts.now,
        idempotencyKey: actionEnvelope.action.idempotencyKey,
        correlationId: actionEnvelope.action.correlationId,
      })
      return {
        ok: true,
        action: actionEnvelope.action,
        task: taskView,
        outbox: remote.outbox,
        activity: remote.activity,
        duplicate: Boolean(remote.duplicate),
        policy: remote.policy,
        persistence: 'hosted_rpc',
      }
    } catch (error) {
      return {
        ok: false,
        error: { code: 'remote_rpc_failed', message: error?.message ?? String(error), class: 'transient', retryable: true },
        action: actionEnvelope.action,
      }
    }
  }

  // Local command-boundary adapter (memory). Used for tests and until hosted RPC is applied.
  // Explicitly not a production planner_tasks writer.
  if (supabase && !db) {
    return {
      ok: false,
      error: {
        code: 'hosted_rpc_required',
        message: 'Production MCP create-task requires hosted kenos_create_plan_task_action; direct planner_tasks upsert is disabled.',
        class: 'permanent',
        retryable: false,
      },
      action: actionEnvelope.action,
      persistence: 'blocked_pending_hosted_rpc',
    }
  }

  const database = db || createMemoryCreateTaskDatabase()
  const result = executeServerCreateTaskAction(database, actionEnvelope.action, {
    authUserId: ownerId,
    now: opts.now || Date.now(),
    mode,
  })
  if (!result.ok) return { ...result, action: actionEnvelope.action }

  const taskView = materializePlannerTaskView(result.task, { ...input, title }, {
    now: opts.now,
    idempotencyKey: actionEnvelope.action.idempotencyKey,
    correlationId: actionEnvelope.action.correlationId,
  })
  return {
    ok: true,
    action: actionEnvelope.action,
    task: taskView,
    outbox: result.outbox,
    activity: result.activity,
    duplicate: result.duplicate,
    policy: result.policy,
    persistence: 'local_command_boundary',
  }
}
