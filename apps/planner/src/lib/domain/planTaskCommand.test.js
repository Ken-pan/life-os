import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCreateTaskCommand, retryPendingCreateTaskOutbox } from './planTaskCommand.js'
import { createTask } from './tasks.js'
import { S, flushSave } from '../state.svelte.js'
import { KenosActionResultSchema, KenosActivityRecordSchema, KenosCommandFailureSchema, KenosOutboxRecordSchema } from '@life-os/contracts/kenos'

const ASSISTANT_CORRELATION_ID = '40000000-0000-4000-8000-000000000010'

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
      correlationId: ASSISTANT_CORRELATION_ID,
    })

    expect(result.ok).toBe(true)
    expect(result.task.meta.command.correlationId).toBe(ASSISTANT_CORRELATION_ID)
    expect(result.activity.actor.type).toBe('assistant')
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
    expect(S.kenosActionOutbox.map((item) => item.aggregate.id)).toEqual([result.task.id])
    expect(S.kenosActivity.flatMap((item) => item.targetRefs.map((ref) => ref.id))).toEqual([result.task.id])
    expect(KenosOutboxRecordSchema.safeParse(result.outbox).success).toBe(true)
    expect(KenosActivityRecordSchema.safeParse(result.activity).success).toBe(true)
    expect(KenosActionResultSchema.safeParse(result.actionResult).success).toBe(true)
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

  it('uses the frozen command error envelope and fails invalid correlation IDs closed', () => {
    const result = executeCreateTaskCommand({ title: 'Invalid correlation', correlationId: 'not-a-uuid' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('invalid_correlation_id')
    expect(KenosCommandFailureSchema.safeParse(result).success).toBe(true)
    expect(KenosActivityRecordSchema.safeParse(S.kenosActivity[0]).success).toBe(true)
    expect(S.tasks).toHaveLength(0)
  })
})
