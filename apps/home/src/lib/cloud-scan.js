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
  scanObjectPhotoEntries,
} from './spatial/scan-payload.js'
import {
  mapScanIntoLayout,
  mergeViewpointsOnly,
  mergeFurnitureWithIdentity,
  describeReplacements,
} from './spatial/scan-merge.js'
import {
  normalizeContainerPayload,
  resolveScanContainers,
  mergeContainerBindings,
} from './spatial/container-scan.js'
import { dhashFromBlob } from './spatial/photo-hash.js'

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

/** 同时在天上飞的照片下载数。3 够把往返延迟叠起来,又不会挤爆弱网 */
const PHOTO_CONCURRENCY = 3

/**
 * 把 payload 里带 photoPath 的照片下载进 IndexedDB,重铸 photoRef。
 * 两类:机位照片(viewpoints[].photoPath)+ 家具抓拍图(placements/fixtures
 * 的 attrs.photoPath,iOS 扫描时自动挑最佳视角裁的)。
 *
 * 签名用 createSignedUrls **一次批量拿全**(几十张照片省几十个串行往返),
 * 下载限并发 3;单张失败跳过并计数,宿主本身保留(机位变无照片视角;
 * 家具只是没缩略图)。
 * @param {any} payload 会被就地更新(viewpoints[].photoRef / attrs.photoRef)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ total: number, failed: number }>}
 */
export async function resolveScanPhotos(payload, onProgress) {
  const viewpoints = payload?.homeos?.viewpoints ?? []
  /** @type {Array<{ path: string, assign: (ref: string) => void }>} */
  const jobs = [
    ...viewpoints
      .filter((vp) => vp.photoPath)
      .map((vp) => ({
        path: vp.photoPath,
        assign: (ref) => {
          vp.photoRef = ref
        },
      })),
    ...scanObjectPhotoEntries(payload),
  ]
  if (!jobs.length) return { total: 0, failed: 0 }

  // 1) 批量签名(单请求)。整批失败(网断/权限)时退化为逐张签名,
  //    让下载环节自己报失败数,而不是这里直接全军覆没。
  /** @type {Map<string, string>} path → signedUrl */
  const signed = new Map()
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(jobs.map((j) => j.path), SIGNED_URL_TTL_S)
    if (error) throw error
    for (const row of data ?? []) {
      // 返回行带 path/signedUrl/error;单行 error 表示该文件不存在或无权
      if (row?.signedUrl && row.path) signed.set(row.path, row.signedUrl)
    }
  } catch {
    /* signed 留空,下面逐张兜底 */
  }

  let done = 0
  let failed = 0
  /** @param {{ path: string, assign: (ref: string) => void }} job */
  const run = async (job) => {
    try {
      let url = signed.get(job.path)
      if (!url) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(job.path, SIGNED_URL_TTL_S)
        if (error || !data?.signedUrl) throw error ?? new Error('无签名 URL')
        url = data.signedUrl
      }
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const { ref } = await putPhoto(blob)
      job.assign(ref)
      // 感知哈希(外观特征,scan-identity 用):失败置 null 不拖垮下载
      if (job.assignHash) {
        const hash = await dhashFromBlob(blob)
        if (hash) job.assignHash(hash)
      }
    } catch {
      failed += 1
    }
    done += 1
    onProgress?.(done, jobs.length)
  }

  // 2) 有界并发下载:固定 3 条工人流水,谁闲谁领下一张
  let next = 0
  const workers = Array.from(
    { length: Math.min(PHOTO_CONCURRENCY, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const job = jobs[next]
        next += 1
        await run(job)
      }
    },
  )
  await Promise.all(workers)
  return { total: jobs.length, failed }
}

/** 往回翻多少次扫描找柜内数据。柜内测量是低频动作,8 次早够覆盖 */
const CONTAINER_SCAN_LOOKBACK = 8

/**
 * @typedef {object} ContainerGroup 一次扫描的柜内数据(原始 JSON)+ 该扫描的 homeos
 * @property {any[]} containers
 * @property {any} [homeos] identity 兜底配准用;拿不到为 null
 */

