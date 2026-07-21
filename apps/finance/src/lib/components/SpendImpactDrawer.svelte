<script>
  // Port of src/components/SpendImpactDrawer.tsx.
  import { onMount } from 'svelte'
  import {
    clearMoneyOverlay,
    setMoneyOverlay,
  } from '$lib/kenos/financeSpaceAdapter.js'
  import { projectMonthly } from '../../engine/monthly.js'

  onMount(() => {
    setMoneyOverlay('drawer')
    return () => clearMoneyOverlay()
  })
  import { buildAugmentedDailyOutlook } from '../../engine/outlook.js'
  import {
    computeSpendImpact,
    liquidAfterSimulatedSpend,
    selectSafeToSpendBreakdown,
  } from '../../engine/metrics.js'
  import {
    money,
    signedMoney,
    delayToHuman,
    monthToYearLabel,
    depositDeltaClass,
  } from '$lib/format.js'
  import { todayLocalISO } from '../../engine/calendar.js'
  import { pickSpendingCard } from '../../engine/finance.js'
  import {
    safeToSpendAfterPurchaseExplainTitle,
    safeToSpendAfterPurchaseLabel,
  } from '../../copy/metrics.js'
  import { fundingSourceLabels, liquidCashLabel, stsBreakdown } from '../../copy/terminology.js'
  import NumberField from './fields/NumberField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import { t } from '$lib/i18n.svelte.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('../../types.js').FundingSource} FundingSource */
  /** @typedef {import('../../types.js').ScenarioEvent} ScenarioEvent */
  /** @typedef {import('../../engine/monthly.js').MonthSnapshot} MonthSnapshot */
  /** @typedef {'one-time' | 'monthly'} SpendType */

  /** @type {{ data: FinanceData, baseline: MonthSnapshot[], onClose: () => void }} */
  let { data, baseline, onClose } = $props()

  /** @param {string} verdict */
  function verdictKey(verdict) {
    switch (verdict) {
      case 'low':
        return 'spendImpact.verdictLow'
      case 'noticeable':
        return 'spendImpact.verdictNoticeable'
      case 'plan-change':
        return 'spendImpact.verdictPlanChange'
      case 'funding':
        return 'spendImpact.verdictFunding'
      default:
        return 'spendImpact.verdictLow'
    }
  }

  const quick = $derived([
    { label: t('spendImpact.quickGadget'), type: /** @type {SpendType} */ ('one-time'), amount: 1500, source: /** @type {FundingSource} */ ('checking') },
    { label: t('spendImpact.quickRent'), type: /** @type {SpendType} */ ('monthly'), amount: 500 },
    { label: t('spendImpact.quickSubscription'), type: /** @type {SpendType} */ ('monthly'), amount: 30 },
    { label: t('spendImpact.quickTravel'), type: /** @type {SpendType} */ ('one-time'), amount: 3000, source: /** @type {FundingSource} */ ('savings') },
  ])

  /** @type {SpendType} */
  let type = $state('one-time')
  let amount = $state(0)
  /** @type {FundingSource} */
  let source = $state('checking')

  const compareYears = $derived(
    [5, 10, 20].filter((y) => y <= data.assumptions.horizonYears),
  )
  const spendingCard = $derived(pickSpendingCard(data.accounts))
  const fundingLabels = $derived(fundingSourceLabels())
  const liquidCash = $derived(liquidCashLabel())
  const sts = $derived(stsBreakdown())

  const fundingOptions = $derived.by(() => {
    /** @type {{ value: FundingSource, label: string }[]} */
    const opts = [
      { value: 'checking', label: fundingLabels.checking },
      { value: 'savings', label: fundingLabels.savings },
      { value: 'invested', label: fundingLabels.invested },
    ]
    if (spendingCard) {
      opts.push({
        value: 'credit-card',
        label: spendingCard.name
          ? t('spendImpact.creditCardNamed', { name: spendingCard.name })
          : fundingLabels['credit-card'],
      })
    }
    return opts
  })

  const impact = $derived.by(() => {
    if (amount <= 0) return null
    const todayISO = todayLocalISO()
    /** @type {ScenarioEvent} */
    const simEvent =
      type === 'one-time'
        ? {
            id: '__sim_spend__',
            name: t('spendImpact.simOneTime'),
            eventType: 'one-time-purchase',
            enabled: true,
            date: todayISO,
            monthOffset: 0,
            amount,
            fundingSource: source,
          }
        : {
            id: '__sim_spend__',
            name: t('spendImpact.simMonthly'),
            eventType: 'expense-change',
            enabled: true,
            monthOffset: 1,
            amount,
          }
    /** @type {FinanceData} */
    const simData = {
      ...data,
      events: [...data.events, simEvent],
      cashFlows:
        type === 'monthly'
          ? [
              ...data.cashFlows,
              {
                id: '__sim_monthly_spend__',
                name: t('spendImpact.simMonthly'),
                type: 'expense',
                frequency: 'monthly',
                amount,
              },
            ]
          : data.cashFlows,
    }
    const sim = projectMonthly({
      accounts: simData.accounts,
      cashFlows: simData.cashFlows,
      events: simData.events,
      goals: simData.goals,
      assumptions: simData.assumptions,
    })
    const { outlook: simDailyOutlook } = buildAugmentedDailyOutlook(simData)
    const spend = { amount, type, fundingSource: source }
    const safeToSpendBreakdownAfter = selectSafeToSpendBreakdown({
      outlook: simDailyOutlook,
      assumptions: simData.assumptions,
      goals: simData.goals,
    })
    return computeSpendImpact({
      baseline,
      sim,
      goals: data.goals,
      safeToSpendBreakdownAfter,
      cashAfter: liquidAfterSimulatedSpend(simDailyOutlook, spend),
      compareYears,
      spend,
    })
  })

  const privacy = $derived(data.privacy)
  const delayedGoals = $derived(
    impact?.goalDelays.filter(
      (g) => g.delayMonths != null && Number.isFinite(g.delayMonths) && g.delayMonths > 0,
    ) ?? [],
  )

  const tenYearDiff = $derived(
    impact?.diffByYear.find((d) => d.year === 10) ??
      impact?.diffByYear[impact.diffByYear.length - 1],
  )
  const firstDelay = $derived(delayedGoals[0])
  const yearLabel = $derived(tenYearDiff ? monthToYearLabel(tenYearDiff.year * 12) : null)

  let breakdownOpen = $state(false)
