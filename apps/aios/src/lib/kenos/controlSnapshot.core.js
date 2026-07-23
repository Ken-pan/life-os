/**
 * Control Center 只读快照(stale-while-revalidate 的持久层)。
 *
 * 目标:「今日」等 tab 冷启秒开 —— 先渲染上次成功刷新的 projection(标 stale),
 * 后台刷新逐源覆盖,不再每次白屏现场拉。
 *
 * 安全边界:
 * - 快照按 userId 归属,水合时不匹配即拒绝(fail-closed);
 * - 键名走 aios_* 前缀,登出/换号由 clientSessionCleanup fail-closed 全清;
 * - 只存已裁剪的展示数据(条数上限),不存 shadow/flags/capabilities 等运行时派生。
 */

export const CONTROL_SNAPSHOT_KEY = 'aios_control_snapshot_v1'
export const CONTROL_SNAPSHOT_VERSION = 1
/** 超过该年龄的快照按无效处理(展示两天前的「今日」比骨架更误导)。 */
export const CONTROL_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000

const LIST_CAP = 30

/** 持久化的 source 键(与 CONTROL.sources 对齐;运行时派生的 side 键不存)。 */
const SNAPSHOT_SOURCE_KEYS = Object.freeze([
  'today',
  'inbox',
  'approvals',
  'activity',
  'focus',
  'work',
])

/** 可作为快照基底的 source 状态(有真实数据语义)。 */
const SNAPSHOTTABLE = new Set(['ready', 'empty', 'partial', 'stale'])

const capList = (items) =>
  Array.isArray(items) ? items.slice(0, LIST_CAP) : []

/**
 * 从 CONTROL 形状构建可持久化快照;不可快照(demo / 无归属 / 无可读源)返回 null。
 * @param {{
 *   demo?: boolean,
 *   summary?: object|null,
 *   inbox?: object[], approvals?: object[], activities?: object[],
 *   focusContexts?: object[], workProjects?: object[], workCards?: object[],
 *   sources?: Record<string, { status?: string, source?: string, lastUpdated?: number, availableCount?: number }>,
 * }} control
 * @param {{ userId?: string, now?: number }} [opts]
 */
export function buildControlSnapshot(control, { userId = '', now = Date.now() } = {}) {
  if (!control || control.demo) return null
  const uid = String(userId || '').trim()
  if (!uid) return null
  const sources = control.sources || {}
  const readable = SNAPSHOT_SOURCE_KEYS.some((key) =>
    SNAPSHOTTABLE.has(sources[key]?.status),
  )
  if (!readable) return null
  const sourceMeta = {}
  for (const key of SNAPSHOT_SOURCE_KEYS) {
    const s = sources[key]
    if (!s || !SNAPSHOTTABLE.has(s.status)) continue
    sourceMeta[key] = {
      source: s.source || 'unknown',
      lastUpdated: Number(s.lastUpdated) || 0,
      availableCount: Number(s.availableCount) || 0,
    }
  }
  return {
    v: CONTROL_SNAPSHOT_VERSION,
    userId: uid,
    savedAt: now,
    summary: control.summary ?? null,
    inbox: capList(control.inbox),
    approvals: capList(control.approvals),
    activities: capList(control.activities),
    focusContexts: capList(control.focusContexts),
    workProjects: capList(control.workProjects),
    workCards: capList(control.workCards),
    sourceMeta,
  }
}

/**
 * 校验并规划快照水合。返回 null(不可用)或
 * { fields, sources }:fields 直接覆盖 CONTROL 数据字段;
 * sources 为「stale 降级」后的 source 状态(仅覆盖快照里存在的键)。
 * @param {unknown} raw JSON.parse 后的快照
 * @param {{ userId?: string, now?: number, maxAgeMs?: number, staleMessage?: string }} [opts]
 */
export function planControlHydration(
  raw,
  {
    userId = '',
    now = Date.now(),
    maxAgeMs = CONTROL_SNAPSHOT_MAX_AGE_MS,
    staleMessage = '正在显示上次同步的数据,后台刷新中。',
  } = {},
) {
  if (!raw || typeof raw !== 'object') return null
  const snap = /** @type {Record<string, any>} */ (raw)
  if (snap.v !== CONTROL_SNAPSHOT_VERSION) return null
  const uid = String(userId || '').trim()
  // fail-closed:没有归属或归属不符,一律拒绝水合
  if (!uid || snap.userId !== uid) return null
  const savedAt = Number(snap.savedAt) || 0
  if (!savedAt || now - savedAt > maxAgeMs || savedAt > now + 60_000) return null
  const meta =
    snap.sourceMeta && typeof snap.sourceMeta === 'object' ? snap.sourceMeta : {}
  /** @type {Record<string, object>} */
  const sources = {}
  for (const key of SNAPSHOT_SOURCE_KEYS) {
    const m = meta[key]
    if (!m || typeof m !== 'object') continue
    sources[key] = {
      status: 'stale',
      source: String(m.source || 'unknown'),
      message: staleMessage,
      lastUpdated: Number(m.lastUpdated) || savedAt,
      stale: true,
      retryable: true,
      availableCount: Number(m.availableCount) || 0,
    }
  }
  if (!Object.keys(sources).length) return null
  return {
    savedAt,
    fields: {
      summary: snap.summary ?? null,
      inbox: capList(snap.inbox),
      approvals: capList(snap.approvals),
      activities: capList(snap.activities),
      focusContexts: capList(snap.focusContexts),
      workProjects: capList(snap.workProjects),
      workCards: capList(snap.workCards),
    },
    sources,
  }
}

/**
 * 刷新进行中的 source 过渡态:已有可读数据的源保持内容可见、只标 stale(后台刷新),
 * 没有数据的源才回 loading(首次加载显示骨架)。消除「每次刷新都闪骨架」。
 * @param {{ status?: string, source?: string, lastUpdated?: number, availableCount?: number, message?: string }} state 当前 source 状态
 * @param {boolean} hasRetainedData 该源对应的数据字段当前是否非空
 */
export function refreshTransitionSourceState(state, hasRetainedData) {
  const source = state?.source || 'unknown'
  const lastUpdated = Number(state?.lastUpdated) || 0
  if (hasRetainedData && SNAPSHOTTABLE.has(state?.status)) {
    return {
      status: 'stale',
      source,
      message: '后台刷新中。',
      lastUpdated,
      stale: true,
      retryable: false,
      availableCount: Number(state?.availableCount) || 0,
    }
  }
  return {
    status: 'loading',
    source,
    message: '',
    lastUpdated,
    stale: false,
    retryable: false,
    availableCount: 0,
  }
}
