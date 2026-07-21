import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isSystemNavActive,
  systemNavCapsuleItems,
  systemNavItems,
  systemNavSpacesItem,
} from './systemNav.js'

describe('systemNav', () => {
  it('exposes four top-level entries with Spaces first (Settings off-capsule)', () => {
    const items = systemNavItems((k) => k)
    assert.deepEqual(
      items.map((i) => i.href),
      ['/spaces', '/', '/assistant', '/inbox'],
    )
  })

  it('splits Spaces Orb from three-item capsule', () => {
    const t = (k) => k
    assert.equal(systemNavSpacesItem(t).href, '/spaces')
    assert.deepEqual(
      systemNavCapsuleItems(t).map((i) => i.href),
      ['/', '/assistant', '/inbox'],
    )
  })

  it('highlights Spaces for /work aliases', () => {
    assert.equal(isSystemNavActive('/work', '/spaces'), true)
    assert.equal(isSystemNavActive('/work/projects/1', '/spaces'), true)
    assert.equal(isSystemNavActive('/inbox', '/spaces'), false)
  })

  it('highlights Inbox for approvals/activity aliases', () => {
    assert.equal(isSystemNavActive('/approvals', '/inbox'), true)
    assert.equal(isSystemNavActive('/activity', '/inbox'), true)
    assert.equal(isSystemNavActive('/assistant', '/inbox'), false)
  })

  it('keeps Today exact-match', () => {
    assert.equal(isSystemNavActive('/', '/'), true)
    assert.equal(isSystemNavActive('/assistant', '/'), false)
  })
})
