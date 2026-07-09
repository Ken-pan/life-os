<script>
  import HorizontalTabs from './HorizontalTabs.svelte'
  import TabPanel from './TabPanel.svelte'
  import TodayView from './TodayView.svelte'
  import OverviewView from './OverviewView.svelte'
  import { t } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('$lib/dashboard.js').Dashboard} Dashboard */
  /** @typedef {import('$lib/projection.js').Projection} Projection */
  /** @typedef {import('@life-os/finance-core/routing/app-route').HomeSection} HomeSection */
  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */

  /** @type {{
   *   data: FinanceData,
   *   dashboard: Dashboard,
   *   projection: Projection,
   *   active: HomeSection,
   *   onChange: (section: HomeSection) => void,
   *   onOpenSpend: () => void,
   *   onGoTab: GoTab,
   *   onGoStocks: (snapshotId?: string) => void,
   * }} */
  let {
    data,
    dashboard,
    projection,
    active,
    onChange,
    onOpenSpend,
    onGoTab,
    onGoStocks,
  } = $props()

  const sections = $derived([
    { id: 'today', label: t('nav.today') },
    { id: 'overview', label: t('nav.overview') },
  ])
</script>

<HorizontalTabs
  items={sections}
  activeId={active}
  ariaLabel={t('nav.homeSectionAria')}
  onChange={(next) => onChange(/** @type {HomeSection} */ (next))}
>
  <TabPanel tabId="today" active={active === 'today'}>
    <TodayView {data} {dashboard} {onOpenSpend} {onGoTab} />
  </TabPanel>
  <TabPanel tabId="overview" active={active === 'overview'}>
    <OverviewView
      {data}
      {projection}
      {dashboard}
      {onOpenSpend}
      {onGoTab}
      {onGoStocks}
      tabActive={active === 'overview'}
    />
  </TabPanel>
</HorizontalTabs>
