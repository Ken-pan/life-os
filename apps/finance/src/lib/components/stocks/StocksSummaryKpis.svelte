<script>
  // Port of StocksSummaryKpis from src/components/stocks/StocksSummaryKpis.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney } from '$lib/format.js'
  import { helpTipPosition } from '$lib/helpTipPosition.js'

  /** @type {{
   *   scope: {
   *     totalInvested: number,
   *     taxableSecurities: number,
   *     taxableCostBasis?: number,
   *     retirementBalance: number,
   *     hsaBalance: number,
   *     lockedBalance: number,
   *   },
   *   todayReturnAmount?: number,
   *   todayReturnPct?: number,
   *   unrealizedGain?: number,
   *   weightedTotalReturnPct?: number,
   *   positionCount: number,
   *   privacy: boolean,
   * }} */
  let {
    scope,
    todayReturnAmount,
    todayReturnPct,
    unrealizedGain,
    weightedTotalReturnPct,
    positionCount,
    privacy,
  } = $props()

  const hasLocked = $derived(scope.lockedBalance > 0)
  const hasTodayAmount = $derived(
    todayReturnAmount != null && Number.isFinite(todayReturnAmount),
  )
  const todayPctLabel = $derived(
    todayReturnPct != null && Number.isFinite(todayReturnPct)
      ? `${todayReturnPct >= 0 ? '+' : ''}${todayReturnPct.toFixed(2)}%`
      : '--',
  )
  const todayAmountLabel = $derived(
    hasTodayAmount ? signedMoney(/** @type {number} */ (todayReturnAmount), privacy) : '--',
  )
  const totalReturnPctLabel = $derived(
    weightedTotalReturnPct != null && Number.isFinite(weightedTotalReturnPct)
      ? `${weightedTotalReturnPct >= 0 ? '+' : ''}${weightedTotalReturnPct.toFixed(2)}%`
      : null,
  )
</script>

{#snippet kpiLabel(text, tip)}
  <span class="label">
    {text}
    <span class="help-tip" tabindex="0" aria-label={t('stocks.kpi.helpTipAria', { label: text })} use:helpTipPosition>
      ?
      <span class="help-tip-pop">{tip}</span>
    </span>
  </span>
{/snippet}

<div class="card stocks-kpi-strip">
  <div class="stocks-kpi stocks-kpi-lead">
    {@render kpiLabel(
      t('stocks.kpi.investedSnapshot'),
      hasLocked
        ? t('stocks.kpi.investedSnapshotTipWithLocked')
        : t('stocks.kpi.investedSnapshotTipTaxableOnly'),
    )}
    <span class="value">{money(scope.totalInvested, privacy)}</span>
    {#if hasLocked}
      <span class="sub">
        {t('stocks.kpi.taxableSecurities', { amount: money(scope.taxableSecurities, privacy) })}
        {#if scope.retirementBalance > 0}
          {t('stocks.kpi.retirement401k', { amount: money(scope.retirementBalance, privacy) })}
        {/if}
        {#if scope.hsaBalance > 0}
          {t('stocks.kpi.hsa', { amount: money(scope.hsaBalance, privacy) })}
        {/if}
      </span>
    {:else if scope.taxableCostBasis != null && Number.isFinite(scope.taxableCostBasis)}
      <span class="sub">
        {t('stocks.kpi.totalCostSub', { amount: money(scope.taxableCostBasis, privacy) })}
      </span>
    {/if}
  </div>
  <div class="stocks-kpi">
    {@render kpiLabel(t('stocks.kpi.dailyChange'), t('stocks.kpi.dailyChangeTip'))}
    <span class="value">{todayAmountLabel}</span>
    <span class="sub">{todayPctLabel}</span>
  </div>
  <div class="stocks-kpi">
    {@render kpiLabel(t('stocks.kpi.unrealizedGain'), t('stocks.kpi.unrealizedGainTip'))}
    <span class="value">{signedMoney(unrealizedGain ?? 0, privacy)}</span>
    {#if totalReturnPctLabel}<span class="sub">{totalReturnPctLabel}</span>{/if}
  </div>
  <div class="stocks-kpi">
    <span class="label">{t('stocks.kpi.positionCount')}</span>
    <span class="value">{positionCount}</span>
    <span class="sub">{t('stocks.kpi.positionCountSub')}</span>
  </div>
</div>
