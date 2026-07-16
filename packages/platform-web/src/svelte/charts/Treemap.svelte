<script>
  /**
   * Life OS Treemap — 矩形树图(部分-整体,类目多时比环图/条形更紧凑)。
   * squarified 布局、2px 表面间隙、3px 圆角;每块的标签只在放得下时
   * 内嵌(先量再放,绝不裁字),值/占比永远可从 tooltip 拿到。
   * 颜色:块按固定 categorical 槽位;>8 块自动折叠为"其他"。
   */
  import { treemapLayout } from './treemapLayout.js'
  import { seriesColor, compactNumber, px } from './chartUtils.js'
  import ChartTooltip from './ChartTooltip.svelte'

  /**
   * @type {{
   *   items: { label: string, value: number, color?: string, meta?: string }[],
   *   height?: number,
   *   format?: (v: number) => string,
   *   otherLabel?: string,
   *   onSelect?: (item: { label: string, value: number }, index: number) => void,
   *   ariaLabel?: string,
   * }}
   */
  let {
    items,
    height = 260,
    format = compactNumber,
    otherLabel = '其他',
    onSelect,
    ariaLabel = '',
  } = $props()

  const MAX_TILES = 8
  const tiles = $derived.by(() => {
    const positive = items.filter((d) => d.value > 0)
    positive.sort((a, b) => b.value - a.value)
    if (positive.length <= MAX_TILES) return positive
    const head = positive.slice(0, MAX_TILES - 1)
    const rest = positive.slice(MAX_TILES - 1)
    return [
      ...head,
      {
        label: otherLabel,
        value: rest.reduce((a, d) => a + d.value, 0),
        meta: `${rest.length} 项`,
      },
    ]
  })

  const total = $derived(tiles.reduce((a, d) => a + d.value, 0) || 1)

  let wrapW = $state(0)
  const chartW = $derived(Math.max(240, Math.round(wrapW) || 560))

  const rects = $derived(
    treemapLayout(
      tiles.map((d) => d.value),
      { x: 0, y: 0, w: chartW, h: height },
      2,
    ),
  )

  // 标签放不下就不放(先量再放):中文 ~1em/字,拉丁 ~0.55em
  function textW(str, fs) {
    let w = 0
    for (const ch of String(str)) w += ch.codePointAt(0) > 0x2e80 ? fs : fs * 0.55
    return w
  }
  const LABEL_FS = 11.5
  const VALUE_FS = 11
  function fitsLabel(tile, r) {
    return r.w >= textW(tile.label, LABEL_FS) + 14 && r.h >= 34
  }
  function fitsValue(tile, r) {
    return (
      r.w >= Math.max(textW(tile.label, LABEL_FS), textW(format(tile.value), VALUE_FS)) + 14 &&
      r.h >= 50
    )
  }

  let hover = $state(/** @type {number | null} */ (null))
  let pointerXY = $state({ x: 0, y: 0 })

  function onTilePointer(e, i) {
    hover = i
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    pointerXY = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const computedAria = $derived(
    ariaLabel || `矩形树图:${tiles.map((d) => d.label).join('、')}`,
  )
</script>

<div class="treemap" bind:clientWidth={wrapW}>
  <svg
    width={chartW}
    {height}
    role="img"
    aria-label={computedAria}
    onpointerleave={() => (hover = null)}
  >
    {#each tiles as tile, i (tile.label + i)}
      {@const r = rects[i]}
      {@const color = seriesColor(i, tiles.length > 1 ? tiles.length : 2, tile.color)}
      {@const dim = hover != null && hover !== i}
      {#if r.w > 1 && r.h > 1}
        <g
          class="treemap__tile"
          class:treemap__tile--dim={dim}
          class:treemap__tile--clickable={!!onSelect}
          onpointermove={(e) => onTilePointer(e, i)}
          onclick={() => onSelect?.(tile, i)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect?.(tile, i)
            }
          }}
          role={onSelect ? 'button' : 'presentation'}
          tabindex={onSelect ? 0 : undefined}
        >
          <rect
            x={px(r.x)}
            y={px(r.y)}
            width={px(r.w)}
            height={px(r.h)}
            rx="3"
            fill={color}
            opacity="0.9"
          />
          {#if fitsLabel(tile, r)}
            <text
              class="treemap__label"
              x={px(r.x) + 7}
              y={px(r.y) + 16}
            >
              {tile.label}
            </text>
            {#if fitsValue(tile, r)}
              <text
                class="treemap__value"
                x={px(r.x) + 7}
                y={px(r.y) + 31}
              >
                {format(tile.value)}
              </text>
            {/if}
          {/if}
        </g>
      {/if}
    {/each}
  </svg>

  <ChartTooltip
    visible={hover != null}
    x={pointerXY.x}
    y={pointerXY.y}
    boundsW={chartW}
    rows={hover == null
      ? []
      : [
          {
            label: `${tiles[hover].label} · ${Math.round((tiles[hover].value / total) * 100)}%${tiles[hover].meta ? ` · ${tiles[hover].meta}` : ''}`,
            value: format(tiles[hover].value),
            color: seriesColor(
              hover,
              tiles.length > 1 ? tiles.length : 2,
              tiles[hover].color,
            ),
          },
        ]}
  />
</div>

<style>
  .treemap {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
  }
  .treemap__tile {
    transition: opacity 120ms ease;
    outline: none;
  }
  .treemap__tile--dim {
    opacity: 0.4;
  }
  .treemap__tile--clickable {
    cursor: pointer;
  }
  .treemap__tile:focus-visible rect {
    stroke: var(--t1, var(--text, #0b0b0b));
    stroke-width: 1.5;
  }
  /* 内嵌标签是"彩色填充内的文字"例外:按填充亮度选白/墨在组件外不可知,
     统一用白字 + 轻描边保证在 8 个槽位色上都可读 */
  .treemap__label,
  .treemap__value {
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.28);
    stroke-width: 1.6;
    font-size: 11.5px;
    font-weight: 600;
    pointer-events: none;
  }
  .treemap__value {
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    opacity: 0.92;
  }
</style>
