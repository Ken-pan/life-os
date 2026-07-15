/**
 * 动线与空间利用率分析 —— 纯几何,无 AI、无 IO(node 单测直接跑)。
 *
 * 做法:把户型栅格化成 6 英寸的格子,标出「人能站的地方」(分区内、不压家具、
 * 不穿墙),然后:
 * - **通道宽度**:多源 BFS 从障碍出发做距离变换,每格到最近障碍的距离 ×2 = 该处通道宽。
 * - **可达性**:门到门 BFS,走不通的门 = 被家具堵死。
 * - **瓶颈**:主路径上宽度 < 舒适阈值的位置(轮椅/搬家具过不去)。
 * - **利用率**:每区家具占地 / 总面积。
 *
 * 阈值取自通用住宅动线标准:36in 主通道、30in 次通道、24in 极限(侧身)。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').Point} Point */

const PX_PER_IN = 3
/** 栅格步长(英寸)。6in 够分辨通道,全屋约 60×80 格,BFS 毫秒级。 */
export const GRID_IN = 6
const GRID_PX = GRID_IN * PX_PER_IN
/** 墙半厚(英寸):墙线段膨胀成障碍,免得动线穿墙 */
const WALL_HALF_IN = 3

export const CLEARANCE = {
  /** 主通道:两人错身、搬家具 */
  comfortable: 36,
  /** 次通道:单人通行 */
  tight: 30,
  /** 极限:侧身挤过 */
  minimum: 24,
}

/**
 * @param {Point} p
 * @param {Point[]} poly
 * @returns {boolean}
 */
export function pointInPolygon(p, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/** 点到线段距离(px) */
function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** 家具/设施的占地矩形(px);placements 的 w/h 已按 rotation 调整过,即 AABB */
function obstacleRects(project) {
  const rects = []
  for (const pl of project.placements ?? []) {
    // 地毯/瑜伽垫这类踩得上去的不算障碍
    if (pl.kind === 'rug' || pl.kind === 'yoga_mat' || pl.kind === 'mat') continue
    rects.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h, id: pl.id, label: pl.label })
  }
  for (const fx of project.fixtures ?? []) {
    const b = fx.bounds
    if (!b) continue
    rects.push({ x: b.x, y: b.y, w: b.w, h: b.h, id: fx.id, label: fx.label })
  }
  return rects
}

/**
 * 门的通行口。两种 layoutMode 的 openings 形状不一样,得分开取:
 * - **wallGraph**(扫描来的):派生的 door 只有 `pathD`(开门弧线),没有 rect ——
 *   位置只能回到 graphOpenings 沿宿主边按 offsetIn 算。
 * - **parametric508**(手工的):openings 带 rect/hitRect,直接取中心。
 */
function doorGates(project) {
  const disabled = new Set(project.layoutConfig?.disabledOpenings ?? [])
  const gates = []
  const graph = project.wallGraph
  if (graph && project.graphOpenings?.length) {
    const vById = Object.fromEntries(graph.vertices.map((v) => [v.id, v]))
    for (const op of project.graphOpenings) {
      if (op.type !== 'door' || op.hidden || disabled.has(op.id)) continue
      const edge = graph.edges.find((e) => e.id === op.edgeId)
      const a = edge && vById[edge.a]
      const b = edge && vById[edge.b]
      if (!a || !b) continue
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (!len) continue
      const t = ((op.offsetIn + op.spanIn / 2) * PX_PER_IN) / len
      gates.push({
        id: op.id,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        spanIn: op.spanIn,
        dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
      })
    }
    return gates
  }
  for (const op of project.openings ?? []) {
    if (op.type !== 'door' || disabled.has(op.id)) continue
    const r = op.hitRect ?? op.rect
    if (!r) continue
    // 门洞是扁矩形:长边是门宽方向,短边是墙厚方向
    const horizontal = r.w >= r.h
    gates.push({
      id: op.id,
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      spanIn: Math.max(r.w, r.h) / PX_PER_IN,
      dir: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
    })
  }
  return gates
}

/** 墙厚方向的放行半径:够打通墙缝,又不会误开旁边的墙 */
const GATE_ACROSS_PX = 18

/**
 * 点是否在门洞内。沿墙方向按门宽、垂直方向只放墙厚那一点点 ——
 * 用圆形半径会把门附近的**其他**墙一起开了(洗衣间北墙就这么被误开过)。
 */
