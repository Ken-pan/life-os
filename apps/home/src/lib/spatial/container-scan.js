/**
 * 柜内实测消费 —— 把 iOS 柜内扫描(能力11)的桶内 JSON 变成储藏区上的
 * `container` 字段(纯函数,无 IO,node 单测直接跑;IO 在 cloud-scan.js)。
 *
 * 契约:`{uid}/{scanId}/container-{placementId}.json`,formVersion 1,
 * 见 apps/home/supabase/README.md「柜内扫描」节;iOS 侧同源
 * ios/home-scan/HomeScan/Services/ContainerGeometry.swift。
 *
 * ⚠️ 绑定不能只按 id 直连:JSON 里的 placementId 是**那次扫描**的家具 id,
 * 而网页端 furniture 合并对认出的旧家具**保留旧 id**。所以:
 *   1. 先试 id 直连(replace 模式拉过这次扫描时,id 就是同一套);
 *   2. 直连不上,把该扫描的家具(已过 mapScanIntoLayout 配准进家坐标系)
 *      用 scan-identity 匹配到当前户型的家具,再顺着 placementId 找储藏区。
 */
import { matchScanObjects } from './scan-identity.js'

/** @typedef {import('./types.js').ContainerScanInfo} ContainerScanInfo */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */

/** 内腔单维合法范围(英寸):1in–140in(3.5m,与 iOS 端 dimRange 一致) */
const DIM_IN = [1, 140]

/** @param {unknown} v */
const finitePos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0

/** @param {unknown} raw @returns {{ w: number, d: number, h: number } | null} */
function normalizeDims(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { w, d, h } = /** @type {any} */ (raw)
  if (![w, d, h].every(finitePos)) return null
  if ([w, d, h].some((v) => v < DIM_IN[0] || v > DIM_IN[1])) return null
  return { w, d, h }
}

/**
 * 校验并裁剪一份桶里的柜内 JSON。白名单字段 —— 外部 JSON 原样存进项目会把
 * 说不清的字段糊进 localStorage(与 normalizePurchase 同一个道理)。
 * @param {unknown} raw 解析好的 JSON
 * @returns {(ContainerScanInfo & { placementId: string }) | null} 不合法返回 null
 */
export function normalizeContainerPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  const src = /** @type {any} */ (raw)
  const placementId = String(src.placementId ?? '').trim()
  const scanId = String(src.scanId ?? '').trim()
  const interiorIn = normalizeDims(src.interiorIn)
  if (!placementId || !scanId || !interiorIn) return null

  /** @type {number[]} */
  const shelfHeightsIn = (Array.isArray(src.shelfHeightsIn) ? src.shelfHeightsIn : [])
    .filter((v) => finitePos(v) && v < interiorIn.h)
    .sort((a, b) => a - b)

  /** @type {ContainerScanInfo['compartments']} */
  let compartments = (Array.isArray(src.compartments) ? src.compartments : [])
    .filter(
      (c) =>
        c &&
        typeof c === 'object' &&
        Number.isInteger(c.level) &&
        c.level >= 0 &&
        typeof c.y0In === 'number' &&
        typeof c.y1In === 'number' &&
        c.y1In > c.y0In,
    )
    .map((c) => ({
      level: c.level,
      y0In: c.y0In,
      y1In: c.y1In,
      heightIn: c.y1In - c.y0In,
    }))
    .sort((a, b) => a.level - b.level)
  // 旧/残缺 payload 没有分层就当一整腔 —— 「有柜内实测」不该因此丢掉
  if (!compartments.length) {
    compartments = [{ level: 0, y0In: 0, y1In: interiorIn.h, heightIn: interiorIn.h }]
  }

  /** @type {ContainerScanInfo & { placementId: string }} */
  const out = {
    placementId,
    scanId,
    interiorIn,
    shelfHeightsIn,
    compartments,
  }
  const capturedAt = String(src.capturedAt ?? '').trim()
  if (capturedAt) out.capturedAt = capturedAt
  const measured = normalizeDims(src.measuredInteriorIn)
  if (measured) out.measuredInteriorIn = measured
  if (finitePos(src.interiorVolumeL)) out.volumeL = src.interiorVolumeL
  return out
}

/**
 * @typedef {object} ContainerBinding
 * @property {ContainerScanInfo & { placementId: string }} container
 * @property {'bound'|'no_zone'|'unmatched'} status
 * @property {string} [projectPlacementId] 匹配到的当前户型家具 id
 * @property {string} [placementLabel] 匹配到的家具人话名(报告用)
 * @property {string} [zoneId] status=bound 时:挂到哪个储藏区
 * @property {string} [zoneCode]
 */

