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
