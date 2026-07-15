<script>
  // Port of src/components/SpendingTrendChart.tsx (SVG chart; avoids React-only recharts).
  import { money, moneyCompact, signedMoney } from '$lib/format.js'
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import MerchantLogo from './MerchantLogo.svelte'

  /** @type {{
   *   series: import('../../engine/transactions.js').MonthPoint[],
   *   privacy: boolean,
   *   daily?: boolean,
   *   budgetPerDay?: number,
   *   onSelectPoint?: (bucket: string) => void,
   * }} */
  let { series, privacy, daily = false, budgetPerDay = 0, onSelectPoint } = $props()

  const showBudget = $derived(daily && budgetPerDay > 0)

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
  // Bars are spending, which is never negative — dailySeries reports outflow, not
  // net-of-refunds. (An earlier pass drew refund days as downward bars; that put
  // a misclassified $6,645 deposit on the chart and squashed every real day to a
  // hairline. Refunds and income are not spending; they do not belong here.)
  // The budget line participates in the scale (with headroom for its label) —
  // on a frugal month every bar sits below budget and the line would otherwise
  // be clipped off the top of the plot.
  const span = $derived(Math.max(maxY, showBudget ? budgetPerDay * 1.15 : 0) || 1)
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
    return padT + innerH - (Math.max(0, v) / span) * innerH
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
    if (!daily) return d.month.slice(2)
    // 跨月的日窗口（近 30 天）只标裸日号会造成「14 …… 2 …… 13」的歧义：
    // 第一个刻度和每月第一个被标出的刻度带上月份。
    const day = Number(d.month.slice(8, 10))
    const firstOfItsMonth =
      i === 0 ||
      !data
        .slice(0, i)
        .some((p, j) => p.month.slice(5, 7) === d.month.slice(5, 7) && labelAt(j, every))
    return firstOfItsMonth ? `${Number(d.month.slice(5, 7))}/${day}` : String(day)
  }

  /** @type {number | null} */
  let activeIndex = $state(null)
  // Read from `series`, not the rounded `data` the bars use — the tooltip should
  // show the real amount, and `data` also drops count/merchants.
  const active = $derived(activeIndex == null ? null : (series[activeIndex] ?? null))

  // A few named merchants, then a rolled-up rest. A day with 7 transactions is
  // not usefully described by its single biggest one, but a full list would
  // outgrow the plot — especially the 160px compact one.
  const tipMerchantLimit = $derived(compact ? 2 : 3)
  const tipRows = $derived((active?.merchants ?? []).slice(0, tipMerchantLimit))
  const tipRestRows = $derived((active?.merchants ?? []).slice(tipMerchantLimit))
  const tipRest = $derived(tipRestRows.length)
  const tipRestAmount = $derived(tipRestRows.reduce((a, m) => a + m.amount, 0))

  // The hit area is deliberately wider than the bar and spans the full plot
  // height: a 30-day sweep gives ~5px bars on a phone, and the skill's floor is
  // a 24px target. Slices tile the plot, so the pointer only has to be nearest —
  // never dead-centre on a hairline.
  const sliceW = $derived(data.length > 0 ? innerW / data.length : innerW)
  /** @param {number} i */
  function sliceX(i) {
    return padL + (innerW / data.length) * i
  }

  /** @param {import('../../engine/transactions.js').MonthPoint} d */
  function pointLabel(d) {
    if (!daily) return d.month
    const [, m, day] = d.month.split('-')
    return `${Number(m)}月${Number(day)}日`
  }

  /** 星期几帮人认出模式（「超支的都是周末」）；跟随界面语言。 @param {string} day */
  function weekdayOf(day) {
    return new Date(`${day}T12:00:00`).toLocaleDateString(intlLocaleTag(), { weekday: 'short' })
  }

  /** 超预算是状态不是分类，用 --warning 表达（本 app 的图表配色规则）。
   * @param {{ spending: number }} d @param {number} i */
  function barFill(d, i) {
    const over = showBudget && d.spending > budgetPerDay
    if (activeIndex === i) return over ? 'var(--warning)' : 'var(--accent)'
    return over ? 'color-mix(in srgb, var(--warning) 62%, var(--bg-elevated))' : 'var(--accent-dim)'
  }

  const activeBudgetDelta = $derived(
    active && showBudget ? active.spending - budgetPerDay : 0,
  )

  // Same content on focus as on hover, and Escape dismisses — a tooltip reachable
  // only by pointer hides the data from keyboard users entirely.
  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') activeIndex = null
  }

  // Keep the tooltip inside the plot instead of letting it run off the edge on
  // the first/last day. Daily needs the extra width for logo + merchant + amount
  // rows; the floor is 4px (not padL) because on a narrow phone the tooltip is
  // wider than the plot and pinning it to the gutter is the lesser evil.
  const TIP_W = $derived(daily ? 232 : 176)
  const tipX = $derived(
    activeIndex == null
      ? 0
      : Math.max(4, Math.min(xCenter(activeIndex) - TIP_W / 2, chartW - padR - TIP_W)),
  )
</script>

