import { describe, expect, it } from 'vitest'
import {
  analyticsEventForRoute,
  analyticsPathForRoute,
} from './routes'

describe('analyticsRoutes', () => {
  it('covers all primary IA routes from mapping table', () => {
    const cases: Array<[Parameters<typeof analyticsEventForRoute>[0], string]> =
      [
        [{ tab: 'home', section: 'today' }, 'nav.home.today'],
        [{ tab: 'home', section: 'overview' }, 'nav.home.overview'],
        [{ tab: 'accounts' }, 'nav.money.accounts'],
        [{ tab: 'history', section: 'insights' }, 'nav.money.history.insights'],
        [{ tab: 'history', section: 'fixed' }, 'nav.money.history.fixed'],
        [{ tab: 'history', section: 'oneoff' }, 'nav.money.history.oneoff'],
        [{ tab: 'stocks' }, 'nav.money.stocks'],
        [{ tab: 'forecast', section: 'forecast' }, 'nav.plan.forecast'],
        [{ tab: 'forecast', section: 'scenarios' }, 'nav.plan.scenarios'],
        [{ tab: 'decision', section: 'compare' }, 'nav.plan.decision.compare'],
        [{ tab: 'decision', section: 'saved' }, 'nav.plan.decision.saved'],
        [{ tab: 'decision', section: 'log' }, 'nav.plan.decision.log'],
        [{ tab: 'review', section: 'import' }, 'nav.review.import'],
        [{ tab: 'review', section: 'queue' }, 'nav.review.queue'],
        [{ tab: 'review', section: 'baseline' }, 'nav.review.baseline'],
        [{ tab: 'review', section: 'calibrate' }, 'nav.review.calibrate'],
        [{ tab: 'review', section: 'reconcile' }, 'nav.review.reconcile'],
        [
          { tab: 'settings', section: 'assumptions' },
          'nav.settings.assumptions',
        ],
        [{ tab: 'settings', section: 'app' }, 'nav.settings.app'],
        [{ tab: 'settings', section: 'help' }, 'nav.settings.help'],
      ]

    for (const [route, event] of cases) {
      expect(analyticsEventForRoute(route)).toBe(event)
      expect(analyticsPathForRoute(route)).toMatch(/^\//)
    }
  })
})
