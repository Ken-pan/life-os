/**
 * 照片盲区盘点 —— 回答三个问题:哪些分区系统还「看不清」、该去哪站着、朝哪拍。
 *
 * 此前的采集链路是反的:系统等用户自己去 /plan 摆机位、挂照片、点识别,
 * 大部分时间对家里处于半盲,杂乱指数只能靠几何硬撑。这里把方向倒过来:
 * 由覆盖情况主动生成拍照任务 —— /tidy 顶部给清单,点进 /plan 自动放好
 * 建议机位,用户只负责走过去按快门。
 *
 * 纯函数、无 IO:`now` 由调用方传入(node 单测直接跑,也不让 $derived 里
 * 藏一个隐式时钟)。建议机位只是**建议**,这里不落库 —— 用户在 /plan 上
 * 点开任务才会变成真机位,系统不该趁人不注意往图上塞东西。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */
/** @typedef {import('./types.js').SpatialViewpoint} SpatialViewpoint */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */

import { pointInPolygon, zoneCentroid } from './zones.js'
import { headingFromPoint, DEFAULT_FOV_DEG } from './viewpoints.js'
import { roomsAsZones } from './circulation.js'

/** 识别结果多少天后算「过期」—— 房间状态是会变的,上周的照片不能一直当真相 */
export const STALE_DAYS = 7

const DAY_MS = 86400e3

/**
 * @typedef {'missing' | 'noPhoto' | 'undescribed' | 'stale' | 'fresh'} CoverageStatus
 *
 * @typedef {object} CoverageEntry
 * @property {string} zoneId
 * @property {string} nameZh
 * @property {CoverageStatus} status
 * @property {string} reason 人话,直接可展示
 * @property {string} [viewpointId] 已有机位可复用时指向它(去拍/去识别/重拍)
 * @property {{ x: number, y: number, heading: number, fovDeg: number }} [suggestion]
 *   没有机位时的建议站位:点 + 朝向,坐标同 viewpoints
 * @property {number} [daysAgo] 距上次识别多少天(described 过才有)
 */

/** 越小越先办:全盲 > 有机位没照片 > 有照片没识别 > 识别过期 */
const PRIORITY = { missing: 0, noPhoto: 1, undescribed: 2, stale: 3, fresh: 9 }

/** 任务清单上的按钮文案 */
export const COVERAGE_ACTION = /** @type {const} */ ({
  missing: '去拍一张',
  noPhoto: '去拍照',
  undescribed: '去跑识别',
  stale: '去重拍',
})

/** @param {unknown} v @returns {number | null} */
function toMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}

/**
 * 分区里家具的面积加权中心 —— 镜头该对准的地方。
 * 家具越大越该入画;一件家具都没有就退回分区形心。
 * @param {SpatialZone} zone
 * @param {SpatialPlacement[]} placements
 * @returns {{ x: number, y: number } | null}
 */
function furnitureFocus(zone, placements) {
  let sw = 0
  let sx = 0
  let sy = 0
  for (const p of placements) {
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const inZone =
      pointInPolygon({ x: cx, y: cy }, zone.polygon) || p.zoneId === zone.id
    if (!inZone) continue
    const w = Math.max(1, p.w * p.h)
    sw += w
    sx += cx * w
    sy += cy * w
  }
  return sw ? { x: sx / sw, y: sy / sw } : null
}

const round2 = (n) => Math.round(n * 100) / 100

/**
 * 人得站得下:候选点落在任何家具矩形里就不能当站位。
 * placements 的 x/y/w/h 已是轴对齐外框(旋转在落库时换算过)。
 * @param {{ x: number, y: number }} pt
 * @param {SpatialPlacement[]} placements
 */
function insideAnyPlacement(pt, placements) {
  for (const p of placements) {
    if (pt.x >= p.x && pt.x <= p.x + p.w && pt.y >= p.y && pt.y <= p.y + p.h) {
      return true
    }
  }
  return false
}

/**
 * 给一个还没有机位的分区算建议站位。
 *
 * 候选点取多边形每个顶点和每条边中点、向形心收 25%(贴墙站,但离墙一步,
 * 视锥才罩得住房间);凹多边形收进来可能落在区外,pointInPolygon 过滤掉;
 * 落在家具上的也过滤掉 —— 不能让用户「站进床里」。全被家具占满时退回
 * 不过滤的候选:给个能微调的起点,好过什么都不给。
 * 在剩下的候选里选**离拍摄目标最远**的 —— 距离越远视野越全。
 * 朝向 = 站位 → 家具加权中心(没家具就朝分区形心)。
 *
 * 确定性:同一输入永远同一输出(平局取先遇到的候选),没有随机数。
 *
 * @param {SpatialZone} zone
 * @param {SpatialPlacement[]} [placements]
 * @returns {{ x: number, y: number, heading: number, fovDeg: number } | null}
 */
