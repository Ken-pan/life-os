<script>
  // Port of src/components/ForecastView.tsx.
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.svelte.js'
  import {
    adjustForDisplay,
    depositDeltaClass,
    money,
    monthOffsetToCalendarLabel,
    pct,
    signedMoney,
  } from '$lib/format.js'
  import {
    accessibleLabel,
    getForecastMetricHints,
    getForecastMetricLabels,
    inTransitCashLabel,
    liquidCashLabel,
    lockedLabel,
  } from '../../copy/terminology.js'
  import { goalReachMonth, metricValue } from '../../engine/metrics.js'
  import ForecastChart from './ForecastChart.svelte'
  import ForecastSplitChart from './ForecastSplitChart.svelte'
  import SortBySelect from './SortBySelect.svelte'

  /** @typedef {import('../../types.js').FinanceData} FinanceData */
  /** @typedef {import('../../types.js').ForecastMetric} ForecastMetric */
  /** @typedef {import('$lib/projection.js').computeProjection} _cp */

  /** @type {{
   *   data: FinanceData,
   *   projection: ReturnType<typeof import('$lib/projection.js').computeProjection>,
   *   displayLiquidCash?: number,
   *   cashAnchors?: import('../../engine/reconciliation.js').LiquidCashAnchors,
   *   onGoTab?: (tab: string, section?: string) => void,
   * }} */
  let { data, projection, displayLiquidCash, cashAnchors, onGoTab } = $props()

  const FORECAST_METRICS = /** @type {ForecastMetric[]} */ ([
    'accessible',
    'liquid',
    'net-worth',
    'invested',
    'locked',
  ])

  const maxYears = $derived(data.assumptions.horizonYears)
  const horizonOptions = $derived.by(() => {
    const opts = [1, 5, 10, 20, 30].filter((y) => y <= maxYears)
    if (!opts.includes(maxYears)) opts.push(maxYears)
    return opts
  })

  let years = $state(1)
  let metric = $state(/** @type {ForecastMetric} */ ('accessible'))
  let chartMode = $state(/** @type {'trajectory' | 'composition'} */ ('trajectory'))
  let showMetricHint = $state(false)

  // 图表高度需与 .forecast-chart-wrap 的 CSS 高度一致（桌面 340 / 移动 280），
  // 否则固定高度的 SVG 会溢出容器、底部月份轴标签压到下方文字。
  let chartHeight = $state(340)
  onMount(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const sync = () => (chartHeight = mq.matches ? 280 : 340)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  })

  const read = $derived(metricValue(metric))
  const horizonMonths = $derived(years * 12)
  const a = $derived(data.assumptions)
  const metricLabels = $derived(getForecastMetricLabels())
  const metricHints = $derived(getForecastMetricHints())
  const accessible = $derived(accessibleLabel())
  const locked = $derived(lockedLabel())
  const liquidCash = $derived(liquidCashLabel())
  const inTransitCash = $derived(inTransitCashLabel())
  const privacy = $derived(data.privacy)
  const endIdx = $derived(Math.min(horizonMonths, projection.baseline.length - 1))
  const endSnap = $derived(projection.baseline[endIdx])
  const nowSnap = $derived(projection.baseline[0])

  /** @param {number} v @param {number} m */
  function adj(v, m) {
    return adjustForDisplay(v, m, a.displayMode, a.inflation)
  }

  const todayVal = $derived(adj(read(nowSnap), 0))
  const endVal = $derived(adj(read(endSnap), endIdx))
  const delta = $derived(endVal - todayVal)
  const liquidToday = $derived(displayLiquidCash ?? nowSnap.liquidCash)
  const capGainsRate = $derived(Math.min(1, Math.max(0, a.capitalGainsTaxRate ?? 0.15)))
  const brokerageTax = $derived({
    market: nowSnap.investedTaxable,
    basis: nowSnap.investedTaxableBasis,
    gain: nowSnap.unrealizedGainEstimate,
    tax: nowSnap.capitalGainsTaxEstimate,
    afterTax: nowSnap.investedTaxableAfterTax,
    basisKnown: nowSnap.taxBasisKnown,
  })
  const lowVal = $derived(adj(read(projection.conservative[endIdx]), endIdx))
  const highVal = $derived(adj(read(projection.aggressive[endIdx]), endIdx))
  const accessibleEnd = $derived(adj(endSnap.accessible, endIdx))
  const lockedEnd = $derived(adj(endSnap.locked, endIdx))
  const totalSplit = $derived(accessibleEnd + lockedEnd)
  const accessiblePct = $derived(totalSplit > 0 ? accessibleEnd / totalSplit : 0)
  const reaching = $derived(
    data.goals
      .filter((g) => g.metric === metric)
      .map((g) => ({ goal: g, month: goalReachMonth(projection.baseline, g) }))
      .filter((x) => x.month != null && /** @type {number} */ (x.month) <= horizonMonths)
      .sort((a, b) => /** @type {number} */ (a.month) - /** @type {number} */ (b.month))
      .slice(0, 3),
  )
  const displayModeNote = $derived(
    a.displayMode === 'today' ? t('forecast.displayToday') : t('forecast.displayFuture'),
  )
