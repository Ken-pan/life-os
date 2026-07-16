<script>
  /**
   * Life OS BarChart — 柱状/条形图(分组、堆叠、横向排名)。
   * 设计规范(dataviz):柱厚 ≤24px、数据端 4px 圆角基线端直角、
   * 堆叠段之间 2px 表面间隙(靠留白分隔,不描边)、悬浮整列读数、
   * 单系列直接标注值,多系列图例 + tooltip 兜底。
   */
  import {
    linearScale,
    niceTicks,
    barPath,
    seriesColor,
    compactNumber,
    xLabelFilter,
    stackLayout,
    px,
    MAX_SERIES,
  } from './chartUtils.js'
  import ChartLegend from './ChartLegend.svelte'
  import ChartTooltip from './ChartTooltip.svelte'

  /**
   * @type {{
   *   labels: string[],
   *   series: { label: string, values: (number | null)[], color?: string }[],
   *   stacked?: boolean,
   *   horizontal?: boolean,
   *   height?: number,
   *   format?: (v: number) => string,
   *   xFormat?: (label: string, index: number) => string,
   *   showValues?: 'auto' | 'always' | 'never',
   *   legend?: boolean | 'auto',
   *   ariaLabel?: string,
   * }}
   */
  let {
    labels,
    series,
    stacked = false,
    horizontal = false,
    height = 200,
    format = compactNumber,
    xFormat = (l) => l,
    showValues = 'auto',
    legend = 'auto',
    ariaLabel = '',
  } = $props()

  const drawn = $derived(series.slice(0, MAX_SERIES))
  const showLegend = $derived(legend === 'auto' ? drawn.length >= 2 : legend)

  let wrapW = $state(0)
  const chartW = $derived(Math.max(240, Math.round(wrapW) || 560))

  const GAP = 2 // 表面间隙:堆叠段之间/组内柱之间
  const RADIUS = 4
  const MAX_BAR = 24

  const rows = $derived(drawn.map((s) => s.values.map((v) => v ?? 0)))
  const stacks = $derived(stacked ? stackLayout(rows) : null)

  const maxVal = $derived(
    stacked
      ? Math.max(1, ...labels.map((_, j) => stacks[drawn.length - 1]?.[j]?.y1 ?? 0))
      : Math.max(1, ...rows.flat()),
  )
  const minVal = $derived(stacked ? 0 : Math.min(0, ...rows.flat()))

  const valueTexts = $derived(rows.map((r) => r.map((v) => format(v))))
  const directValues = $derived(
    showValues === 'never'
      ? false
      : showValues === 'always' ||
          (!horizontal && drawn.length === 1 && labels.length <= 12) ||
          (horizontal && drawn.length === 1),
  )

  /* ───────────── 纵向布局 ───────────── */
  const yInfo = $derived(niceTicks(minVal, maxVal, 4))
  const tickTexts = $derived(yInfo.ticks.map((t) => format(t)))
  const padL = $derived(
    horizontal
      ? Math.min(
          Math.max(...labels.map((l) => String(l).length)) * 6.8 + 12,
          chartW * 0.38,
        )
      : Math.max(...tickTexts.map((t) => t.length), 2) * 6.5 + 12,
  )
  const padR = $derived(horizontal ? 44 : 12)
  const padT = $derived(directValues && !horizontal ? 18 : 10)
  const padB = $derived(horizontal ? 6 : 24)
  const innerW = $derived(Math.max(40, chartW - padL - padR))

  /* 横向:高度由行数决定 */
  const ROW_H = 30
  const BAR_H = 16
  const chartH = $derived(
    horizontal ? labels.length * ROW_H + padT + padB : height,
  )
  const innerH = $derived(chartH - padT - padB)

  const yScale = $derived(
    linearScale(yInfo.niceMin, yInfo.niceMax, padT + innerH, padT),
  )
  const xValScale = $derived(linearScale(0, yInfo.niceMax, 0, innerW))
  const zeroY = $derived(yScale(Math.max(yInfo.niceMin, 0)))

  const bandW = $derived(labels.length ? innerW / labels.length : innerW)
  const groupN = $derived(stacked ? 1 : drawn.length)
  const barW = $derived(
    Math.max(
      2,
      Math.min(MAX_BAR, (bandW * 0.72 - (groupN - 1) * GAP) / groupN),
    ),
  )
  const groupW = $derived(groupN * barW + (groupN - 1) * GAP)

  const bandX = $derived((j) => padL + j * bandW + (bandW - groupW) / 2)

  const showXAt = $derived(xLabelFilter(labels.length, innerW, 52))

  /* ───────────── 交互 ───────────── */
  let hoverIndex = $state(/** @type {number | null} */ (null))
  let pointerXY = $state({ x: 0, y: 0 })
  let legendHover = $state(/** @type {number | null} */ (null))

  function onBandPointer(e, j) {
    hoverIndex = j
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    pointerXY = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onKeyDown(e) {
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
      hoverIndex = Math.max(
        0,
        Math.min(labels.length - 1, (hoverIndex ?? 0) + dir),
      )
      pointerXY = horizontal
        ? { x: padL + innerW / 2, y: padT + hoverIndex * ROW_H + ROW_H / 2 }
        : { x: bandX(hoverIndex) + groupW / 2, y: padT + innerH / 2 }
    } else if (e.key === 'Escape') {
      hoverIndex = null
    }
  }

  const tooltipRows = $derived(
    hoverIndex == null
      ? []
      : drawn.map((s, i) => ({
          label: s.label,
          value:
            s.values[hoverIndex] == null ? '—' : format(s.values[hoverIndex]),
          color: seriesColor(i, drawn.length, s.color),
          muted: legendHover != null && legendHover !== i,
        })),
  )

  const computedAria = $derived(
    ariaLabel ||
      `${horizontal ? '条形' : '柱状'}图:${drawn.map((s) => s.label).join('、')},${labels.length} 个类别`,
  )
