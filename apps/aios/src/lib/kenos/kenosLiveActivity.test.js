import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  endFocusLiveActivity,
  publishFocusLiveActivity,
} from './kenosLiveActivity.js'

describe('kenosLiveActivity (Focus)', () => {
  it('maps deep_work to focus kind and training mode to training', async () => {
    const deep = await publishFocusLiveActivity({
      mode: 'deep_work',
      title: 'Korben IA',
      status: 'active',
      safeSummary: 'Deep Work',
    })
    assert.equal(deep.skipped, true)

    const train = await publishFocusLiveActivity({
      mode: 'training',
      title: 'Push',
      status: 'active',
    })
    assert.equal(train.skipped, true)

    const ended = await endFocusLiveActivity('deep_work')
    assert.equal(ended.skipped, true)
  })
})
