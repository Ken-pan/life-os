import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isProdTrainingReadEnabled,
  projectTrainingFromTodayFitness,
  readTrainingSpaceSource,
} from './trainingReadSource.core.js'

describe('trainingReadSource.core', () => {
  it('defaults training read Off outside read canary', () => {
    assert.equal(isProdTrainingReadEnabled({}), false)
    assert.equal(isProdTrainingReadEnabled({ VITE_KENOS_PROD_READ_TRAINING: '1' }), true)
  })

  it('projects fitness summary without inventing a workout plan', () => {
    const projected = projectTrainingFromTodayFitness({
      trained_today: true,
      last_session_at: '2026-07-20T12:00:00Z',
      body_parts: ['push'],
      session_count: 1,
    })
    assert.equal(projected.trainedToday, true)
    assert.deepEqual(projected.bodyParts, ['push'])
    assert.equal(projected.deepLink, 'https://fitness.kenos.space')
  })

  it('returns empty-ready shape when fitness block missing', async () => {
    const client = {
      rpc: async () => ({ data: { ok: true }, error: null }),
    }
    const result = await readTrainingSpaceSource({ client, authorized: true, online: true })
    assert.equal(result.state.status, 'ready')
    assert.equal(result.training.trainedToday, false)
  })
})
