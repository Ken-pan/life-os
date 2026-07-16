<script>
  // Port of src/components/RecordsView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import {
    LifeOsTabs as HorizontalTabs,
    LifeOsTabPanel as TabPanel,
  } from '@life-os/platform-web/svelte/tabs'
  import HistoryView from './HistoryView.svelte'
  import CashFlowsView from './CashFlowsView.svelte'
  import FutureCashflowView from './FutureCashflowView.svelte'

  /** @typedef {'insights' | 'fixed' | 'oneoff'} RecordsSection */

  /** @type {{
   *   data: import('../../types.js').FinanceData,
   *   active: RecordsSection,
   *   onChange: (section: RecordsSection) => void,
   *   onGoTab?: (tab: string, section?: string, opts?: { ledgerSearch?: string, focusEventId?: string }) => void,
   *   ledgerSearch?: string,
   *   onLedgerSearchConsumed?: () => void,
   *   focusEventId?: string,
   *   onFocusEventConsumed?: () => void,
   *   onQuickAdd?: () => void,
   * }} */
  let {
    data,
    active,
    onChange,
    onGoTab,
    ledgerSearch,
    onLedgerSearchConsumed,
    focusEventId,
    onFocusEventConsumed,
    onQuickAdd,
  } = $props()

  const sections = $derived([
    { id: 'insights', label: t('records.sectionInsights') },
    { id: 'fixed', label: t('records.sectionFixed') },
    { id: 'oneoff', label: t('records.sectionOneoff') },
  ])
</script>

<div class="records-view">
  <HorizontalTabs
    items={sections}
    activeId={active}
    onChange={(id) => onChange(/** @type {RecordsSection} */ (id))}
    ariaLabel={t('records.sectionAria')}
  >
    <TabPanel tabId="insights" active={active === 'insights'} class="records-panel">
      <HistoryView
        {data}
        initialLedgerSearch={ledgerSearch}
        {onLedgerSearchConsumed}
        {onQuickAdd}
      />
    </TabPanel>
    <TabPanel tabId="fixed" active={active === 'fixed'} class="records-panel">
      <CashFlowsView />
    </TabPanel>
    <TabPanel tabId="oneoff" active={active === 'oneoff'} class="records-panel">
      <FutureCashflowView {onGoTab} {focusEventId} onFocusConsumed={onFocusEventConsumed} />
    </TabPanel>
  </HorizontalTabs>
</div>