function inGate(p, g) {
  const dx = p.x - g.x
  const dy = p.y - g.y
  const along = Math.abs(dx * g.dir.x + dy * g.dir.y)
  const across = Math.abs(-dx * g.dir.y + dy * g.dir.x)
  return along <= (g.spanIn / 2) * PX_PER_IN && across <= GATE_ACROSS_PX
}

/**
 * 没有 zones 时(手工的 508 参数户型就没有)拿 rooms 顶上:
 * 每个房间的 bounds 当作矩形分区。通行区/承重墙不算房间。
 * photo-coverage 也用它 —— 拍照任务和动线分析必须看到同一套分区。
 */
export function roomsAsZones(project) {
  return (project.rooms ?? [])
    .filter((r) => r.kind !== 'structural' && r.bounds)
    .map((r) => ({
      id: r.id,
      // 508 里有无名的过道区,列表上显示成空白很怪
      nameZh: r.nameZh || (r.kind === 'circulation' ? '通道' : '房间'),
      polygon: [
        { x: r.bounds.x, y: r.bounds.y },
        { x: r.bounds.x + r.bounds.w, y: r.bounds.y },
        { x: r.bounds.x + r.bounds.w, y: r.bounds.y + r.bounds.h },
        { x: r.bounds.x, y: r.bounds.y + r.bounds.h },
      ],
    }))
}

/**
 * 栅格化户型。
 * @param {SpatialProject} project
 */
function buildGrid(project) {
  const zones = project.zones?.length ? project.zones : roomsAsZones(project)
  const polys = zones.map((z) => z.polygon)
  const all = polys.flat()
  if (!all.length) return null

  const minX = Math.min(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxX = Math.max(...all.map((p) => p.x))
  const maxY = Math.max(...all.map((p) => p.y))
  const cols = Math.ceil((maxX - minX) / GRID_PX) + 1
  const rows = Math.ceil((maxY - minY) / GRID_PX) + 1

  const rects = obstacleRects(project)
  // walls 两种 layoutMode 都有(hydrate 时派生),比 wallGraph.edges 更通用。
  // 只有 kind==='wall' 是障碍:'gap' 是开口,'threshold' 是门槛(地面过渡条,
  // 人照走不误)—— 把门槛当墙会把洗衣间这类房间整个封死。
  const walls = (project.walls ?? [])
    .filter((w) => w.kind === 'wall' && w.from && w.to)
    .map((w) => ({ a: w.from, b: w.to }))
  const gates = doorGates(project)

  /** 0=区外/墙, 1=可站, 2=家具占据 */
  const cell = new Uint8Array(cols * rows)
  /** 每格所属 zone 下标(-1 无) */
  const zoneOf = new Int16Array(cols * rows).fill(-1)

  const at = (c, r) => ({ x: minX + c * GRID_PX, y: minY + r * GRID_PX })

  // 508 的 rooms 是矩形近似,彼此会重叠(厨房那块矩形盖住了整个玄关) ——
  // 一格归属取**最小**的那个房间:小房间更具体,大房间只是它的背景。
  const polyAreas = polys.map((poly) => Math.abs(shoelace(poly)))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = at(c, r)
      let zi = -1
      let bestArea = Infinity
      for (let k = 0; k < polys.length; k++) {
        if (polyAreas[k] >= bestArea) continue
        if (!pointInPolygon(p, polys[k])) continue
        zi = k
        bestArea = polyAreas[k]
      }
      const onGate = gates.some((g) => inGate(p, g))
      // 门洞格可能落在所有房间矩形之外 —— 508 的房间矩形之间隔着墙厚,
      // 门正卡在那道缝里。不放行的话洗衣间这种房间会与邻居完全隔离。
      if (zi < 0 && !onGate) continue
      if (zi >= 0) zoneOf[r * cols + c] = zi

      if (!onGate) {
        const nearWall = walls.some(
          (w) => distToSegment(p, w.a, w.b) < WALL_HALF_IN * PX_PER_IN,
        )
        if (nearWall) continue // 0 = 墙
      }

      const onFurniture = rects.some(
        (rc) =>
          p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h,
      )
      cell[r * cols + c] = onFurniture ? 2 : 1
    }
  }
  return { cols, rows, minX, minY, cell, zoneOf, gates, rects, zones }
}

