<script>
  // Port of src/components/ReviewView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { computeBaselineWindows } from '$lib/engine/realityLoop'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import HorizontalTabs from './HorizontalTabs.svelte'
  import TabPanel from './TabPanel.svelte'
  import AccountReconcileView from './AccountReconcileView.svelte'
  import ImportWizard from './review/ImportWizard.svelte'
  import ReviewQueue from './review/ReviewQueue.svelte'
  import BaselineView from './review/BaselineView.svelte'
  import CalibrationView from './review/CalibrationView.svelte'

  /** @typedef {'import' | 'queue' | 'baseline' | 'calibrate' | 'reconcile'} ReviewTab */

  /** @type {{
   *   data: import('../../types.js').FinanceData,
   *   active?: ReviewTab,
   *   onChange?: (tab: ReviewTab) => void,
   * }} */
  let { data, active, onChange } = $props()

  const transactions = getTransactionsStore()
  const store = getFinanceStore()

  /** @type {ReviewTab} */
  let internalTab = $state('import')
  const tab = $derived(active ?? internalTab)

  /** @param {ReviewTab} next */
  function setTab(next) {
    onChange?.(next)
    if (!onChange) internalTab = next
  }

  let openReviewCount = $state(0)
  const windows = $derived(computeBaselineWindows(transactions.txns, openReviewCount))
  const sections = $derived([
    { id: /** @type {ReviewTab} */ ('import'), label: t('review.tabImport') },
    { id: /** @type {ReviewTab} */ ('queue'), label: t('review.tabQueue') },
    { id: /** @type {ReviewTab} */ ('baseline'), label: t('review.tabBaseline') },
    { id: /** @type {ReviewTab} */ ('calibrate'), label: t('review.tabCalibrate') },
    { id: /** @type {ReviewTab} */ ('reconcile'), label: t('review.tabReconcile') },
  ])
</script>

<div class="grid gap-4">
  <HorizontalTabs
    items={sections}
    activeId={tab}
    onChange={(id) => setTab(/** @type {ReviewTab} */ (id))}
    ariaLabel={t('review.sectionAria')}
  >
    <TabPanel tabId="import" active={tab === 'import'}>
      <ImportWizard
        privacy={data.privacy}
        onImported={async () => {
          await transactions.reload()
          setTab('baseline')
        }}
      />
    </TabPanel>
    <TabPanel tabId="queue" active={tab === 'queue'}>
      <ReviewQueue onOpenCountChange={(n) => (openReviewCount = n)} />
    </TabPanel>
    <TabPanel tabId="baseline" active={tab === 'baseline'}>
      <BaselineView
        privacy={data.privacy}
        {windows}
        {openReviewCount}
        onOpenCalibrate={() => setTab('calibrate')}
      />
    </TabPanel>
    <TabPanel tabId="calibrate" active={tab === 'calibrate'}>
      <CalibrationView
        privacy={data.privacy}
        data={store.data}
        {windows}
        txns={transactions.txns}
        onApplied={() => setTab('baseline')}
      />
    </TabPanel>
    <TabPanel tabId="reconcile" active={tab === 'reconcile'}>
      <AccountReconcileView {data} />
    </TabPanel>
  </HorizontalTabs>
</div>