</script>

{#if data.accounts.length === 0 && data.cashFlows.length === 0}
  <div class="empty">{t('forecast.empty')}</div>
{:else}
  <div class="grid gap-4">
    <div class="card forecast-card">
      {#if onGoTab}
        <div class="forecast-card-head">
          <button
            type="button"
            class="btn outline compact"
            onclick={() => onGoTab('settings', 'assumptions')}
          >
            {t('forecast.editAssumptions')}
          </button>
        </div>
      {/if}

      <div class="forecast-controls-mobile chart-controls">
        <SortBySelect
          label={t('forecast.horizonLabel')}
          compact
          value={String(years)}
          onChange={(v) => (years = Number(v))}
          options={horizonOptions.map((y) => ({
            id: String(y),
            label: t('forecast.yearsShort', { y: String(y) }),
          }))}
        />
        <SortBySelect
          label={t('forecast.metricLabel')}
          compact
          value={metric}
          onChange={(v) => (metric = /** @type {ForecastMetric} */ (v))}
          options={FORECAST_METRICS.map((m) => ({ id: m, label: metricLabels[m] }))}
        />
        <span class="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge forecast-chart-mode-seg">
          <button
            type="button"
            class={chartMode === 'trajectory' ? 'active' : ''}
            onclick={() => (chartMode = 'trajectory')}
          >
            {t('forecast.chartTrajectory')}
          </button>
          <button
            type="button"
            class={chartMode === 'composition' ? 'active' : ''}
            onclick={() => (chartMode = 'composition')}
          >
            {accessible} / {locked}
          </button>
        </span>
        <button
          type="button"
          class="icon-btn forecast-hint-btn"
          aria-expanded={showMetricHint}
          aria-label={t('forecast.metricHintAria', { metric: metricLabels[metric] })}
          title={t('forecast.metricHintTitle')}
          onclick={() => (showMetricHint = !showMetricHint)}
        >
          ⓘ
        </button>
      </div>

      <div class="forecast-controls-desktop">
        <div class="chart-controls forecast-controls">
          <span class="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
            {#each horizonOptions as y (y)}
              <button
                type="button"
                class={years === y ? 'active' : ''}
                onclick={() => (years = y)}
              >
                {t('forecast.yearsShort', { y: String(y) })}
              </button>
            {/each}
          </span>
          <span class="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
            <button
              type="button"
              class={chartMode === 'trajectory' ? 'active' : ''}
              onclick={() => (chartMode = 'trajectory')}
            >
              {t('forecast.chartTrajectory')}
            </button>
            <button
              type="button"
              class={chartMode === 'composition' ? 'active' : ''}
              onclick={() => (chartMode = 'composition')}
            >
              {accessible} / {locked}
            </button>
          </span>
        </div>
        <div class="chart-controls forecast-controls forecast-controls-metrics mt-2">
          <div class="forecast-controls-cluster">
            <span
              class="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge forecast-metric-seg"
              role="group"
              aria-label={t('forecast.metricLabel')}
            >
              {#each FORECAST_METRICS as m (m)}
                <button
                  type="button"
                  class={metric === m ? 'active' : ''}
                  onclick={() => (metric = m)}
                >
                  {metricLabels[m]}
                </button>
              {/each}
            </span>
            <button
              type="button"
              class="icon-btn forecast-hint-btn"
              aria-expanded={showMetricHint}
              aria-label={t('forecast.metricHintAria', { metric: metricLabels[metric] })}
              title={t('forecast.metricHintTitle')}
              onclick={() => (showMetricHint = !showMetricHint)}
            >
              ⓘ
            </button>
          </div>
          <div class="forecast-controls-cluster forecast-controls-cluster-end">
            <span class="text-muted forecast-display-mode">{displayModeNote}</span>
          </div>
        </div>
      </div>

      {#if showMetricHint}
        <p class="muted-note forecast-metric-hint">
          {metricHints[metric]}
          <span class="text-muted"> · {displayModeNote}</span>
        </p>
      {/if}

      <div class="forecast-hero">
        <div class="forecast-hero-main">
          <span class="text-secondary">
            {t('forecast.metricRange', { metric: metricLabels[metric], years: String(years) })}
          </span>
          <div class="forecast-hero-values">
            <span class="forecast-hero-today">{money(todayVal, privacy)}</span>
            <span class="forecast-hero-arrow text-muted">→</span>
            <span class="pr-value">{money(endVal, privacy)}</span>
            <span class="forecast-hero-delta {depositDeltaClass(delta)}">
              {signedMoney(delta, privacy)}
            </span>
          </div>
          {#if metric === 'accessible'}
            <p class="forecast-hero-breakdown text-muted">
              {t('forecast.todayBreakdown')}
              {cashAnchors?.hasAnchoredAccounts ? inTransitCash : liquidCash}
              {money(liquidToday, privacy)}
              {#if nowSnap.reserve > 0}
                {t('forecast.reservePart', { amount: money(nowSnap.reserve, privacy) })}
              {/if}
              {#if brokerageTax.market > 0}
                {#if brokerageTax.basisKnown}
                  {t('forecast.brokerageTaxFull', {
                    market: money(brokerageTax.market, privacy),
                    basis: money(brokerageTax.basis, privacy),
                    gain: money(brokerageTax.gain, privacy),
                    tax: money(brokerageTax.tax, privacy),
                    rate: pct(capGainsRate),
                    afterTax: money(brokerageTax.afterTax, privacy),
                  })}
                {:else}
                  {t('forecast.brokerageNoBasis', { market: money(brokerageTax.market, privacy) })}
                {/if}
              {/if}
              {#if nowSnap.property > 0}
                {t('forecast.propertyPart', { amount: money(nowSnap.property, privacy) })}
              {/if}
              {#if nowSnap.liabilities > 0}
                {t('forecast.liabilitiesPart', { amount: money(nowSnap.liabilities, privacy) })}
              {/if}
            </p>
          {/if}
          {#if metric === 'liquid' && cashAnchors?.hasAnchoredAccounts}
            <p class="forecast-hero-breakdown text-muted">
              {t('forecast.inTransitNote', { amount: money(cashAnchors.cacheLiquid, privacy) })}
            </p>
          {/if}
        </div>
        {#if chartMode === 'trajectory'}
          <p class="forecast-hero-range text-secondary">
            {t('forecast.rangeNote', {
              years: String(years),
              conservative: pct(a.conservativeReturn),
              baseline: pct(a.baselineReturn),
              aggressive: pct(a.aggressiveReturn),
              low: money(lowVal, privacy),
              high: money(highVal, privacy),
            })}
          </p>
        {:else}
          <p class="forecast-hero-range text-secondary">
            {t('forecast.endSplit', {
              years: String(years),
              accessible,
              locked,
              amount: money(accessibleEnd, privacy),
              pct: pct(accessiblePct),
              lockedAmount: money(lockedEnd, privacy),
            })}
          </p>
        {/if}
      </div>

      {#if chartMode === 'trajectory'}
        <ForecastChart
          baseline={projection.baseline}
          low={projection.conservative}
          high={projection.aggressive}
          read={read}
          displayMode={a.displayMode}
          inflation={a.inflation}
          horizonMonths={horizonMonths}
          height={chartHeight}
          {privacy}
        />
      {:else}
        <ForecastSplitChart
          baseline={projection.baseline}
          displayMode={a.displayMode}
          inflation={a.inflation}
          horizonMonths={horizonMonths}
          height={chartHeight}
          {privacy}
        />
      {/if}

      {#if chartMode === 'trajectory' && metric !== 'locked'}
        <p class="forecast-composition-strip text-secondary">
          {t('forecast.endComposition', {
            years: String(years),
            accessible,
            locked,
            amount: money(accessibleEnd, privacy),
            pct: pct(accessiblePct),
            lockedAmount: money(lockedEnd, privacy),
          })}
        </p>
      {/if}

      {#if reaching.length > 0}
        <div class="forecast-milestones">
          <span class="text-secondary">
            {t('forecast.goalsInWindow', { metric: metricLabels[metric] })}
          </span>
          <ul class="forecast-milestone-list">
            {#each reaching as r (r.goal.id)}
              <li>
                <div class="forecast-milestone-main">
                  <span class="forecast-milestone-name">{r.goal.name}</span>
                  <span class="forecast-milestone-meta">
                    {t('forecast.goalTarget', { amount: money(r.goal.target, privacy) })}
                  </span>
                </div>
                <span class="forecast-milestone-when text-muted">
                  {t('forecast.goalEta', {
                    when: monthOffsetToCalendarLabel(/** @type {number} */ (r.month)),
                  })}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {:else if data.goals.some((g) => g.metric !== metric)}
        <p class="muted-note">
          {t('forecast.noGoalsInWindow', { years: String(years) })}
          {#if onGoTab}
            <button type="button" class="text-btn" onclick={() => onGoTab('home', 'overview')}>
              {t('forecast.viewAllGoals')}
            </button>
          {/if}
        </p>
      {/if}

      <p class="muted-note forecast-disclaimer">{t('forecast.disclaimer')}</p>
    </div>
  </div>
{/if}
