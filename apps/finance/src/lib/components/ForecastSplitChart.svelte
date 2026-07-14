<script>
  // Port of src/components/ForecastSplitChart.tsx — LayerChart v2 stacked area chart.
  import { Area, Axis, Chart, Layer } from 'layerchart'
  import { moneyCompact } from '$lib/format.js'
  import {
    buildForecastSplitChartData,
    buildXTicks,
    formatSplitXAxisLabel,
  } from './forecastChartData.js'

  /** @type {{
   *   baseline: import('../../engine/monthly.js').MonthSnapshot[],
   *   displayMode: import('../../types.js').DisplayMode,
   *   inflation: number,
   *   horizonMonths: number,
   *   privacy: boolean,
   *   height?: number,
   * }} */
  let { baseline, displayMode, inflation, horizonMonths, privacy, height = 340 } = $props()

  const months = $derived(Math.min(horizonMonths, baseline.length - 1))
  const step = $derived(months > 120 ? 3 : 1)
  const data = $derived(
    buildForecastSplitChartData({ baseline, displayMode, inflation, months, step }),
  )
  const ticks = $derived(buildXTicks(months, step))
</script>

<div class="forecast-chart-wrap">
  <Chart
    {data}
    x="m"
    y="stackTop"
    yDomain={[0, null]}
    yNice
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
        format={(m) => formatSplitXAxisLabel(Number(m), months)}
        stroke="var(--border-strong)"
      />
      <Area
        y0={() => 0}
        y1="accessible"
        motion="none"
        style="fill: var(--baseline-line); fill-opacity: 0.28"
        line={{ style: 'stroke: var(--baseline-line); stroke-width: 2; fill: none' }}
      />
      <Area
        y0="accessible"
        y1="stackTop"
        motion="none"
        style="fill: var(--band); fill-opacity: 0.5"
        line={{ style: 'stroke: var(--text-muted, #888); stroke-width: 2; fill: none' }}
      />
    </Layer>
  </Chart>
</div>
