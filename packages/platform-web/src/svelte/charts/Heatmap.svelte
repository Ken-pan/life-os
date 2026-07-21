<script>
  /**
   * Life OS Heatmap — 强度网格(周×时段活跃度、习惯打卡等)。
   * Sequential 单色相 light→dark:强度 = 品牌 accent 与表面的 color-mix
   * 分位五档(dataviz:量级用单色相渐变,不用彩虹);零值只留 hairline 框。
   * 单元格 3px 圆角、2px 间隙,悬浮读数。
   */
  import ChartTooltip from './ChartTooltip.svelte'
  import { compactNumber } from './chartUtils.js'

  /**
   * @type {{
   *   rows: string[],
   *   cols: string[],
   *   values: (number | null)[][],
   *   cellSize?: number,
   *   format?: (v: number) => string,
   *   colEvery?: number,
   *   cellLabel?: (r: number, c: number) => string,
   *   ariaLabel?: string,
   * }}
   */
  let {
    rows,
    cols,
    values,
    cellSize = 16,
    format = compactNumber,
    colEvery = 1,
    cellLabel = (r, c) => [rows[r], cols[c]].filter(Boolean).join(' · '),
    ariaLabel = '',
  } = $props()

  const GAP = 2
  const RADIUS = 3

  const max = $derived(
    Math.max(1, ...values.flat().filter((v) => v != null)),
  )

  /** 五档量化:12/30/52/76/100% 与表面混合,读得出等级差 */
  const STEPS = [0.12, 0.3, 0.52, 0.76, 1]
  function intensity(v) {
    if (v == null || v <= 0) return 0
    const t = v / max
    const idx = Math.min(4, Math.floor(t * 5))
    return STEPS[idx]
  }

  const labelW = $derived(
    Math.max(...rows.map((r) => String(r).length), 1) * 6.8 + 10,
  )
  const gridW = $derived(cols.length * (cellSize + GAP) - GAP)
  const gridH = $derived(rows.length * (cellSize + GAP) - GAP)
  const width = $derived(labelW + gridW)
  const height = $derived(gridH + 18)

  let hover = $state(/** @type {{ r: number, c: number } | null} */ (null))
  let pointerXY = $state({ x: 0, y: 0 })

  function onCellPointer(e, r, c) {
    hover = { r, c }
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    pointerXY = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const computedAria = $derived(
    ariaLabel || `热力图:${rows.length} 行 × ${cols.length} 列`,
  )
</script>

<div class="heatmap">
  <svg
    {width}
    {height}
    role="img"
    aria-label={computedAria}
    onpointerleave={() => (hover = null)}
  >
    {#each rows as row, r (r)}
      <text
        class="heatmap__label"
        x={labelW - 8}
        y={r * (cellSize + GAP) + cellSize / 2 + 3.5}
        text-anchor="end"
      >
        {row}
      </text>
      {#each cols as col, c (c)}
        {@const v = values[r]?.[c]}
        {@const t = intensity(v)}
        {@const active = hover && hover.r === r && hover.c === c}
        <rect
          class="heatmap__cell"
          class:heatmap__cell--empty={t === 0}
          class:heatmap__cell--active={active}
          x={labelW + c * (cellSize + GAP)}
          y={r * (cellSize + GAP)}
          width={cellSize}
          height={cellSize}
          rx={RADIUS}
          fill={t === 0
            ? 'color-mix(in srgb, var(--t3, var(--text-muted, #898781)) 10%, transparent)'
            : `color-mix(in srgb, var(--chart-heat, var(--chart-line, var(--accent))) ${Math.round(t * 100)}%, var(--chart-surface, var(--card, transparent)))`}
          onpointermove={(e) => onCellPointer(e, r, c)}
        />
      {/each}
    {/each}
    {#each cols as col, c (c)}
      {#if c % colEvery === 0}
        <text
          class="heatmap__label"
          x={labelW + c * (cellSize + GAP) + cellSize / 2}
          y={gridH + 13}
          text-anchor="middle"
        >
          {col}
        </text>
      {/if}
    {/each}
  </svg>

  <ChartTooltip
    visible={hover != null}
    x={pointerXY.x}
    y={pointerXY.y}
    boundsW={width}
    rows={hover == null
      ? []
      : [
          {
            label: cellLabel(hover.r, hover.c),
            value:
              values[hover.r]?.[hover.c] == null
                ? '—'
                : format(values[hover.r][hover.c]),
          },
        ]}
  />
</div>

<style>
  .heatmap {
    position: relative;
    display: inline-block;
    max-width: 100%;
    overflow-x: auto;
  }
  svg {
    display: block;
  }
  .heatmap__label {
    fill: var(--chart-axis, var(--text-muted, #898781));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .heatmap__cell {
    transition: opacity var(--kenos-motion-press-reduce) var(--ease-standard, ease);
  }
  /* 零值格用淡填充(GitHub 式);描边在整年 300+ 格的尺度下太吵 */
  .heatmap__cell--active {
    stroke: var(--t1, var(--text, #0b0b0b));
    stroke-width: 1.5;
  }
</style>
