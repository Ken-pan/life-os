<script>
  /**
   * Life OS LineChart — 趋势折线/面积图。
   * 设计规范(dataviz):2px 圆头线、面积 10% 洗色、hairline 网格、
   * crosshair 吸附 + 单 tooltip 列出全部系列、端点 8px 圆点带表面环、
   * ≥2 系列必带图例、单系列用品牌 accent、多系列走验证过的固定槽位色。
   * 宽度自适应容器 1:1 绘制(不用 viewBox 缩放,轴字号恒定可读)。
   */
  import {
    linearScale,
    niceTicks,
    linePath,
    monotonePath,
    seriesColor,
    compactNumber,
    xLabelFilter,
    px,
    MAX_SERIES,
  } from './chartUtils.js'
  import ChartLegend from './ChartLegend.svelte'
  import ChartTooltip from './ChartTooltip.svelte'

  /**
   * @type {{
   *   labels: string[],
   *   series: { label: string, values: (number | null)[], color?: string }[],
   *   height?: number,
   *   area?: boolean,
   *   curve?: 'smooth' | 'linear',
   *   baseline?: 'zero' | 'auto',
   *   format?: (v: number) => string,
   *   xFormat?: (label: string, index: number) => string,
   *   endLabels?: boolean | 'auto',
   *   legend?: boolean | 'auto',
   *   ariaLabel?: string,
   * }}
   */
  let {
    labels,
    series,
    height = 200,
    area = false,
    curve = 'smooth',
    baseline = 'zero',
    format = compactNumber,
    xFormat = (l) => l,
    endLabels = 'auto',
    legend = 'auto',
    ariaLabel = '',
  } = $props()

  const uid = $props.id()
  const drawn = $derived(series.slice(0, MAX_SERIES))
  const showLegend = $derived(legend === 'auto' ? drawn.length >= 2 : legend)
  const showEndLabels = $derived(
    endLabels === 'auto' ? drawn.length <= 2 : endLabels,
  )

  let wrapW = $state(0)
  const chartW = $derived(Math.max(240, Math.round(wrapW) || 560))

  // 值域:zero 基线适合金额/计数;auto 适合心率/体重这类窄幅指标
  const flat = $derived(
    drawn.flatMap((s) => s.values.filter((v) => v != null)),
  )
  const rawMin = $derived(flat.length ? Math.min(...flat) : 0)
  const rawMax = $derived(flat.length ? Math.max(...flat) : 1)
  const domainMin = $derived(baseline === 'zero' ? Math.min(0, rawMin) : rawMin)
  const yInfo = $derived(niceTicks(domainMin, rawMax, 4))

  const tickTexts = $derived(yInfo.ticks.map((t) => format(t)))
  const padL = $derived(
    Math.max(...tickTexts.map((t) => t.length), 2) * 6.5 + 12,
  )
  const endTexts = $derived(
    showEndLabels
      ? drawn.map((s) => {
          const last = [...s.values].reverse().find((v) => v != null)
          return last == null ? '' : format(last)
        })
      : [],
  )
  const padR = $derived(
    showEndLabels
      ? Math.max(...endTexts.map((t) => t.length), 0) * 6.5 + 16
      : 12,
  )
  const padT = 10
  const padB = 24
  const innerW = $derived(Math.max(40, chartW - padL - padR))
  const innerH = $derived(height - padT - padB)

  const yScale = $derived(
    linearScale(yInfo.niceMin, yInfo.niceMax, padT + innerH, padT),
  )
  const xAt = $derived((i) =>
    labels.length > 1
      ? padL + (i / (labels.length - 1)) * innerW
      : padL + innerW / 2,
  )

  /** 每系列拆成连续非 null 段,null 即断线 */
  const segments = $derived(
    drawn.map((s) => {
      const segs = []
      let cur = []
      s.values.forEach((v, i) => {
        if (v == null) {
          if (cur.length) segs.push(cur)
          cur = []
        } else {
          cur.push({ x: xAt(i), y: yScale(v) })
        }
      })
      if (cur.length) segs.push(cur)
      return segs
    }),
  )

  const pathOf = $derived((pts) =>
    curve === 'smooth' ? monotonePath(pts) : linePath(pts),
  )
  const baseY = $derived(yScale(Math.max(yInfo.niceMin, 0)))

  const lastPoint = $derived(
    drawn.map((s) => {
      for (let i = s.values.length - 1; i >= 0; i--) {
        if (s.values[i] != null) return { x: xAt(i), y: yScale(s.values[i]) }
      }
      return null
    }),
  )

  const showXAt = $derived(xLabelFilter(labels.length, innerW))

  // ── 交互:crosshair 吸附最近 X,tooltip 列出全部系列 ──
  let hoverIndex = $state(/** @type {number | null} */ (null))
  let pointerY = $state(0)
  let legendHover = $state(/** @type {number | null} */ (null))

  function indexFromClientX(clientX, target) {
    const rect = target.getBoundingClientRect()
    const x = clientX - rect.left
    if (labels.length <= 1) return 0
    const step = innerW / (labels.length - 1)
    return Math.max(
      0,
      Math.min(labels.length - 1, Math.round((x - padL) / step)),
    )
  }

  function onPointerMove(e) {
    hoverIndex = indexFromClientX(e.clientX, e.currentTarget)
    const rect = e.currentTarget.getBoundingClientRect()
    pointerY = e.clientY - rect.top
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      hoverIndex = Math.max(
        0,
        Math.min(labels.length - 1, (hoverIndex ?? 0) + dir),
      )
      pointerY = padT + innerH / 2
    } else if (e.key === 'Escape') {
      hoverIndex = null
    }
  }

  const tooltipRows = $derived(
    hoverIndex == null
      ? []
      : drawn
          .map((s, i) => ({
            label: s.label,
            value: s.values[hoverIndex] == null ? '—' : format(s.values[hoverIndex]),
            color: seriesColor(i, drawn.length, s.color),
            muted: legendHover != null && legendHover !== i,
          }))
          .filter((r) => r.value !== '—' || drawn.length > 1),
  )

  const computedAria = $derived(
    ariaLabel ||
      `折线图:${drawn.map((s) => s.label).join('、')},${labels.length} 个数据点`,
  )
