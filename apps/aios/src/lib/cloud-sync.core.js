/**
 * AIOS 云同步合并决策（纯函数，零 $lib/$app 依赖）。
 * cloud.svelte.js 负责 I/O；本文件锁定 LWW / 墓碑语义，供 STABLE.26 回归。
 */

/**
 * @typedef {{ id: string, updatedAt: number }} LocalConversation
 * @typedef {{ id: string, updated_at: number, deleted?: boolean }} RemoteConversationMeta
 * @typedef {{ id: string }} LocalMemory
 * @typedef {{ id: string, text?: string, created_at?: number, deleted?: boolean }} RemoteMemory
 */

/**
 * 对话 LWW + 墓碑规划。
 * @param {LocalConversation[]} local
 * @param {RemoteConversationMeta[]} remote
 * @param {Record<string, number>} snapConvs snapshot: id → last known updatedAt
 */
export function planConversationSync(local, remote, snapConvs = {}) {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localById = new Map(local.map((c) => [c.id, c]))

  /** @type {LocalConversation[]} */
  const toPush = []
  /** @type {string[]} */
  const toTombstone = []
  /** @type {string[]} */
  const toPull = []
  const dropLocal = new Set()

  for (const c of local) {
    const r = remoteById.get(c.id)
    if (!r) {
      toPush.push(c)
    } else if (r.deleted) {
      if (c.updatedAt > r.updated_at) toPush.push(c)
      else dropLocal.add(c.id)
    } else if (c.updatedAt > r.updated_at) {
      toPush.push(c)
    } else if (r.updated_at > c.updatedAt) {
      toPull.push(c.id)
    }
  }
  for (const r of remote) {
    if (localById.has(r.id) || r.deleted) continue
    if (snapConvs[r.id] !== undefined) toTombstone.push(r.id)
    else toPull.push(r.id)
  }

  return { toPush, toTombstone, toPull, dropLocal }
}

/**
 * 记忆同步规划（新增推送 / 墓碑 / 拉取并入）。
 * @param {LocalMemory[]} local
 * @param {RemoteMemory[]} remote
 * @param {string[]} snapMemIds
 */
export function planMemorySync(local, remote, snapMemIds = []) {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localIds = new Set(local.map((m) => m.id))
  const snapIds = new Set(snapMemIds)

  /** @type {LocalMemory[]} */
  const toPush = []
  /** @type {string[]} */
  const toTombstone = []
  /** @type {Array<{ id: string, text: string, vector: null, createdAt: number }>} */
  const toAdd = []
  const dropLocal = new Set()

  for (const m of local) {
    const r = remoteById.get(m.id)
    if (!r) toPush.push(m)
    else if (r.deleted) dropLocal.add(m.id)
  }
  for (const r of remote) {
    if (localIds.has(r.id) || r.deleted) continue
    if (snapIds.has(r.id)) toTombstone.push(r.id)
    else toAdd.push({ id: r.id, text: r.text ?? '', vector: null, createdAt: r.created_at ?? 0 })
  }

  return { toPush, toTombstone, toAdd, dropLocal }
}

/**
 * 设置整包 LWW：比较本地/远端 updated_at。
 * @returns {'pull' | 'push' | 'noop'}
 */
export function planSettingsLww(localAt, remoteAt, hasRemote) {
  const local = Number(localAt ?? 0)
  const remote = Number(remoteAt ?? 0)
  if (hasRemote && remote > local) return 'pull'
  if (local > remote) return 'push'
  return 'noop'
}
