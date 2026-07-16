/**
 * 高频任务路径 —— 「门到门可达」升级成「日常任务链走多远」。
 * 纯几何,无 AI、无 IO(node 单测直接跑)。
 *
 * 做法:复用动线栅格(circulation.js 的 6in 格),把日常任务的两端解析成
 * 锚点格集合(入口门 / 分区 / 某类家具旁),对每条路径跑一次多源 BFS,
 * 输出真实步行距离。每条任务链带每天次数权重,合计出「日常步行 ft/天」——
 * 这是布局方案能不能让日子省腿的可比数字。
 *
 * 锚点解析是**尽力而为**:家里没有的链路(没有狗围栏/没有办公桌)直接跳过,
 * 不硬算;两端都在但走不通的,如实报 unreachable —— 那本身就是布局问题。
 *
 * 权重是常识先验(次/天,单程;计算时 ×2 算往返),不是实测 —— 等事件流
 * 攒出真实行为数据后应换成实测频率(能力路线图 Phase 5)。
 */
import { buildCirculationBase, buildGrid, GRID_IN } from './circulation.js'
import { PX_PER_IN } from './dimensions.js'
import { isFence } from './placements.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

const GRID_PX = GRID_IN * PX_PER_IN

/**
 * 任务链词表:a/b 是锚点键,perDay 是单程次数先验。
 * 锚点键:entry(入口门) | zone:<名>(踏入该分区即到达) | kind:<家具类>(走到它旁边)
 */
export const ROUTE_RULES = [
  { key: 'entry_kitchen', zh: '入口 ↔ 厨房', a: 'entry', b: 'zone:厨', perDay: 2 },
  { key: 'entry_desk', zh: '入口 ↔ 办公桌', a: 'entry', b: 'kind:desk', perDay: 2 },
  { key: 'bed_bath', zh: '床 ↔ 卫生间', a: 'kind:bed', b: 'zone:卫', perDay: 2 },
  { key: 'bed_wardrobe', zh: '床 ↔ 衣柜', a: 'kind:bed', b: 'kind:wardrobe', perDay: 2 },
  { key: 'desk_kitchen', zh: '办公桌 ↔ 厨房', a: 'kind:desk', b: 'zone:厨', perDay: 4 },
  { key: 'kitchen_dining', zh: '厨房 ↔ 餐区', a: 'zone:厨', b: 'zone:餐', perDay: 3 },
  { key: 'fence_entry', zh: '宠物围栏 ↔ 入口', a: 'kind:fence', b: 'entry', perDay: 2 },
  { key: 'fence_kitchen', zh: '宠物围栏 ↔ 厨房', a: 'kind:fence', b: 'zone:厨', perDay: 2 },
  { key: 'washer_wardrobe', zh: '洗衣机 ↔ 衣柜', a: 'kind:washer', b: 'kind:wardrobe', perDay: 1 },
  { key: 'kitchen_balcony', zh: '厨房 ↔ 阳台', a: 'zone:厨', b: 'zone:阳台', perDay: 1 },
]

/** kind: 锚点的家具匹配表(placements 与 fixtures 都认) */
const KIND_MATCH = {
  bed: (k) => String(k).startsWith('bed'),
  desk: (k) => k === 'desk' || k === 'standing_desk',
  wardrobe: (k) => k === 'wardrobe' || k === 'dresser',
  washer: (k) => k === 'washer' || k === 'dryer',
  fence: (k) => isFence(k),
}

/** 矩形外扩 pad 后覆盖的可走格集合(家具锚点 = 它周围一圈能站人的地方) */
function ringCells(g, rect, padPx) {
  const { cols, rows, minX, minY, cell } = g
  const c0 = Math.max(0, Math.floor((rect.x - padPx - minX) / GRID_PX))
  const c1 = Math.min(cols - 1, Math.ceil((rect.x + rect.w + padPx - minX) / GRID_PX))
  const r0 = Math.max(0, Math.floor((rect.y - padPx - minY) / GRID_PX))
  const r1 = Math.min(rows - 1, Math.ceil((rect.y + rect.h + padPx - minY) / GRID_PX))
  const out = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c
      if (cell[i] === 1) out.push(i)
    }
  }
  return out
}

/**
 * 入口门:落在户型外边界上的门洞。外边界 = 全部分区的包围盒;
 * 门洞中心贴着包围盒任一边(≤12in)就当入口。识别不出返回 null(路线跳过)。
 */
function entryGate(g) {
  const { gates, minX, minY, cols, rows } = g
  const maxX = minX + cols * GRID_PX
  const maxY = minY + rows * GRID_PX
  const edgeTol = 12 * PX_PER_IN
  for (const gate of gates) {
    const nearEdge =
      Math.abs(gate.x - minX) < edgeTol ||
      Math.abs(gate.x - maxX) < edgeTol ||
      Math.abs(gate.y - minY) < edgeTol ||
      Math.abs(gate.y - maxY) < edgeTol
    if (nearEdge) return gate
  }
  return null
}

