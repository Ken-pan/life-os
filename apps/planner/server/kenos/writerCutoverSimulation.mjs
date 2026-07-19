import { randomUUID } from 'node:crypto'
import { createMemoryCreateTaskDatabase, executeServerCreateTaskAction } from './createTaskCommand.mjs'

export const DEFAULT_WRITER_CUTOVER_CONFIG = Object.freeze({ mode: 'off', source: 'server_config', authorized: false })
const SIMULATION_CAPABILITY = 'kenos.plan.writer_cutover.simulate'
const MODES = ['off', 'shadow', 'new_with_fallback']

export function resolveWriterCutoverMode(config = DEFAULT_WRITER_CUTOVER_CONFIG, context = {}) {
  if (config.source !== 'server_config' || config.authorized !== true) return 'off'
  if (context.environment !== 'local_disposable' || !context.capabilities?.includes(SIMULATION_CAPABILITY)) return 'off'
  return MODES.includes(config.mode) ? config.mode : 'off'
}

function normalizeTask(task) {
  return {
    title: task.title,
    notes: task.notes || '',
    completed: Boolean(task.completed),
  }
}

export function createWriterCutoverSimulator({ config = DEFAULT_WRITER_CUTOVER_CONFIG, context = {}, shadowTransform } = {}) {
  const mode = resolveWriterCutoverMode(config, context)
  const legacyTasks = []
  const legacyIdempotency = new Map()
  const shadowDb = createMemoryCreateTaskDatabase()
  const telemetry = []

  function legacyWrite(action) {
    const existingId = legacyIdempotency.get(action.idempotencyKey)
    if (existingId) return { task: legacyTasks.find(({ id }) => id === existingId), duplicate: true }
    const task = {
      id: randomUUID(),
      title: String(action.payload?.title || '').trim(),
      notes: action.payload?.notes || '',
      completed: false,
    }
    legacyTasks.push(task)
    legacyIdempotency.set(action.idempotencyKey, task.id)
    return { task, duplicate: false }
  }

  function compare(legacyTask, newTask) {
    const legacy = normalizeTask(legacyTask)
    const candidate = normalizeTask(shadowTransform ? shadowTransform(newTask) : newTask)
    return { match: JSON.stringify(legacy) === JSON.stringify(candidate), legacy, candidate }
  }

  function execute(action, options = {}) {
    if (mode === 'off') {
      const legacy = legacyWrite(action)
      telemetry.push({ event: 'writer_legacy', duplicate: legacy.duplicate, fallback: false })
      return { ok: true, mode, source: 'legacy', ...legacy }
    }

    if (mode === 'shadow') {
      const legacy = legacyWrite(action)
      let shadow
      try {
        if (options.injectNewFailure) throw new Error('injected shadow command failure')
        shadow = executeServerCreateTaskAction(shadowDb, action, { authUserId: action.actor.id, now: Date.parse(action.requestedAt) })
      } catch (error) {
        telemetry.push({ event: 'writer_shadow_failed', errorClass: 'simulation', fallback: true })
        return { ok: true, mode, source: 'legacy', ...legacy, shadow: { ok: false, error: error.message }, fallback: true }
      }
      const comparison = shadow.ok ? compare(legacy.task, shadow.task) : { match: false, error: shadow.error }
      telemetry.push({ event: comparison.match ? 'writer_shadow_match' : 'writer_shadow_mismatch', duplicate: legacy.duplicate, fallback: false })
      return { ok: true, mode, source: 'legacy', ...legacy, shadow, comparison, fallback: false }
    }

    try {
      if (options.injectNewFailure) throw new Error('injected new command failure')
      const candidate = executeServerCreateTaskAction(shadowDb, action, { authUserId: action.actor.id, now: Date.parse(action.requestedAt) })
      if (!candidate.ok) throw new Error(candidate.error.code)
      telemetry.push({ event: 'writer_new_simulated', duplicate: candidate.duplicate, fallback: false })
      return { ok: true, mode, source: 'new_simulation', task: candidate.task, duplicate: candidate.duplicate, fallback: false }
    } catch (error) {
      const legacy = legacyWrite(action)
      telemetry.push({ event: 'writer_new_fallback', errorClass: 'simulation', fallback: true })
      return { ok: true, mode, source: 'legacy', ...legacy, fallback: true, newError: error.message }
    }
  }

  function rollbackToLegacy() {
    telemetry.push({ event: 'writer_rollback_simulated', retainedLegacyTasks: legacyTasks.length })
    return { mode: 'off', retainedLegacyTasks: legacyTasks.length, deletedTasks: 0 }
  }

  return { mode, execute, rollbackToLegacy, state: { legacyTasks, shadowDb, telemetry } }
}
