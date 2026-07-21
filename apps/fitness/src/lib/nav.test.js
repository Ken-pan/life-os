import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPrimaryNavItems,
  buildMoreNavGroups,
  resolveNavTab,
  isMoreNavActive,
} from './nav.js'

const t = (k) => k

describe('fitness nav IA', () => {
  it('primary tabs are Today · Program · Discover', () => {
    assert.deepEqual(
      buildPrimaryNavItems(t).map((i) => i.tab),
      ['today', 'program', 'discover'],
    )
  })

  it('Workout / History live under More', () => {
    const tabs = buildMoreNavGroups(t)
      .flatMap((g) => g.items)
      .map((i) => i.tab)
    assert.ok(tabs.includes('workout'))
    assert.ok(tabs.includes('history'))
    assert.ok(!tabs.includes('program'))
    assert.ok(!tabs.includes('discover'))
  })

  it('resolveNavTab maps primary and more surfaces', () => {
    assert.equal(resolveNavTab('/'), 'today')
    assert.equal(resolveNavTab('/program'), 'program')
    assert.equal(resolveNavTab('/program/edit'), 'program')
    assert.equal(resolveNavTab('/day/chest'), 'program')
    assert.equal(resolveNavTab('/discover'), 'discover')
    assert.equal(resolveNavTab('/session'), 'workout')
    assert.equal(resolveNavTab('/day/chest/focus'), 'workout')
    assert.equal(resolveNavTab('/discover/records'), 'history')
  })

  it('isMoreNavActive only for secondary surfaces', () => {
    assert.equal(isMoreNavActive('/'), false)
    assert.equal(isMoreNavActive('/program'), false)
    assert.equal(isMoreNavActive('/discover'), false)
    assert.equal(isMoreNavActive('/session'), true)
    assert.equal(isMoreNavActive('/discover/records'), true)
    assert.equal(isMoreNavActive('/library'), true)
  })
})
