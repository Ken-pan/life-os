// 思维导图 tidy 布局——纯函数,无 DOM 依赖。
// 叶子按行堆叠、父节点垂直居中于子树,经典 XMind 式左右分布。

/**
 * @typedef {{ label: string, children?: MindInput[] }} MindInput
 * @typedef {{
 *   id: string, label: string, depth: number, side: 1 | -1,
 *   x: number, y: number, w: number, h: number,
 *   branch: number, hasChildren: boolean, collapsed: boolean,
 *   descendants: number, parentId: string | null,
 * }} MindNode
 */

/**
 * @param {MindInput} root
 * @param {{
 *   measure: (label: string, depth: number) => { w: number, h: number },
 *   levelGap?: number,
 *   vGap?: number,
 *   split?: boolean,
 *   collapsed?: Set<string>,
 * }} opts
 * @returns {{ nodes: MindNode[], links: { from: MindNode, to: MindNode }[], width: number, height: number }}
 */
export function mindmapLayout(root, opts) {
  const {
    measure,
    levelGap = 36,
    vGap = 10,
    split = true,
    collapsed = new Set(),
  } = opts

  /** 子孙总数(含被折叠隐藏的),折叠徽标用 */
  function countDesc(n) {
    if (!n.children?.length) return 0
    return n.children.reduce((a, c) => a + 1 + countDesc(c), 0)
  }

  const nodes = /** @type {MindNode[]} */ ([])
  const links = []

  /**
   * 递归布局一侧的子树;返回子树占据的高度。
   * leafCursor 以 { y } 对象穿透递归(可变游标)。
   */
  function place(input, id, depth, side, branch, parentId, cursor) {
    const { w, h } = measure(input.label, depth)
    const isCollapsed = collapsed.has(id)
    const kids = !isCollapsed && input.children?.length ? input.children : []
    const node = {
      id,
      label: input.label,
      depth,
      side,
      x: 0, // 水平位置由第二遍(定位)填
      y: 0,
      w,
      h,
      branch,
      hasChildren: Boolean(input.children?.length),
      collapsed: isCollapsed,
      descendants: countDesc(input),
      parentId,
    }
    nodes.push(node)
    if (kids.length === 0) {
      node.y = cursor.y
      cursor.y += h + vGap
      return node
    }
    const children = kids.map((c, i) =>
      place(c, `${id}.${i}`, depth + 1, side, depth === 0 ? i : branch, id, cursor),
    )
    for (const c of children) links.push({ from: node, to: c })
    const last = children[children.length - 1]
    node.y = (children[0].y + last.y + last.h - h) / 2
    // 父节点比子树高时撑开游标,防兄弟重叠
    cursor.y = Math.max(cursor.y, node.y + h + vGap)
    return node
  }

  const rootMeasure = measure(root.label, 0)
  const allKids = root.children ?? []

  // 左右分侧:按叶子数贪心均衡,保持原始顺序(前半右、后半左)
  let rightKids = allKids
  let leftKids = []
  if (split && allKids.length > 2) {
    const weights = allKids.map((c) => 1 + countDesc(c))
    const total = weights.reduce((a, b) => a + b, 0)
    let acc = 0
    let cut = allKids.length
    for (let i = 0; i < allKids.length; i++) {
      acc += weights[i]
      if (acc >= total / 2) {
        cut = i + 1
        break
      }
    }
    rightKids = allKids.slice(0, cut)
    leftKids = allKids.slice(cut)
  }

  const rootCollapsed = collapsed.has('0')
  const rootNode = {
    id: '0',
    label: root.label,
    depth: 0,
    side: /** @type {1} */ (1),
    x: 0,
    y: 0,
    w: rootMeasure.w,
    h: rootMeasure.h,
    branch: -1,
    hasChildren: allKids.length > 0,
    collapsed: rootCollapsed,
    descendants: countDesc(root),
    parentId: null,
  }
  nodes.push(rootNode)

  const sides = rootCollapsed
    ? []
    : [
        { kids: rightKids, side: /** @type {1} */ (1), offset: 0 },
        { kids: leftKids, side: /** @type {-1} */ (-1), offset: rightKids.length },
      ]

  const sideSpans = []
  for (const s of sides) {
    const cursor = { y: 0 }
    const placed = s.kids.map((c, i) =>
      place(c, `0.${s.offset + i}`, 1, s.side, s.offset + i, '0', cursor),
    )
    for (const c of placed) links.push({ from: rootNode, to: c })
    sideSpans.push({ side: s.side, span: Math.max(0, cursor.y - vGap) })
  }

  // 两侧各自垂直居中对齐根节点
  const maxSpan = Math.max(rootMeasure.h, ...sideSpans.map((s) => s.span))
  for (const { side, span } of sideSpans) {
    const shift = (maxSpan - span) / 2
    for (const n of nodes) {
      if (n !== rootNode && n.side === side) n.y += shift
    }
  }
  rootNode.y = (maxSpan - rootMeasure.h) / 2

  // 第二遍:水平定位(此时各节点宽度已知)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  function placeX(n) {
    if (n.parentId == null) {
      n.x = 0
    } else {
      const p = byId.get(n.parentId)
      n.x = n.side === 1 ? p.x + p.w + levelGap : p.x - levelGap - n.w
    }
    for (const child of nodes.filter((c) => c.parentId === n.id)) placeX(child)
  }
  placeX(rootNode)

  // 平移到正坐标
  const minX = Math.min(...nodes.map((n) => n.x))
  const maxX = Math.max(...nodes.map((n) => n.x + n.w))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxY = Math.max(...nodes.map((n) => n.y + n.h))
  for (const n of nodes) {
    n.x -= minX
    n.y -= minY
  }

  return { nodes, links, width: maxX - minX, height: maxY - minY }
}