/** 锚点键 → 可走格集合(空数组 = 家里没有这个锚点) */
function resolveAnchor(g, project, key) {
  if (key === 'entry') {
    const gate = entryGate(g)
    if (!gate) return []
    return ringCells(
      g,
      { x: gate.x - GRID_PX, y: gate.y - GRID_PX, w: GRID_PX * 2, h: GRID_PX * 2 },
      18 * PX_PER_IN,
    )
  }
  if (key.startsWith('zone:')) {
    const frag = key.slice(5)
    const zi = g.zones.findIndex((z) => (z.nameZh ?? '').includes(frag))
    if (zi < 0) return []
    const out = []
    for (let i = 0; i < g.cell.length; i++) {
      if (g.zoneOf[i] === zi && g.cell[i] === 1) out.push(i)
    }
    return out
  }
  if (key.startsWith('kind:')) {
    const match = KIND_MATCH[key.slice(5)]
    if (!match) return []
    const boxes = []
    for (const pl of project.placements ?? []) {
      if (pl.attrs?.staged) continue
      if (match(pl.kind)) boxes.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h })
    }
    for (const fx of project.fixtures ?? []) {
      if (fx.bounds && match(fx.kind)) boxes.push(fx.bounds)
    }
    // 同类多件(两个床头柜/多段围栏):任何一件旁边都算到达
    return boxes.flatMap((b) => ringCells(g, b, 18 * PX_PER_IN))
  }
  return []
}

/** 8 向 BFS 最短步行距离(格距 ×10,斜向 14 ≈ √2):A 集合 → B 集合的最短一条 */
function shortestPathIn(g, fromCells, toCells) {
  if (!fromCells.length || !toCells.length) return null
  const { cols, rows, cell } = g
  const targets = new Uint8Array(cols * rows)
  for (const i of toCells) targets[i] = 1
  const dist = new Int32Array(cols * rows).fill(-1)
  /** 简易分层队列:代价只有 10/14 两种,普通队列 + 已访问即够(近似 Dijkstra,
   * 误差 ≤ 一格斜边,对「日常走多远」绰绰有余) */
  let queue = []
  for (const i of fromCells) {
    if (dist[i] === -1) {
      dist[i] = 0
      queue.push(i)
    }
  }
  const STEPS = [
    [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
    [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
  ]
  let best = -1
  while (queue.length) {
    const next = []
    for (const i of queue) {
      if (targets[i]) {
        if (best < 0 || dist[i] < best) best = dist[i]
        continue
      }
      const r = Math.floor(i / cols)
      const c = i % cols
      for (const [dc, dr, w] of STEPS) {
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        // 斜穿墙角不许:斜向要求两个正交邻格至少一个可走
        if (w === 14 && cell[nr * cols + c] !== 1 && cell[r * cols + nc] !== 1) continue
        const ni = nr * cols + nc
        if (cell[ni] !== 1) continue
        const nd = dist[i] + w
        if (dist[ni] === -1 || nd < dist[ni]) {
          dist[ni] = nd
          next.push(ni)
        }
      }
    }
    if (best >= 0) break
    queue = next
  }
  if (best < 0) return null
  return (best / 10) * (GRID_IN / 12) // 格数 → 英尺
}

/**
 * 计算一套摆法下的全部日常任务路径。
 * @param {SpatialProject} project hydrate 过的户型
 * @param {{ base?: ReturnType<typeof buildCirculationBase> | null }} [opts]
 * @returns {{
 *   ok: boolean, reason?: string,
 *   routes: Array<{ key: string, zh: string, perDay: number, lengthFt: number | null }>,
 *   dailyWalkFt: number | null,
 * }}
 */
export function computeTaskRoutes(project, opts = {}) {
  const g = buildGrid(project, opts.base ?? null)
  if (!g) return { ok: false, reason: '没有房间数据', routes: [], dailyWalkFt: null }

  const anchorCache = new Map()
  const anchor = (key) => {
    if (!anchorCache.has(key)) anchorCache.set(key, resolveAnchor(g, project, key))
    return anchorCache.get(key)
  }

  const routes = []
  let total = 0
  let counted = 0
  for (const rule of ROUTE_RULES) {
    const a = anchor(rule.a)
    const b = anchor(rule.b)
    if (!a.length || !b.length) continue // 家里没有这条链路,不硬算
    const lengthFt = shortestPathIn(g, a, b)
    routes.push({
      key: rule.key,
      zh: rule.zh,
      perDay: rule.perDay,
      lengthFt: lengthFt === null ? null : Math.round(lengthFt * 10) / 10,
    })
    if (lengthFt !== null) {
      total += rule.perDay * lengthFt * 2 // 往返
      counted += 1
    }
  }
  return {
    ok: true,
    routes,
    dailyWalkFt: counted ? Math.round(total) : null,
  }
}