/** 登录路径:直接从 home.scans + 私有桶拉 @param {string} uid @returns {Promise<{ groups: ContainerGroup[], scansChecked: number }>} */
async function fetchContainerGroupsAuthed(uid) {
  const scans = (await listScans()).slice(0, CONTAINER_SCAN_LOOKBACK)
  /** @type {ContainerGroup[]} */
  const groups = []
  for (const scan of scans) {
    const prefix = `${uid}/${scan.id}`
    const { data: files, error } = await supabase.storage.from(BUCKET).list(prefix)
    if (error || !files?.length) continue
    const names = files
      .map((f) => f?.name ?? '')
      .filter((n) => /^container-.+\.json$/.test(n))
    if (!names.length) continue

    /** @type {any[]} */
    const containers = []
    for (const name of names) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(`${prefix}/${name}`)
      if (dlErr || !blob) continue
      try {
        containers.push(JSON.parse(await blob.text()))
      } catch {
        /* 单份脏 JSON 跳过,别拖垮整次同步 */
      }
    }
    if (!containers.length) continue

    let homeos = null
    try {
      const payload = await fetchScanPayload(scan.id)
      if (!validateScanPayload(payload)) homeos = payload.homeos
    } catch {
      /* homeos 只是兜底输入,拿不到时 id 直连仍可用 */
    }
    groups.push({ containers, homeos })
  }
  return { groups, scansChecked: scans.length }
}

/** 开发免登录路径:vite 中间件持钥代拉(见 vite.config.js /__dev/container-scans) */
async function fetchContainerGroupsDev() {
  const res = await fetch('/__dev/container-scans')
  if (!res.ok) throw new Error('未登录,拉不到柜内数据')
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('未登录,拉不到柜内数据')
  return {
    groups: rows.map((r) => ({ containers: r?.containers ?? [], homeos: r?.homeos ?? null })),
    scansChecked: rows.length,
  }
}

/**
 * 拉取全部柜内实测(iOS「柜内扫描」上传的 container-{placementId}.json),
 * 匹配到当前户型的储藏区。**不写任何东西** —— 返回绑定表交给 state 层落库。
 *
 * 匹配路径见 spatial/container-scan.js 头注:id 直连优先,identity 兜底
 * (兜底前先用 mapScanIntoLayout 把该扫描的家具配准进家坐标系)。
 * 扫描新→旧遍历,同一件家具新数据赢。
 *
 * @param {SpatialProject} project 当前户型(hydrate 过的)
 * @returns {Promise<{
 *   byZoneId: Record<string, import('./spatial/types.js').ContainerScanInfo>,
 *   bound: any[], noZone: any[], unmatched: number, scansChecked: number,
 * }>}
 */
export async function pullContainerScans(project) {
  const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: null }))
  const uid = userData?.user?.id
  let fetched
  if (uid) {
    fetched = await fetchContainerGroupsAuthed(uid)
  } else if (import.meta.env.DEV) {
    fetched = await fetchContainerGroupsDev()
  } else {
    throw new Error('未登录,拉不到柜内数据')
  }

  /** @type {any[][]} 每次扫描的绑定(新→旧) */
  const perScan = []
  for (const group of fetched.groups) {
    const containers = group.containers
      .map((raw) => normalizeContainerPayload(raw))
      .filter(Boolean)
    if (!containers.length) continue

    // identity 兜底要用配准进家坐标系的扫描家具;配准失败传 [],
    // id 直连(replace 模式拉过这次扫描)仍然可用
    let scanPlacements = []
    try {
      if (group.homeos) {
        const mapped = mapScanIntoLayout(project, group.homeos)
        scanPlacements = mapped.placements?.length ? mapped.placements : []
      }
    } catch {
      /* 见上 */
    }

    perScan.push(
      resolveScanContainers({
        containers,
        scanPlacements,
        projectPlacements: project.placements ?? [],
        zones: project.storageZones ?? [],
      }),
    )
  }
  return { ...mergeContainerBindings(perScan), scansChecked: fetched.scansChecked }
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
    const merged = mergeFurnitureWithIdentity(current, mapped)
    return {
      project: merged.project,
      photos,
      report: mapped.report,
      replaced: describeReplacements(current, mapped),
      identity: merged.identity,
    }
  }
  return {
    project: mergeViewpointsOnly(current, mapped.viewpoints),
    photos,
    report: { ...mapped.report, mapped: mapped.viewpoints.length },
    replaced: [],
    identity: null,
  }
}