/**
 * 多源 BFS 距离变换:每个可站格到最近障碍(家具/墙/区外)的格距。
 * 通道宽度 ≈ 2 × 该距离。
 */
function clearanceField(g) {
  const { cols, rows, cell } = g
  const dist = new Int32Array(cols * rows).fill(-1)
  const queue = []
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] !== 1) {
      dist[i] = 0
      queue.push(i)
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    const c = i % cols
    const r = (i / cols) | 0
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = nr * cols + nc
      if (dist[ni] !== -1) continue
      dist[ni] = dist[i] + 1
      queue.push(ni)
    }
  }
  return dist
}

const NEIGH8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * 最宽路径(widest path / maximin):从 start 到每格,走法有很多种,
 * 取「路径上最窄处最宽」的那条 —— 人就是这么走路的,能绕开缝隙就绕开。
 *
 * 这是瓶颈判据的关键:家具与墙之间 12in 的缝隙不是瓶颈(绕一下就过去了),
 * 只有**绕无可绕**的窄处才是。clearance 值域小,用桶排序代替堆。
 * @returns {{ width: Int32Array, from: Int32Array }} width=到该格的路径瓶颈(格距)
 */
function widestPath(g, dist, start) {
  const { cols, rows, cell } = g
  const width = new Int32Array(cols * rows).fill(-1)
  const from = new Int32Array(cols * rows).fill(-1)
  if (start < 0) return { width, from }
  let maxC = 0
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxC) maxC = dist[i]
  /** @type {number[][]} */
  const buckets = Array.from({ length: maxC + 1 }, () => [])
  width[start] = dist[start]
  buckets[dist[start]].push(start)
  for (let w = maxC; w >= 0; w--) {
    while (buckets[w].length) {
      const i = buckets[w].pop()
      if (width[i] !== w) continue // 已被更宽的路径更新过
      const c = i % cols
      const r = (i / cols) | 0
      for (const [dc, dr] of NEIGH8) {
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = nr * cols + nc
        if (cell[ni] !== 1) continue
        const nw = Math.min(w, dist[ni])
        if (nw > width[ni]) {
          width[ni] = nw
          from[ni] = i
          buckets[nw].push(ni)
        }
      }
    }
  }
  return { width, from }
}

/** 从若干起点做 BFS,返回可达标记 */
function reachableFrom(g, starts) {
  const { cols, rows, cell } = g
  const seen = new Uint8Array(cols * rows)
  const queue = []
  for (const i of starts) {
    if (cell[i] === 1 && !seen[i]) {
      seen[i] = 1
      queue.push(i)
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    const c = i % cols
    const r = (i / cols) | 0
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = nr * cols + nc
      if (seen[ni] || cell[ni] !== 1) continue
      seen[ni] = 1
      queue.push(ni)
    }
  }
  return seen
}

/** 某点附近的可站格下标(找不到返回 []) */
function cellsNear(g, x, y, radiusPx) {
  const out = []
  const { cols, rows, minX, minY, cell } = g
  const rad = Math.ceil(radiusPx / GRID_PX)
  const c0 = Math.round((x - minX) / GRID_PX)
  const r0 = Math.round((y - minY) / GRID_PX)
  for (let r = r0 - rad; r <= r0 + rad; r++) {
    for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue
      const i = r * cols + c
      if (cell[i] === 1) out.push(i)
    }
  }
  return out
}

/**
 * 全屋动线与利用率分析。
 * @param {SpatialProject} project
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   zoneStats: Array<{ zoneId: string, nameZh: string, areaSqft: number, furnitureSqft: number, freeSqft: number, usedRatio: number, tightRatio: number }>,
 *   bottlenecks: Array<{ x: number, y: number, widthIn: number, zoneId: string|null, nameZh: string|null }>,
 *   blockedDoors: Array<{ id: string, reason: string }>,
 *   isolatedZones: Array<{ zoneId: string, nameZh: string }>,
 *   totals: { areaSqft: number, freeSqft: number, usedRatio: number },
 * }}
 */
