<script>
  /**
   * Life OS Sparkline — 行内迷你趋势线,stat 瓦片/列表行的 trend 通道。
   * 无轴无网格;2px 线 + 可选 10% 面积洗色 + 端点圆点(表面环)。
   * 颜色默认品牌 accent;delta 语义(涨好/跌好)交给调用方传 color。
   */
  import { linearScale, monotonePath, linePath, px } from './chartUtils.js'

  /**
   * @type {{
   *   values: (number | null)[],
   *   width?: number,
   *   height?: number,
   *   area?: boolean,
   *   curve?: 'smooth' | 'linear',
   *   color?: string,
   *   endDot?: boolean,
   *   ariaLabel?: string,
   * }}
   */
  let {
    values,
    width = 96,
    height = 28,
    area = true,
    curve = 'smooth',
    color = 'var(--chart-line, var(--accent))',
    endDot = true,
    ariaLabel = '',
  } = $props()

  const PAD = 4
  const clean = $derived(values.filter((v) => v != null))
  const min = $derived(clean.length ? Math.min(...clean) : 0)
  const max = $derived(clean.length ? Math.max(...clean) : 1)
  const yScale = $derived(
    linearScale(min === max ? min - 1 : min, min === max ? max + 1 : max, height - PAD, PAD),
  )
  const xAt = $derived((i) =>
    values.length > 1
      ? PAD + (i / (values.length - 1)) * (width - PAD * 2)
      : width / 2,
  )

  const segments = $derived.by(() => {
    const segs = []
    let cur = []
    values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur)
        cur = []
      } else {
        cur.push({ x: xAt(i), y: yScale(v) })
      }
    })
    if (cur.length) segs.push(cur)
    return segs
  })

  const pathOf = $derived((pts) =>
    curve === 'smooth' ? monotonePath(pts) : linePath(pts),
  )

  const last = $derived.by(() => {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return { x: xAt(i), y: yScale(values[i]) }
    }
    return null
  })
</script>

<svg {width} {height} role="img" aria-label={ariaLabel || '趋势迷你图'} class="sparkline">
  {#each segments as pts, pi (pi)}
    {#if pts.length > 1}
      {#if area}
        <path
          d={`${pathOf(pts)}L${px(pts[pts.length - 1].x)},${height - 1}L${px(pts[0].x)},${height - 1}Z`}
          fill={color}
          opacity="0.1"
        />
      {/if}
      <path class="sparkline__line" d={pathOf(pts)} stroke={color} />
    {:else if pts.length === 1}
      <circle cx={px(pts[0].x)} cy={px(pts[0].y)} r="2.5" fill={color} />
    {/if}
  {/each}
  {#if endDot && last}
    <circle class="sparkline__dot" cx={px(last.x)} cy={px(last.y)} r="3" fill={color} />
  {/if}
</svg>

<style>
  .sparkline {
    display: block;
    overflow: visible;
  }
  .sparkline__line {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sparkline__dot {
    stroke: var(--chart-surface, var(--card, #fff));
    stroke-width: 1.5;
  }
</style>
