// 端口自 src/store/transactions.tsx（React Context TransactionsProvider）→ Svelte 5 runes class store。
import { getContext, setContext } from 'svelte'
import { computeMeta } from '../engine/transactions.js'
import { deleteTxn, insertTxn, insertTxns, loadTransactions, updateTxn } from './repo.js'
import { CACHE_SCOPES, peekSessionUserId, readCache, writeCache } from './localCache.js'
import { TRANSACTIONS_CONTEXT_KEY as KEY } from './context.js'
import { isDemoMode } from './demoMode'
import { buildDemoTransactions } from './demoData'

function sortDesc(list) {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** 首帧同步读取本地缓存的交易，实现「秒开不空屏」。 */
function readCachedTxns() {
  const userId = peekSessionUserId()
  if (!userId) return null
  return readCache(CACHE_SCOPES.txns, userId)
}

export class TransactionsStore {
  txns = $state([])
  loading = $state(true)
  error = $state(null)
  /** 首次云端拉取已完成（含缓存秒开后的后台 refresh），扩展同步应等待此标志。 */
  syncReady = $state(false)
  #meta = $derived.by(() => computeMeta(this.txns))

  get meta() {
    return this.#meta
  }

  constructor() {
    // 本地演示模式：直接注入模拟流水，不触云端（见 demoMode.ts）。
    if (isDemoMode()) {
      this.txns = sortDesc(buildDemoTransactions())
      this.loading = false
      this.syncReady = true
      return
    }
    const cached = readCachedTxns()
    this.txns = cached ?? []
    // 已有缓存时不显示 loading：先渲染缓存，后台静默刷新。
    this.loading = !cached
    void this.#bootstrap()
  }

  async #bootstrap() {
    try {
      await this.reload()
    } finally {
      this.syncReady = true
    }
  }

  #writeLocalCache() {
    const userId = peekSessionUserId()
    if (userId) writeCache(CACHE_SCOPES.txns, userId, this.txns)
  }

  /** 重新从云端拉取。 */
  async reload() {
    this.error = null
    if (isDemoMode()) {
      this.txns = sortDesc(buildDemoTransactions())
      this.loading = false
      return
    }
    const userId = peekSessionUserId()
    // 无缓存时才进入显式 loading 态，避免覆盖已渲染的缓存内容造成闪烁。
    if (!readCache(CACHE_SCOPES.txns, userId ?? '')) this.loading = true
    try {
      const rows = await loadTransactions()
      this.txns = sortDesc(rows)
      this.#writeLocalCache()
    } catch (e) {
      this.error = e instanceof Error ? e.message : '加载交易失败'
    } finally {
      this.loading = false
    }
  }

  /** 记一笔（手动）。 */
  async addTxn(input) {
    const saved = await insertTxn(input)
    this.txns = sortDesc([saved, ...this.txns])
    this.#writeLocalCache()
  }

  /** 批量记一笔（扩展同步用）。 */
  async addTxnsBatch(inputs) {
    if (inputs.length === 0) return []
    const saved = await insertTxns(inputs)
    this.txns = sortDesc([...saved, ...this.txns])
    this.#writeLocalCache()
    return saved
  }

  /** 扩展 RPC 已写入的交易合并进本地 store（不重复请求云端）。 */
  mergeImportedTxns(rows) {
    if (rows.length === 0) return
    const ids = new Set(rows.map((r) => r.id).filter(Boolean))
    const rest = this.txns.filter((t) => !t.id || !ids.has(t.id))
    this.txns = sortDesc([...rows, ...rest])
    this.#writeLocalCache()
  }

  /** 编辑一笔（需带 id）。 */
  async editTxn(t) {
    const saved = await updateTxn(t)
    this.txns = sortDesc(this.txns.map((x) => (x.id === saved.id ? saved : x)))
    this.#writeLocalCache()
  }

  /** 删除一笔。 */
  async removeTxn(id) {
    await deleteTxn(id)
    this.txns = this.txns.filter((x) => x.id !== id)
    this.#writeLocalCache()
  }
}

export function createTransactionsStore() {
  return new TransactionsStore()
}

/** @param {TransactionsStore} store */
export function setTransactionsStore(store) {
  return setContext(KEY, store)
}

/** @returns {TransactionsStore} */
export function getTransactionsStore() {
  const store = getContext(KEY)
  if (!store) {
    throw new Error(
      'getTransactionsStore must be called within a component tree wrapped by setTransactionsStore',
    )
  }
  return store
}

export { KEY as TRANSACTIONS_CONTEXT_KEY }
