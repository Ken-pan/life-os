import { describe, expect, it } from 'vitest'
import { createTaskEditorDraft } from './taskEditorDraft.js'

describe('createTaskEditorDraft', () => {
  it('initializes every progressive-disclosure field to its domain default', () => {
    expect(createTaskEditorDraft({ listId: 'inbox' })).toMatchObject({
      listId: 'inbox',
      priority: 'P3',
      urgency: 'normal',
      size: 'medium',
      area: 'other',
      effortMin: null,
      nextAction: null,
      aiContext: null,
      projectId: null,
      dueDate: null,
      scheduledDate: null,
      reminderMinutes: null,
      recurrence: null,
      tags: [],
      subtasks: [],
      meta: { kind: 'standard' },
    })
  })

  it('keeps route-provided capture context', () => {
    expect(
      createTaskEditorDraft({
        listId: 'work',
        dueDate: '2026-07-12',
        scheduledDate: '2026-07-12',
        scheduledStart: '09:30',
        durationMinutes: 45,
        projectId: 'project-1',
      }),
    ).toMatchObject({
      listId: 'work',
      dueDate: '2026-07-12',
      scheduledDate: '2026-07-12',
      scheduledStart: '09:30',
      durationMinutes: 45,
      projectId: 'project-1',
    })
  })
})

