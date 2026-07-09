// 端口自 src/store/timeline.tsx（React Context TimelineProvider）→ Svelte 5 runes class store。
// 依赖 finance.svelte.js 的 FinanceStore 与 transactions.svelte.js 的 TransactionsStore 实例
// （构造时传入，而不是内部 import getFinanceStore()/getTransactionsStore()，避免要求
// TimelineStore 一定要在同一组件树内创建；调用方——未来的 +layout.svelte——负责按顺序装配）。
import { getContext, setContext } from 'svelte'
import {
  actionableConfirmations,
  pendingConfirmations,
  rollTimeline,
  txnSignedForMatch,
  daysBetween,
} from '../engine/timeline.js'
import { computeLiquidCashAnchors, shouldAutoHealCashDrift } from '../engine/reconciliation.js'
import {
  loadBalanceAssertions,
  loadExpectedOccurrences,
  updateOccurrenceState,
  upsertExpectedOccurrences,
} from './repo.js'
import { MANUAL_ALIGN_NOTE, reanchorCashAccounts } from './cashReanchor.js'
import { CACHE_SCOPES, peekSessionUserId, readCache, writeCache } from './localCache.js'
import { TIMELINE_CONTEXT_KEY as KEY } from './context.js'

function snapshotRows(rows) {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      state: r.state,
      matchedTxnId: r.matchedTxnId ?? null,
      varianceAmount: r.varianceAmount ?? null,
      varianceDays: r.varianceDays ?? null,
      reconciledPeriodId: r.reconciledPeriodId ?? null,
      expectedAmount: r.expectedAmount,
      date: r.date,
    })),
  )
}

/** 首帧同步读取缓存的时间轴数据，避免空屏。 */
function readTimelineCache() {
  const userId = peekSessionUserId()
  if (!userId) return null
  const occ = readCache(CACHE_SCOPES.occurrences, userId)
  const asserts = readCache(CACHE_SCOPES.assertions, userId)
  if (!occ && !asserts) return null
  return { occurrences: occ ?? [], assertions: asserts ?? [] }
}

function todayAssertionDate() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
}

export class TimelineStore {
  #finance
  #transactions
  #lastPersisted = ''
  #persistTimer = null
  #autoHealAttempted = false
  #cleanupEffects = () => {}

  stored = $state([])
  assertions = $state([])
  loading = $state(true)
  error = $state(null)

  occurrences = $derived.by(() => {
    if (this.loading && this.stored.length === 0) return []
    return rollTimeline({
      data: this.#finance.data,
      txns: this.#transactions.txns,
      stored: this.stored,
      assertions: this.assertions,
    })
  })

  pending = $derived.by(() => pendingConfirmations(this.occurrences, new Date()))

  /** 到期/逾期需用户确认（含扣款当日的 upcoming）。 */
  actionable = $derived.by(() => actionableConfirmations(this.occurrences, new Date()))

  cashAnchors = $derived.by(() => {
    const pendingOutflowTotal = this.pending.reduce(
      (s, o) => (o.expectedAmount < 0 ? s + Math.abs(o.expectedAmount) : s),
      0,
    )
    return computeLiquidCashAnchors({
      accounts: this.#finance.data.accounts,
      assertions: this.assertions,
      txns: this.#transactions.txns,
      pendingOutflowTotal,
    })
  })