<div class="spending-chart-wrap" bind:clientWidth={wrapW}>
  <!-- viewBox tracks the measured width, so 1 unit = 1px: no letterboxing on a
       wide card, and font-size stays honest on a phone instead of being scaled
       down with the drawing. -->
  <!-- Not aria-hidden: the bars below are focusable, and a hidden subtree cannot
       be reached by keyboard at all. -->
  <svg
    viewBox="0 0 {chartW} {chartH}"
    width={chartW}
    height={chartH}
    role="group"
    aria-label={t('history.chartAria')}
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
        {privacy ? '•' : moneyCompact(span * tick)}
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
        fill={barFill(d, i)}
      />
      <text x={cx} y={chartH - 6} text-anchor="middle" fill="var(--border-strong)" font-size="10">
        {xLabel(d, i)}
      </text>
    {/each}

    <!-- The budget line is a threshold, not a series: dashed, warning-colored,
         labeled in place so it needs no legend. Drawn before the hit layer so
         slices stay on top. -->
    {#if showBudget}
      {@const by = yScale(budgetPerDay)}
      <line
        x1={padL}
        y1={by}
        x2={chartW - padR}
        y2={by}
        stroke="var(--warning)"
        stroke-dasharray="6 4"
      />
      <text
        x={chartW - padR}
        y={by - 5}
        text-anchor="end"
        font-size="10"
        fill="var(--warning)"
      >
        {t('history.budgetLineLabel', { amount: money(budgetPerDay, privacy) })}
      </text>
    {/if}

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

    <!-- Hit layer last so it sits above the marks. Each slice is a focusable,
         labelled target — the label is what a screen reader reads, so it must
         carry the same facts the tooltip shows. -->
    <!-- The hit target is a real <button> inside <foreignObject>, not an SVG
         <rect tabindex="0">. A focusable rect takes focus in Chrome but fires no
         focus/focusin event at all — not even on document — so the keyboard path
         silently showed nothing. An HTML button behaves. -->
    {#each data as d, i (d.month)}
      <foreignObject x={sliceX(i)} y={padT} width={sliceW} height={innerH}>
        <button
          type="button"
          class="chart-hit"
          aria-label={t('history.pointAria', {
            date: pointLabel(d),
            amount: money(series[i]?.spending ?? 0, privacy),
            // From `series`, not the rounded `data` the bars use — `data` only
            // carries month/spending/income, so `d.count` is always undefined
            // and every bar announced "0 transactions" to a screen reader.
            count: series[i]?.count ?? 0,
          })}
          onclick={() => onSelectPoint?.(d.month)}
          onpointerenter={() => (activeIndex = i)}
          onpointerleave={() => (activeIndex = null)}
          onfocus={() => (activeIndex = i)}
          onblur={() => {
            // Only clear if we are still the active point. Tabbing fires the new
            // button's focus BEFORE the old one's blur, so an unconditional
            // clear wiped the incoming selection and the tooltip stuck on the
            // day you just left.
            if (activeIndex === i) activeIndex = null
          }}
          onkeydown={onKeydown}
        ></button>
      </foreignObject>
    {/each}

    {#if active}
      <line
        class="chart-tip"
        x1={xCenter(activeIndex)}
        y1={padT}
        x2={xCenter(activeIndex)}
        y2={padT + innerH}
        stroke="var(--border-strong)"
        stroke-dasharray="3 3"
      />
    {/if}
  </svg>

  <!-- The tooltip is HTML over the SVG, not SVG <text>: merchant logos are <img>
       and text that wraps/ellipsizes — neither exists inside SVG without
       reimplementing layout by hand in x/y coordinates. Background stays
       var(--tooltip-bg): opaque on purpose, a translucent card over a dark bar
       is unreadable (and --surface does not exist in this app at all). -->
  {#if active}
    <div
      class="chart-tip chart-tooltip"
      role="tooltip"
      aria-live="polite"
      style="left: {tipX}px; top: {padT + 4}px; width: {TIP_W}px"
    >
      <!-- Value leads, label follows: the reader has the date and wants the number. -->
      <div class="chart-tooltip-amount records-metric">{money(active.spending, privacy)}</div>
      <div class="chart-tooltip-sub">
        {pointLabel(active)}{daily ? ` ${weekdayOf(active.month)}` : ''} ·
        {t('history.pointCount', { count: active.count ?? 0 })}
      </div>
      {#if showBudget && active.count > 0}
        <!-- 「这天花得多不多」需要一把尺子；日预算就是那把尺子。 -->
        <div class="chart-tooltip-budget" class:over={activeBudgetDelta > 0}>
          {activeBudgetDelta > 0
            ? t('history.tipOverBudget', { amount: money(activeBudgetDelta, privacy) })
            : t('history.tipUnderBudget', { amount: money(-activeBudgetDelta, privacy) })}
        </div>
      {/if}
      {#if daily && tipRows.length > 0}
        <!-- Merchant left, amount right-aligned: the amounts form a column the
             eye can compare, instead of ragged text. -->
        <ul class="chart-tooltip-merchants">
          {#each tipRows as m (m.merchant)}
            <li>
              <MerchantLogo merchant={m.merchant} size={16} />
              <span class="chart-tooltip-merchant-name">{m.merchant}</span>
              <span class="chart-tooltip-merchant-amount">
                {money(m.amount, privacy)}
              </span>
            </li>
          {/each}
        </ul>
        {#if tipRest > 0}
          <div class="chart-tooltip-more">
            {t('history.pointMoreMerchants', {
              count: tipRest,
              amount: money(tipRestAmount, privacy),
            })}
          </div>
        {/if}
      {:else if !daily}
        <!-- The big number is the bar (spending); these rows add the line
             (income) and the net, swatch-coded to the marks so the tooltip
             doesn't need a legend. -->
        <div class="chart-tooltip-series">
          <span class="chart-tooltip-dot" style="background: var(--positive)"></span>
          <span class="chart-tooltip-series-label">{t('history.tipIncome')}</span>
          <span class="chart-tooltip-merchant-amount">
            {money(active.income, privacy)}
          </span>
        </div>
        <div class="chart-tooltip-series">
          <span class="chart-tooltip-dot chart-tooltip-dot-net"></span>
          <span class="chart-tooltip-series-label">{t('history.tipNet')}</span>
          <span
            class="chart-tooltip-merchant-amount"
            class:chart-tooltip-net-neg={active.net < 0}
          >
            {signedMoney(active.net, privacy)}
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>
