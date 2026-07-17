<script>
  /**
   * Life OS MindMap — 思维导图(层级结构鸟瞰)。
   * 经典布局:根居中、一级分支左右均衡;每条一级分支取一个
   * categorical 槽位色,子孙继承(身份跟分支走,永不循环)。
   * 节点可折叠(带 +N 徽标);超出容器横向滚动。
   */
  import { mindmapLayout } from './mindmapLayout.js'
  import { seriesColor, px, MAX_SERIES } from './chartUtils.js'

  /**
   * @typedef {{ label: string, note?: string, data?: any, children?: MindInput[] }} MindInput
   * @type {{
   *   root: MindInput,
   *   split?: boolean,
   *   collapsible?: boolean,
   *   defaultCollapsedDepth?: number,
   *   height?: number,
   *   zoomable?: boolean,
   *   fitKey?: any,
   *   onSelect?: (node: { id: string, label: string, depth: number, data?: any }) => void,
   *   ariaLabel?: string,
   * }}
   */
  let {
    root,
    split = true,
    collapsible = true,
    defaultCollapsedDepth = 0,
    height = 420,
    zoomable = true,
    fitKey = null,
    onSelect,
    ariaLabel = '',
  } = $props()

  const NODE_H = 28
  const ROOT_H = 36
  const FS = 12
  const ROOT_FS = 13.5
  const MAX_CHARS = 22
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  function clip(label) {
    const s = String(label)
    return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1) + '…' : s
  }

  function textW(str, fs) {
    let w = 0
    for (const ch of String(str)) w += ch.codePointAt(0) > 0x2e80 ? fs : fs * 0.58
    return w
  }

  function measure(label, depth) {
    const fs = depth === 0 ? ROOT_FS : FS
    return {
      w: Math.ceil(textW(clip(label), fs)) + (depth === 0 ? 28 : 22),
      h: depth === 0 ? ROOT_H : NODE_H,
    }
  }

  /** 折叠集合(id 为路径式 "0.1.2");重赋值触发响应 */
  let collapsed = $state(initCollapsed())

  function initCollapsed() {
    if (defaultCollapsedDepth <= 0) return new Set()
    const set = new Set()
    ;(function walk(n, id, depth) {
      if (depth >= defaultCollapsedDepth && n.children?.length) set.add(id)
      n.children?.forEach((c, i) => walk(c, `${id}.${i}`, depth + 1))
    })(root, '0', 0)
    return set
  }

  const layout = $derived(
    mindmapLayout(root, { measure, split, collapsed }),
  )

  function toggle(node) {
    onSelect?.({
      id: node.id,
      label: node.label,
      depth: node.depth,
      data: dataMap.get(node.id),
    })
    if (!collapsible || !node.hasChildren || node.depth === 0) return
    const next = new Set(collapsed)
    if (next.has(node.id)) next.delete(node.id)
    else next.add(node.id)
    collapsed = next
  }

  function branchColor(branch) {
    if (branch < 0) return 'var(--accent, #2a78d6)'
    return seriesColor(Math.min(branch, MAX_SERIES - 1), MAX_SERIES)
  }

  /** 连接线:从父节点朝向子节点的一侧边缘出发的三次贝塞尔 */
  function linkPath(from, to) {
    const x0 = to.side === 1 ? from.x + from.w : from.x
    const y0 = from.y + from.h / 2
    const x1 = to.side === 1 ? to.x : to.x + to.w
    const y1 = to.y + to.h / 2
    const dx = (x1 - x0) / 2
    return `M${px(x0)},${px(y0)}C${px(x0 + dx)},${px(y0)} ${px(x1 - dx)},${px(y1)} ${px(x1)},${px(y1)}`
  }

  const computedAria = $derived(ariaLabel || `思维导图:${root.label}`)

  // 节点说明:节点 id(路径式 "0.1.2")→ note 文本
  const noteMap = $derived.by(() => {
    const m = new Map()
    ;(function walk(n, id) {
      if (n.note) m.set(id, String(n.note))
      n.children?.forEach((c, i) => walk(c, `${id}.${i}`))
    })(root, '0')
    return m
  })

  // 节点业务数据:id → data(透传给 onSelect,宿主用来做联动/下钻)
  const dataMap = $derived.by(() => {
    const m = new Map()
    ;(function walk(n, id) {
      if (n.data !== undefined) m.set(id, n.data)
      n.children?.forEach((c, i) => walk(c, `${id}.${i}`))
    })(root, '0')
    return m
  })

  /** 该节点是否值得弹 tooltip:有说明,或标签被截断(需看全名) */
  function nodeTip(node) {
    const note = noteMap.get(node.id) ?? ''
    const clipped = String(node.label).length > MAX_CHARS
    return note || clipped ? { label: String(node.label), note } : null
  }

  // ── 视口状态(固定视口 + 内部 g transform 做 zoom/pan)──
  let wrapEl = $state(null)
  let svgEl = $state(null)
  let vw = $state(600)
  let k = $state(1)
  let tx = $state(0)
  let ty = $state(0)
  let lastFitKey = /** @type {any} */ (Symbol('init'))
  let panning = $state(false)
  let moved = false
  let panPointerId = /** @type {number | null} */ (null)
  let panStart = { x: 0, y: 0, tx: 0, ty: 0 }
  const PAN_THRESHOLD = 6 // 超过才算拖拽,否则视为点击(避免抖动误判)

  // ── tooltip 状态 ──
  let hover = $state(/** @type {{ label: string, note: string } | null} */ (null))
  let tipXY = $state({ cx: 0, top: 0, bottom: 0 })
  let tipEl = $state(null)
  let tipW = $state(160)
  let tipH = $state(40)

  const ZOOM_MIN = 0.3
  const ZOOM_MAX = 3

  /** 适配:让整图居中铺满视口 */
  function fitView() {
    const cw = layout.width
    const ch = layout.height
    if (!cw || !ch || !vw) return
    const k0 = clamp(Math.min((vw - 32) / cw, (height - 32) / ch, 1.3), ZOOM_MIN, ZOOM_MAX)
    k = k0
    tx = (vw - cw * k0) / 2
    ty = (height - ch * k0) / 2
  }

  // 首次就绪、以及 fitKey 变化(如切换聚焦项目)时重新适配;
  // 用户手动 zoom/pan 期间 fitKey 不变,不会被拉回。
  $effect(() => {
    const key = fitKey
    const ready = layout.width && layout.height && vw
    if (ready && key !== lastFitKey) {
      lastFitKey = key
      fitView()
    }
  })

  /** 以视口内 (mx,my) 为锚点缩放,该点在缩放前后屏幕位置不动 */
  function zoomAt(mx, my, factor) {
    const nk = clamp(k * factor, ZOOM_MIN, ZOOM_MAX)
    tx = mx - (mx - tx) * (nk / k)
    ty = my - (my - ty) * (nk / k)
    k = nk
  }

  function onWheel(e) {
    if (!zoomable) return
    e.preventDefault()
    const r = svgEl.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  function zoomBtn(factor) {
    zoomAt(vw / 2, height / 2, factor)
  }

  function onCanvasDown(e) {
    if (!zoomable) return
    panning = true
    moved = false
    panPointerId = e.pointerId
    panStart = { x: e.clientX, y: e.clientY, tx, ty }
    // 关键:此处不 setPointerCapture。立即 capture 会把 pointerup 夺给 svg,
    // 导致节点收不到 click(点不动)。只有确认拖拽后才 capture。
  }
  function onCanvasMove(e) {
    if (!panning) return
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    if (!moved && Math.abs(dx) + Math.abs(dy) > PAN_THRESHOLD) {
      moved = true
      hover = null // 拖拽开始就收起 tooltip
      svgEl?.setPointerCapture?.(panPointerId)
    }
    if (moved) {
      tx = panStart.tx + dx
      ty = panStart.ty + dy
    }
  }
  function onCanvasUp() {
    if (moved && panPointerId != null) {
      svgEl?.releasePointerCapture?.(panPointerId)
    }
    panning = false
    panPointerId = null
  }

  $effect(() => {
    if (!tipEl || !hover) return
    const r = tipEl.getBoundingClientRect()
    tipW = r.width
    tipH = r.height
  })

  function onNodePointer(e, node) {
    if (panning) return // 拖拽平移时不弹 tooltip
    const tip = nodeTip(node)
    if (!tip) {
      hover = null
      return
    }
    hover = tip
    if (!wrapEl) return
    // 锚定到节点(不跟鼠标):固定在节点下方居中,鼠标在节点内移动它不动
    const wrap = wrapEl.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    tipXY = {
      cx: r.left - wrap.left + r.width / 2,
      top: r.top - wrap.top,
      bottom: r.bottom - wrap.top,
    }
  }

  const TIP_GAP = 8
  const tipLeft = $derived(Math.max(4, Math.min(tipXY.cx - tipW / 2, vw - tipW - 4)))
  const tipTop = $derived.by(() => {
    const below = tipXY.bottom + TIP_GAP
    return below + tipH > height ? Math.max(4, tipXY.top - tipH - TIP_GAP) : below
  })
</script>

<div
  class="mindmap"
  class:mindmap--grabbing={panning}
  bind:this={wrapEl}
  bind:clientWidth={vw}
  style:height="{height}px"
  role="tree"
  aria-label={computedAria}
  onpointerleave={() => (hover = null)}
>
  <svg
    bind:this={svgEl}
    width={vw}
    {height}
    onwheel={onWheel}
    onpointerdown={onCanvasDown}
    onpointermove={onCanvasMove}
    onpointerup={onCanvasUp}
    onpointercancel={onCanvasUp}
  >
    <g transform={`translate(${px(tx)} ${px(ty)}) scale(${k})`}>
    {#each layout.links as link (link.to.id)}
      <path
        class="mindmap__link"
        d={linkPath(link.from, link.to)}
        stroke={branchColor(link.to.branch)}
      />
    {/each}

    {#each layout.nodes as node (node.id)}
      {@const isRoot = node.depth === 0}
      {@const color = branchColor(node.branch)}
      <g
        class="mindmap__node"
        class:mindmap__node--branch={!isRoot}
        role="treeitem"
        aria-expanded={node.hasChildren ? !node.collapsed : undefined}
        aria-selected="false"
        tabindex="0"
        onclick={() => {
          if (!moved) toggle(node)
        }}
        onpointermove={(e) => onNodePointer(e, node)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(node)
          }
        }}
      >
        <title>{node.label}{noteMap.get(node.id) ? ` — ${noteMap.get(node.id)}` : ''}</title>
        {#if isRoot}
          <rect
            class="mindmap__root-pill"
            x={px(node.x)}
            y={px(node.y)}
            width={node.w}
            height={node.h}
            rx={node.h / 2}
          />
          <text
            class="mindmap__root-label"
            x={px(node.x + node.w / 2)}
            y={px(node.y + node.h / 2 + ROOT_FS * 0.36)}
            text-anchor="middle"
          >
            {clip(node.label)}
          </text>
        {:else}
          <rect
            class="mindmap__pill"
            x={px(node.x)}
            y={px(node.y)}
            width={node.w}
            height={node.h}
            rx="8"
            style={`fill: color-mix(in srgb, ${color} 13%, var(--chart-surface, var(--card, transparent))); stroke: color-mix(in srgb, ${color} 45%, transparent)`}
          />
          <text
            class="mindmap__label"
            x={px(node.x + node.w / 2)}
            y={px(node.y + node.h / 2 + FS * 0.36)}
            text-anchor="middle"
          >
            {clip(node.label)}
          </text>
          {#if node.collapsed && node.descendants > 0}
            <g class="mindmap__badge">
              <circle
                cx={px(node.side === 1 ? node.x + node.w : node.x)}
                cy={px(node.y + node.h / 2)}
                r="8.5"
                fill={color}
              />
              <text
                class="mindmap__badge-text"
                x={px(node.side === 1 ? node.x + node.w : node.x)}
                y={px(node.y + node.h / 2 + 3)}
                text-anchor="middle"
              >
                +{node.descendants}
              </text>
            </g>
          {/if}
        {/if}
      </g>
    {/each}
    </g>
  </svg>

  {#if zoomable}
    <div class="mindmap__zoom">
      <button type="button" aria-label="放大" onclick={() => zoomBtn(1.3)}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
      <button type="button" aria-label="缩小" onclick={() => zoomBtn(1 / 1.3)}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
      <button type="button" aria-label="适应" onclick={fitView}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M3 6V3.5A0.5 0.5 0 0 1 3.5 3H6M13 6V3.5A0.5 0.5 0 0 0 12.5 3H10M3 10v2.5a0.5 0.5 0 0 0 0.5 0.5H6M13 10v2.5a0.5 0.5 0 0 1-0.5 0.5H10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  {/if}

  {#if hover}
    <div
      bind:this={tipEl}
      class="mindmap__tip"
      style:transform={`translate(${Math.round(tipLeft)}px, ${Math.round(tipTop)}px)`}
      role="status"
    >
      <div class="mindmap__tip-title">{hover.label}</div>
      {#if hover.note}
        <div class="mindmap__tip-note">{hover.note}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mindmap {
    position: relative;
    width: 100%;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .mindmap--grabbing {
    cursor: grabbing;
  }
  .mindmap__zoom {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mindmap__zoom button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--card, #fff);
    color: var(--t2, var(--text-muted, #555));
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }
  .mindmap__zoom button:hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
    color: var(--t1, var(--text, #000));
  }
  .mindmap__zoom button:active {
    transform: translateY(0.5px);
  }
  .mindmap__tip {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
    pointer-events: none;
    max-width: 260px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--chart-tooltip-bg, var(--card, #fff));
    border: 1px solid var(--chart-tooltip-border, var(--border, rgba(0, 0, 0, 0.1)));
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.06),
      0 8px 24px rgba(0, 0, 0, 0.1);
    font-size: var(--text-xs, 11px);
    line-height: 1.5;
    will-change: transform;
  }
  .mindmap__tip-title {
    color: var(--t1, var(--text, #0b0b0b));
    font-weight: 650;
  }
  .mindmap__tip-note {
    margin-top: 2px;
    color: var(--t3, var(--text-muted, #898781));
    white-space: pre-line;
  }
  svg {
    display: block;
    touch-action: none;
  }
  .mindmap__link {
    fill: none;
    stroke-width: 1.5;
    opacity: 0.55;
  }
  .mindmap__node {
    cursor: default;
    outline: none;
  }
  .mindmap__node--branch {
    cursor: pointer;
  }
  .mindmap__node:focus-visible rect {
    stroke: var(--t1, var(--text, #0b0b0b));
    stroke-width: 1.5;
  }
  .mindmap__root-pill {
    fill: var(--accent, #2a78d6);
  }
  .mindmap__root-label {
    fill: var(--on-accent, #fff);
    font-size: 13.5px;
    font-weight: 700;
    pointer-events: none;
  }
  .mindmap__pill {
    stroke-width: 1;
    transition: filter 120ms ease;
  }
  .mindmap__node--branch:hover .mindmap__pill {
    filter: brightness(1.06);
  }
  .mindmap__label {
    fill: var(--t1, var(--text, #0b0b0b));
    font-size: 12px;
    font-weight: 500;
    pointer-events: none;
  }
  .mindmap__badge-text {
    fill: #fff;
    font-size: 9px;
    font-weight: 700;
    pointer-events: none;
  }
</style>
