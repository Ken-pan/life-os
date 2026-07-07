import {
  buildAppPath,
  defaultSectionForTab,
  type AppRoute,
  type AppTabId,
} from './appRoute'

/** IA 导航视图事件名（与 docs/IA_ROUTE_MAPPING.csv 对齐） */
export function analyticsEventForRoute(route: AppRoute): string {
  const section = route.section ?? defaultSectionForTab(route.tab)

  if (route.tab === 'home') {
    return section === 'overview' ? 'nav.home.overview' : 'nav.home.today'
  }
  if (route.tab === 'accounts') return 'nav.money.accounts'
  if (route.tab === 'stocks') return 'nav.money.stocks'

  if (route.tab === 'history') {
    if (section === 'fixed') return 'nav.money.history.fixed'
    if (section === 'oneoff') return 'nav.money.history.oneoff'
    return 'nav.money.history.insights'
  }

  if (route.tab === 'forecast') {
    return section === 'scenarios' ? 'nav.plan.scenarios' : 'nav.plan.forecast'
  }

  if (route.tab === 'decision') {
    if (section === 'saved') return 'nav.plan.decision.saved'
    if (section === 'log') return 'nav.plan.decision.log'
    return 'nav.plan.decision.compare'
  }

  if (route.tab === 'review') {
    const map: Record<string, string> = {
      import: 'nav.review.import',
      queue: 'nav.review.queue',
      baseline: 'nav.review.baseline',
      calibrate: 'nav.review.calibrate',
      reconcile: 'nav.review.reconcile',
    }
    return map[section ?? 'import'] ?? 'nav.review.import'
  }

  if (route.tab === 'settings') {
    if (section === 'help') return 'nav.settings.help'
    if (section === 'app') return 'nav.settings.app'
    return 'nav.settings.assumptions'
  }

  return `nav.${route.tab}`
}

export function analyticsPathForRoute(route: AppRoute): string {
  return buildAppPath(route)
}

export const FUNNEL_EVENTS = {
  onboardingStep: 'funnel.onboarding.step.click',
  reviewImportStarted: 'funnel.review.import.started',
  reviewImportFinalized: 'funnel.review.import.finalized',
  reviewCalibrateApplied: 'funnel.review.calibrate.applied',
  reviewReconcileCompleted: 'funnel.review.reconcile.completed',
  accountsUpdated: 'funnel.money.accounts.updated',
} as const

export type AnalyticsTabId = AppTabId | 'settings-help'
