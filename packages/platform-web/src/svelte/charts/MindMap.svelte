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
   * @typedef {{ label: string, note?: string, children?: MindInput[] }} MindInput
   * @type {{
   *   root: MindInput,
   *   split?: boolean,
   *   collapsible?: boolean,
   *   defaultCollapsedDepth?: number,
   *   onSelect?: (node: { id: string, label: string, depth: number }) => void,
   *   ariaLabel?: string,
   * }}
   */
  let {
    root,
    split = true,
    collapsible = true,
    defaultCollapsedDepth = 0,
    onSelect,
    ariaLabel = '',
  } = $props()

  const NODE_H = 28
  const ROOT_H = 36
  const FS = 12
  const ROOT_FS = 13.5
  const MAX_CHARS = 18

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

  const PAD = 12
  const layout = $derived(
    mindmapLayout(root, { measure, split, collapsed }),
  )

  function toggle(node) {
    onSelect?.({ id: node.id, label: node.label, depth: node.depth })
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

  /** 该节点是否值得弹 tooltip:有说明,或标签被截断(需看全名) */
  function nodeTip(node) {
    const note = noteMap.get(node.id) ?? ''
    const clipped = String(node.label).length > MAX_CHARS
    return note || clipped ? { label: String(node.label), note } : null
  }

  let wrapEl = $state(null)
  let hover = $state(/** @type {{ label: string, note: string } | null} */ (null))
  let tipXY = $state({ x: 0, y: 0 })
  let tipEl = $state(null)
  let tipW = $state(160)
  let tipH = $state(40)
  $effect(() => {
    if (!tipEl || !hover) return
    const r = tipEl.getBoundingClientRect()
    tipW = r.width
    tipH = r.height
  })

  function onNodePointer(e, node) {
    const tip = nodeTip(node)
    if (!tip) {
      hover = null
      return
    }
    hover = tip
    if (!wrapEl) return
    const r = wrapEl.getBoundingClientRect()
    // .mindmap 可横向滚动;绝对定位子元素随内容滚动,坐标要含 scroll 偏移
    tipXY = {
      x: e.clientX - r.left + wrapEl.scrollLeft,
      y: e.clientY - r.top + wrapEl.scrollTop,
    }
  }

  const TIP_OFF = 14
  const tipLeft = $derived.by(() => {
    if (!wrapEl) return tipXY.x + TIP_OFF
    const rightBound = wrapEl.scrollLeft + wrapEl.clientWidth
    const wantRight = tipXY.x + TIP_OFF
    return wantRight + tipW > rightBound
      ? Math.max(wrapEl.scrollLeft, tipXY.x - TIP_OFF - tipW)
      : wantRight
  })
  const tipTop = $derived.by(() => {
    const floor = wrapEl?.scrollTop ?? 0
    const above = tipXY.y - tipH - TIP_OFF
    return above < floor ? tipXY.y + TIP_OFF : above
  })
</script>

<div
  class="mindmap"
  bind:this={wrapEl}
  role="tree"
  aria-label={computedAria}
  onpointerleave={() => (hover = null)}
>
  <svg
    width={layout.width + PAD * 2}
    height={layout.height + PAD * 2}
    viewBox={`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`}
  >
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
        onclick={() => toggle(node)}
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
  </svg>

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
    overflow: auto;
    -webkit-overflow-scrolling: touch;
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
    margin: 0 auto;
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
