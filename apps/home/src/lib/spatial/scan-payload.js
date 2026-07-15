/**
 * iOS HomeScan 扫描 payload(home.scans.payload jsonb,formatVersion 1)的
 * 纯校验与组装 —— 无任何 IO/supabase 依赖,node 单测直接跑。
 * 契约三处同源:ios/home-scan/HomeScan/Convert/HomeOSModels.swift ·
 * apps/home/supabase/README.md · 这里。
 */
import { buildFromWallGraph } from './wall-graph.js'

export const SCAN_PAYLOAD_FORMAT_VERSION = 1

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/**
 * 返回 null 表示合法,否则返回给用户看的错误文案。
 * @param {any} payload
 * @returns {string | null}
 */
export function validateScanPayload(payload) {
  if (!payload || typeof payload !== 'object') return '扫描数据为空'
  if (payload.formatVersion !== SCAN_PAYLOAD_FORMAT_VERSION) {
    return `扫描格式版本不支持(${payload.formatVersion}),请更新网页端或重新上传`
  }
  const h = payload.homeos
  if (!h?.wallGraph?.vertices?.length || !h.wallGraph.edges?.length) {
    return '扫描缺少墙体图'
  }
  if (typeof h.wallGraph.pxPerFt !== 'number' || h.wallGraph.pxPerFt <= 0) {
    return '扫描缺少比例(pxPerFt)'
  }
  if (!Array.isArray(h.zones) || h.zones.length === 0) {
    return '扫描缺少分区(房间会回落到默认户型),请用新版 HomeScan 重新上传'
  }
  return null
}

/**
 * payload → 完整 SpatialProject。机位照片必须已换成本地 photoRef
 * (photoPath 在 cloud-scan.js 的 resolveScanPhotos 里消化),这里只丢弃该字段。
 * storageZones 有意置空 —— 其 placementId 引用在新扫描里已不存在。
 * @param {any} payload 已通过 validateScanPayload
 * @returns {SpatialProject}
 */
export function buildProjectFromScan(payload) {
  const h = payload.homeos
  const meta = {
    id: h.meta?.id ?? `scan-${String(payload.scanId ?? 'unknown')}`,
    nameZh: h.meta?.nameZh ?? '扫描户型',
    ...h.meta,
    sourceNote: h.meta?.sourceNote ?? 'iOS HomeScan · RoomPlan 实测',
  }
  return buildFromWallGraph(h.wallGraph, {
    graphOpenings: h.graphOpenings ?? [],
    zones: h.zones ?? [],
    placements: h.placements ?? [],
    fixtures: h.fixtures ?? [],
    viewpoints: (h.viewpoints ?? []).map(stripPhotoPath),
    meta,
  })
}

/** @param {any} vp */
function stripPhotoPath(vp) {
  const { photoPath, ...rest } = vp
  return rest
}
