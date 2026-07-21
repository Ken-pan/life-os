<script>
  /**
   * Life OS DonutChart — 构成占比环图。
   * 设计规范(dataviz):段间 2px 表面间隙(padAngle 换算,不描边)、
   * 中心 hero 数值、悬浮段外扩 + tooltip、图例带占比;
   * 超过 8 片折叠为"其他",不生成新色相。
   */
  import { donutArcPath, seriesColor, compactNumber } from './chartUtils.js'
  import ChartTooltip from './ChartTooltip.svelte'

  /**
   * @type {{
   *   items: { label: string, value: number, color?: string }[],
   *   size?: number,
   *   thickness?: number,
   *   centerLabel?: string,
   *   centerValue?: string,
   *   format?: (v: number) => string,
   *   otherLabel?: string,
   *   ariaLabel?: string,
   * }}
   */
  let {
    items,
    size = 168,
    thickness = 22,
    centerLabel = '',
    centerValue = '',
    format = compactNumber,
    otherLabel = '其他',
    ariaLabel = '',
  } = $props()

  const MAX_SLICES = 8
  const slices = $derived.by(() => {
    const positive = items.filter((d) => d.value > 0)
    if (positive.length <= MAX_SLICES) return positive
    const head = positive.slice(0, MAX_SLICES - 1)
    const rest = positive.slice(MAX_SLICES - 1)
    return [
      ...head,
      { label: otherLabel, value: rest.reduce((a, d) => a + d.value, 0) },
    ]
  })

  const total = $derived(slices.reduce((a, d) => a + d.value, 0) || 1)

  const cx = $derived(size / 2)
  const cy = $derived(size / 2)
  const rOuter = $derived(size / 2 - 4) // 留出 hover 外扩空间
  const rInner = $derived(rOuter - thickness)

  // 2px 表面间隙 → 每段两侧各让出 1px 对应的弧度(取外半径处)
  const padAngle = $derived(slices.length > 1 ? 2 / rOuter : 0)

  const arcs = $derived.by(() => {
    let acc = 0
    return slices.map((d, i) => {
      const a0 = (acc / total) * Math.PI * 2
      acc += d.value
      const a1 = (acc / total) * Math.PI * 2
      const pad = Math.min(padAngle, (a1 - a0) / 3)
      return {
        ...d,
        index: i,
        a0: a0 + pad / 2,
        a1: a1 - pad / 2,
        mid: (a0 + a1) / 2,
        pct: d.value / total,
      }
    })
  })

  let hover = $state(/** @type {number | null} */ (null))
  let pointerXY = $state({ x: 0, y: 0 })

  function onSlicePointer(e, i) {
    hover = i
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    pointerXY = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const computedAria = $derived(
    ariaLabel || `环图:${slices.map((d) => d.label).join('、')}`,
  )
</script>

<div class="donut-chart">
  <div class="donut-chart__plot">
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={computedAria}
      onpointerleave={() => (hover = null)}
    >
      {#each arcs as arc (arc.label + arc.index)}
        {@const lifted = hover === arc.index}
        {@const dim = hover != null && !lifted}
        <path
          class="donut-chart__slice"
          class:donut-chart__slice--dim={dim}
          class:donut-chart__slice--lifted={lifted}
          d={donutArcPath(
            cx + (lifted ? 3 * Math.sin(arc.mid) : 0),
            cy - (lifted ? 3 * Math.cos(arc.mid) : 0),
            rOuter,
            rInner,
            arc.a0,
            arc.a1,
          )}
          fill={seriesColor(arc.index, slices.length > 1 ? slices.length : 2, arc.color)}
          onpointermove={(e) => onSlicePointer(e, arc.index)}
        />
      {/each}
    </svg>
    {#if centerValue || centerLabel}
      <div class="donut-chart__center">
        {#if centerValue}
          <span class="donut-chart__center-value">{centerValue}</span>
        {/if}
        {#if centerLabel}
          <span class="donut-chart__center-label">{centerLabel}</span>
        {/if}
      </div>
    {/if}

    <ChartTooltip
      visible={hover != null}
      x={pointerXY.x}
      y={pointerXY.y}
      boundsW={size}
      rows={hover == null
        ? []
        : [
            {
              label: `${arcs[hover].label} · ${Math.round(arcs[hover].pct * 100)}%`,
              value: format(arcs[hover].value),
              color: seriesColor(
                hover,
                slices.length > 1 ? slices.length : 2,
                arcs[hover].color,
              ),
            },
          ]}
    />
  </div>

  <!-- 图例带值与占比:构成图的身份 + 数值主通道 -->
  <div class="donut-chart__legend" role="list">
    {#each arcs as arc (arc.label + arc.index)}
      <div
        class="donut-chart__legend-item"
        class:donut-chart__legend-item--dim={hover != null && hover !== arc.index}
        role="listitem"
        onpointerenter={() => (hover = arc.index)}
        onpointerleave={() => (hover = null)}
      >
        <span
          class="donut-chart__swatch"
          style:background={seriesColor(
            arc.index,
            slices.length > 1 ? slices.length : 2,
            arc.color,
          )}
        ></span>
        <span class="donut-chart__legend-label">{arc.label}</span>
        <span class="donut-chart__legend-value">{format(arc.value)}</span>
        <span class="donut-chart__legend-pct">{Math.round(arc.pct * 100)}%</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .donut-chart {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }
  .donut-chart__plot {
    position: relative;
    flex: none;
  }
  svg {
    display: block;
  }
  .donut-chart__slice {
    transition:
      opacity 120ms ease,
      transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1),
      filter 160ms ease;
    cursor: default;
  }
  .donut-chart__slice--dim {
    opacity: 0.35;
  }
  .donut-chart__slice--lifted {
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.18));
  }
  .donut-chart__center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    text-align: center;
  }
  .donut-chart__center-value {
    font-size: var(--text-2xl, 20px);
    font-weight: 700;
    line-height: 1.15;
    color: var(--t1, var(--text, #0b0b0b));
  }
  .donut-chart__center-label {
    font-size: var(--text-2xs, 10px);
    color: var(--t3, var(--text-muted, #898781));
    margin-top: 2px;
  }
  .donut-chart__legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 150px;
    flex: 1;
  }
  .donut-chart__legend-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm, 12px);
    transition: opacity var(--dur-fast) var(--ease-standard, ease);
  }
  .donut-chart__legend-item--dim {
    opacity: 0.4;
  }
  .donut-chart__swatch {
    width: 9px;
    height: 9px;
    border-radius: 3px;
  }
  .donut-chart__legend-label {
    color: var(--t2, var(--text-secondary, #52514e));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .donut-chart__legend-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--t1, var(--text, #0b0b0b));
  }
  .donut-chart__legend-pct {
    font-variant-numeric: tabular-nums;
    color: var(--t3, var(--text-muted, #898781));
    min-width: 34px;
    text-align: right;
  }
</style>