</script>

<div class="bar-chart">
  {#if showLegend}
    <ChartLegend
      shape="rect"
      items={drawn.map((s, i) => ({
        label: s.label,
        color: seriesColor(i, drawn.length, s.color),
        muted: legendHover != null && legendHover !== i,
      }))}
      onHover={(i) => (legendHover = i)}
    />
  {/if}

  <div class="bar-chart__plot" bind:clientWidth={wrapW}>
    <svg
      width={chartW}
      height={chartH}
      role="img"
      aria-label={computedAria}
      tabindex="0"
      onkeydown={onKeyDown}
      onblur={() => (hoverIndex = null)}
      onpointerleave={() => (hoverIndex = null)}
    >
      {#if horizontal}
        <!-- 横向排名条:标签列 + 从零基线向右生长 -->
        {#each labels as label, j (j)}
          {@const v = rows[0]?.[j] ?? 0}
          {@const w = Math.max(0, xValScale(Math.max(0, v)))}
          {@const y = padT + j * ROW_H + (ROW_H - BAR_H) / 2}
          {@const dim = hoverIndex != null && hoverIndex !== j}
          <g class="bar-chart__row" class:bar-chart__mark--dim={dim}>
            <text
              class="bar-chart__cat"
              x={padL - 8}
              y={y + BAR_H / 2 + 3.5}
              text-anchor="end"
            >
              {xFormat(label, j)}
            </text>
            <path
              class="bar-chart__mark"
              d={barPath(padL, y, Math.max(w, 1), BAR_H, RADIUS, 'right')}
              fill={seriesColor(0, drawn.length, drawn[0]?.color)}
            />
            {#if directValues}
              <text
                class="bar-chart__value"
                x={padL + w + 6}
                y={y + BAR_H / 2 + 3.5}
              >
                {valueTexts[0]?.[j]}
              </text>
            {/if}
            <rect
              class="bar-chart__hit"
              x={0}
              y={padT + j * ROW_H}
              width={chartW}
              height={ROW_H}
              onpointermove={(e) => onBandPointer(e, j)}
            />
          </g>
        {/each}
      {:else}
        <!-- 网格 + Y 刻度 -->
        {#each yInfo.ticks as tick (tick)}
          <line
            class="bar-chart__grid"
            x1={padL}
            x2={padL + innerW}
            y1={px(yScale(tick))}
            y2={px(yScale(tick))}
          />
          <text
            class="bar-chart__tick"
            x={padL - 8}
            y={px(yScale(tick)) + 3.5}
            text-anchor="end"
          >
            {format(tick)}
          </text>
        {/each}

        {#each labels as label, j (j)}
          {@const dim = hoverIndex != null && hoverIndex !== j}
          <g class:bar-chart__mark--dim={dim}>
            {#if stacked}
              {#each drawn as s, si (s.label + si)}
                {@const seg = stacks[si][j]}
                {@const isTop =
                  si ===
                  drawn.findLastIndex((_, k) => stacks[k][j].y1 > stacks[k][j].y0)}
                {@const yTop = yScale(seg.y1)}
                {@const yBot = si === 0 ? zeroY : yScale(seg.y0) - GAP}
                {@const segDim = legendHover != null && legendHover !== si}
                {#if yBot - yTop > 0.5}
                  <path
                    class="bar-chart__mark"
                    class:bar-chart__mark--dim={segDim}
                    d={isTop
                      ? barPath(bandX(j), yTop, barW, yBot - yTop, RADIUS, 'up')
                      : barPath(bandX(j), yTop, barW, yBot - yTop, 0, 'up')}
                    fill={seriesColor(si, drawn.length, s.color)}
                  />
                {/if}
              {/each}
            {:else}
              {#each drawn as s, si (s.label + si)}
                {@const v = rows[si][j]}
                {@const x = bandX(j) + si * (barW + GAP)}
                {@const up = v >= 0}
                {@const y = up ? yScale(v) : zeroY}
                {@const h = Math.abs(yScale(v) - zeroY)}
                {@const segDim = legendHover != null && legendHover !== si}
                <path
                  class="bar-chart__mark"
                  class:bar-chart__mark--dim={segDim}
                  d={barPath(x, y, barW, Math.max(h, 1), RADIUS, up ? 'up' : 'down')}
                  fill={seriesColor(si, drawn.length, s.color)}
                />
              {/each}
              {#if directValues && rows[0][j] >= 0}
                <text
                  class="bar-chart__value"
                  x={px(bandX(j) + groupW / 2)}
                  y={yScale(rows[0][j]) - 6}
                  text-anchor="middle"
                >
                  {valueTexts[0][j]}
                </text>
              {/if}
            {/if}
            <rect
              class="bar-chart__hit"
              x={padL + j * bandW}
              y={0}
              width={bandW}
              height={chartH}
              onpointermove={(e) => onBandPointer(e, j)}
            />
          </g>
        {/each}

        <!-- X 类别标签 -->
        {#each labels as label, j (j)}
          {#if showXAt(j)}
            <text
              class="bar-chart__tick"
              x={px(bandX(j) + groupW / 2)}
              y={chartH - 6}
              text-anchor="middle"
            >
              {xFormat(label, j)}
            </text>
          {/if}
        {/each}
      {/if}
    </svg>

    <ChartTooltip
      visible={hoverIndex != null}
      x={pointerXY.x}
      y={pointerXY.y}
      boundsW={chartW}
      title={hoverIndex == null ? '' : xFormat(labels[hoverIndex], hoverIndex)}
      rows={tooltipRows}
    />
  </div>
</div>

<style>
  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar-chart__plot {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    touch-action: pan-y;
    outline: none;
  }
  svg:focus-visible {
    border-radius: 8px;
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--accent, #2a78d6) 40%, transparent);
  }
  .bar-chart__grid {
    stroke: var(--chart-grid, rgba(0, 0, 0, 0.08));
    stroke-width: 1;
  }
  .bar-chart__tick,
  .bar-chart__cat {
    fill: var(--chart-axis, var(--text-muted, #898781));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .bar-chart__cat {
    font-size: 11px;
  }
  .bar-chart__value {
    fill: var(--t2, var(--text-secondary, #52514e));
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .bar-chart__mark {
    transition: opacity 120ms ease;
  }
  .bar-chart__mark--dim {
    opacity: 0.35;
  }
  .bar-chart__hit {
    fill: transparent;
  }
</style>
