/**
 * Kenos 壳偏好 / 空间连续性云同步(aios.shell_state)— 纯函数,零 $lib/$app 依赖。
 * spaceSwitcher.svelte.js 负责状态与触发,cloud.svelte.js 负责 I/O;
 * 本文件锁定 per-key LWW / 墓碑语义,iOS 原生镜像见
 * clients/apple/Apps/Shared/KenosShellStateSync.swift(改契约两处同步)。
 *
 * 行命名空间:
 *   spaces.pinned           → { ids: string[] } 整表 LWW(pin 集合 + 顺序)
 *   spaces.recent           → { ids: string[] } 整表 LWW(最近使用顺序)
 *   spaces.resume.<listKey> → ResumeDescriptor 逐 key LWW,删除走墓碑
 */

export const SHELL_KEY_PINNED = 'spaces.pinned'
export const SHELL_KEY_RECENT = 'spaces.recent'
export const SHELL_RESUME_PREFIX = 'spaces.resume.'

/**
 * @typedef {{ key: string, value: unknown, updated_at: number, deleted?: boolean }} ShellRow
 * @typedef {{ pinnedAt: number, recentAt: number, tombstones: Record<string, number> }} ShellSyncMeta
 * @typedef {import('./spaceSwitcher.core.js').SpaceSwitcherState} SpaceSwitcherState
 */

/** @returns {ShellSyncMeta} */
export function emptyShellSyncMeta() {
  return { pinnedAt: 0, recentAt: 0, tombstones: {} }
}

/** @param {unknown} raw @returns {ShellSyncMeta} */
export function normalizeShellSyncMeta(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {}
  /** @type {Record<string, number>} */
  const tombstones = {}
  if (r.tombstones && typeof r.tombstones === 'object') {
    for (const [key, ts] of Object.entries(r.tombstones)) {
      const ms = Number(ts)
      if (key.startsWith(SHELL_RESUME_PREFIX) && Number.isFinite(ms) && ms > 0)
        tombstones[key] = ms
    }
  }
  return {
    pinnedAt: Number.isFinite(Number(r.pinnedAt)) ? Number(r.pinnedAt) : 0,
    recentAt: Number.isFinite(Number(r.recentAt)) ? Number(r.recentAt) : 0,
    tombstones,
  }
}

