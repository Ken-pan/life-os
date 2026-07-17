<script>
  /**
   * 图表悬浮读数——一个 tooltip 列出该 X 上的所有系列;
   * 值是主角(粗、主文本色),系列名次之;身份用系列色短线键。
   * 由宿主图表定位:传入图表内坐标,自身负责夹在容器内。
   * @type {{
   *   visible: boolean,
   *   x: number,
   *   y: number,
   *   boundsW: number,
   *   title?: string,
   *   rows: { label: string, value: string, color?: string, muted?: boolean }[],
   * }}
   */
  let { visible, x, y, boundsW, title = '', rows } = $props()

  let el = $state(null)
  let w = $state(120)
  let h = $state(48)
  $effect(() => {
    if (!el || !visible) return
    const r = el.getBoundingClientRect()
    w = r.width
    h = r.height
  })

  const OFFSET = 12
  const left = $derived(
    x + OFFSET + w > boundsW ? Math.max(0, x - OFFSET - w) : x + OFFSET,
  )
  const top = $derived(Math.max(0, y - h - OFFSET < 0 ? y + OFFSET : y - h - OFFSET))
</script>

{#if visible && rows.length > 0}
  <div
    bind:this={el}
    class="chart-tooltip"
    style:transform={`translate(${Math.round(left)}px, ${Math.round(top)}px)`}
    role="status"
  >
    {#if title}
      <div class="chart-tooltip__title">{title}</div>
    {/if}
    {#each rows as row (row.label)}
      <div class="chart-tooltip__row" class:chart-tooltip__row--muted={row.muted}>
        {#if row.color}
          <span class="chart-tooltip__key" style:background={row.color}></span>
        {/if}
        <span class="chart-tooltip__value">{row.value}</span>
        <span class="chart-tooltip__label">{row.label}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .chart-tooltip {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
    pointer-events: none;
    min-width: 96px;
    max-width: 240px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--chart-tooltip-bg, var(--card, #fff)) 92%, transparent);
    border: 1px solid var(--chart-tooltip-border, var(--border, rgba(0, 0, 0, 0.1)));
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 6px 16px rgba(0, 0, 0, 0.07),
      0 16px 32px rgba(0, 0, 0, 0.06);
    font-size: var(--text-xs, 11px);
    line-height: 1.5;
    will-change: transform;
    transition:
      transform 90ms ease-out,
      opacity 90ms ease-out;
  }
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .chart-tooltip {
      backdrop-filter: blur(10px) saturate(1.5);
      -webkit-backdrop-filter: blur(10px) saturate(1.5);
    }
  }
  .chart-tooltip__title {
    color: var(--t3, var(--text-muted, #898781));
    margin-bottom: 3px;
    font-weight: 500;
  }
  .chart-tooltip__row {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .chart-tooltip__row--muted {
    opacity: 0.45;
  }
  .chart-tooltip__key {
    width: 10px;
    height: 2px;
    border-radius: 1px;
    flex: none;
  }
  .chart-tooltip__value {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--t1, var(--text, #0b0b0b));
  }
  .chart-tooltip__label {
    color: var(--t3, var(--text-muted, #898781));
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
