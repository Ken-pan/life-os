/**
 * 云端扫描拉取(HOME.SYNC.4 · iOS HomeScan → 网页端) —— IO 层。
 *
 * iOS 扫描应用(ios/home-scan)把 RoomPlan 扫描转成 HomeOS plan-px 格式写进
 * home.scans(payload jsonb,契约 formatVersion 1,见 apps/home/supabase/README.md),
 * 照片放私有桶 home-scan-photos。这里负责:列表 → 拉取 → 照片落 IndexedDB
 * (photoRef 仅本机唯一,必须重铸)。纯校验/组装在 spatial/scan-payload.js。
 *
 * ⚠️ 不走 importLayoutJson —— 那条路只吃 wallGraph/graphOpenings/layoutConfig,
 * 会静默丢弃 zones/placements/fixtures/viewpoints(扫描的主要价值所在)。
 */
import { supabase } from './supabase.js'
import { putPhoto } from './photo-store.js'
import {
  validateScanPayload,
  buildProjectFromScan,
} from './spatial/scan-payload.js'
import {
  mapScanIntoLayout,
  mergeViewpointsOnly,
  mergeFurnitureAndViewpoints,
  describeReplacements,
} from './spatial/scan-merge.js'

export { validateScanPayload, buildProjectFromScan }

const BUCKET = 'home-scan-photos'
const SIGNED_URL_TTL_S = 3600

/** @typedef {import('./spatial/types.js').SpatialProject} SpatialProject */

/**
 * @typedef {object} ScanRow
 * @property {string} id
 * @property {string} [label]
 * @property {string} [device]
 * @property {number} updated_at 客户端毫秒
 */

/** @returns {Promise<ScanRow[]>} */
export async function listScans() {
  const { data, error } = await supabase
    .schema('home')
    .from('scans')
    .select('id, label, device, updated_at')
    .eq('deleted', false)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`拉取扫描列表失败:${error.message}`)
  return data ?? []
}

/**
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function fetchScanPayload(id) {
  const { data, error } = await supabase
    .schema('home')
    .from('scans')
    .select('payload')
    .eq('id', id)
    .eq('deleted', false)
    .single()
  if (error) throw new Error(`拉取扫描失败:${error.message}`)
  return data?.payload
}

/**
 * 把 payload 里带 photoPath 的机位照片逐张下载进 IndexedDB,重铸 photoRef。
 * 逐张串行(照片可能几十张,并发签名+下载会拥塞),失败的照片跳过并计数,
 * 机位本身保留(变成无照片视角)。
 * @param {any} payload 会被就地更新(viewpoints[].photoRef)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ total: number, failed: number }>}
 */
export async function resolveScanPhotos(payload, onProgress) {
  const viewpoints = payload?.homeos?.viewpoints ?? []
  const withPhoto = viewpoints.filter((vp) => vp.photoPath)
  let done = 0
  let failed = 0
  for (const vp of withPhoto) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(vp.photoPath, SIGNED_URL_TTL_S)
      if (error || !data?.signedUrl) throw error ?? new Error('无签名 URL')
      const resp = await fetch(data.signedUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const { ref } = await putPhoto(blob)
      vp.photoRef = ref
    } catch {
      failed += 1
    }
    done += 1
    onProgress?.(done, withPhoto.length)
  }
  return { total: withPhoto.length, failed }
}

/**
 * 拉取模式:
 * - `photos` —— 日常。只把机位照片/状态并进来,户型与家具一概不动。
 * - `furniture` —— 初始摆家具。照片 + 把实测家具摆进现有户型(墙体仍不动)。
 * - `replace` —— 整包替换成扫描的户型。**慎用**:RoomPlan 有漂移,
 *   手工量过的户型通常比它准。
 * @typedef {'photos' | 'furniture' | 'replace'} PullMode
 */

/**
 * 全流程:拉 payload → 校验 → 照片落库 → 按模式并进当前户型。
 * 调用方拿到 project 后自行走 applyCloudScan(确认/撤销在 UI 层)。
 *
 * ⚠️ 默认**不碰户型**:墙体/房间/储藏区都是用户一寸寸量的,比扫描准。
 * @param {SpatialProject} current 当前户型
 * @param {string} id
 * @param {{ mode?: PullMode, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<{
 *   project: SpatialProject,
 *   photos: { total: number, failed: number },
 *   report: { mapped: number, skipped: number, rooms: any[] } | null,
 *   replaced: Array<{ label: string, byLabel: string, movedFt: number }>,
 * }>}
 */
export async function pullScan(current, id, opts = {}) {
  const mode = opts.mode ?? 'photos'
  const payload = await fetchScanPayload(id)
  const invalid = validateScanPayload(payload)
  if (invalid) throw new Error(invalid)
  const photos = await resolveScanPhotos(payload, opts.onProgress)

  if (mode === 'replace') {
    return { project: buildProjectFromScan(payload), photos, report: null, replaced: [] }
  }

  const mapped = mapScanIntoLayout(current, payload.homeos)
  if (mode === 'furniture') {
    return {
      project: mergeFurnitureAndViewpoints(current, mapped),
      photos,
      report: mapped.report,
      replaced: describeReplacements(current, mapped),
    }
  }
  return {
    project: mergeViewpointsOnly(current, mapped.viewpoints),
    photos,
    report: { ...mapped.report, mapped: mapped.viewpoints.length },
    replaced: [],
  }
}