/** @param {string | null | undefined} iso @returns {number} 解析失败 → 0 */
export function resumeTimestampMs(iso) {
  const ms = Date.parse(String(iso || ''))
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

/** @param {string[] | undefined} a @param {string[] | undefined} b */
function sameIds(a, b) {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/**
 * 本地变更时间戳记账:persist 前用「上次持久化状态 vs 新状态」判定哪些 key 变了。
 * 远端拉下来的应用走 applyShellRows(直接采信远端时间戳),不走这里,避免 ping-pong。
 *
 * @param {SpaceSwitcherState | null} prev 上次持久化状态(null = 首次,不当作变更)
 * @param {SpaceSwitcherState} next
 * @param {ShellSyncMeta} meta
 * @param {number} [now]
 * @returns {ShellSyncMeta}
 */
export function bumpShellSyncMeta(prev, next, meta, now = Date.now()) {
  const out = {
    pinnedAt: meta.pinnedAt,
    recentAt: meta.recentAt,
    tombstones: { ...meta.tombstones },
  }
  if (prev) {
    if (!sameIds(prev.pinned, next.pinned)) out.pinnedAt = now
    if (!sameIds(prev.recent, next.recent)) out.recentAt = now
    for (const listKey of Object.keys(prev.resume ?? {})) {
      if (!next.resume?.[listKey]) out.tombstones[SHELL_RESUME_PREFIX + listKey] = now
    }
  }
  // 续播重新出现 → 撤销墓碑(以新 descriptor 的 updatedAt 竞争)
  for (const listKey of Object.keys(next.resume ?? {})) {
    delete out.tombstones[SHELL_RESUME_PREFIX + listKey]
  }
  return out
}

/**
 * 把本地状态编成 shell_state 行视图(供 LWW 规划)。
 * pinned/recent 只有真的本地改过(meta 时间戳 > 0)才参与推送竞争,
 * 新设备的空默认不会覆盖云端。
 *
 * @param {SpaceSwitcherState} state
 * @param {ShellSyncMeta} meta
 * @returns {ShellRow[]}
 */
export function buildLocalShellRows(state, meta) {
  /** @type {ShellRow[]} */
  const rows = []
  if (meta.pinnedAt > 0) {
    rows.push({
      key: SHELL_KEY_PINNED,
      value: { ids: [...(state.pinned ?? [])] },
      updated_at: meta.pinnedAt,
    })
  }
  if (meta.recentAt > 0) {
    rows.push({
      key: SHELL_KEY_RECENT,
      value: { ids: [...(state.recent ?? [])] },
      updated_at: meta.recentAt,
    })
  }
  for (const [listKey, descriptor] of Object.entries(state.resume ?? {})) {
    const ts = resumeTimestampMs(/** @type {any} */ (descriptor)?.updatedAt)
    if (!ts) continue
    rows.push({ key: SHELL_RESUME_PREFIX + listKey, value: descriptor, updated_at: ts })
  }
  for (const [key, ts] of Object.entries(meta.tombstones)) {
    rows.push({ key, value: null, updated_at: ts, deleted: true })
  }
  return rows
}

/**
 * per-key LWW 规划:双方逐 key 比时间戳,严格更大的一方赢。
 * @param {ShellRow[]} localRows
 * @param {ShellRow[]} remoteRows
 * @returns {{ toPush: ShellRow[], toApply: ShellRow[] }}
 */
export function planShellStateSync(localRows, remoteRows) {
  const remoteByKey = new Map(remoteRows.map((r) => [r.key, r]))
  const localByKey = new Map(localRows.map((r) => [r.key, r]))
  /** @type {ShellRow[]} */
  const toPush = []
  /** @type {ShellRow[]} */
  const toApply = []

  for (const row of localRows) {
    const remote = remoteByKey.get(row.key)
    const remoteAt = Number(remote?.updated_at ?? 0)
    if (row.updated_at > remoteAt) toPush.push(row)
  }
  for (const remote of remoteRows) {
    const local = localByKey.get(remote.key)
    const localAt = Number(local?.updated_at ?? 0)
    if (Number(remote.updated_at ?? 0) > localAt) toApply.push(remote)
  }
  return { toPush, toApply }
}

/**
 * 把赢家远端行合入本地状态(raw 合并;调用方随后跑 normalizeSpaceSwitcherState
 * 做 owner 绑定 / descriptor 归一 / 截断)。同时回写 meta,让已应用的远端
 * 时间戳成为本地基线,不会被误判成本地新变更再推回去。
 *
 * @param {SpaceSwitcherState} state
 * @param {ShellSyncMeta} meta
 * @param {ShellRow[]} rows planShellStateSync().toApply
 * @returns {{ state: SpaceSwitcherState, meta: ShellSyncMeta }}
 */
export function applyShellRows(state, meta, rows) {
  let next = {
    ...state,
    pinned: [...(state.pinned ?? [])],
    recent: [...(state.recent ?? [])],
    resume: { ...(state.resume ?? {}) },
  }
  const outMeta = {
    pinnedAt: meta.pinnedAt,
    recentAt: meta.recentAt,
    tombstones: { ...meta.tombstones },
  }
  for (const row of rows) {
    const at = Number(row.updated_at ?? 0)
    if (row.key === SHELL_KEY_PINNED) {
      const ids = /** @type {any} */ (row.value)?.ids
      next.pinned = Array.isArray(ids) ? ids.map(String).filter(Boolean) : []
      outMeta.pinnedAt = at
    } else if (row.key === SHELL_KEY_RECENT) {
      const ids = /** @type {any} */ (row.value)?.ids
      next.recent = Array.isArray(ids) ? ids.map(String).filter(Boolean) : []
      outMeta.recentAt = at
    } else if (row.key.startsWith(SHELL_RESUME_PREFIX)) {
      const listKey = row.key.slice(SHELL_RESUME_PREFIX.length)
      if (!listKey) continue
      if (row.deleted || row.value == null) {
        delete next.resume[listKey]
        delete outMeta.tombstones[row.key]
      } else if (typeof row.value === 'object') {
        next.resume[listKey] = /** @type {any} */ (row.value)
        delete outMeta.tombstones[row.key]
      }
    }
  }
  return { state: next, meta: outMeta }
}