  /**
   * @param {import('./finance.svelte.js').FinanceStore} financeStore
   * @param {import('./transactions.svelte.js').TransactionsStore} transactionsStore
   */
  constructor(financeStore, transactionsStore) {
    this.#finance = financeStore
    this.#transactions = transactionsStore

    const cached = readTimelineCache()
    this.stored = cached?.occurrences ?? []
    this.assertions = cached?.assertions ?? []
    this.loading = !cached
    this.#lastPersisted = cached ? snapshotRows(cached.occurrences) : ''

    void this.reload()
    this.#cleanupEffects = $effect.root(() => {
      // stored 变化（标记跳过 / 后台同步）后刷新缓存，保证下次秒开是最新状态。
      $effect(() => {
        if (this.loading) return
        const userId = peekSessionUserId()
        if (userId) writeCache(CACHE_SCOPES.occurrences, userId, this.stored)
      })

      // occurrences 变化后 debounce 400ms 写回云端。
      $effect(() => {
        if (this.loading) return
        const rolled = this.occurrences
        const snap = snapshotRows(rolled)
        if (snap === this.#lastPersisted) return
        if (this.#persistTimer) clearTimeout(this.#persistTimer)
        this.#persistTimer = setTimeout(() => {
          void (async () => {
            try {
              await upsertExpectedOccurrences(rolled)
              this.#lastPersisted = snap
              this.stored = rolled
            } catch (e) {
              this.error = e instanceof Error ? e.message : '同步时间轴失败'
            }
          })()
        }, 400)
      })

      // 现金漂移自动校准（只尝试一次，除非失败重置）。
      $effect(() => {
        if (this.loading || this.#autoHealAttempted) return
        if (
          !shouldAutoHealCashDrift({
            anchors: this.cashAnchors,
            accounts: this.#finance.data.accounts,
            assertions: this.assertions,
          })
        ) {
          return
        }
        this.#autoHealAttempted = true
        void (async () => {
          try {
            await reanchorCashAccounts({
              accounts: this.#finance.data.accounts,
              assertionDate: todayAssertionDate(),
            })
            await this.reloadAssertions()
          } catch (e) {
            this.#autoHealAttempted = false
            this.error = e instanceof Error ? e.message : '自动校准余额失败'
          }
        })()
      })
    })
  }

  /** 组件卸载 / store 重建时调用，停止内部 effect 与未完成的 debounce。 */
  destroy() {
    this.#cleanupEffects()
    if (this.#persistTimer) clearTimeout(this.#persistTimer)
  }

  #applyLocalOccurrencePatch(id, patch) {
    const fromRoll = this.occurrences.find((r) => r.id === id)
    const base = this.stored.find((r) => r.id === id) ?? fromRoll
    if (!base) return
    const exists = this.stored.some((r) => r.id === id)
    const next = exists
      ? this.stored.map((r) => (r.id === id ? { ...r, ...patch } : r))
      : [...this.stored, { ...base, ...patch }]
    const rolled = rollTimeline({
      data: this.#finance.data,
      txns: this.#transactions.txns,
      stored: next,
      assertions: this.assertions,
    })
    this.#lastPersisted = snapshotRows(rolled)
    this.stored = rolled
  }

  async reload() {
    this.error = null
    const userId = peekSessionUserId()
    const hasCache = Boolean(readCache(CACHE_SCOPES.occurrences, userId ?? ''))
    if (!hasCache) this.loading = true
    try {
      const [occ, asserts] = await Promise.all([loadExpectedOccurrences(), loadBalanceAssertions()])
      this.stored = occ
      this.assertions = asserts
      this.#lastPersisted = snapshotRows(occ)
      const uid = peekSessionUserId()
      if (uid) {
        writeCache(CACHE_SCOPES.occurrences, uid, occ)
        writeCache(CACHE_SCOPES.assertions, uid, asserts)
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : '加载时间轴失败'
      if (!hasCache) this.stored = []
    } finally {
      this.loading = false
    }
  }

  /** 仅刷新余额锚点（扩展同步后，避免全量 timeline reload）。 */
  async reloadAssertions() {
    try {
      const asserts = await loadBalanceAssertions()
      this.assertions = asserts
      const uid = peekSessionUserId()
      if (uid) writeCache(CACHE_SCOPES.assertions, uid, asserts)
    } catch (e) {
      this.error = e instanceof Error ? e.message : '刷新余额锚点失败'
      throw e
    }
  }

  async markSkipped(id) {
    await updateOccurrenceState(id, { state: 'skipped' })
    this.#applyLocalOccurrencePatch(id, { state: 'skipped' })
  }

  /** 银行/账户已发生但 CSV 未导入时，手动确认（matched）。 */
  async markConfirmedPaid(id) {
    const row = this.occurrences.find((r) => r.id === id)
    if (!row) return
    const patch = {
      state: 'matched',
      actualAmount: row.expectedAmount,
      actualDate: row.date,
      varianceAmount: 0,
      varianceDays: 0,
    }
    await updateOccurrenceState(id, patch)
    this.#applyLocalOccurrencePatch(id, patch)
  }

  /** 手动将预期条目关联到某笔真实交易。 */
  async markMatchedWithTxn(id, txnId) {
    const row = this.occurrences.find((r) => r.id === id)
    const txn = this.#transactions.txns.find((t) => t.id === txnId)
    if (!row || !txn) return
    const signed = txnSignedForMatch(txn)
    const varianceAmount = Math.round((signed - row.expectedAmount) * 100) / 100
    const varianceDays = daysBetween(row.date, txn.date)
    const patch = {
      state: 'matched',
      matchedTxnId: txnId,
      actualAmount: signed,
      actualDate: txn.date,
      varianceAmount,
      varianceDays,
    }
    await updateOccurrenceState(id, patch)
    this.#applyLocalOccurrencePatch(id, patch)
  }

  /** 用设置页当前余额重锚可对账账户，消除漂移。 */
  async alignCashToAccountBalances(accountIds) {
    await reanchorCashAccounts({
      accounts: this.#finance.data.accounts,
      accountIds: accountIds ? new Set(accountIds) : undefined,
      assertionDate: todayAssertionDate(),
      note: MANUAL_ALIGN_NOTE,
    })
    await this.reloadAssertions()
  }
}

/**
 * @param {import('./finance.svelte.js').FinanceStore} financeStore
 * @param {import('./transactions.svelte.js').TransactionsStore} transactionsStore
 */
export function createTimelineStore(financeStore, transactionsStore) {
  return new TimelineStore(financeStore, transactionsStore)
}

/** @param {TimelineStore} store */
export function setTimelineStore(store) {
  return setContext(KEY, store)
}

/** @returns {TimelineStore} */
export function getTimelineStore() {
  const store = getContext(KEY)
  if (!store) {
    throw new Error('getTimelineStore must be called within a component tree wrapped by setTimelineStore')
  }
  return store
}

export { KEY as TIMELINE_CONTEXT_KEY }