export function suggestCameraForZone(zone, placements = []) {
  const poly = zone?.polygon ?? []
  if (poly.length < 3) return null
  const c = zoneCentroid(poly)
  const target = furnitureFocus(zone, placements) ?? c

  /** @type {{ x: number, y: number }[]} */
  const candidates = []
  for (let i = 0; i < poly.length; i++) {
    const v = poly[i]
    const nxt = poly[(i + 1) % poly.length]
    const mid = { x: (v.x + nxt.x) / 2, y: (v.y + nxt.y) / 2 }
    for (const base of [v, mid]) {
      const pt = {
        x: base.x + (c.x - base.x) * 0.25,
        y: base.y + (c.y - base.y) * 0.25,
      }
      if (pointInPolygon(pt, poly)) candidates.push(pt)
    }
  }
  if (!candidates.length) candidates.push(c)
  const standable = candidates.filter((pt) => !insideAnyPlacement(pt, placements))
  const pool = standable.length ? standable : candidates

  let best = pool[0]
  let bestD = -1
  for (const pt of pool) {
    const d = Math.hypot(pt.x - target.x, pt.y - target.y)
    if (d > bestD) {
      bestD = d
      best = pt
    }
  }
  const heading =
    bestD < 1 ? 0 : Math.round(headingFromPoint(best.x, best.y, target.x, target.y))
  return { x: round2(best.x), y: round2(best.y), heading, fovDeg: DEFAULT_FOV_DEG }
}

/**
 * 盘点全屋照片覆盖:每个分区一条,`needs` 是其中需要行动的子集(按优先级排)。
 *
 * 机位归区**几何优先**(挪过机位后 `zoneId` 不会跟着更新,信坐标不信标签),
 * 落在所有多边形之外时才回退 `zoneId`。
 *
 * @param {SpatialProject} project
 * @param {{ now?: number | string, staleDays?: number }} [opts]
 *   `now` 不传时跳过过期判断(全部按新鲜算)—— UI 记得传 Date.now()
 * @returns {{ zones: CoverageEntry[], needs: CoverageEntry[] }}
 */
export function assessPhotoCoverage(project, opts = {}) {
  const now = toMs(opts.now)
  const staleDays = opts.staleDays ?? STALE_DAYS
  // 508 参数户型没有 zones,和动线分析一样拿 rooms 顶上 —— 两边必须看到同一套分区
  const zones = project?.zones?.length ? project.zones : roomsAsZones(project ?? {})
  const viewpoints = project?.viewpoints ?? []
  const placements = project?.placements ?? []
  if (!zones.length) return { zones: [], needs: [] }

  /** @type {Map<string, SpatialViewpoint[]>} */
  const byZone = new Map(zones.map((z) => [z.id, []]))
  for (const vp of viewpoints) {
    const hit =
      zones.find((z) => pointInPolygon({ x: vp.x, y: vp.y }, z.polygon)) ??
      (vp.zoneId ? zones.find((z) => z.id === vp.zoneId) : null)
    if (hit) byZone.get(hit.id)?.push(vp)
  }

  /** @type {CoverageEntry[]} */
  const entries = zones.map((zone) => {
    const vps = byZone.get(zone.id) ?? []
    /** @type {CoverageEntry} */
    const base = { zoneId: zone.id, nameZh: zone.nameZh, status: 'fresh', reason: '' }

    if (!vps.length) {
      const suggestion = suggestCameraForZone(zone, placements) ?? undefined
      return {
        ...base,
        status: 'missing',
        reason: '这一区还没有任何照片 —— 按建议站位拍一张',
        suggestion,
      }
    }

    const withPhoto = vps.filter((v) => v.photoRef)
    if (!withPhoto.length) {
      // 复用离形心最近的机位:它最可能就是当初想拍这间房的那个
      const c = zoneCentroid(zone.polygon)
      const vp = [...vps].sort(
        (a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y),
      )[0]
      return {
        ...base,
        status: 'noPhoto',
        reason: '机位已放好,还差一张照片',
        viewpointId: vp.id,
      }
    }

    const described = withPhoto.filter((v) => toMs(v.describedAt) != null)
    if (!described.length) {
      return {
        ...base,
        status: 'undescribed',
        reason: '照片已拍,还没跑识别 —— 点一下就好',
        viewpointId: withPhoto[0].id,
      }
    }

    const latest = described.reduce((a, b) =>
      /** @type {number} */ (toMs(a.describedAt)) >= /** @type {number} */ (toMs(b.describedAt)) ? a : b,
    )
    const daysAgo =
      now == null
        ? undefined
        : Math.max(0, Math.floor((now - /** @type {number} */ (toMs(latest.describedAt))) / DAY_MS))
    if (daysAgo != null && daysAgo > staleDays) {
      return {
        ...base,
        status: 'stale',
        reason: `上次识别是 ${daysAgo} 天前 —— 房间早变样了,重拍确认`,
        viewpointId: latest.id,
        daysAgo,
      }
    }
    return {
      ...base,
      status: 'fresh',
      reason: daysAgo != null ? `${daysAgo} 天前识别过` : '识别过',
      viewpointId: latest.id,
      daysAgo,
    }
  })

  const needs = entries
    .filter((e) => e.status !== 'fresh')
    .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status])
  return { zones: entries, needs }
}

/**
 * /plan 深链用:单个分区的覆盖结论(去选哪个机位 / 在哪放新机位)。
 * @param {SpatialProject} project
 * @param {string} zoneId
 * @param {{ now?: number | string, staleDays?: number }} [opts]
 * @returns {CoverageEntry | null}
 */
export function coverageForZone(project, zoneId, opts) {
  const { zones } = assessPhotoCoverage(project, opts)
  return zones.find((z) => z.zoneId === zoneId) ?? null
}
