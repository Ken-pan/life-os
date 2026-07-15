<script>
  // Port of src/components/SpendingTrendChart.tsx (SVG chart; avoids React-only recharts).
  import { money, moneyCompact } from '$lib/format.js'

  /** @type {{
   *   series: import('../../engine/transactions.js').MonthPoint[],
   *   privacy: boolean,
   *   daily?: boolean,
   * }} */
  let { series, privacy, daily = false } = $props()

  const data = $derived(
    series.map((p) => ({
      month: p.month,
      spending: Math.round(p.spending),
      income: Math.round(p.income),
    })),
  )

  // Scale to what is actually drawn. Including income in the daily view would
  // let one payday set the ceiling for 31 days of spending and flatten every bar
  // to a sliver.
  // Measure the container and draw at 1:1 instead of scaling a fixed viewBox.
  // `viewBox="0 0 640 200" width="100%" height="200"` scales by
  // min(containerW/640, 1) under the default preserveAspectRatio, which is wrong
  // in both directions: on a 980px card it stays 640px wide and letterboxes ~170px
  // of dead space each side, and on a 350px phone it shrinks the whole drawing to
  // 0.55x — taking the 10px axis labels down to an unreadable 5.5px.
  let wrapW = $state(0)
  const chartW = $derived(Math.max(280, Math.round(wrapW) || 640))
  const compact = $derived(chartW < 520)

  const maxY = $derived(
    Math.max(
      1,
      ...data.map((d) => (daily ? d.spending : Math.max(d.spending, d.income))),
    ),
  )
  // A day can be net-negative when refunds outweigh purchases. Clamping the
  // baseline to 0 drew those as nothing — identical to a day with no activity —
  // so a month that nets negative still looked like steady spending.
  //
  // But letting one refund set the floor is just as unreadable in the other
  // direction: a real month here runs $10–$558/day next to a single -$6,645
  // reversal, which squashes every ordinary day into a hairline. Floor the axis
  // at one chart-height below zero and clip the outlier, marking it so the
  // clipping is visible rather than silent.
  const rawMin = $derived(daily ? Math.min(0, ...data.map((d) => d.spending)) : 0)
  const minY = $derived(rawMin < -maxY ? -maxY : rawMin)
  const span = $derived(maxY - minY || 1)
  /** @param {number} v */
  const isClipped = (v) => v < minY
  const chartH = $derived(compact ? 160 : 200)
  // The y-axis gutter is sized for its widest label ("-$7k" vs "$1,234"); on a
  // phone a fixed 56px gutter is a sixth of the whole chart.
  const padL = $derived(compact ? 40 : 56)
  const padR = 12
  const padT = 8
  const padB = 24
  const innerW = $derived(chartW - padL - padR)
  const innerH = $derived(chartH - padT - padB)
  // Floor at 2px: a month of days on a narrow phone would otherwise compute a
  // sub-pixel width and render nothing at all.
  const barW = $derived(
    data.length > 0 ? Math.max(2, Math.min(48, innerW / data.length - 4)) : 24,
  )

  /** @param {number} v */
  function yScale(v) {
    const clamped = Math.max(minY, Math.min(maxY, v))
    return padT + innerH - ((clamped - minY) / span) * innerH
  }

  /** @param {number} i */
  function xCenter(i) {
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW / 2
    return padL + (data.length > 1 ? i * step : innerW / 2)
  }

  const linePoints = $derived(
    data.map((d, i) => `${xCenter(i)},${yScale(d.income)}`).join(' '),
  )

  // A month of days is ~31 ticks — every label would collide. Show the day
  // number only, and only every Nth, keeping the last so the axis ends on the
  // as-of date. Budget ~34px per label off the MEASURED width rather than a
  // fixed count, so a phone drops to ~4 labels while a wide card keeps ~10.
  const maxLabels = $derived(Math.max(3, Math.floor(innerW / 34)))
  const labelEvery = $derived(
    daily ? Math.max(1, Math.ceil(data.length / maxLabels)) : 1,
  )
  // "26-07" needs ~40px; a bare day number ~14px. Thin monthly labels too —
  // "全部" spans 50+ months and used to draw every one on top of the next.
  const monthLabelEvery = $derived(
    Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 46)))),
  )
  /**
   * Always label the last point — it carries the as-of date — but only if the
   * previous label is far enough away, otherwise the two collide (the "全部"
   * view stacked 26-04 and 26-07 on top of each other).
   * @param {number} i @param {number} every
   */
  function labelAt(i, every) {
    if (i === data.length - 1) return true
    // Skip a scheduled label that sits within one step of the last one.
    return i % every === 0 && data.length - 1 - i >= every
  }
  /** @param {import('../../engine/transactions.js').MonthPoint} d @param {number} i */
  function xLabel(d, i) {
    const every = daily ? labelEvery : monthLabelEvery
    if (!labelAt(i, every)) return ''
    return daily ? String(Number(d.month.slice(8, 10))) : d.month.slice(2)
  }
</script>

<div class="spending-chart-wrap" bind:clientWidth={wrapW}>
  <!-- viewBox tracks the measured width, so 1 unit = 1px: no letterboxing on a
       wide card, and font-size stays honest on a phone instead of being scaled
       down with the drawing. -->
  <svg
    viewBox="0 0 {chartW} {chartH}"
    width={chartW}
    height={chartH}
    role="img"
    aria-hidden="true"
  >
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
        {privacy ? '•' : moneyCompact(minY + span * tick)}
      </text>
    {/each}

    {#if minY < 0}
      <line
        x1={padL}
        y1={yScale(0)}
        x2={chartW - padR}
        y2={yScale(0)}
        stroke="var(--border-strong)"
      />
    {/if}

    {#each data as d, i (d.month)}
      {@const cx = xCenter(i)}
      {@const zeroY = yScale(0)}
      {@const barY = Math.min(yScale(d.spending), zeroY)}
      {@const barH = Math.abs(yScale(d.spending) - zeroY)}
      <rect
        x={cx - barW / 2}
        y={barY}
        width={barW}
        height={barH}
        rx="3"
        fill={d.spending < 0 ? 'var(--positive)' : 'var(--accent-dim)'}
      />
      <!-- Clipped outlier: hatch the cut end so a truncated bar can never be
           mistaken for one that simply reaches the axis floor. -->
      {#if isClipped(d.spending)}
        {#each [0, 3, 6] as off (off)}
          <line
            x1={cx - barW / 2}
            y1={padT + innerH - off}
            x2={cx + barW / 2}
            y2={padT + innerH - off}
            stroke="var(--bg)"
            stroke-width="1.5"
          />
        {/each}
        <text
          x={cx}
          y={padT + innerH - 12}
          text-anchor="middle"
          fill="var(--bg)"
          font-size="9"
        >
          {privacy ? '•' : moneyCompact(d.spending)}
        </text>
      {/if}
      <text x={cx} y={chartH - 6} text-anchor="middle" fill="var(--border-strong)" font-size="10">
        {xLabel(d, i)}
      </text>
    {/each}

    <!-- No income line in the daily view: income lands on a couple of paydays,
         so per-day it is a flat run of zeros with two spikes — that reads as
         "no income" and drags the y-axis. Monthly is where income vs spending
         is a fair comparison. -->
    {#if !daily}
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
    {/if}
  </svg>
</div>
