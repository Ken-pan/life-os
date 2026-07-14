<script>
  // Port of src/components/ForecastChart.tsx — LayerChart v2 composable chart.
  import { Area, Axis, Chart, Layer, Spline } from 'layerchart'
  import { moneyCompact } from '$lib/format.js'
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import {
    buildForecastChartData,
    buildXTicks,
    buildYDomain,
    formatXAxisLabel,
  } from './forecastChartData.js'

  /** @type {{
   *   baseline: import('../../engine/monthly.js').MonthSnapshot[],
   *   low: import('../../engine/monthly.js').MonthSnapshot[],
   *   high: import('../../engine/monthly.js').MonthSnapshot[],
   *   sim?: import('../../engine/monthly.js').MonthSnapshot[],
   *   read: import('../../engine/metrics.js').GoalMetricValue,
   *   displayMode: import('../../types.js').DisplayMode,
   *   inflation: number,
   *   horizonMonths: number,
   *   privacy: boolean,
   *   height?: number,
   *   goals?: import('../../types.js').Goal[],
   * }} */
  let {
    baseline,
    low,
    high,
    sim,
    read,
    displayMode,
    inflation,
    horizonMonths,
    privacy,
    height = 340,
  } = $props()

  const months = $derived(Math.min(horizonMonths, baseline.length - 1))
  const step = $derived(months > 120 ? 3 : 1)
  const data = $derived(
    buildForecastChartData({
      baseline,
      low,
      high,
      sim,
      read,
      displayMode,
      inflation,
      months,
      step,
    }),
  )
  const ticks = $derived(buildXTicks(months, step))
  const yDomain = $derived(buildYDomain(data))
  const intlLoc = $derived(intlLocaleTag())
  const hasSim = $derived(!!sim)
</script>

<div class="forecast-chart-wrap">
  <Chart
    {data}
    x="m"
    y="baseline"
    {yDomain}
    padding={{ top: 10, right: 12, bottom: 24, left: 56 }}
    {height}
  >
    <Layer>
      <Axis
        placement="left"
        grid={{ stroke: 'var(--chart-grid)' }}
        rule
        format={(v) => (privacy ? '•' : moneyCompact(Number(v)))}
        stroke="var(--border-strong)"
      />
      <Axis
        placement="bottom"
        rule
        {ticks}
        format={(m) => formatXAxisLabel(Number(m), months, intlLoc, t)}
        stroke="var(--border-strong)"
      />
      <Area
        y0="low"
        y1="high"
        motion="none"
        style="fill: var(--band)"
      />
      <Spline
        y="baseline"
        motion="none"
        style="stroke: var(--baseline-line); stroke-width: 2.5; fill: none"
      />
      {#if hasSim}
        <Spline
          y="sim"
          motion="none"
          style="stroke: var(--sim-line); stroke-width: 2.5; stroke-dasharray: 6 5; fill: none"
        />
      {/if}
    </Layer>
  </Chart>
</div>
