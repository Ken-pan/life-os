import { useMemo, useState } from 'react'
import { useLocale } from '../../i18n/context'
import {
  clearAnalytics,
  countAnalyticsByPrefix,
  exportAnalyticsJson,
  getRecentAnalytics,
} from '../../lib/analytics'
import { analyticsEventForRoute } from '../../lib/analyticsRoutes'
import { buildAppPath, type AppRoute } from '../../lib/appRoute'

const NAV_ROUTE_SAMPLES: AppRoute[] = [
  { tab: 'home', section: 'today' },
  { tab: 'home', section: 'overview' },
  { tab: 'accounts' },
  { tab: 'history', section: 'insights' },
  { tab: 'history', section: 'fixed' },
  { tab: 'history', section: 'oneoff' },
  { tab: 'stocks' },
  { tab: 'forecast', section: 'forecast' },
  { tab: 'forecast', section: 'scenarios' },
  { tab: 'decision', section: 'compare' },
  { tab: 'decision', section: 'saved' },
  { tab: 'decision', section: 'log' },
  { tab: 'review', section: 'import' },
  { tab: 'review', section: 'queue' },
  { tab: 'review', section: 'baseline' },
  { tab: 'review', section: 'calibrate' },
  { tab: 'review', section: 'reconcile' },
  { tab: 'settings', section: 'assumptions' },
  { tab: 'settings', section: 'app' },
  { tab: 'settings', section: 'help' },
]

export function AnalyticsPanel() {
  const { t } = useLocale()
  const [tick, setTick] = useState(0)

  const stats = useMemo(() => {
    void tick
    return {
      total: getRecentAnalytics(500).length,
      nav: countAnalyticsByPrefix('nav.'),
      funnel: countAnalyticsByPrefix('funnel.'),
    }
  }, [tick])

  const download = () => {
    const blob = new Blob([exportAnalyticsJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-os-analytics-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <h3>{t('analytics.panelTitle')}</h3>
      <p className="muted-note">{t('analytics.panelIntro')}</p>
      <dl className="analytics-stats">
        <div>
          <dt>{t('analytics.statTotal')}</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>{t('analytics.statNav')}</dt>
          <dd>{stats.nav}</dd>
        </div>
        <div>
          <dt>{t('analytics.statFunnel')}</dt>
          <dd>{stats.funnel}</dd>
        </div>
      </dl>
      <div className="flex-row-center mt-3">
        <button
          type="button"
          className="btn outline compact"
          onClick={download}
        >
          {t('analytics.export')}
        </button>
        <button
          type="button"
          className="btn ghost compact"
          onClick={() => {
            clearAnalytics()
            setTick((v) => v + 1)
          }}
        >
          {t('analytics.clear')}
        </button>
      </div>
    </div>
  )
}

export function NavRouteReference() {
  const { t } = useLocale()

  return (
    <div className="card">
      <h3>{t('help.navMapTitle')}</h3>
      <p className="muted-note">{t('help.navMapIntro')}</p>
      <div className="help-route-table-wrap">
        <table className="help-route-table">
          <thead>
            <tr>
              <th>{t('help.navMapColPath')}</th>
              <th>{t('help.navMapColEvent')}</th>
            </tr>
          </thead>
          <tbody>
            {NAV_ROUTE_SAMPLES.map((route) => (
              <tr key={buildAppPath(route)}>
                <td>
                  <code>{buildAppPath(route)}</code>
                </td>
                <td>
                  <code>{analyticsEventForRoute(route)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
