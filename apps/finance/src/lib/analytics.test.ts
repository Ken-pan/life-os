import { beforeEach, describe, expect, it } from 'vitest'
import { analyticsEventForRoute } from './analyticsRoutes'
import {
  clearAnalytics,
  exportAnalyticsJson,
  getRecentAnalytics,
  track,
  trackNavView,
} from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    clearAnalytics()
  })

  it('maps routes to IA event names', () => {
    expect(analyticsEventForRoute({ tab: 'accounts' })).toBe(
      'nav.money.accounts',
    )
    expect(analyticsEventForRoute({ tab: 'decision', section: 'saved' })).toBe(
      'nav.plan.decision.saved',
    )
  })

  it('stores events locally', () => {
    track('test.event', { foo: 'bar' })
    const events = getRecentAnalytics()
    expect(events).toHaveLength(1)
    expect(events[0]?.name).toBe('test.event')
    expect(events[0]?.props?.foo).toBe('bar')
  })

  it('trackNavView writes path prop', () => {
    trackNavView({ tab: 'home', section: 'today' })
    const events = getRecentAnalytics()
    expect(events[0]?.name).toBe('nav.home.today')
    expect(events[0]?.props?.path).toBe('/home/today')
  })

  it('exportAnalyticsJson returns valid json', () => {
    track('a')
    track('b')
    const parsed = JSON.parse(exportAnalyticsJson()) as unknown[]
    expect(parsed).toHaveLength(2)
  })
})
