<script>
  // Port of src/components/ForecastHubView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import {
    LifeOsTabs as HorizontalTabs,
    LifeOsTabPanel as TabPanel,
  } from '@life-os/platform-web/svelte/tabs'
  import ForecastView from './ForecastView.svelte'
  import ScenariosView from './ScenariosView.svelte'

  /** @typedef {'forecast' | 'scenarios'} ForecastSection */

  /** @type {{
   *   data: import('../../types.js').FinanceData,
   *   projection: ReturnType<typeof import('$lib/projection.js').computeProjection>,
   *   displayLiquidCash?: number,
   *   cashAnchors?: import('../../engine/reconciliation.js').LiquidCashAnchors,
   *   onGoTab?: (tab: string, section?: string) => void,
   *   active: ForecastSection,
   *   onChange: (section: ForecastSection) => void,
   * }} */
  let { data, projection, displayLiquidCash, cashAnchors, onGoTab, active, onChange } = $props()

  const sections = $derived([
    { id: /** @type {ForecastSection} */ ('forecast'), label: t('forecastHub.sectionForecast') },
    { id: /** @type {ForecastSection} */ ('scenarios'), label: t('forecastHub.sectionScenarios') },
  ])
</script>

<div class="grid gap-6">
  <HorizontalTabs
    items={sections}
    activeId={active}
    onChange={(id) => onChange(/** @type {ForecastSection} */ (id))}
    ariaLabel={t('forecastHub.sectionAria')}
  >
    <TabPanel tabId="forecast" active={active === 'forecast'}>
      <ForecastView {data} {projection} {displayLiquidCash} {cashAnchors} {onGoTab} />
    </TabPanel>
    <TabPanel tabId="scenarios" active={active === 'scenarios'}>
      <ScenariosView />
    </TabPanel>
  </HorizontalTabs>
</div>
