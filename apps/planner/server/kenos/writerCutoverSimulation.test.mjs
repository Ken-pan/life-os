import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createWriterCutoverSimulator, DEFAULT_WRITER_CUTOVER_CONFIG, resolveWriterCutoverMode } from './writerCutoverSimulation.mjs'

const corpus = JSON.parse(readFileSync(new URL('../../../../packages/contracts/fixtures/kenos/v1/corpus.json', import.meta.url), 'utf8'))
const action = corpus.valid.find(({ id }) => id === 'action-create-task-r1').value
const authorizedContext = { environment: 'local_disposable', capabilities: ['kenos.plan.writer_cutover.simulate'] }

assert.equal(resolveWriterCutoverMode(), 'off')
assert.equal(resolveWriterCutoverMode({ mode: 'shadow', source: 'client_request', authorized: true }, authorizedContext), 'off')
assert.equal(resolveWriterCutoverMode({ mode: 'shadow', source: 'server_config', authorized: false }, authorizedContext), 'off')
assert.equal(resolveWriterCutoverMode({ mode: 'shadow', source: 'server_config', authorized: true }, { environment: 'production', capabilities: [] }), 'off')
assert.deepEqual(DEFAULT_WRITER_CUTOVER_CONFIG, { mode: 'off', source: 'server_config', authorized: false })

{
  const simulator = createWriterCutoverSimulator({ config: { mode: 'shadow', source: 'server_config', authorized: true }, context: authorizedContext })
  const first = simulator.execute(action)
  const duplicate = simulator.execute({ ...action, id: '10000000-0000-4000-8000-000000000009' })
  assert.equal(first.comparison.match, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.shadow.duplicate, true)
  assert.equal(simulator.state.legacyTasks.length, 1, 'shadow requests must not double-write the legacy truth')
  assert.equal(simulator.state.shadowDb.state.tasks.length, 1, 'shadow idempotency must produce one candidate task')
}

{
  const simulator = createWriterCutoverSimulator({
    config: { mode: 'shadow', source: 'server_config', authorized: true },
    context: authorizedContext,
    shadowTransform: (task) => ({ ...task, title: `${task.title} mismatch` }),
  })
  const result = simulator.execute(action)
  assert.equal(result.comparison.match, false)
  assert.equal(simulator.state.telemetry.at(-1).event, 'writer_shadow_mismatch')
}

{
  const simulator = createWriterCutoverSimulator({ config: { mode: 'new_with_fallback', source: 'server_config', authorized: true }, context: authorizedContext })
  const result = simulator.execute(action, { injectNewFailure: true })
  assert.equal(result.ok, true)
  assert.equal(result.source, 'legacy')
  assert.equal(result.fallback, true)
  assert.equal(simulator.state.legacyTasks.length, 1)
  const rollback = simulator.rollbackToLegacy()
  assert.deepEqual(rollback, { mode: 'off', retainedLegacyTasks: 1, deletedTasks: 0 })
}

console.log('writer cutover simulation — default-off/shadow/fallback/rollback PASS')
