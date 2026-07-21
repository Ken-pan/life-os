import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
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
})
