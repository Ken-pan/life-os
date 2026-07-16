<script>
  /**
   * Life OS TimelineChart — Linear 式项目时间线(Gantt-lite)。
   * 每行一个条目:轨道条(起止时间)+ 进度填充 + dueDate 里程碑菱形
   * (实心=已完成,描边=未完成)+ 今日竖线;月刻度 hairline 轴。
   * 颜色克制:默认全部走品牌 accent(行身份由左侧标签承担,
   * 不消耗 categorical 槽位),单行可用 color 覆写。
   */
  import { linearScale, monthTicks, px } from './chartUtils.js'
  import ChartTooltip from './ChartTooltip.svelte'

  /**
   * @typedef {{ at: number, label?: string, done?: boolean }} TimelineMilestone
   * @type {{
   *   rows: {
   *     label: string,
   *     start: number,
   *     end: number,
   *     progress?: number,
   *     milestones?: TimelineMilestone[],
   *     meta?: string,
   *     color?: string,
   *   }[],
   *   formatDate?: (ms: number) => string,
   *   today?: number,
   *   todayLabel?: string,
   *   ariaLabel?: string,
   * }}
   */
  let {
    rows,
    formatDate = (ms) => {
      const d = new Date(ms)
      return `${d.getMonth() + 1}/${d.getDate()}`
    },
    today = undefined,
    todayLabel = '今天',
    ariaLabel = '',
  } = $props()

  const ROW_H = 40
  const BAR_H = 14
  const RADIUS = 7
  const AXIS_H = 24
  const PAD_T = 20 // 今日线标签的头部空间

  let wrapW = $state(0)
  const chartW = $derived(Math.max(280, Math.round(wrapW) || 640))

  const labelW = $derived(
    Math.min(
      Math.max(...rows.map((r) => textW(r.label)), 40) + 14,
      chartW * 0.32,
    ),
  )
  const padR = 16
  const innerW = $derived(Math.max(60, chartW - labelW - padR))
  const chartH = $derived(rows.length * ROW_H + PAD_T + AXIS_H)

  function textW(str) {
    let w = 0
    for (const ch of String(str)) w += ch.codePointAt(0) > 0x2e80 ? 12.5 : 7
    return w
  }

  // 今日快照:untrack 外部传入优先;不传则取渲染时刻(图表随数据重渲,可接受)
  const now = $derived(today ?? Date.now())

  const domainStart = $derived(
    rows.length ? Math.min(...rows.map((r) => r.start)) : now - 1,
  )
  const domainEnd = $derived(
    Math.max(rows.length ? Math.max(...rows.map((r) => r.end)) : now, now) +
      1,
  )
  // 两端各留 3% 呼吸感
  const span = $derived(domainEnd - domainStart)
  const xScale = $derived(
    linearScale(
      domainStart - span * 0.03,
      domainEnd + span * 0.03,
      labelW,
      labelW + innerW,
    ),
  )

  const ticks = $derived(monthTicks(domainStart, domainEnd, innerW))
  const todayX = $derived(xScale(now))

  const rowY = (i) => PAD_T + i * ROW_H + (ROW_H - BAR_H) / 2

  /** 里程碑菱形 path(边长 d) */
  function diamond(cx, cy, d = 5) {
    return `M${px(cx)},${px(cy - d)}L${px(cx + d)},${px(cy)}L${px(cx)},${px(cy + d)}L${px(cx - d)},${px(cy)}Z`
  }

  let hover = $state(/** @type {number | null} */ (null))
  let pointerXY = $state({ x: 0, y: 0 })

  function onRowPointer(e, i) {
    hover = i
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    pointerXY = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const tooltipRows = $derived.by(() => {
    if (hover == null || !rows[hover]) return []
    const r = rows[hover]
    const out = [
      {
        label: `${formatDate(r.start)} – ${formatDate(r.end)}`,
        value: r.progress != null ? `${Math.round(r.progress * 100)}%` : '',
        color: r.color || 'var(--chart-line, var(--accent))',
      },
    ]
    if (r.meta) out.push({ label: r.meta, value: '' })
    return out
  })

  const computedAria = $derived(
    ariaLabel || `时间线:${rows.map((r) => r.label).join('、')}`,
  )
</script>

<div class="timeline-chart" bind:clientWidth={wrapW}>
  <svg
    width={chartW}
    height={chartH}
    role="img"
    aria-label={computedAria}
    onpointerleave={() => (hover = null)}
  >
    <!-- 月刻度:hairline 竖线 + 底部标签 -->
    {#each ticks as tick (tick.at)}
      <line
        class="timeline-chart__grid"
        x1={px(xScale(tick.at))}
        x2={px(xScale(tick.at))}
        y1={PAD_T - 6}
        y2={chartH - AXIS_H + 6}
      />
      <text
        class="timeline-chart__tick"
        x={px(xScale(tick.at))}
        y={chartH - 8}
        text-anchor="middle"
      >
        {tick.label}
      </text>
    {/each}

    <!-- 今日线:accent 实线 + 顶部标签 -->
    {#if todayX >= labelW && todayX <= labelW + innerW}
      <line
        class="timeline-chart__today"
        x1={px(todayX)}
        x2={px(todayX)}
        y1={PAD_T - 6}
        y2={chartH - AXIS_H + 6}
      />
      <text
        class="timeline-chart__today-label"
        x={px(todayX)}
        y={PAD_T - 10}
        text-anchor="middle"
      >
        {todayLabel}
      </text>
    {/if}

    {#each rows as row, i (row.label + i)}
      {@const y = rowY(i)}
      {@const x0 = xScale(row.start)}
      {@const x1 = Math.max(xScale(row.end), x0 + BAR_H)}
      {@const color = row.color || 'var(--chart-line, var(--accent))'}
      {@const dim = hover != null && hover !== i}
      {@const progW = row.progress != null ? Math.max(0, Math.min(1, row.progress)) * (x1 - x0) : 0}
      <g class="timeline-chart__row" class:timeline-chart__row--dim={dim}>
        <text
          class="timeline-chart__label"
          x={labelW - 12}
          y={y + BAR_H / 2 + 4}
          text-anchor="end"
        >
          {row.label}
        </text>
        <!-- 轨道(整段淡染)+ 进度填充(实色) -->
        <rect
          x={px(x0)}
          y={px(y)}
          width={px(x1 - x0)}
          height={BAR_H}
          rx={RADIUS}
          fill={color}
          opacity="0.18"
        />
        {#if progW > 1}
          <rect
            x={px(x0)}
            y={px(y)}
            width={px(Math.max(progW, BAR_H))}
            height={BAR_H}
            rx={RADIUS}
            fill={color}
          />
        {/if}
        <!-- 里程碑菱形:实心=已完成,表面底+描边=未完成 -->
        {#each row.milestones ?? [] as m, mi (mi)}
          {#if m.at >= row.start && m.at <= row.end}
            <path
              class="timeline-chart__milestone"
              d={diamond(xScale(m.at), y + BAR_H / 2)}
              fill={m.done ? color : 'var(--chart-surface, var(--card, #fff))'}
              stroke={color}
            />
          {/if}
        {/each}
        <rect
          class="timeline-chart__hit"
          x={0}
          y={PAD_T + i * ROW_H}
          width={chartW}
          height={ROW_H}
          onpointermove={(e) => onRowPointer(e, i)}
        />
      </g>
    {/each}
  </svg>

  <ChartTooltip
    visible={hover != null}
    x={pointerXY.x}
    y={pointerXY.y}
    boundsW={chartW}
    title={hover == null ? '' : rows[hover].label}
    rows={tooltipRows}
  />
</div>

<style>
  .timeline-chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
  }
  .timeline-chart__grid {
    stroke: var(--chart-grid, rgba(0, 0, 0, 0.08));
    stroke-width: 1;
  }
  .timeline-chart__tick {
    fill: var(--chart-axis, var(--text-muted, #898781));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .timeline-chart__today {
    stroke: var(--chart-line, var(--accent, #2a78d6));
    stroke-width: 1.5;
    opacity: 0.75;
  }
  .timeline-chart__today-label {
    fill: var(--chart-line, var(--accent, #2a78d6));
    font-size: 10px;
    font-weight: 650;
  }
  .timeline-chart__label {
    fill: var(--t1, var(--text, #0b0b0b));
    font-size: 12px;
    font-weight: 500;
  }
  .timeline-chart__row {
    transition: opacity 120ms ease;
  }
  .timeline-chart__row--dim {
    opacity: 0.4;
  }
  .timeline-chart__milestone {
    stroke-width: 1.5;
  }
  .timeline-chart__hit {
    fill: transparent;
  }
</style>
