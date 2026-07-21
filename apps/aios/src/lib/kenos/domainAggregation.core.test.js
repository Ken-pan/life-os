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

  it('projects shelf Kenos / ACTIVE / RECENT / ALL', () => {
    const shelf = projectSpaceShelf({
      activeDomainId: 'money',
      recentIds: ['plan', 'finance'],
    })
    assert.equal(shelf.kenosHome.isKenos, true)
    assert.equal(shelf.active[0]?.id, 'money')
    assert.ok(shelf.recent.some((c) => c.id === 'plan'))
    assert.ok(shelf.all.length >= 7)
    assert.equal(shelf.privacy.money, 'hide_amounts')
  })

  it('searches Quick Switch across aliases', () => {
    const hits = searchAllDomains('know')
    assert.ok(hits.some((h) => h.domainId === 'library'))
  })

  it('lists single Inbox + Assistant handoffs from providers', () => {
    assert.ok(listInboxSources().some((s) => s.domainId === 'work'))
    assert.ok(listAssistantHandoffs().some((h) => h.domainId === 'work'))
  })
})