export function analyzeCirculation(project) {
  const empty = {
    ok: false,
    zoneStats: [],
    bottlenecks: [],
    blockedDoors: [],
    isolatedZones: [],
    totals: { areaSqft: 0, freeSqft: 0, usedRatio: 0 },
  }
  const g = buildGrid(project)
  if (!g) return { ...empty, reason: '没有房间数据,先从 iPhone 扫描或手动画分区' }
  const { cols, rows, cell, zoneOf, minX, minY, zones, gates, rects } = g

  const dist = clearanceField(g)

  // 门是建筑固定件:32in 的标准门再怎么整理也拓不宽,不该被算成瓶颈
  // (否则每道门都报一次,把真正被家具卡住的地方淹没)。
  // 把门洞内格子的余量抬到舒适线,让最宽路径不因过门而降级。
  const gateBoost = Math.ceil(CLEARANCE.comfortable / 2 / GRID_IN)
  /** 门洞格:选区代表点时要排掉 —— 门口敞亮不代表屋里走得动 */
  const gateCells = new Set()
  for (const gate of gates) {
    for (const i of cellsNear(g, gate.x, gate.y, (gate.spanIn / 2) * PX_PER_IN)) {
      gateCells.add(i)
      if (dist[i] > 0) dist[i] = Math.max(dist[i], gateBoost)
    }
  }

  const cellSqft = (GRID_IN / 12) ** 2

  // 每区统计
  const zoneStats = zones.map((z, zi) => {
    let free = 0
    let furniture = 0
    let tight = 0
    let maxClear = 0
    for (let i = 0; i < cell.length; i++) {
      if (zoneOf[i] !== zi) continue
      if (cell[i] === 1) {
        free++
        if (dist[i] * GRID_IN * 2 < CLEARANCE.tight) tight++
        // 开阔度:区内最大空旷圆直径。门洞格被 gateBoost 抬过,不算 ——
        // 门口敞亮不代表屋里有整块可活动的负空间
        if (!gateCells.has(i) && dist[i] > maxClear) maxClear = dist[i]
      } else if (cell[i] === 2) furniture++
    }
    const area = (free + furniture) * cellSqft
    return {
      zoneId: z.id,
      nameZh: z.nameZh,
      areaSqft: round1(area),
      furnitureSqft: round1(furniture * cellSqft),
      freeSqft: round1(free * cellSqft),
      usedRatio: area > 0 ? round2(furniture / (free + furniture)) : 0,
      tightRatio: free > 0 ? round2(tight / free) : 0,
      maxClearIn: Math.round(maxClear * GRID_IN * 2),
    }
  })

  // 可达性起点:最大分区里**最开阔**的一格(必在主通道上)。
  // ⚠️ 不能拿门口当起点 —— 那样「从门口能不能走到门口」永远为真,堵门永远抓不到。
  let biggestZi = 0
  zoneStats.forEach((z, i) => {
    if (z.areaSqft > zoneStats[biggestZi].areaSqft) biggestZi = i
  })
  let start = -1
  let bestClear = -1
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] !== 1 || zoneOf[i] !== biggestZi) continue
    if (dist[i] > bestClear) {
      bestClear = dist[i]
      start = i
    }
  }
  const seen =
    start >= 0 ? reachableFrom(g, [start]) : new Uint8Array(cols * rows)

  // 堵门:门口那格本身被家具压住,或从主通道根本走不过去
  const blockedDoors = []
  for (const gate of gates) {
    const c = Math.round((gate.x - minX) / GRID_PX)
    const r = Math.round((gate.y - minY) / GRID_PX)
    const gi = r * cols + c
    const inRange = c >= 0 && r >= 0 && c < cols && r < rows
    if (inRange && cell[gi] === 2) {
      blockedDoors.push({ id: gate.id, reason: '门口被家具占住' })
      continue
    }
    const near = cellsNear(g, gate.x, gate.y, GRID_PX * 2)
    if (!near.length) {
      blockedDoors.push({ id: gate.id, reason: '门口被家具占住' })
    } else if (!near.some((i) => seen[i])) {
      blockedDoors.push({ id: gate.id, reason: '从主通道走不到这道门' })
    }
  }

  // 走不进去的区。可站面积 < 6 sqft 的不报:那是柜子/设备位(508 的洗衣机柜
  // 就塞了两台机器),人本来就不进去,报「走不进去」是误导。
  const isolatedZones = []
  zones.forEach((z, zi) => {
    if ((zoneStats[zi]?.freeSqft ?? 0) < 6) return
    let hasFree = false
    let hasSeen = false
    for (let i = 0; i < cell.length; i++) {
      if (zoneOf[i] !== zi || cell[i] !== 1) continue
      hasFree = true
      if (seen[i]) {
        hasSeen = true
        break
      }
    }
    if (hasFree && !hasSeen) isolatedZones.push({ zoneId: z.id, nameZh: z.nameZh })
  })

  // 瓶颈:走到每个区的「活动中心」(区内最开阔那格)要挤过多窄的地方。
  // 取最开阔处而非任意格:贴着墙站的地方余量本来就小,那不是动线问题;
  // 而客厅被沙发与柜子夹住时,连最开阔处也只剩一条窄缝 —— 那才要报。
  const { width, from } = widestPath(g, dist, start)
  /** @type {Map<string, {x:number,y:number,widthIn:number,zoneId:string|null,nameZh:string|null}>} */
  const perZone = new Map()
  zones.forEach((z, zi) => {
    let best = -1
    for (let i = 0; i < cell.length; i++) {
      if (zoneOf[i] !== zi || cell[i] !== 1 || width[i] < 0) continue
      if (gateCells.has(i)) continue
      if (best < 0 || dist[i] > dist[best]) best = i
    }
    if (best < 0) return
    const widthIn = width[best] * GRID_IN * 2
    if (widthIn >= CLEARANCE.tight) return
    // 卡点:从代表格回溯最宽路径,路径上最窄的那格就是罪魁
    let narrow = best
    for (let i = best; i >= 0; i = from[i]) {
      if (dist[i] < dist[narrow]) narrow = i
      if (from[i] < 0) break
    }
    const nx = minX + (narrow % cols) * GRID_PX
    const ny = minY + (((narrow / cols) | 0)) * GRID_PX
    perZone.set(z.id, {
      x: nx,
      y: ny,
      widthIn: Math.round(widthIn),
      zoneId: z.id,
      nameZh: z.nameZh,
      // 「拓宽通道」是废话 —— 得说清楚挪哪件、挪多少
      blockers: blockersAt(nx, ny, widthIn, rects),
    })
  })
  const bottlenecks = [...perZone.values()].sort((a, b) => a.widthIn - b.widthIn)

  const areaSqft = round1(zoneStats.reduce((s, z) => s + z.areaSqft, 0))
  const freeSqft = round1(zoneStats.reduce((s, z) => s + z.freeSqft, 0))
  return {
    ok: true,
    zoneStats,
    bottlenecks,
    blockedDoors,
    isolatedZones,
    totals: {
      areaSqft,
      freeSqft,
      usedRatio: areaSqft > 0 ? round2((areaSqft - freeSqft) / areaSqft) : 0,
    },
  }
}

