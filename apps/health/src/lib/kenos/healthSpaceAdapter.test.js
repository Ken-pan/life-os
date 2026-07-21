import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  HEALTH_SPACE_ID,
  buildHealthNavManifest,
  suspendHealthSpace,
} from './healthSpaceAdapter.js'

describe('healthSpaceAdapter', () => {
  it('uses frozen health space id', () => {
    assert.equal(HEALTH_SPACE_ID, 'health')
  })

  it('suspends route pointers without medical decision text', () => {
    const d = suspendHealthSpace({ pathname: '/trends' })
    assert.equal(d.spaceId, 'health')
    assert.equal(d.displaySubtitle, 'Trends')
    assert.equal(d.substate?.medicalDecision, false)
  })

  it('builds health nav manifest', () => {
    const m = buildHealthNavManifest()
    assert.equal(m.domainId, 'health')
    assert.equal(m.title, 'Health')
  })

  it('wires compose to Focus (/focus)', () => {
    const src = readFileSync(
      new URL('./healthSpaceAdapter.js', import.meta.url),
      'utf8',
    )
    assert.match(src, /route:\s*'\/focus'/)
    assert.match(src, /__KENOS_DOMAIN_COMPOSE__/)
  })
})