</script>

<div class="drawer-backdrop kenos-drawer-backdrop" onclick={onClose} role="presentation"></div>
<aside class="drawer kenos-drawer-panel">
  <div class="drawer-head">
    <h2>{t('spendImpact.title')}</h2>
    <button type="button" class="icon-btn" onclick={onClose}>{t('common.close')}</button>
  </div>

  <div class="seg mb-3">
    <button
      type="button"
      class={type === 'one-time' ? 'active' : ''}
      onclick={() => (type = 'one-time')}
    >
      {t('spendImpact.typeOneTime')}
    </button>
    <button
      type="button"
      class={type === 'monthly' ? 'active' : ''}
      onclick={() => (type = 'monthly')}
    >
      {t('spendImpact.typeMonthly')}
    </button>
  </div>

  <NumberField
    label={type === 'one-time' ? t('spendImpact.amount') : t('spendImpact.amountMonthly')}
    value={amount}
    onChange={(v) => (amount = v)}
    step={50}
    min={0}
    suffix={type === 'monthly' ? t('spendImpact.perMonthSuffix') : undefined}
    placeholder="0"
  />

  {#if type === 'one-time'}
    <SelectField
      label={t('spendImpact.fundingSource')}
      value={source}
      onChange={(v) => (source = /** @type {FundingSource} */ (v))}
      options={fundingOptions}
    />
  {/if}

  <div class="flex-row-tight mt-1 mb-4">
    {#each quick as q (q.label)}
      <button
        type="button"
        class="chip"
        onclick={() => {
          type = q.type
          amount = q.amount
          if (q.source) source = q.source
        }}
      >
        {q.label}
      </button>
    {/each}
  </div>

  {#if !impact}
    <p class="text-muted">{t('spendImpact.emptyHint')}</p>
  {:else}
    <div class="result-block">
      <div class="rb-title">{t('spendImpact.immediateTitle')}</div>
      <div class="kv">
        <span class="k">{t('spendImpact.liquidCashEndOfDay', { liquidCash })}</span>
        <span>{money(impact.cashAfter, privacy)}</span>
      </div>
      {#if type === 'one-time' && source === 'invested'}
        <p class="muted-note mb-2">{t('spendImpact.investedNote', { liquidCash })}</p>
      {/if}
      {#if type === 'one-time' && source === 'credit-card'}
        <p class="muted-note mb-2">{t('spendImpact.creditCardNote', { liquidCash })}</p>
      {/if}
      <div class="kv">
        <span class="k">{t('spendImpact.buffer30d', { buffer: sts.buffer })}</span>
        <span class="text-secondary">
          {impact.operatingCashBufferOk
            ? t('spendImpact.bufferOk', {
                amount: money(impact.safeToSpendBreakdown.operatingCashBuffer, privacy),
              })
            : t('spendImpact.bufferLow', {
                amount: money(impact.safeToSpendBreakdown.operatingCashBuffer, privacy),
              })}
        </span>
      </div>
      <div class="kv">
        <span class="k">{safeToSpendAfterPurchaseLabel()}</span>
        <span>{money(impact.safeToSpendAfter, privacy)}</span>
      </div>
      <div class="mt-1">
        <button
          type="button"
          class="icon-btn plain-text-btn"
          onclick={() => (breakdownOpen = !breakdownOpen)}
        >
          {breakdownOpen ? t('spendImpact.collapseBreakdown') : safeToSpendAfterPurchaseExplainTitle()}
        </button>
        {#if breakdownOpen}
          <div class="list mt-1">
            <div class="kv">
              <span class="k">{sts.lowest30d}</span>
              <span>{money(impact.safeToSpendBreakdown.lowestProjectedOperatingCash30d, privacy)}</span>
            </div>
            <div class="kv">
              <span class="k">{sts.buffer}</span>
              <span>{money(impact.safeToSpendBreakdown.operatingCashBuffer, privacy)}</span>
            </div>
            <div class="kv">
              <span class="k">{sts.goalReserve}</span>
              <span>{money(impact.safeToSpendBreakdown.earmarkedOperatingGoalCash, privacy)}</span>
            </div>
            <div class="kv">
              <span class="k">{sts.protectedReserve}</span>
              <span>{money(impact.safeToSpendBreakdown.protectedReserveExcludedUpstream, privacy)}</span>
            </div>
            <div class="kv">
              <span class="k">{sts.obligations30d}</span>
              <span>{money(impact.safeToSpendBreakdown.upcomingObligations30d, privacy)}</span>
            </div>
          </div>
        {/if}
      </div>
      <div class="kv">
        <span class="k">{t('spendImpact.monthlySurplus')}</span>
        <span class={depositDeltaClass(impact.monthlySurplusChange)}>
          {impact.monthlySurplusChange === 0
            ? t('spendImpact.unchanged')
            : signedMoney(impact.monthlySurplusChange, privacy)}
        </span>
      </div>
    </div>

    <div class="result-block">
      <div class="rb-title">{t('spendImpact.longTermTitle')}</div>
      {#each impact.diffByYear as d (d.year)}
        <div class="kv">
          <span class="k">{t('spendImpact.assetsLessInYears', { years: d.year })}</span>
          <span class={depositDeltaClass(d.diff)}>{signedMoney(d.diff, privacy)}</span>
        </div>
      {/each}
    </div>

    {#if delayedGoals.length > 0}
      <div class="result-block">
        <div class="rb-title">{t('spendImpact.goalDelayTitle')}</div>
        {#each delayedGoals as g (g.goal.id)}
          <div class="kv">
            <span class="k">{g.goal.name}</span>
            <span class="text-secondary">{delayToHuman(g.delayMonths)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <p class="muted-note">
      {#if tenYearDiff && yearLabel != null}
        {t('spendImpact.neutralSummaryNetWorth', {
          year: yearLabel,
          amount: money(Math.abs(tenYearDiff.diff), privacy),
        })}
      {/if}
      {firstDelay
        ? t('spendImpact.neutralSummaryGoalDelay', {
            name: firstDelay.goal.name,
            delay: delayToHuman(firstDelay.delayMonths),
          })
        : t('spendImpact.neutralSummaryNoGoalDelay')}
      {impact.operatingCashBufferOk
        ? t('spendImpact.neutralSummaryBufferOk', { buffer: sts.buffer })
        : t('spendImpact.neutralSummaryBufferLow', { buffer: sts.buffer })}
    </p>

    <div class="verdict {impact.verdict}">{t(verdictKey(impact.verdict))}</div>
  {/if}
</aside>