/**
 * 卡住这个瓶颈的是哪两件家具,各自让开多少就够。
 *
 * 「把家具挪开」这种话等于没说 —— 人站在屋里也不知道是挪沙发还是挪柜子、
 * 挪一寸还是挪一尺。取瓶颈点两侧最近的家具,算出补齐到舒适通道所缺的距离:
 * 让**任意一件**让开这么多就够(不是每件都挪)。
 *
 * @param {number} x 瓶颈点
 * @param {number} y
 * @param {number} widthIn 此处现有通道宽
 * @param {{x:number,y:number,w:number,h:number,id:string,label:string}[]} rects
 * @returns {Array<{ id: string, label: string, moveIn: number }>}
 */
function blockersAt(x, y, widthIn, rects) {
  const needIn = Math.max(0, CLEARANCE.comfortable - widthIn)
  if (!needIn) return []
  // 瓶颈点半径内的家具就是元凶:通道窄正是因为它们夹着
  const reach = (CLEARANCE.comfortable / 2 + 6) * PX_PER_IN
  return rects
    .map((r) => {
      const cx = Math.max(r.x, Math.min(r.x + r.w, x))
      const cy = Math.max(r.y, Math.min(r.y + r.h, y))
      return { r, d: Math.hypot(cx - x, cy - y) }
    })
    .filter((e) => e.d <= reach)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map((e) => ({
      id: e.r.id,
      label: e.r.label ?? '家具',
      moveIn: Math.round(needIn),
    }))
}

/** 多边形有向面积×2 的绝对值/2(鞋带公式) */
function shoelace(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

const round1 = (v) => Math.round(v * 10) / 10
const round2 = (v) => Math.round(v * 100) / 100
