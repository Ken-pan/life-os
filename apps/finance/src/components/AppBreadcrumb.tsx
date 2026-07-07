import { useMemo } from 'react'
import { useLocale } from '../i18n/context'
import {
  routeDepth,
  type AppRoute,
  type AppTabId,
  type DecisionSection,
  type HomeSection,
} from '../lib/appRoute'

function sectionLabel(
  t: (key: string) => string,
  tab: AppTabId,
  section?: string,
): string | null {
  if (!section) return null

  if (tab === 'home') {
    return section === 'overview' ? t('nav.overview') : t('nav.today')
  }
  if (tab === 'history') {
    if (section === 'insights') return t('records.sectionInsights')
    if (section === 'fixed') return t('records.sectionFixed')
    if (section === 'oneoff') return t('records.sectionOneoff')
  }
  if (tab === 'forecast') {
    if (section === 'forecast') return t('forecastHub.sectionForecast')
    if (section === 'scenarios') return t('forecastHub.sectionScenarios')
  }
  if (tab === 'review') {
    if (section === 'import') return t('review.tabImport')
    if (section === 'queue') return t('review.tabQueue')
    if (section === 'baseline') return t('review.tabBaseline')
    if (section === 'calibrate') return t('review.tabCalibrate')
    if (section === 'reconcile') return t('review.tabReconcile')
  }
  if (tab === 'decision') {
    if (section === 'compare') return t('decisionStudio.tabCompare')
    if (section === 'saved') return t('decisionStudio.tabSaved')
    if (section === 'log') return t('decisionStudio.tabLog')
  }
  if (tab === 'settings') {
    if (section === 'help') return t('settings.sectionHelp')
    if (section === 'app') return t('settings.sectionApp')
    return t('settings.sectionAssumptions')
  }
  return null
}

function domainLabel(t: (key: string) => string, tab: AppTabId): string {
  if (tab === 'home') return t('nav.groupHome')
  if (tab === 'accounts' || tab === 'history' || tab === 'stocks') {
    return t('nav.groupMoney')
  }
  if (tab === 'forecast' || tab === 'decision') return t('nav.groupPlan')
  if (tab === 'review') return t('nav.groupReview')
  return t('nav.groupSettings')
}

function tabLabel(t: (key: string) => string, tab: AppTabId): string {
  if (tab === 'accounts') return t('nav.accounts')
  if (tab === 'home') return t('nav.home')
  return t(`nav.${tab}` as 'nav.history')
}

export function AppBreadcrumb({ route }: { route: AppRoute }) {
  const { t } = useLocale()

  const items = useMemo(() => {
    if (routeDepth(route) < 2 || route.tab === 'home') return []

    const domain = domainLabel(t, route.tab)
    const tab = tabLabel(t, route.tab)
    const section = sectionLabel(t, route.tab, route.section)

    if (section && route.tab !== 'accounts' && route.tab !== 'stocks') {
      return [domain, tab, section]
    }
    return [domain, tab]
  }, [route, t])

  if (items.length === 0) return null

  return (
    <nav className="app-breadcrumb" aria-label={t('nav.breadcrumbAria')}>
      <ol className="app-breadcrumb-list">
        {items.map((label, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li key={`${label}-${index}`} className="app-breadcrumb-item">
              {index > 0 && (
                <span className="app-breadcrumb-sep" aria-hidden="true">
                  /
                </span>
              )}
              <span
                className="app-breadcrumb-label"
                aria-current={isCurrent ? 'page' : undefined}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function shellRouteFromState(input: {
  tab: AppTabId
  homeSection: HomeSection
  recordsTab: string
  forecastTab: string
  reviewTab: string
  decisionTab: DecisionSection
  settingsTab: string
}): AppRoute {
  if (input.tab === 'home') {
    return { tab: 'home', section: input.homeSection }
  }
  if (input.tab === 'history') {
    return { tab: 'history', section: input.recordsTab }
  }
  if (input.tab === 'forecast') {
    return { tab: 'forecast', section: input.forecastTab }
  }
  if (input.tab === 'review') {
    return { tab: 'review', section: input.reviewTab }
  }
  if (input.tab === 'decision') {
    return { tab: 'decision', section: input.decisionTab }
  }
  if (input.tab === 'settings') {
    return { tab: 'settings', section: input.settingsTab }
  }
  return { tab: input.tab }
}
