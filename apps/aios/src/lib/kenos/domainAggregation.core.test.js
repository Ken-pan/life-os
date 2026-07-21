import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateTodaySummaries,
  listAssistantHandoffs,
  listInboxSources,
  projectSpaceShelf,
  searchAllDomains,
} from './domainAggregation.core.js'

describe('domainAggregation.core', () => {
  it('aggregates Today L1/L2/L3 without inventing Paper when missing', () => {
    const rows = aggregateTodaySummaries()
    assert.ok(rows.some((r) => r.domainId === 'plan' && r.level === 'L1'))
    assert.ok(rows.some((r) => r.domainId === 'work'))
    assert.ok(!rows.some((r) => r.domainId === 'paper'))
  })

  it('projects shelf Current / Recent / Other Spaces', () => {
    const shelf = projectSpaceShelf({
      activeDomainId: 'money',
      recentIds: ['plan', 'finance'],
    })
    assert.equal(shelf.kenosHome.isKenos, true)
    assert.equal(shelf.kenosHome.title, 'Kenos')
    assert.equal(shelf.kenosHome.subtitle, 'Today · Ask · Inbox')
    assert.equal(shelf.active[0]?.id, 'money')
    assert.ok(shelf.recent.some((c) => c.id === 'plan'))
    assert.ok(shelf.all.length >= 7)
    assert.ok(shelf.other.every((c) => c.id !== 'money' && c.id !== 'plan'))
    assert.ok(!shelf.other.some((c) => c.id === 'money'))
    assert.equal(shelf.privacy.money, 'hide_amounts')
    assert.equal(shelf.privacy.home, 'hide_interior_images')
  })

  it('searches Quick Switch across aliases', () => {
    const hits = searchAllDomains('know')
    assert.ok(hits.some((h) => h.domainId === 'library'))
  })

  it('lists single Inbox + Assistant handoffs from providers', () => {
    assert.ok(listInboxSources().some((s) => s.domainId === 'work'))
    assert.ok(listAssistantHandoffs().some((h) => h.domainId === 'work'))
    assert.ok(listAssistantHandoffs().some((h) => h.domainId === 'health'))
  })
})
