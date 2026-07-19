import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCreateTaskCommand, retryPendingCreateTaskOutbox } from './planTaskCommand.js'
import { createTask } from './tasks.js'
import { S, flushSave } from '../state.svelte.js'

vi.mock('../state.svelte.js', () => ({
  S: {
    tasks: [],
    kenosActionOutbox: [],
    kenosActivity: [],
    settings: { defaultListId: 'inbox' },
  },
  save: vi.fn(),
  flushSave: vi.fn(() => true),
  uid: vi.fn(() => `id-${Math.random().toString(36).slice(2, 8)}`),
}))

vi.mock('../services/reminders.js', () => ({
  syncRemindersToServiceWorker: vi.fn(),
}))

beforeEach(() => {
  S.tasks = []
  S.kenosActionOutbox = []
  S.kenosActivity = []
  S.settings = { defaultListId: 'inbox' }
  flushSave.mockReturnValue(true)
})

describe('KR-P1-001 Plan create task command', () => {
  it('is the compatibility writer used by the legacy Planner UI createTask adapter', () => {
    const task = createTask({ title: 'UI task', idempotencyKey: 'ui-key-1' })

    expect(S.tasks).toHaveLength(1)
    expect(S.kenosActionOutbox).toHaveLength(1)
    expect(S.kenosActivity).toHaveLength(1)
    expect(task.meta.command).toMatchObject({ actionType: 'plan.create_task', idempotencyKey: 'ui-key-1' })
  })

  it('allows explicit Assistant actions but keeps Assistant as producer only', () => {
    const result = executeCreateTaskCommand({
      source: 'assistant',
      userRequested: true,
      title: 'Assistant requested task',
      idempotencyKey: 'assistant-key-1',
      correlationId: 'corr-assistant-1',
    })

    expect(result.ok).toBe(true)
    expect(result.task.meta.command.correlationId).toBe('corr-assistant-1')
    expect(result.activity.actor).toBe('assistant')
    expect(S.tasks).toHaveLength(1)
  })

  it('rejects proactive Assistant and Work-sourced payloads fail closed', () => {
    expect(executeCreateTaskCommand({ source: 'assistant', title: 'guess' }).ok).toBe(false)
    expect(executeCreateTaskCommand({ source: 'plan_ui', title: 'work', workSource: { body: 'secret' } }).ok).toBe(false)
    expect(S.tasks).toHaveLength(0)
    expect(S.kenosActivity).toHaveLength(2)
  })

  it('atomically persists Task, Outbox, and Activity for an accepted action', () => {
    const result = executeCreateTaskCommand({ source: 'plan_ui', title: 'Atomic', idempotencyKey: 'atomic-key' })

    expect(result.ok).toBe(true)
    expect(S.tasks.map((task) => task.id)).toEqual([result.task.id])
    expect(S.kenosActionOutbox.map((item) => item.entityRef.id)).toEqual([result.task.id])
    expect(S.kenosActivity.map((item) => item.entityRef.id)).toEqual([result.task.id])
  })



  it('rolls back in-memory Task, Outbox, and Activity when browser storage commit fails', () => {
    vi.stubGlobal('window', { localStorage: {} })
    flushSave.mockReturnValue(false)

    const result = executeCreateTaskCommand({ source: 'plan_ui', title: 'Rollback', idempotencyKey: 'rollback-key' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('local_projection_commit_failed')
    expect(S.tasks).toHaveLength(0)
    expect(S.kenosActionOutbox).toHaveLength(0)
    expect(S.kenosActivity).toHaveLength(0)
    vi.unstubAllGlobals()
  })

  it('is idempotent and offline retry bookkeeping does not duplicate Tasks', () => {
    const first = executeCreateTaskCommand({ source: 'plan_ui', title: 'Retry me', idempotencyKey: 'retry-key' })
    const second = executeCreateTaskCommand({ source: 'plan_ui', title: 'Retry me', idempotencyKey: 'retry-key' })
    retryPendingCreateTaskOutbox()
    retryPendingCreateTaskOutbox()

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(second.task.id).toBe(first.task.id)
    expect(S.tasks).toHaveLength(1)
    expect(S.kenosActionOutbox).toHaveLength(1)
    expect(S.kenosActionOutbox[0].attempts).toBe(2)
  })

  it('redacts Activity payloads instead of storing full sensitive content', () => {
    const result = executeCreateTaskCommand({
      source: 'plan_ui',
      title: 'Redact',
      notes: 'private note body',
      idempotencyKey: 'redact-key',
      connectorPayload: { token: 'secret-token' },
    })

    expect(result.ok).toBe(true)
    expect(result.activity.redactedPayload.notes).toBe('[REDACTED_NOTES]')
    expect(JSON.stringify(S.kenosActivity)).not.toContain('private note body')
    expect(JSON.stringify(S.kenosActivity)).not.toContain('secret-token')
  })
})
