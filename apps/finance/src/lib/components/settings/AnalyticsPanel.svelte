<script module>
  import { buildAppPath } from '@life-os/finance-core/routing/app-route'
  import { analyticsEventForRoute } from '../../../lib/analyticsRoutes'

  /** @type {import('@life-os/finance-core/routing/app-route').AppRoute[]} */
  const NAV_ROUTE_SAMPLES = [
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

  export { NAV_ROUTE_SAMPLES, buildAppPath, analyticsEventForRoute }
</script>

<script>
  import { t } from '$lib/i18n.svelte.js'
  import {
    clearAnalytics,
    countAnalyticsByPrefix,
    exportAnalyticsJson,
    getRecentAnalytics,
  } from '../../../lib/analytics'

  let tick = $state(0)

  const stats = $derived.by(() => {
    void tick
    return {
      total: getRecentAnalytics(500).length,
      nav: countAnalyticsByPrefix('nav.'),
      funnel: countAnalyticsByPrefix('funnel.'),
    }
  })

  function download() {
    const blob = new Blob([exportAnalyticsJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-os-analytics-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<div class="card">
  <h3>{t('analytics.panelTitle')}</h3>
  <p class="muted-note">{t('analytics.panelIntro')}</p>
  <dl class="analytics-stats">
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
  <div class="flex-row-center mt-3">
    <button type="button" class="btn outline compact" onclick={download}>
      {t('analytics.export')}
    </button>
    <button
      type="button"
      class="btn ghost compact"
      onclick={() => {
        clearAnalytics()
        tick += 1
      }}
    >
      {t('analytics.clear')}
    </button>
  </div>
</div>
