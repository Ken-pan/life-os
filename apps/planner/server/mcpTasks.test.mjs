import assert from 'node:assert/strict'

import {
  buildTask,
  isOpen,
  isToday,
  completeTask,
  formatTaskLine,
  selectTasks,
  findTaskToComplete,
  isIsoDate,
  buildCreateTaskAction,
  buildCompleteTaskAction,
  executeAssistantCreateTaskCommand,
  executeAssistantCompleteTaskCommand,
} from './mcpTasks.mjs'

/* buildTask：补齐全字段、默认与 createTask 对齐 */
{
  const t = buildTask({ title: '  买牛奶  ', notes: '低脂', dueDate: '2026-07-20', priority: 'P1' }, { id: 'x1', now: 1000 })
  assert.equal(t.id, 'x1')
  assert.equal(t.title, '买牛奶') // trim
  assert.equal(t.notes, '低脂')
  assert.equal(t.listId, 'inbox')
  assert.equal(t.priority, 'P1')
  assert.equal(t.dueDate, '2026-07-20')
  assert.equal(t.completed, false)
  assert.equal(t.completedAt, null)
  assert.equal(t.createdAt, 1000)
  assert.equal(t.updatedAt, 1000)
  assert.equal(t.sortOrder, 1000)
  assert.equal(t.deletedAt, null)
  assert.deepEqual(t.tags, [])
  assert.deepEqual(t.subtasks, [])
  assert.equal(t.meta.kind, 'standard')
  assert.equal(t.meta.source, 'mcp')
  // 非法优先级 → P3；非法日期 → null
  const t2 = buildTask({ title: 'x', priority: 'ZZ', dueDate: '不是日期' })
  assert.equal(t2.priority, 'P3')
  assert.equal(t2.dueDate, null)
  // 自动 id
  assert.equal(typeof buildTask({ title: 'y' }).id, 'string')
}

/* isIsoDate */
assert.equal(isIsoDate('2026-07-17'), true)
assert.equal(isIsoDate('2026-7-1'), false)
assert.equal(isIsoDate(''), false)
assert.equal(isIsoDate(null), false)

/* isOpen / isToday */
{
  const open = buildTask({ title: 'a' }, { now: 1 })
  assert.equal(isOpen(open), true)
  assert.equal(isOpen({ ...open, completed: true }), false)
  assert.equal(isOpen({ ...open, deletedAt: 5 }), false)

  const today = '2026-07-17'
  assert.equal(isToday(buildTask({ title: 'due today', dueDate: '2026-07-17' }), today), true)
  assert.equal(isToday(buildTask({ title: 'overdue', dueDate: '2026-07-10' }), today), true) // 逾期算今天
  assert.equal(isToday(buildTask({ title: 'future', dueDate: '2026-07-30' }), today), false)
  const sched = { ...buildTask({ title: 'sched' }), scheduledDate: '2026-07-17' }
  assert.equal(isToday(sched, today), true)
  // 已完成的不算今天
  assert.equal(isToday({ ...buildTask({ title: 'x', dueDate: today }), completed: true }, today), false)
}

/* completeTask：不可变、刷 updatedAt */
{
  const t = buildTask({ title: 'done me' }, { now: 100 })
  const done = completeTask(t, 999)
  assert.equal(t.completed, false) // 原对象不变
  assert.equal(done.completed, true)
  assert.equal(done.completedAt, 999)
  assert.equal(done.updatedAt, 999)
}

/* formatTaskLine */
assert.equal(formatTaskLine(buildTask({ title: '普通' })), '普通')
assert.equal(formatTaskLine(buildTask({ title: '要紧', priority: 'P0' })), '[P0] 要紧')
assert.equal(formatTaskLine(buildTask({ title: '有期', dueDate: '2026-07-20' })), '有期（截止 2026-07-20）')
assert.equal(formatTaskLine({ ...buildTask({ title: 'ok' }), completed: true }), '✓ ok')

/* selectTasks */
{
  const tasks = [
    buildTask({ title: '打电话', dueDate: '2026-07-10' }, { now: 3 }),
    { ...buildTask({ title: '已完成的', dueDate: '2026-07-17' }, { now: 1 }), completed: true, completedAt: 2 },
    buildTask({ title: '写报告 milk', dueDate: '2026-07-17' }, { now: 2 }),
    { ...buildTask({ title: '删了的' }, { now: 4 }), deletedAt: 9 },
  ]
  const open = selectTasks(tasks, { scope: 'open' })
  assert.deepEqual(open.map((t) => t.title), ['写报告 milk', '打电话']) // 排除已完成/已删；按 sortOrder(now) 升序（2 在 3 前）
  const today = selectTasks(tasks, { scope: 'today', today: '2026-07-17' })
  assert.deepEqual(today.map((t) => t.title), ['写报告 milk', '打电话']) // 逾期 + 今天，同样 sortOrder 升序
  const q = selectTasks(tasks, { scope: 'all', query: 'MILK' })
  assert.deepEqual(q.map((t) => t.title), ['写报告 milk']) // 大小写不敏感
  assert.equal(selectTasks(tasks, { scope: 'open', limit: 1 }).length, 1)
}

