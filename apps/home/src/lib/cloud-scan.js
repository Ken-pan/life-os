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
 * 全流程:拉 payload → 校验 → 照片落库 → 组装项目。
 * 调用方拿到 project 后自行走 applyCloudScan(确认/撤销在 UI 层)。
 * @param {string} id
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ project: SpatialProject, photos: { total: number, failed: number } }>}
 */
export async function pullScan(id, onProgress) {
  const payload = await fetchScanPayload(id)
  const invalid = validateScanPayload(payload)
  if (invalid) throw new Error(invalid)
  const photos = await resolveScanPhotos(payload, onProgress)
  const project = buildProjectFromScan(payload)
  return { project, photos }
}
