import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildHomeNavManifest,
  homeResumeEntityId,
  homeResumeSubtitle,
  suspendHomeSpace,
} from './homeSpaceAdapter.js'

describe('homeSpaceAdapter', () => {
  it('maps routes to Rooms / Items / Organize resume subtitles', () => {
    assert.equal(homeResumeSubtitle('/plan'), 'Rooms')
    assert.equal(homeResumeSubtitle('/storage', '?zone=S3'), 'Items · S3')
    assert.equal(homeResumeSubtitle('/storage', '?item=锅'), 'Items · 锅')
    assert.equal(homeResumeSubtitle('/tidy'), 'Organize')
    assert.equal(homeResumeSubtitle('/tidy/go'), 'Organize focus')
  })

  it('extracts zone/item entity ids without photo refs', () => {
    assert.equal(homeResumeEntityId('/storage', '?zone=S3'), 'S3')
    assert.equal(homeResumeEntityId('/storage', '?item=box-1'), 'box-1')
  })

  it('suspends text-only descriptors (no photo URLs)', () => {
    const d = suspendHomeSpace({
      pathname: '/storage',
      search: '?zone=S3',
      userId: null,
    })
    assert.equal(d.spaceId, 'home')
    assert.equal(d.route, '/storage?zone=S3')
    assert.equal(d.displaySubtitle, 'Items · S3')
    assert.equal(d.entityId, 'S3')
    assert.equal(d.substate?.surface, 'items')
    const blob = JSON.stringify(d)
    assert.equal(/photoRef|blob:|data:image/i.test(blob), false)
  })

  it('builds home nav manifest without photo leakage', () => {
    const m = buildHomeNavManifest()
    assert.equal(m.domainId, 'home')
    assert.equal(m.title, 'Home')
    assert.equal(/photoRef|blob:|data:image/i.test(JSON.stringify(m)), false)
  })

  it('wires compose to Organize (/tidy)', () => {
    const src = readFileSync(
      new URL('./homeSpaceAdapter.js', import.meta.url),
      'utf8',
    )
    assert.match(src, /route:\s*'\/tidy'/)
    assert.match(src, /__KENOS_DOMAIN_COMPOSE__/)
  })
})
