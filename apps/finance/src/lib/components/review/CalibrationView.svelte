<script>
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney } from '$lib/format.js'
  import { quoteSafeToSpend } from '@life-os/finance-core/copy/terminology'
  import {
    baselineCategoryAverages,
    buildCalibrationRows,
    buildItemCalibrationRows,
  } from '$lib/engine/realityLoop'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { trackFunnel, FUNNEL_EVENTS } from '$lib/analytics.js'
  import { proposedActionLabels } from './reviewUtils.js'
  import StatChip from './StatChip.svelte'

  /** @type {{
   *   privacy: boolean,
   *   data: import('../../../types.js').FinanceData,
   *   windows: ReturnType<typeof import('$lib/engine/realityLoop').computeBaselineWindows>,
   *   txns: import('../../../types.js').Transaction[],
   *   onApplied: () => void,
   * }} */
  let { privacy, data, windows, txns, onApplied } = $props()

  const actionLabels = $derived(proposedActionLabels(t))
  const store = getFinanceStore()
  const timeline = getTimelineStore()

  /** @param {ReturnType<typeof import('$lib/engine/realityLoop').computeBaselineWindows>} w */
  function defaultWindowMonths(w) {
    return w.find((x) => x.windowMonths === 6)?.confidence !== 'Not ready'
      ? 6
      : (w.find((x) => x.confidence !== 'Not ready')?.windowMonths ?? 3)
  }

  /** @type {3 | 6 | 12} */
  let windowMonths = $state(/** @type {3 | 6 | 12} */ (defaultWindowMonths(windows)))
  /** @type {'item' | 'category'} */
  let calibrationMode = $state('item')
  /** @type {Record<string, boolean>} */
  let selected = $state({})

  const baselineByCategory = $derived(baselineCategoryAverages(txns, windowMonths))
  const itemRows = $derived(
    buildItemCalibrationRows(data.cashFlows, timeline.occurrences, {
      lookbackMonths: windowMonths,
    }),
  )
  const categoryRows = $derived(buildCalibrationRows(data.cashFlows, baselineByCategory))
  const rows = $derived(
    calibrationMode === 'item' && itemRows.length > 0 ? itemRows : categoryRows,
  )
  const activeMode = $derived(
    calibrationMode === 'item' && itemRows.length > 0 ? 'item' : 'category',
  )
  const chosen = $derived(rows.filter((r) => selected[r.key]))
  const monthlyDelta = $derived(chosen.reduce((a, r) => a + r.difference, 0))
  const yearlyDelta = $derived(monthlyDelta * 12)

  function applySelected() {
    for (const row of chosen) {
      const target =
        row.sourceId != null
          ? data.cashFlows.find((c) => c.id === row.sourceId)
          : data.cashFlows.find(
              (c) => c.type === 'expense' && (c.category ?? c.name) === row.category,
            )
      if (!target) continue
      store.upsertCashFlow({
        ...target,
        amount: row.actualMonthlyBaseline,
        frequency: 'monthly',
      })
    }
    onApplied()
    trackFunnel(FUNNEL_EVENTS.reviewCalibrateApplied, {
      rows: chosen.length,
      mode: activeMode,
    })
  }
</script>

<div class="card">
  <div class="card-head">
    <h3>{t('review.calibrateTitle')}</h3>
  </div>
  <p class="muted-note">
    {activeMode === 'item' ? t('review.calibrateModeItem') : t('review.calibrateModeCategory')}
    {t('review.calibrateApplyNote')}
  </p>
  <div class="row">
    <label class="field">
      <span>{t('review.calibrateWindow')}</span>
      <select
        class="input"
        value={String(windowMonths)}
        onchange={(e) => {
          windowMonths = Number(e.currentTarget.value)
        }}
      >
        <option value="3">{t('review.calibrateWindow3')}</option>
        <option value="6">{t('review.calibrateWindow6')}</option>
        <option value="12">{t('review.calibrateWindow12')}</option>
      </select>
    </label>
    {#if itemRows.length > 0}
      <label class="field">
        <span>{t('review.calibrateCompareMode')}</span>
        <select
          class="input"
          value={activeMode}
          onchange={(e) => {
            calibrationMode = /** @type {'item' | 'category'} */ (e.currentTarget.value)
          }}
        >
          <option value="item">
            {t('review.calibrateModeItemOption', { count: itemRows.length })}
          </option>
          <option value="category">
            {t('review.calibrateModeCategoryOption')}
          </option>
        </select>
      </label>
    {/if}
  </div>
  <div class="life-os-scroll-x mt-2">
    <table class="review-table">
      <thead>
        <tr>
          <th>{t('review.colApply')}</th>
          <th>
            {activeMode === 'item' ? t('review.colPlanItem') : t('review.colPlanCategory')}
          </th>
          {#if activeMode === 'item'}
            <th>{t('review.colHits')}</th>
          {/if}
          <th>{t('review.colPlannedMonthly')}</th>
          <th>
            {activeMode === 'item' ? t('review.colActualMedian') : t('review.colActualBaseline')}
          </th>
          <th>{t('review.colDifference')}</th>
          <th>{t('review.colSuggestedAction')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr>
            <td>
              <input
                type="checkbox"
                checked={Boolean(selected[r.key])}
                onchange={(e) => {
                  selected = { ...selected, [r.key]: e.currentTarget.checked }
                }}
              />
            </td>
            <td>
              {r.label}
              {#if activeMode === 'item' && r.category !== r.label}
                <span class="text-secondary text-sm inline-meta-tight">
                  {r.category}
                </span>
              {/if}
            </td>
            {#if activeMode === 'item'}
              <td>{r.hitCount ?? 0}</td>
            {/if}
            <td>{money(r.plannedMonthlyAmount, privacy)}</td>
            <td>{money(r.actualMonthlyBaseline, privacy)}</td>
            <td>{signedMoney(r.difference, privacy)}</td>
            <td>{actionLabels[r.proposedAction]}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="grid kpi-row-4 mt-3">
    <StatChip label={t('review.calibrateMonthlyDelta')} value={signedMoney(-monthlyDelta, privacy)} />
    <StatChip label={t('review.calibrateInvestableDelta')} value={signedMoney(-monthlyDelta, privacy)} />
    <StatChip label={t('review.calibrateDelta1y')} value={signedMoney(-yearlyDelta, privacy)} />
    <StatChip label={t('review.calibrateDelta5y')} value={signedMoney(-(yearlyDelta * 5), privacy)} />
  </div>
  <div class="grid cols-2 mt-2">
    <StatChip label={t('review.calibrateDelta10y')} value={signedMoney(-(yearlyDelta * 10), privacy)} />
    <StatChip
      label={t('review.calibrateStsPreview', { safeToSpend: quoteSafeToSpend() })}
      value={signedMoney(-monthlyDelta * 0.8, privacy)}
    />
  </div>
  <p class="muted-note mt-2-5">{t('review.calibrateFootnote')}</p>
  <div class="row">
    <button class="btn ghost" type="button" onclick={onApplied}>
      {t('common.cancel')}
    </button>
    <button
      class="btn"
      type="button"
      onclick={applySelected}
      disabled={chosen.length === 0}
    >
      {t('review.calibrateApplySelected')}
    </button>
  </div>
</div>
