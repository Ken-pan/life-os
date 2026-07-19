import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSystemNavActive, systemNavItems } from './systemNav.js'

describe('systemNav', () => {
  it('exposes four top-level entries', () => {
    const items = systemNavItems((k) => k)
    assert.deepEqual(
      items.map((i) => i.href),
      ['/', '/assistant', '/spaces', '/inbox'],
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