/**
 * 把一次扫描的柜内数据落到当前户型:id 直连优先,identity 匹配兜底。
 *
 * @param {object} args
 * @param {Array<ContainerScanInfo & { placementId: string }>} args.containers 该扫描的柜内数据
 * @param {any[]} args.scanPlacements 该扫描的家具(**已配准**进家坐标系;拿不到可传 [])
 * @param {SpatialPlacement[]} args.projectPlacements 当前户型家具
 * @param {SpatialStorageZone[]} args.zones 当前储藏区
 * @returns {ContainerBinding[]}
 */
export function resolveScanContainers({ containers, scanPlacements, projectPlacements, zones }) {
  const projectById = new Map(projectPlacements.map((p) => [p.id, p]))
  const zoneByPlacement = new Map(
    zones.filter((z) => z.placementId).map((z) => [z.placementId, z]),
  )

  // identity 兜底只对「id 直连不上」的那部分跑,一次批量配对
  /** @type {Map<string, string>} 扫描家具 id → 当前户型家具 id */
  const identityMap = new Map()
  const needIdentity = containers.filter((c) => !projectById.has(c.placementId))
  if (needIdentity.length && scanPlacements.length) {
    const wanted = new Set(needIdentity.map((c) => c.placementId))
    const nexts = scanPlacements.filter((p) => wanted.has(p.id))
    if (nexts.length) {
      const match = matchScanObjects(projectPlacements, nexts)
      for (const pair of match.pairs) {
        // possibly_same 保守跳过:把充电器指去别人家的柜子比不指更糟
        if (pair.state === 'possibly_same') continue
        identityMap.set(pair.nextId, pair.prevId)
      }
    }
  }

  return containers.map((container) => {
    const direct = projectById.get(container.placementId)
    const viaIdentity = identityMap.get(container.placementId)
    const target = direct ?? (viaIdentity ? projectById.get(viaIdentity) : undefined)
    if (!target) return { container, status: 'unmatched' }
    const zone = zoneByPlacement.get(target.id)
    if (!zone) {
      return {
        container,
        status: 'no_zone',
        projectPlacementId: target.id,
        placementLabel: target.label,
      }
    }
    return {
      container,
      status: 'bound',
      projectPlacementId: target.id,
      placementLabel: target.label,
      zoneId: zone.id,
      zoneCode: zone.code,
    }
  })
}

/**
 * 跨扫描合并绑定:同一储藏区多次被测(重扫/重测),新的赢。
 * 输入按扫描新→旧排好(listScans 默认序),同 zone 首见即最新。
 * @param {ContainerBinding[][]} perScan 每次扫描的解析结果(新→旧)
 * @returns {{
 *   byZoneId: Record<string, ContainerScanInfo>,
 *   bound: ContainerBinding[],
 *   noZone: ContainerBinding[],
 *   unmatched: number,
 * }}
 */
export function mergeContainerBindings(perScan) {
  /** @type {Record<string, ContainerScanInfo>} */
  const byZoneId = {}
  /** @type {ContainerBinding[]} */
  const bound = []
  /** @type {ContainerBinding[]} */
  const noZone = []
  const seenPlacement = new Set()
  let unmatched = 0
  for (const bindings of perScan) {
    for (const b of bindings) {
      if (b.status === 'unmatched') {
        unmatched += 1
        continue
      }
      // 同一件家具旧扫描的数据不覆盖新扫描的
      if (b.projectPlacementId && seenPlacement.has(b.projectPlacementId)) continue
      if (b.projectPlacementId) seenPlacement.add(b.projectPlacementId)
      if (b.status === 'bound' && b.zoneId) {
        const { placementId: _drop, ...info } = b.container
        byZoneId[b.zoneId] = info
        bound.push(b)
      } else {
        noZone.push(b)
      }
    }
  }
  return { byZoneId, bound, noZone, unmatched }
}

// ---- 展示辅助(储藏区卡片 / 搜索命中共用) ----

/** 英寸 → 取整厘米 */
export const inToCm = (v) => Math.round(v * 2.54)

/** @param {ContainerScanInfo} c @returns {string} 「内 80×35×190 cm · 3 层」 */
export function containerSummary(c) {
  const d = c.interiorIn
  const levels = c.compartments.length
  const base = `内 ${inToCm(d.w)}×${inToCm(d.d)}×${inToCm(d.h)} cm`
  return levels > 1 ? `${base} · ${levels} 层` : base
}

/**
 * 层选项(编辑器下拉):自下而上「第 1 层(高 38cm)」。
 * @param {ContainerScanInfo | undefined} c
 * @returns {Array<{ value: number, label: string }>}
 */
export function levelOptions(c) {
  if (!c) return []
  return c.compartments.map((lv) => ({
    value: lv.level,
    label: `第 ${lv.level + 1} 层(高 ${inToCm(lv.heightIn)}cm)`,
  }))
}

/** @param {number | undefined} level @returns {string} */
export function levelLabel(level) {
  return level === undefined || level === null ? '' : `第 ${level + 1} 层`
}
