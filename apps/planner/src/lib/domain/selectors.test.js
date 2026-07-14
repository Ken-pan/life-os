import { describe, it, expect, vi } from 'vitest'
import { buildTaskIndex } from './taskIndex.js'
import {
  selectByList,
  selectByDate,
  selectSearch,
  selectTodayGroups,
  selectUpcomingGroups,
  selectInboxTasks,
  selectAllTags,
  selectCompleted,
  selectCompletedToday,
  selectTodayProgress,
} from './selectors.js'

const tasks = [
  {
    id: '1',
    title: 'Today task',
    notes: '',
    listId: 'inbox',
    priority: 0,
    dueDate: '2026-07-05',
    dueTime: null,
    reminderMinutes: null,
    recurrence: null,
    tags: ['work'],
    subtasks: [],
    completed: false,
    completedAt: null,
    createdAt: 1,
    updatedAt: 1,
    sortOrder: 1,
    meta: {},
  },
  {
    id: '2',
    title: 'Tomorrow',
    notes: '',
    listId: 'list-a',
    priority: 0,
    dueDate: '2026-07-06',
    dueTime: null,
    reminderMinutes: null,
    recurrence: null,
    tags: [],
    subtasks: [],
    completed: false,
    completedAt: null,
    createdAt: 2,
    updatedAt: 2,
    sortOrder: 2,
    meta: {},
  },
  {
    id: '3',
    title: 'No date',
    notes: '',
    listId: 'inbox',
    priority: 0,
    dueDate: null,
    dueTime: null,
    reminderMinutes: null,
    recurrence: null,
    tags: [],
    subtasks: [],
    completed: false,
    completedAt: null,
    createdAt: 3,
    updatedAt: 3,
    sortOrder: 3,
    meta: {},
  },
]

describe('taskIndex + selectors', () => {
  const index = buildTaskIndex(tasks)

  it('indexes by list and date', () => {
    expect(selectByList(index, 'inbox')).toHaveLength(2)
    expect(selectByDate(index, '2026-07-05')).toHaveLength(1)
  })

  it('searches title and tags', () => {
    expect(selectSearch(index, 'Tomorrow')).toHaveLength(1)
    expect(selectSearch(index, 'work')).toHaveLength(1)
  })

  it('collects tags', () => {
    expect(selectAllTags(index)).toEqual(['work'])
    const withEmpty = buildTaskIndex([
      ...tasks,
      { ...tasks[0], id: 'empty-tag', tags: ['', '  ', 'valid'] },
    ])
    expect(selectAllTags(withEmpty)).toEqual(['valid', 'work'])
  })

  it('lists completed tasks by completedAt desc', () => {
    const withDone = buildTaskIndex([
      ...tasks,
      {
        ...tasks[0],
        id: 'done-1',
        title: 'Done task',
        completed: true,
        completedAt: 100,
      },
    ])
    expect(selectCompleted(withDone)).toHaveLength(1)
    expect(selectCompleted(withDone)[0].title).toBe('Done task')
  })
})

describe('selectTodayGroups', () => {
  it('groups by due date relative to today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const groups = selectTodayGroups(buildTaskIndex(tasks))
    expect(groups.today).toHaveLength(1)
    expect(groups.noDate).toHaveLength(1)
    vi.useRealTimers()
  })
})

// PLNR.CORE.4 — Planner Today ↔ Portal `portal_today_summary` 计数口径一致契约。
// Portal RPC (apps/finance/supabase/migrations/20260712200000_*.sql) 计数谓词：
//   todayOpen : completed=false AND deletedAt IS NULL AND dueDate == today
//   overdue   : completed=false AND deletedAt IS NULL AND dueDate IS NOT NULL AND dueDate < today
// 该测试用同一谓词的 JS 复刻，锁定 Planner selectors 与 RPC 不漂移。
describe('PLNR.CORE.4 Portal today-count parity', () => {
  const TODAY = '2026-07-05'

  /** Portal RPC `todayOpen` 谓词的 JS 复刻 */
  const portalTodayOpen = (list) =>
    list.filter(
      (t) => !t.completed && !t.deletedAt && t.dueDate === TODAY,
    ).length
  /** Portal RPC `overdue` 谓词的 JS 复刻 */
  const portalOverdue = (list) =>
    list.filter(
      (t) => !t.completed && !t.deletedAt && t.dueDate && t.dueDate < TODAY,
    ).length

  const base = tasks[0]
  const fixture = [
    { ...base, id: 'due-today-open', dueDate: TODAY, completed: false },
    { ...base, id: 'due-today-done', dueDate: TODAY, completed: true, completedAt: 1 },
    { ...base, id: 'due-today-deleted', dueDate: TODAY, completed: false, deletedAt: 1 },
    { ...base, id: 'overdue-open', dueDate: '2026-07-03', completed: false },
    { ...base, id: 'overdue-deleted', dueDate: '2026-07-02', completed: false, deletedAt: 1 },
    { ...base, id: 'tomorrow', dueDate: '2026-07-06', completed: false },
    { ...base, id: 'no-date', dueDate: null, completed: false },
  ]

  it('groups.today count equals Portal todayOpen; overdue matches; excludes done/deleted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const groups = selectTodayGroups(buildTaskIndex(fixture))

    // 只有 due-today-open 计入今日（done/deleted 排除）
    expect(groups.today).toHaveLength(1)
    expect(groups.today.map((t) => t.id)).toEqual(['due-today-open'])
    // 只有 overdue-open 计入逾期
    expect(groups.overdue.map((t) => t.id)).toEqual(['overdue-open'])

    // 与 Portal RPC 谓词逐项一致
    expect(groups.today.length).toBe(portalTodayOpen(fixture))
    expect(groups.overdue.length).toBe(portalOverdue(fixture))
    vi.useRealTimers()
  })
})

describe('selectCompletedToday + selectTodayProgress', () => {
  it('counts today plan progress', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const index = buildTaskIndex([
      ...tasks,
      {
        ...tasks[0],
        id: 'done-today',
        title: 'Done today',
        completed: true,
        completedAt: Date.now(),
      },
    ])
    expect(selectCompletedToday(index)).toHaveLength(1)
    const progress = selectTodayProgress(index)
    expect(progress.done).toBe(1)
    expect(progress.total).toBe(2)
    expect(progress.remaining).toBe(1)
    vi.useRealTimers()
  })
})

describe('selectUpcomingGroups', () => {
  it('places tasks in tomorrow bucket without today or nodate groups', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const groups = selectUpcomingGroups(buildTaskIndex(tasks))
    expect(groups.tomorrow).toHaveLength(1)
    expect(groups.week).toHaveLength(0)
    expect(groups.later).toHaveLength(0)
    vi.useRealTimers()
  })
})

describe('selectInboxTasks', () => {
  it('only returns unprocessed capture items', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 5, 12, 0, 0))
    const index = buildTaskIndex([
      ...tasks,
      {
        ...tasks[0],
        id: 'scheduled-inbox',
        title: 'Scheduled inbox',
        dueDate: '2026-07-05',
        scheduledStart: '09:00',
      },
    ])
    const inbox = selectInboxTasks(index, 'inbox')
    expect(inbox.map((t) => t.title)).toEqual(['No date'])
    vi.useRealTimers()
  })
})