/* findTaskToComplete */
{
  const tasks = [
    buildTask({ title: '买菜' }, { id: 'a', now: 1 }),
    buildTask({ title: '买菜谱书' }, { id: 'b', now: 2 }),
    { ...buildTask({ title: '买菜' }, { id: 'c', now: 3 }), completed: true },
  ]
  assert.equal(findTaskToComplete(tasks, { id: 'b' })?.id, 'b')
  assert.equal(findTaskToComplete(tasks, { title: '买菜' })?.id, 'a') // 精确优先、跳过已完成
  assert.equal(findTaskToComplete(tasks, { title: '菜谱' })?.id, 'b') // 包含匹配
  assert.equal(findTaskToComplete(tasks, { title: '不存在' }), null)
  assert.equal(findTaskToComplete(tasks, {}), null)
}

console.log('mcpTasks.test.mjs: ok')


const AUTH = '20000000-0000-4000-8000-000000000001'

/* Audit remediation: Assistant MCP builds frozen v1 Action envelope. */
{
  const command = buildCreateTaskAction(
    { title: 'Assistant task', notes: 'private body', dueDate: '2026-07-21' },
    {
      authUserId: AUTH,
      now: Date.parse('2026-07-19T00:00:00.000Z'),
      correlationId: '40000000-0000-4000-8000-000000000001',
      actionId: '10000000-0000-4000-8000-000000000001',
      deviceId: '30000000-0000-4000-8000-000000000001',
      idempotencyKey: 'idem-1',
    },
  )
  assert.equal(command.action.schemaVersion, '1')
  assert.equal(command.action.actionType, 'plan.create_task')
  assert.equal(command.action.producer, 'assistant')
  assert.equal(command.action.requestedRisk, 'R1')
  assert.equal(command.action.actor.id, AUTH)
  assert.equal(command.action.idempotencyKey, 'idem-1')
  assert.equal(command.task, undefined)
}

/* Command boundary succeeds locally; legacy persistTask is unreachable. */
{
  const result = await executeAssistantCreateTaskCommand({
    authUserId: AUTH,
    input: { title: 'Remote assistant task' },
    opts: {
      now: Date.parse('2026-07-19T00:00:00.000Z'),
      correlationId: '40000000-0000-4000-8000-000000000011',
      actionId: '10000000-0000-4000-8000-000000000011',
      deviceId: '30000000-0000-4000-8000-000000000011',
      idempotencyKey: 'idem-remote',
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.persistence, 'local_command_boundary')
  assert.equal(result.task.meta.command.correlationId, '40000000-0000-4000-8000-000000000011')
  assert.equal(result.activity.policy.evaluatedRisk, 'R1')
  assert.equal(result.outbox.topic, 'plan.create_task')

  const blockedDirect = await executeAssistantCreateTaskCommand({
    authUserId: AUTH,
    input: { title: 'should not write' },
    persistTask: async () => {
      throw new Error('direct write should be unreachable')
    },
  })
  assert.equal(blockedDirect.ok, false)
  assert.equal(blockedDirect.error.code, 'direct_task_write_forbidden')

  const rejected = await executeAssistantCreateTaskCommand({
    authUserId: AUTH,
    input: { title: 'Work body', workSource: { id: 'work-1' } },
  })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'work_source_excluded')

  const noAuth = await executeAssistantCreateTaskCommand({
    input: { title: 'no auth' },
  })
  assert.equal(noAuth.ok, false)
  assert.equal(noAuth.error.code, 'auth_required')

  const hostedBlocked = await executeAssistantCreateTaskCommand({
    authUserId: AUTH,
    supabase: { tag: 'sb' },
    input: { title: 'needs rpc' },
    opts: {
      now: Date.parse('2026-07-19T00:00:00.000Z'),
      correlationId: '40000000-0000-4000-8000-000000000012',
      actionId: '10000000-0000-4000-8000-000000000012',
      deviceId: '30000000-0000-4000-8000-000000000012',
    },
  })
  assert.equal(hostedBlocked.ok, false)
  assert.equal(hostedBlocked.error.code, 'hosted_rpc_required')

  const completeAction = buildCompleteTaskAction('task-1', { authUserId: AUTH })
  assert.equal(completeAction.actionType, 'plan.complete_task')
  assert.equal(completeAction.payload.taskId, 'task-1')

  const completeBlocked = await executeAssistantCompleteTaskCommand({
    authUserId: AUTH,
    taskId: 'task-1',
    persistTask: async () => {},
  })
  assert.equal(completeBlocked.ok, false)
  assert.equal(completeBlocked.error.code, 'direct_task_write_forbidden')

  const completeHosted = await executeAssistantCompleteTaskCommand({
    authUserId: AUTH,
    taskId: 'task-1',
    remoteRpc: async () => ({ ok: true, duplicate: false, result: { taskId: 'task-1' } }),
  })
  assert.equal(completeHosted.ok, true)
  assert.equal(completeHosted.persistence, 'hosted_rpc')
}
