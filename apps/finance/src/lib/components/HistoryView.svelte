<script>
  // Port of src/components/HistoryView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import {
    money,
    signedMoney,
    depositDeltaClass,
  } from '$lib/format.js'
  import {
    accountNamesOf,
    categoriesOf,
    computeRecurring,
    computeStatistics,
    categoryBreakdown,
    monthlySeries,
    dailySeries,
    coverageGaps,
    searchTxns,
    rangeSummary,
    topMerchants,
  } from '../../engine/transactions.js'
  import {
    buildPurchaseDisplayContext,
    computePurchaseCoverage,
  } from '../../engine/purchaseEnrichmentDisplay.js'
  import { isPurchaseEnrichmentDebugMode } from '../../lib/purchaseDebugMode.js'
  import SpendingTrendChart from './SpendingTrendChart.svelte'
  import BudgetPulseCard from './BudgetPulseCard.svelte'
  import PurchaseCoverageCard from './PurchaseCoverageCard.svelte'
  import MerchantOrderCatalogSection from './MerchantOrderCatalogSection.svelte'
  import HistoryLedger from './HistoryLedger.svelte'
  import { discretionaryMonthlyBudget } from '../../engine/budget.js'
  import { readBackfillState } from '$lib/txnBackfill.js'
  import MerchantLogo from './MerchantLogo.svelte'

  /** @typedef {'month' | '30d' | '3m' | '12m' | 'all'} Window */

  /** @param {string} asOf @param {number} n */
  function monthsBeforeAsOf(asOf, n) {
    const [y, m, d] = asOf.split('-').map(Number)
    const total = y * 12 + (m - 1) - n
    const yy = Math.floor(total / 12)
    const mm = (total % 12) + 1
    return `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  /** @param {string} asOf @param {number} n */
  function daysBeforeAsOf(asOf, n) {
    const d = new Date(`${asOf}T12:00:00`)
    d.setDate(d.getDate() - n + 1)
    return d.toISOString().slice(0, 10)
  }

  /**
   * `month` is month-to-date (07-01..07-13 = 13 days); `30d` is a rolling
   * 30-day window. They answer different questions — "how am I doing this
   * month" vs "what does a normal month of mine cost" — and early in a month
   * they differ a lot.
   * @param {string} asOf @param {Window} w
   */
  function windowRange(asOf, w) {
    const to = asOf
    switch (w) {
      case 'month':
        return { from: `${asOf.slice(0, 7)}-01`, to, label: t('history.windowMonthLong') }
      case '30d':
        return { from: daysBeforeAsOf(asOf, 30), to, label: t('history.window30dLong') }
      case '3m':
        return { from: monthsBeforeAsOf(asOf, 3), to, label: t('history.window3mLong') }
      case '12m':
        return { from: monthsBeforeAsOf(asOf, 12), to, label: t('history.window12mLong') }
      case 'all':
      default:
        return { label: t('history.windowAllLong') }
    }
  }

  /** @type {{
   *   data: import('../../types.js').FinanceData,
   *   initialLedgerSearch?: string,
   *   onLedgerSearchConsumed?: () => void,
   *   onQuickAdd?: () => void,
   * }} */
  let { data, initialLedgerSearch, onLedgerSearchConsumed, onQuickAdd } = $props()

  const txStore = getTransactionsStore()
  const privacy = $derived(data.privacy)

  const series = $derived(monthlySeries(txStore.txns))
  const txnStatistics = $derived(computeStatistics(txStore.txns))
  const categoryList = $derived(categoriesOf(txStore.txns))
  const accountList = $derived(accountNamesOf(txStore.txns))

  // One range for the whole tab. The trend chart and the category/merchant
  // cards each carried their own identical 本月/近3月/近12月/全部 control, so the
  // same question was asked twice on one screen and the two could silently
  // disagree — a chart showing this month above a breakdown showing all time.
  /** @type {Window} */
  let trendWindow = $state('month')
  const catWindow = $derived(trendWindow)

  const WINDOWS = $derived([
    { id: 'month', label: t('history.windowMonth') },
    { id: '30d', label: t('history.window30d') },
    { id: '3m', label: t('history.window3m') },
    { id: '12m', label: t('history.window12m') },
    { id: 'all', label: t('history.windowAll') },
  ])
  // 这是「洞察」页：分类占比、Top 商户和趋势就是它存在的理由，默认展开。
  // 之前默认折叠，于是整个标签页只剩下一条 5,000+ 行的原始流水。
  let showInsights = $state(true)

  const catRange = $derived(windowRange(txStore.meta.asOf, catWindow))
  // 范围控件统辖整页：账本、商品覆盖、周期账单都吃同一份切好范围的流水，
  // 而不是各自为政（之前只有概览/趋势/分类/商户跟随，账本永远是全历史）。
  const rangeTxns = $derived(
    catRange.from
      ? txStore.txns.filter(
          (txn) => txn.date >= catRange.from && txn.date <= (catRange.to ?? txStore.meta.asOf),
        )
      : txStore.txns,
  )
  // 周期性检测需要跨月历史才能认出「连续多月同商户」，所以在全量上算、
  // 再按「本范围内有过扣款」过滤展示——本月视图只看本月还在扣的订阅。
  const recurring = $derived.by(() => {
    const all = computeRecurring(txStore.txns, { limit: 12 })
    if (!catRange.from) return all
    return all.filter((r) => r.lastSeen >= catRange.from)
  })
  // The KPI card follows the range control like every other card. It used to be
  // pinned to trailing-12-months, so picking 本月 left "近 12 月平均月花销"
  // sitting above a chart of 13 days.
  const rangeStats = $derived(
    rangeSummary(txStore.txns, { from: catRange.from, to: catRange.to ?? txStore.meta.asOf }),
  )

  // Short ranges are drawn per day, longer ones per month: a month or 30 days
  // aggregated monthly is one or two bars, which is not a trend. Both take their
  // bounds from catRange so the chart and the cards below cannot describe
  // different periods.
  const trendDaily = $derived(trendWindow === 'month' || trendWindow === '30d')
  const trendSeries = $derived.by(() => {
    if (trendDaily && catRange.from) {
      return dailySeries(txStore.txns, { from: catRange.from, to: catRange.to })
    }
    if (trendWindow === 'all') return series
    const n = trendWindow === '3m' ? 3 : 12
    return series.slice(-n - 1)
  })
  const categories = $derived(
    categoryBreakdown(txStore.txns, { from: catRange.from, to: catRange.to }),
  )
  const merchants = $derived(
    topMerchants(txStore.txns, { from: catRange.from, to: catRange.to, limit: 12 }),
  )
  const maxCat = $derived(categories[0]?.amount ?? 1)
  const categoryLimit = $derived(catWindow === 'month' ? 8 : 14)
  const merchantLimit = $derived(catWindow === 'month' ? 8 : 12)
  // Plan-vs-reality compares against a MONTHLY budget, so it only makes sense for
  // ranges that are about one month. Under 近3月/近12月/全部 the comparison would
  // put a multi-month total next to a single month's plan.
  const planComparable = $derived(trendWindow === 'month' || trendWindow === '30d')
  const rangeSpending = $derived(rangeStats.spending)
  const purchaseDisplayContext = $derived(buildPurchaseDisplayContext(txStore.txns))
  // 上下文用全量建（订单匹配需要完整目录），覆盖统计只数范围内的——
  // 摘要里的数字要和下面同样被范围切过的账本对得上。
  const purchaseCoverage = $derived(computePurchaseCoverage(rangeTxns, purchaseDisplayContext))
  const purchaseDebugMode = $derived(isPurchaseEnrichmentDebugMode())

  /** @type {HTMLDivElement | null} */
  let ledgerRef = $state(null)
  let jumpLedgerSearch = $state(undefined)
  /** @type {'all' | 'clean' | 'review' | 'return'} */
  let purchaseStateFilter = $state('all')
  /** @type {'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource} */
  let purchaseSourceFilter = $state('all')

  // 日预算 = 可变月预算 ÷ 当月天数（业界 daily-budget/safe-to-spend 公式）。
  // 「每天能花多少」只对日常可调的消费有意义：401(k) 等 payroll 供款从不出现在
  // 流水里、房租超大额且不是任何一天的消费决策，都由 discretionaryMonthlyBudget
  // 剔除；水电/订阅这类走日常流水的固定小额项保留，保证预算线和柱子比的是
  // 同一种钱。预算对比卡用同一个分子，两把尺子不打架。
  const discBudget = $derived(discretionaryMonthlyBudget(data.cashFlows))
  const daysInAsOfMonth = $derived.by(() => {
    const [y, m] = txStore.meta.asOf.split('-').map(Number)
    return new Date(y, m, 0).getDate()
  })
  const dailyBudget = $derived(discBudget.monthly > 0 ? discBudget.monthly / daysInAsOfMonth : 0)
  const overBudgetDays = $derived(
    trendDaily && dailyBudget > 0
      ? trendSeries.filter((p) => p.spending > dailyBudget).length
      : 0,
  )

  // 连续多天一条记录都没有（含转账）更像导入缺口而不是没花钱。图上那些 $0
  // 柱子会撒谎，这里把它点破；日均和预算对比也要把这些天摘出去，否则 10 天
  // 缺口能把日均稀释三分之一、把「预测偏保守」的错误结论坐实。
  const rangeGaps = $derived(
    coverageGaps(txStore.txns, {
      from: catRange.from ?? txStore.meta.dateRange.start,
      to: catRange.to ?? txStore.meta.asOf,
      minRun: 5,
    }),
  )
  const gapDays = $derived(rangeGaps.reduce((a, g) => a + g.days, 0))
  // 有数据可言的天数：窗口天数减去已知缺口，至少 1 天防除零。
  const effectiveDays = $derived(Math.max(1, rangeStats.days - gapDays))
  const adjustedAvgPerDay = $derived(rangeStats.spending / effectiveDays)

  // 预测对比按「范围内有数据的天数」折算月支出假设。之前拿 13 天的实际花销
  // 去比整月假设，月中永远显示「低约 73%，预测偏保守」——那不是洞察，是除错了分母。
  const plannedForRange = $derived(dailyBudget * effectiveDays)
  const planDiff = $derived(rangeSpending - plannedForRange)
  const planOverspend = $derived(planDiff > 0)
  const planRatio = $derived(plannedForRange > 0 ? planDiff / plannedForRange : 0)
  const planMeaningful = $derived(Math.abs(planRatio) >= 0.05)

  // 缺口提示是否可以追加「已安排回读」：ExtensionSyncBridge 发现缺口时会随
  // 快照向扩展发一次性回读请求并记账在 localStorage（见 txnBackfill.js）。
  /** @param {{ from: string, to: string }} gap */
  function backfillArmedFor(gap) {
    const s = readBackfillState()
    return s?.status === 'pending' && s.from <= gap.from && s.to >= gap.to
  }

  function scrollToLedger() {
    ledgerRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Clicking a bar answers "what did I buy that day" with the ledger itself —
  // the tooltip's top merchants are a preview, not the answer.
  /** @type {{ from: string, to: string, label: string } | null} */
  let ledgerDateFilter = $state(null)
  /** @param {string} bucket YYYY-MM-DD from the daily chart, YYYY-MM from the monthly one */
  function drillToBucket(bucket) {
    ledgerDateFilter =
      bucket.length === 7
        ? // "-31" over-covers short months, but the filter is a lexicographic
          // string comparison, so real dates like 02-28 still fall inside.
          { from: `${bucket}-01`, to: `${bucket}-31`, label: bucket }
        : { from: bucket, to: bucket, label: bucket }
    scrollToLedger()
  }
</script>

{#if txStore.loading}
  <div class="card">{t('history.loading')}</div>
{:else if txStore.error}
  <div class="card">{t('history.loadFailed', { error: txStore.error })}</div>
{:else}
  <div class="history-view">
    <details class="history-intro-details">
      <summary class="history-intro-summary">
        {t('history.introSummary', {
          start: txStore.meta.dateRange.start,
          end: txStore.meta.dateRange.end,
          count: txStore.meta.rowCount.toLocaleString(),
        })}
      </summary>
      <p class="muted-note history-intro mb-0 mt-1">
        {t('history.intro', {
          start: txStore.meta.dateRange.start,
          end: txStore.meta.dateRange.end,
          count: txStore.meta.rowCount.toLocaleString(),
        })}
      </p>
    </details>

    <!-- One range control for the tab, top-right. Every card below reads it. -->
    <div class="history-insights-toggle">
      <button
        type="button"
        class="btn ghost"
        onclick={() => (showInsights = !showInsights)}
        aria-expanded={showInsights}
      >
        {showInsights ? t('history.collapseInsights') : t('history.expandInsights')}
      </button>
      {#if showInsights}
        <div class="seg" role="group" aria-label={t('history.rangeAria')}>
          {#each WINDOWS as w (w.id)}
            <button
              type="button"
              class={trendWindow === w.id ? 'active' : ''}
              aria-pressed={trendWindow === w.id}
              onclick={() => (trendWindow = w.id)}
            >
              {w.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="history-insights{showInsights ? ' open' : ''}">
      {#if showInsights}
        <div class="card history-kpi-card">
          <h3>{t('history.rangeKpiTitle', { range: catRange.label })}</h3>
          <div class="grid history-kpi-grid mt-2-5">
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiRangeSpending')}</span>
              <span class="value records-metric">{money(rangeStats.spending, privacy)}</span>
              <span class="sub">
                {t('history.kpiRangeSpendingSub', { days: rangeStats.days })}
              </span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiRangeIncome')}</span>
              <span class="value records-metric">{money(rangeStats.income, privacy)}</span>
              <span class="sub">
                {t('history.kpiRangeNetSub', {
                  amount: signedMoney(rangeStats.income - rangeStats.spending, privacy),
                })}
              </span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiAvgPerDay')}</span>
              <span class="value records-metric">{money(adjustedAvgPerDay, privacy)}</span>
              <span class="sub">
                {#if gapDays > 0}
                  {t('history.kpiAvgPerDayGap', { gap: gapDays })}
                {/if}
                {t('history.kpiAvgPerDaySub', {
                  active: rangeStats.activeDays,
                  days: rangeStats.days,
                })}
              </span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiPeakDay')}</span>
              <span class="value records-metric">
                {money(rangeStats.peakDay?.spending ?? 0, privacy)}
              </span>
              <span class="sub">
                {rangeStats.peakDay
                  ? rangeStats.peakDay.date
                  : t('history.kpiNoData')}
              </span>
            </div>
          </div>
        </div>

        {#if planComparable && discBudget.monthly > 0 && rangeSpending > 0}
          <div class="card">
            <h3>{t('history.planRealityTitle')}</h3>
            <div class="grid plan-reality-grid gap-3">
              <div class="kv-stack">
                <span class="text-secondary">
                  {t('history.plannedForRange', { days: effectiveDays })}
                </span>
                <span class="pr-value records-metric">{money(plannedForRange, privacy)}</span>
              </div>
              <div class="kv-stack">
                <span class="text-secondary">
                  {t('history.actualThisMonth', { range: catRange.label })}
                </span>
                <span class="pr-value records-metric">{money(rangeSpending, privacy)}</span>
              </div>
              <div class="kv-stack">
                <span class="text-secondary">{t('history.diff')}</span>
                <span class="pr-value records-metric {depositDeltaClass(-planDiff)}">
                  {signedMoney(planDiff, privacy)}
                </span>
              </div>
            </div>
            <p class="muted-note mt-2-5">
              {!planMeaningful
                ? t('history.planMatch')
                : planOverspend
                  ? t('history.planOverspend', { pct: (planRatio * 100).toFixed(0) })
                  : t('history.planUnderspend', { pct: (Math.abs(planRatio) * 100).toFixed(0) })}
            </p>
            {#if discBudget.excluded.length > 0}
              <p class="muted-note mt-1">
                {t('history.planExcludedNote', {
                  items: discBudget.excluded.map((e) => e.name).join('、'),
                  amount: money(discBudget.excludedMonthly, privacy),
                })}
              </p>
            {/if}
          </div>
        {/if}

        <div class="card">
          <div class="card-head">
            <h3>
              {trendDaily
                ? t('history.trendTitleDaily', { range: catRange.label })
                : t('history.trendTitle')}
            </h3>
          </div>
          <SpendingTrendChart
            series={trendSeries}
            {privacy}
            daily={trendDaily}
            budgetPerDay={trendDaily ? dailyBudget : 0}
            onSelectPoint={drillToBucket}
          />
          {#if trendDaily}
            {#each rangeGaps.slice(0, 2) as g (g.from)}
              <p class="muted-note chart-gap-note mt-2">
                {t('history.coverageGapNote', { from: g.from, to: g.to, days: g.days })}
                {#if backfillArmedFor(g)}
                  {t('history.coverageGapArmed')}
                {/if}
              </p>
            {/each}
          {/if}
          {#if trendDaily && dailyBudget > 0}
            <p class="muted-note mt-2">
              {t('history.budgetRelationNote', {
                budget: money(dailyBudget, privacy),
                monthly: money(discBudget.monthly, privacy),
                excluded: money(discBudget.excludedMonthly, privacy),
                over: overBudgetDays,
                days: trendSeries.length,
              })}
            </p>
          {/if}
          <p class="muted-note mt-2">
            {trendDaily ? t('history.trendNoteDaily') : t('history.trendNote')}
          </p>
        </div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-head">
              <h3>{t('history.categoriesTitle', { range: catRange.label })}</h3>
            </div>
            {#if categories.length === 0}
              <p class="muted-note">{t('history.noSpendingInRange')}</p>
            {:else}
              <div class="cat-list">
                {#each categories.slice(0, categoryLimit) as c (c.category)}
                  <div class="cat-row">
                    <div class="cat-top">
                      <span class="cat-name">{c.category}</span>
                      <span class="cat-amt">{money(c.amount, privacy)}</span>
                    </div>
                    <div class="cat-bar">
                      <div
                        class="cat-bar-fill"
                        style:width="{Math.max(2, (c.amount / maxCat) * 100)}%"
                      ></div>
                    </div>
                    <div class="cat-meta">
                      {c.count === 1
                        ? t('history.categoryMetaOne', { pct: (c.pct * 100).toFixed(1) })
                        : t('history.categoryMeta', { pct: (c.pct * 100).toFixed(1), count: c.count })}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="card">
            <h3>{t('history.recurringTitle', { range: catRange.label })}</h3>
            <p class="muted-note mb-2-5">{t('history.recurringNote')}</p>
            <div class="list recurring-list">
              {#each recurring as r (r.merchant)}
                <div class="item">
                  <MerchantLogo merchant={r.merchant} size={24} />
                  <div class="grow">
                    <div class="name">{r.merchant}</div>
                    <div class="meta">
                      {t('history.recurringMeta', {
                        months: r.distinctMonths,
                        count: r.transactionCount,
                        lastSeen: r.lastSeen,
                      })}
                    </div>
                  </div>
                  <div class="amount text-secondary">
                    {money(r.averageAmount, privacy)}{t('history.perOccurrence')}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="card">
          <h3>{t('history.topMerchantsTitle', { range: catRange.label })}</h3>
          {#if merchants.length === 0}
            <p class="muted-note">{t('history.noSpendingInRange')}</p>
          {:else}
            <div class="grid merchant-grid">
              {#each merchants.slice(0, merchantLimit) as m, i (m.merchant)}
                <div class="merchant-cell">
                  <span class="merchant-rank">{i + 1}</span>
                  <MerchantLogo merchant={m.merchant} size={24} />
                  <div class="grow">
                    <div class="name">{m.merchant}</div>
                    <div class="meta">{t('history.merchantMeta', { count: m.count })}</div>
                  </div>
                  <span class="amount">{money(m.amount, privacy)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Purchase coverage is a ledger FILTER (its actions all scroll to the
         ledger), not an insight, so it does not earn a full card in the main
         flow. Collapsed by default and parked directly above the ledger it
         filters — one click away, out of the way. -->
    <details class="history-coverage-details">
      <summary class="history-coverage-summary">
        {t('history.coverageSummary', {
          bills: (purchaseCoverage.cleanEnriched ?? 0).toLocaleString(),
          items: (purchaseCoverage.cleanItemCount ?? 0).toLocaleString(),
        })}
      </summary>
      <PurchaseCoverageCard
        stats={purchaseCoverage}
        debugMode={purchaseDebugMode}
        sourceFilter={purchaseSourceFilter}
        onSourceFilterChange={(source) => {
          purchaseSourceFilter = source
          if (source !== 'all') purchaseStateFilter = 'clean'
          scrollToLedger()
        }}
        onFilter={(preset) => {
          if (preset === 'purchase:clean') purchaseStateFilter = 'clean'
          else if (preset === 'purchase:review') purchaseStateFilter = 'review'
          else if (preset === 'purchase:return') purchaseStateFilter = 'return'
          purchaseSourceFilter = 'all'
          scrollToLedger()
        }}
        onViewCleanBills={() => {
          purchaseStateFilter = 'clean'
          purchaseSourceFilter = 'all'
          scrollToLedger()
        }}
      />
    </details>

    <div bind:this={ledgerRef} id="history-ledger">
      <HistoryLedger
        {privacy}
        txns={rangeTxns}
        {categoryList}
        {accountList}
        {purchaseDisplayContext}
        {purchaseStateFilter}
        {purchaseSourceFilter}
        {purchaseDebugMode}
        onPurchaseStateFilterChange={(f) => {
          purchaseStateFilter = f
          if (f !== 'clean') purchaseSourceFilter = 'all'
        }}
        onEdit={(txn) => txStore.editTxn(txn)}
        onDelete={(id) => txStore.removeTxn(id)}
        dateFilter={ledgerDateFilter}
        onDateFilterClear={() => (ledgerDateFilter = null)}
        initialSearch={jumpLedgerSearch ?? initialLedgerSearch}
        onInitialSearchConsumed={() => {
          jumpLedgerSearch = undefined
          onLedgerSearchConsumed?.()
        }}
      />
    </div>

    <section class="history-summary-secondary">
      <BudgetPulseCard {data} {onQuickAdd} compact />
      <MerchantOrderCatalogSection catalog={data.merchantOrderCatalog} {privacy} debugMode={purchaseDebugMode} />
    </section>

    <p class="muted-note">
      {t('history.footnote', {
        ccPayments: txnStatistics.creditCardPaymentRows,
        transfers: txnStatistics.internalTransferRows,
        mirrors: txnStatistics.mirrorDuplicateRowsExcludedFromAnalytics,
      })}
    </p>
  </div>
{/if}
