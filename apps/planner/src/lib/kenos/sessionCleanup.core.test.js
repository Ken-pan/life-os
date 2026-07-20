import { describe, expect, it } from 'vitest'
import { buildSignedOutState, hasUserScopedContent } from './sessionCleanup.core.js'

describe('planner session cleanup', () => {
  it('clears user content while preserving device settings', () => {
    const next = buildSignedOutState({
      schemaVersion: 3,
      tasks: [{ id: 't1', title: 'Owner secret' }],
      projects: [{ id: 'p1', title: 'Owner project' }],
      attachments: [{ id: 'a1' }],
      kenosActionOutbox: [{ id: 'o1' }],
      kenosActivity: [{ id: 'ev1' }],
      lists: [
        { id: 'inbox', system: 'inbox' },
        { id: 'custom', title: 'Owner list', system: null },
      ],
      settings: { theme: 'dark', locale: 'en', dailyGoal: 5, syncAuto: true },
    })

    expect(next.tasks).toEqual([])
    expect(next.projects).toEqual([])
    expect(next.attachments).toEqual([])
    expect(next.kenosActionOutbox).toEqual([])
    expect(next.kenosActivity).toEqual([])
    expect(next.lists).toHaveLength(1)
    expect(next.lists[0].system).toBe('inbox')
    expect(next.settings.theme).toBe('dark')
    expect(next.settings.locale).toBe('en')
    expect(next.settings.dailyGoal).toBe(5)
    expect(hasUserScopedContent(next)).toBe(false)
  })

  it('detects residual user content', () => {
    expect(hasUserScopedContent({ tasks: [{ id: 't1' }], lists: [], projects: [] })).toBe(true)
    expect(
      hasUserScopedContent({
        tasks: [],
        projects: [],
        attachments: [],
        lists: [{ id: 'inbox', system: 'inbox' }],
        kenosActionOutbox: [],
        kenosActivity: [],
      }),
    ).toBe(false)
  })
})