</script>

<div class="line-chart">
  {#if showLegend}
    <ChartLegend
      shape="line"
      items={drawn.map((s, i) => ({
        label: s.label,
        color: seriesColor(i, drawn.length, s.color),
        muted: legendHover != null && legendHover !== i,
      }))}
      onHover={(i) => (legendHover = i)}
    />
  {/if}

  <div class="line-chart__plot" bind:clientWidth={wrapW}>
    <svg
      width={chartW}
      height={height}
      role="img"
      aria-label={computedAria}
      tabindex="0"
      onpointermove={onPointerMove}
      onpointerleave={() => (hoverIndex = null)}
      onkeydown={onKeyDown}
      onblur={() => (hoverIndex = null)}
    >
      <!-- 网格与 Y 轴刻度:hairline、退居幕后 -->
      {#each yInfo.ticks as tick (tick)}
        <line
          class="line-chart__grid"
          x1={padL}
          x2={padL + innerW}
          y1={px(yScale(tick))}
          y2={px(yScale(tick))}
        />
        <text class="line-chart__tick" x={padL - 8} y={px(yScale(tick)) + 3.5} text-anchor="end">
          {format(tick)}
        </text>
      {/each}

      <!-- X 轴标签:按宽度预算抽稀,保尾 -->
      {#each labels as label, i (i)}
        {#if showXAt(i)}
          <text
            class="line-chart__tick"
            x={px(xAt(i))}
            y={height - 6}
            text-anchor={i === labels.length - 1 ? 'end' : 'middle'}
          >
            {xFormat(label, i)}
          </text>
        {/if}
      {/each}

      <!-- 面积渐隐(顶部 22% → 基线 0)+ 折线 2px -->
      {#if area}
        <defs>
          {#each drawn as s, si (s.label + si)}
            <linearGradient id={`lc-area-${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={seriesColor(si, drawn.length, s.color)} stop-opacity="0.22" />
              <stop offset="100%" stop-color={seriesColor(si, drawn.length, s.color)} stop-opacity="0" />
            </linearGradient>
          {/each}
        </defs>
      {/if}
      {#each drawn as s, si (s.label + si)}
        {@const color = seriesColor(si, drawn.length, s.color)}
        {@const dim = legendHover != null && legendHover !== si}
        <g class="line-chart__series" class:line-chart__series--dim={dim}>
          {#if area}
            {#each segments[si] as pts, pi (pi)}
              {#if pts.length > 1}
                <path
                  d={`${pathOf(pts)}L${px(pts[pts.length - 1].x)},${px(baseY)}L${px(pts[0].x)},${px(baseY)}Z`}
                  fill={`url(#lc-area-${uid}-${si})`}
                />
              {/if}
            {/each}
          {/if}
          {#each segments[si] as pts, pi (pi)}
            {#if pts.length > 1}
              <path class="line-chart__line" d={pathOf(pts)} stroke={color} />
            {:else if pts.length === 1}
              <circle cx={px(pts[0].x)} cy={px(pts[0].y)} r="3" fill={color} />
            {/if}
          {/each}
        </g>
      {/each}

      <!-- crosshair + 各系列吸附点 -->
      {#if hoverIndex != null}
        <line
          class="line-chart__crosshair"
          x1={px(xAt(hoverIndex))}
          x2={px(xAt(hoverIndex))}
          y1={padT}
          y2={padT + innerH}
        />
        {#each drawn as s, si (s.label + si)}
          {#if s.values[hoverIndex] != null}
            {@const hc = seriesColor(si, drawn.length, s.color)}
            <circle
              class="line-chart__dot line-chart__dot--active"
              cx={px(xAt(hoverIndex))}
              cy={px(yScale(s.values[hoverIndex]))}
              r="4.5"
              fill={hc}
              style={`filter: drop-shadow(0 0 4px color-mix(in srgb, ${hc} 65%, transparent))`}
            />
          {/if}
        {/each}
      {/if}

      <!-- 端点圆点(表面环)+ 选择性直接标注:只标端点 -->
      {#each drawn as s, si (s.label + si)}
        {@const lp = lastPoint[si]}
        {#if lp}
          <circle
            class="line-chart__dot"
            cx={px(lp.x)}
            cy={px(lp.y)}
            r="4"
            fill={seriesColor(si, drawn.length, s.color)}
          />
          {#if showEndLabels && endTexts[si]}
            <text
              class="line-chart__end-label"
              x={px(lp.x) + 9}
              y={px(lp.y) + 3.5}
            >
              {endTexts[si]}
            </text>
          {/if}
        {/if}
      {/each}
    </svg>

    <ChartTooltip
      visible={hoverIndex != null}
      x={hoverIndex == null ? 0 : xAt(hoverIndex)}
      y={pointerY}
      boundsW={chartW}
      title={hoverIndex == null ? '' : xFormat(labels[hoverIndex], hoverIndex)}
      rows={tooltipRows}
    />
  </div>
</div>

<style>
  .line-chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .line-chart__plot {
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
  .line-chart__grid {
    stroke: var(--chart-grid, rgba(0, 0, 0, 0.08));
    stroke-width: 1;
  }
  .line-chart__tick {
    fill: var(--chart-axis, var(--text-muted, #898781));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .line-chart__line {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .line-chart__series {
    transition: opacity var(--dur-fast) var(--ease-standard, ease);
  }
  .line-chart__series--dim {
    opacity: 0.25;
  }
  .line-chart__crosshair {
    stroke: var(--chart-axis, var(--text-muted, #898781));
    stroke-width: 1;
    opacity: 0.5;
  }
  .line-chart__dot {
    stroke: var(--chart-surface, var(--card, #fff));
    stroke-width: 2;
  }
  .line-chart__dot--active {
    animation: line-chart-dot-in 140ms ease-out;
    transform-origin: center;
    transform-box: fill-box;
  }
  @keyframes line-chart-dot-in {
    from {
      transform: scale(0.5);
      opacity: 0.6;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .line-chart__dot--active {
      animation: none;
    }
  }
  .line-chart__end-label {
    fill: var(--t2, var(--text-secondary, #52514e));
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
