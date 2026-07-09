<script>
  import HoldingsOverviewCard from './stocks/HoldingsOverviewCard.svelte'
  import { goalReachMonth } from '$lib/engine/metrics'
  import { signedMonthOffset } from '$lib/engine/calendar'
  import { safeToSpendLabel, safeToSpendExplainTitle } from '@life-os/finance-core/copy/metrics'
  import {
    accessibleLabel,
    lockedLabel,
    liquidCashLabel,
    stsBreakdown,
    welcomeTitle,
    netWorthLabel,
  } from '@life-os/finance-core/copy/terminology'
  import { t } from '$lib/i18n.svelte.js'
  import {
    money,
    signedMoney,
    pct,
    isoToCalendarLabel,
    monthOffsetToCalendarLabel,
    depositDeltaClass,
  } from '$lib/format.js'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('$lib/projection.js').Projection} Projection */
  /** @typedef {import('$lib/dashboard.js').Dashboard} Dashboard */
  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */

  /** @type {{
   *   data: FinanceData,
   *   projection: Projection,
   *   dashboard: Dashboard,
   *   onOpenSpend: () => void,
   *   onGoTab: GoTab,
   *   onGoStocks: (snapshotId?: string) => void,
   *   tabActive?: boolean,
   * }} */
  let {
    data,
    projection,
    dashboard,
    onOpenSpend,
    onGoTab,
    onGoStocks,
    tabActive = true,
  } = $props()

  const summary = $derived(projection.summary)
  const baseline = $derived(projection.baseline)
  const derived = $derived(dashboard.derived)
  const sts = $derived(stsBreakdown())
  const liquidCash = $derived(liquidCashLabel())
  const safeToSpend = $derived(safeToSpendLabel())
  const netWorth = $derived(netWorthLabel())
  const privacy = $derived(data.privacy)
  const now = $derived(baseline[0])
  const m1 = $derived(baseline[1] ?? now)
  const runway = $derived(summary.emergencyRunwayMonths)

  const drivers = $derived.by(() => {
    const liquid = liquidCashLabel()
    return [
      { label: t('overview.driverMonthlySurplus'), delta: m1.surplus },
      { label: t('overview.driverOneTime'), delta: m1.oneTimeIncome - m1.oneTimeExpense },
      { label: t('overview.driverInvestedChange'), delta: m1.invested - now.invested },
      { label: t('overview.driverLiquidChange', { liquidCash: liquid }), delta: m1.liquidCash - now.liquidCash },
      { label: t('overview.driverLiabilitiesChange'), delta: now.liabilities - m1.liabilities },
    ]
      .filter((x) => Math.abs(x.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
  })

  const upcoming = $derived.by(() => {
    const nowDate = new Date()
    /** @type {{ id: string, name: string, month: number, whenLabel: string, signed: number }[]} */
    const items = []
    for (const e of data.events) {
      if (!e.enabled) continue
      if (e.eventType !== 'windfall' && e.eventType !== 'one-time-purchase') continue
      const month = e.date ? signedMonthOffset(nowDate, e.date) : Math.round(e.monthOffset)
      const amt = e.amount ?? 0
      items.push({
        id: e.id,
        name: e.name,
        month,
        whenLabel: e.date ? isoToCalendarLabel(e.date) : monthOffsetToCalendarLabel(month),
        signed: e.eventType === 'windfall' ? amt : -amt,
      })
    }
    items.sort((a, b) => a.month - b.month)
    return items.filter((i) => i.month >= 0).slice(0, 8)
  })

  const accessible = $derived(accessibleLabel())
  const locked = $derived(lockedLabel())
</script>

{#if data.accounts.length === 0 && data.cashFlows.length === 0}
  <div class="empty">
    <h2 class="mb-2">{welcomeTitle()}</h2>
    <p class="text-secondary">{t('overview.emptyHint')}</p>
    <div class="flex-row-center mt-4">
      <button class="btn" onclick={() => onGoTab('accounts')}>{t('today.addAccounts')}</button>
      <button class="btn ghost" onclick={() => onGoTab('history', 'fixed')}>
        {t('today.addCashflows')}
      </button>
    </div>
  </div>
{:else}
  <div class="grid gap-4">
    <p class="muted-note mb-1">{t('overview.intro')}</p>
    <div class="grid kpi-row-4">
      <div class="card kpi">
        <span class="label">{netWorth}</span>
        <span class="value">{money(summary.netWorth, privacy)}</span>
        <span class="sub">
          {t('overview.netWorthSubPrefix')}
          <span class={depositDeltaClass(summary.netWorthChangeThisYear)}>
            {signedMoney(summary.netWorthChangeThisYear, privacy)}
          </span>
        </span>
      </div>
      <div class="card kpi">
        <span class="label">{liquidCash}</span>
        <span class="value">{money(derived.liquidCash, privacy)}</span>
        <span class="sub">
          {derived.cashAnchors.hasAnchoredAccounts
            ? t('overview.liquidAnchored')
            : runway != null
              ? t('overview.liquidRunway', { months: runway.toFixed(1) })
              : t('overview.liquidCheckingSavings')}
        </span>
      </div>
      <div class="card kpi">
        <span class="label">{t('terminology.invested')}</span>
        <span class="value">{money(summary.invested, privacy)}</span>
        <span class="sub">{t('overview.investedSub', { pct: pct(summary.investedPct) })}</span>
      </div>
      <div class="card kpi">
        <span class="label">{safeToSpend}</span>
        <span class="value">{money(derived.safeToSpend, privacy)}</span>
        <span class="sub">{t('overview.safeToSpendSub')}</span>
      </div>
    </div>

    {#if (data.holdingsSnapshots?.length ?? 0) > 0}
      <HoldingsOverviewCard {data} {tabActive} {onGoStocks} />
    {/if}

    <div class="card">
      <h3>{safeToSpendExplainTitle()}</h3>
      <div class="list">
        <div class="kv">
          <span class="k">{sts.lowest30d}</span>
          <span>
            {money(derived.safeToSpendBreakdown.lowestProjectedOperatingCash30d, privacy)}
          </span>
        </div>
        <div class="kv">
          <span class="k">{sts.buffer}</span>
          <span>{money(derived.safeToSpendBreakdown.operatingCashBuffer, privacy)}</span>
        </div>
        <div class="kv">
          <span class="k">{sts.goalReserve}</span>
          <span>{money(derived.safeToSpendBreakdown.earmarkedOperatingGoalCash, privacy)}</span>
        </div>
        <div class="kv">
          <span class="k">{sts.protectedReserve}</span>
          <span>
            {money(derived.safeToSpendBreakdown.protectedReserveExcludedUpstream, privacy)}
          </span>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>{t('overview.driversTitle')}</h3>
      {#if drivers.length === 0}
        <p class="muted-note">{t('overview.noDrivers')}</p>
      {:else}
        <div class="list">
          {#each drivers as d (d.label)}
            <div class="kv">
              <span class="k">{d.label}</span>
              <span class={depositDeltaClass(d.delta)}>{signedMoney(d.delta, privacy)}</span>
            </div>
          {/each}
          <p class="muted-note">{t('overview.driversNote')}</p>
        </div>
      {/if}
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-head">
          <h3>{t('overview.whereMoneyGoes')}</h3>
          <button class="text-btn" onclick={() => onGoTab('forecast')}>
            {t('overview.viewForecast')}
          </button>
        </div>
        <div class="list">
          <div class="kv">
            <span class="k">{t('overview.accessibleAfterTax', { accessible })}</span>
            <span>{money(summary.accessible, privacy)}</span>
          </div>
          <div class="kv">
            <span class="k">{t('overview.locked401k', { locked })}</span>
            <span>{money(summary.locked, privacy)}</span>
          </div>
          <p class="muted-note mb-1-5">
            {t('overview.waterfallFormula', { accessible, liquidCash, locked })}
          </p>
          <div class="kv">
            <span class="k">{t('overview.liquidBreakdown', { liquidCash })}</span>
            <span>{money(derived.liquidCash, privacy)}</span>
          </div>
          {#if summary.investedTaxable > 0}
            <div class="kv">
              <span class="k">{t('overview.brokerageMarket')}</span>
              <span>{money(summary.investedTaxable, privacy)}</span>
            </div>
            {#if summary.taxBasisKnown}
              <div class="kv">
                <span class="k">{t('overview.brokerageBasis')}</span>
                <span>{money(summary.investedTaxableBasis, privacy)}</span>
              </div>
              <div class="kv">
                <span class="k">{t('overview.brokerageUnrealized')}</span>
                <span>{money(summary.unrealizedGainEstimate, privacy)}</span>
              </div>
              <div class="kv">
                <span class="k">{t('overview.brokerageTaxIfSell')}</span>
                <span>{money(summary.capitalGainsTaxEstimate, privacy)}</span>
              </div>
              <div class="kv">
                <span class="k">{t('overview.brokerageAfterTax', { accessible })}</span>
                <span>{money(summary.investedTaxableAfterTax, privacy)}</span>
              </div>
            {:else}
              <p class="muted-note mb-1-5">
                {t('overview.brokerageNoBasis', { accessible })}
              </p>
            {/if}
          {/if}
          {#if summary.reserve > 0}
            <div class="kv">
              <span class="k">{t('overview.reserveBreakdown')}</span>
              <span>{money(summary.reserve, privacy)}</span>
            </div>
          {/if}
          <div class="kv">
            <span class="k">{t('overview.investedTotal')}</span>
            <span>{money(summary.invested, privacy)}</span>
          </div>
          <div class="kv">
            <span class="k">{t('overview.monthlySurplusAvg')}</span>
            <span class={depositDeltaClass(summary.monthlySurplus)}>
              {signedMoney(summary.monthlySurplus, privacy)}
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>{t('overview.goalsTitle')}</h3>
        {#if data.goals.length === 0}
          <p class="text-muted">{t('overview.noGoals')}</p>
        {/if}
        <div class="list">
          {#each data.goals as g (g.id)}
            {@const m = goalReachMonth(baseline, g)}
            <div class="item">
              <div class="grow">
                <div class="name">{g.name}</div>
                <div class="meta">{money(g.target, privacy)}</div>
              </div>
              <div class="amount text-secondary">
                {m == null
                  ? t('overview.goalUnreachable')
                  : t('overview.goalEta', { when: monthOffsetToCalendarLabel(m) })}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>{t('overview.upcomingTitle')}</h3>
        <button class="icon-btn" onclick={() => onGoTab('history', 'oneoff')}>
          {t('overview.upcomingAdd')}
        </button>
      </div>
      {#if upcoming.length === 0}
        <p class="muted-note">{t('overview.upcomingEmpty')}</p>
      {:else}
        <div class="list">
          {#each upcoming as i (i.id)}
            <div class="item">
              <div class="grow">
                <div class="name">{i.name}</div>
                <div class="meta">{i.whenLabel}</div>
              </div>
              <div class="amount {depositDeltaClass(i.signed)}">
                {signedMoney(i.signed, data.privacy)}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card">
      <div class="section-head">
        <h3>{t('overview.spendImpactTitle')}</h3>
        <button class="btn" onclick={onOpenSpend}>{t('overview.trySpend')}</button>
      </div>
      <p class="muted-note">{t('overview.spendImpactHint')}</p>
    </div>
  </div>
{/if}
