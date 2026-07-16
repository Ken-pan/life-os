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
   * @typedef {{ label: string, children?: MindInput[] }} MindInput
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
</script>

<div class="mindmap" role="tree" aria-label={computedAria}>
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
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(node)
          }
        }}
      >
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
</div>

<style>
  .mindmap {
    width: 100%;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
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
