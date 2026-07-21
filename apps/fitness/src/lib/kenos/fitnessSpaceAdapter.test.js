import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const adapterSrc = readFileSync(join(dir, 'fitnessSpaceAdapter.js'), 'utf8')
const uiSrc = readFileSync(join(dir, '../ui.svelte.js'), 'utf8')

describe('fitnessSpaceAdapter liveState chrome contract', () => {
  it('resolves sheet overlays before session liveState', () => {
    assert.match(adapterSrc, /export function resolveFitnessLiveState/)
    assert.match(adapterSrc, /setLogSheet\.open/)
    assert.match(adapterSrc, /fitnessToolSheet\.open/)
    assert.match(adapterSrc, /return 'sheet'/)
    assert.match(adapterSrc, /const liveState = resolveFitnessLiveState\(\)/)
    assert.match(adapterSrc, /liveState,/)
  })

  it('publishes nav manifest on sheet open/close', () => {
    assert.match(uiSrc, /publishFitnessChromeSoon/)
    assert.match(uiSrc, /openSetLogSheet[\s\S]*publishFitnessChromeSoon/)
    assert.match(uiSrc, /closeSetLogSheet[\s\S]*publishFitnessChromeSoon/)
    assert.match(uiSrc, /openFitnessToolSheet[\s\S]*publishFitnessChromeSoon/)
    assert.match(uiSrc, /closeFitnessToolSheet[\s\S]*publishFitnessChromeSoon/)
  })
})
