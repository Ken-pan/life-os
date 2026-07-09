<script>
  // Port of src/components/SpendingTrendChart.tsx (SVG chart; avoids React-only recharts).
  import { money, moneyCompact } from '$lib/format.js'

  /** @type {{ series: import('../../engine/transactions.js').MonthPoint[], privacy: boolean }} */
  let { series, privacy } = $props()

  const data = $derived(
    series.map((p) => ({
      month: p.month,
      spending: Math.round(p.spending),
      income: Math.round(p.income),
    })),
  )

  const maxY = $derived(Math.max(1, ...data.map((d) => Math.max(d.spending, d.income))))
  const chartW = 640
  const chartH = 200
  const padL = 56
  const padR = 12
  const padT = 8
  const padB = 24
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB
  const barW = $derived(data.length > 0 ? Math.min(48, innerW / data.length - 4) : 24)

  /** @param {number} v */
  function yScale(v) {
    return padT + innerH - (v / maxY) * innerH
  }

  /** @param {number} i */
  function xCenter(i) {
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW / 2
    return padL + (data.length > 1 ? i * step : innerW / 2)
  }

  const linePoints = $derived(
    data.map((d, i) => `${xCenter(i)},${yScale(d.income)}`).join(' '),
  )
</script>

<div class="spending-chart-wrap">
  <svg viewBox="0 0 {chartW} {chartH}" width="100%" height={chartH} role="img" aria-hidden="true">
    {#each [0, 0.25, 0.5, 0.75, 1] as tick (tick)}
      {@const y = padT + innerH * (1 - tick)}
      <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="var(--border)" />
      <text
        x={padL - 6}
        y={y + 4}
        text-anchor="end"
        fill="var(--border-strong)"
        font-size="10"
      >
        {privacy ? '•' : moneyCompact(maxY * tick)}
      </text>
    {/each}

    {#each data as d, i (d.month)}
      {@const cx = xCenter(i)}
      {@const barH = Math.max(0, innerH - (yScale(d.spending) - padT))}
      <rect
        x={cx - barW / 2}
        y={yScale(d.spending)}
        width={barW}
        height={barH}
        rx="3"
        fill="var(--accent-dim)"
      />
      <text x={cx} y={chartH - 6} text-anchor="middle" fill="var(--border-strong)" font-size="10">
        {d.month.slice(2)}
      </text>
    {/each}

    {#if data.length > 1}
      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--positive)"
        stroke-width="2"
      />
    {:else if data.length === 1}
      <circle cx={xCenter(0)} cy={yScale(data[0].income)} r="3" fill="var(--positive)" />
    {/if}
  </svg>
</div>
