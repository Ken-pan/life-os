import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'kenosLiveActivity.js'), 'utf8')

describe('kenosLiveActivity (Training)', () => {
  it('publishes training kind and ends training', () => {
    assert.match(src, /'training'/)
    assert.match(src, /nativeLiveActivityUpsert/)
    assert.match(src, /nativeLiveActivityEnd\('training'\)/)
    assert.match(src, /publishTrainingLiveActivity/)
    assert.match(src, /endTrainingLiveActivity/)
  })
})
