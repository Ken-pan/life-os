import { describe, it, expect, beforeEach } from 'vitest'
import { resolveTaskEditorDefaults } from './taskEditorDefaults.js'
import { calendarView } from './ui.svelte.js'

describe('resolveTaskEditorDefaults', () => {
  beforeEach(() => {
    calendarView.selected = null
  })

  it('sets today dueDate on home', () => {
    const d = resolveTaskEditorDefaults('/')
    expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses calendar selection', () => {
    calendarView.selected = '2026-07-21'
    expect(resolveTaskEditorDefaults('/calendar')).toEqual({
      dueDate: '2026-07-21',
    })
    expect(resolveTaskEditorDefaults('/schedule')).toEqual({
      dueDate: '2026-07-21',
    })
  })

  it('binds inbox and list routes', () => {
    expect(resolveTaskEditorDefaults('/inbox')).toEqual({
      listId: 'inbox',
      dueDate: null,
    })
    expect(resolveTaskEditorDefaults('/lists/work')).toEqual({
      listId: 'work',
      dueDate: null,
    })
  })

  it('binds project routes', () => {
    const d = resolveTaskEditorDefaults('/projects/abc')
    expect(d.projectId).toBe('abc')
    expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
