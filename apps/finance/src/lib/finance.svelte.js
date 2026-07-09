// 端口自 src/store/store.tsx（React Context FinanceProvider）→ Svelte 5 runes class store。
// 对外方法名与语义保持与原 FinanceStore 接口一致，使各视图/hook 迁移时零改动（只是拿 store 的方式变了）。
import { getContext, setContext } from 'svelte'
import { BASELINE_SCENARIO_ID, createDefaultData } from '../store/defaults.js'
import * as repo from './repo.js'
import { notifySyncError } from './syncNotify.js'
import { CACHE_SCOPES, peekSessionUserId, writeCache } from './localCache.js'
import {
  sanitizePortfolioAllocationTarget,
  savePortfolioAllocationTargetLocal,
} from './portfolioAllocationPrefs.js'
import { FINANCE_CONTEXT_KEY as KEY } from './context.js'

export function uid(prefix) {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}

export { BASELINE_SCENARIO_ID }

function upsert(list, item) {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = item
    return next
  }
  return [...list, item]
}

function now() {
  return new Date().toISOString()
}

/** 把定点写入的 Promise 兜底，失败时通知用户（本地状态已乐观更新）。 */
function persist(p) {
  p.catch((e) => {
    console.error('[finance] 同步到 Supabase 失败：', e)
    notifySyncError(e)
  })
}

export class FinanceStore {
  /** @type {import('../types.js').FinanceData} */
  data = $state()

  /** @param {import('../types.js').FinanceData} [initialData] 由 AuthGate 从 Supabase 加载后传入；缺省时回退到代码预设（仅用于离线/未配置场景）。 */
  constructor(initialData) {
    this.data = initialData ?? createDefaultData()
    this.#writeLocalCache()
  }

  #writeLocalCache() {
    const userId = peekSessionUserId()
    if (userId) writeCache(CACHE_SCOPES.finance, userId, this.data)
  }

  /** 由 AuthGate 等在拿到新的云端数据后整体替换（对应原来 React 侧 key={dataEpoch} 重挂载）。 */
  replaceData(nextData) {
    this.data = nextData
    this.#writeLocalCache()
  }

  setAssumptions(patch) {
    const assumptions = { ...this.data.assumptions, ...patch }
    this.data = { ...this.data, assumptions, updatedAt: now() }
    this.#writeLocalCache()
    persist(
      repo.saveSettings(assumptions, this.data.privacy, this.data.version, this.data.activeScenarioId),
    )
  }

  setPrivacy(b) {
    this.data = { ...this.data, privacy: b, updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.saveSettings(this.data.assumptions, b, this.data.version, this.data.activeScenarioId))
  }

  upsertAccount(a) {
    this.data = { ...this.data, accounts: upsert(this.data.accounts, a), updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.upsertAccount(a))
  }

  removeAccount(id) {
    this.data = {
      ...this.data,
      accounts: this.data.accounts.filter((x) => x.id !== id),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.deleteAccount(id))
  }

  upsertHoldingsSnapshot(snapshot) {
    this.data = {
      ...this.data,
      holdingsSnapshots: upsert(this.data.holdingsSnapshots, snapshot),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.upsertHoldingsSnapshot(snapshot))
  }

  removeHoldingsSnapshot(id) {
    this.data = {
      ...this.data,
      holdingsSnapshots: this.data.holdingsSnapshots.filter((x) => x.id !== id),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.deleteHoldingsSnapshot(id))
  }

  upsertCashFlow(c) {
    this.data = { ...this.data, cashFlows: upsert(this.data.cashFlows, c), updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.upsertCashFlow(c))
  }

  removeCashFlow(id) {
    this.data = {
      ...this.data,
      cashFlows: this.data.cashFlows.filter((x) => x.id !== id),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.deleteCashFlow(id))
  }

  upsertEvent(e) {
    const scenarioId = this.data.activeScenarioId ?? BASELINE_SCENARIO_ID
    const event = { ...e, scenarioId }
    this.data = { ...this.data, events: upsert(this.data.events, event), updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.upsertEvent(event, scenarioId))
  }

  removeEvent(id) {
    const scenarioId = this.data.activeScenarioId ?? BASELINE_SCENARIO_ID
    this.data = {
      ...this.data,
      events: this.data.events.filter((x) => x.id !== id),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.deleteEvent(id, scenarioId))
  }

  toggleEvent(id) {
    const cur = this.data.events.find((e) => e.id === id)
    if (!cur) return
    const next = { ...cur, enabled: !cur.enabled }
    const scenarioId = this.data.activeScenarioId ?? BASELINE_SCENARIO_ID
    this.data = {
      ...this.data,
      events: this.data.events.map((e) => (e.id === id ? next : e)),
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.upsertEvent({ ...next, scenarioId }, scenarioId))
  }

  upsertScenario(s) {
    const scenarios = upsert(this.data.scenarios ?? [], s)
    this.data = { ...this.data, scenarios, updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.upsertScenario(s))
  }

  removeScenario(id) {
    if (id === BASELINE_SCENARIO_ID) return
    const fallbackId = this.data.scenarios?.find((s) => s.id !== id)?.id ?? BASELINE_SCENARIO_ID
    const wasActive = this.data.activeScenarioId === id
    this.data = {
      ...this.data,
      scenarios: (this.data.scenarios ?? []).filter((s) => s.id !== id),
      activeScenarioId: wasActive ? fallbackId : this.data.activeScenarioId,
      events: wasActive ? [] : this.data.events,
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.deleteScenario(id))
    if (wasActive) {
      persist(repo.setActiveScenario(fallbackId))
      repo
        .loadScenarioEvents(fallbackId)
        .then((events) => {
          this.data = { ...this.data, events, activeScenarioId: fallbackId, updatedAt: now() }
          this.#writeLocalCache()
        })
        .catch((e) => console.error('[finance] 切换场景后加载事件失败：', e))
    }
  }

  duplicateActiveScenario() {
    const sourceId = this.data.activeScenarioId ?? BASELINE_SCENARIO_ID
    const targetId = uid('scn')
    const sourceName = this.data.scenarios?.find((s) => s.id === sourceId)?.name ?? 'Scenario'
    /** @type {import('../types.js').Scenario} */
    const scenario = {
      id: targetId,
      name: `${sourceName} Copy`,
      scenarioType: 'custom',
      status: 'draft',
      updatedAt: now(),
    }
    this.data = {
      ...this.data,
      scenarios: [...(this.data.scenarios ?? []), scenario],
      updatedAt: now(),
    }
    this.#writeLocalCache()
    persist(repo.duplicateScenario(sourceId, scenario))
  }

  setActiveScenario(id) {
    if (id === this.data.activeScenarioId) return
    this.data = { ...this.data, activeScenarioId: id, events: [], updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.setActiveScenario(id))
    repo
      .loadScenarioEvents(id)
      .then((events) => {
        this.data = { ...this.data, activeScenarioId: id, events, updatedAt: now() }
        this.#writeLocalCache()
      })
      .catch((e) => console.error('[finance] 加载场景事件失败：', e))
  }

  upsertGoal(g) {
    this.data = { ...this.data, goals: upsert(this.data.goals, g), updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.upsertGoal(g))
  }

  removeGoal(id) {
    this.data = { ...this.data, goals: this.data.goals.filter((x) => x.id !== id), updatedAt: now() }
    this.#writeLocalCache()
    persist(repo.deleteGoal(id))
  }

  setPortfolioAllocationTarget(target) {
    const portfolioAllocationTarget = sanitizePortfolioAllocationTarget(target)
    this.data = { ...this.data, portfolioAllocationTarget, updatedAt: now() }
    this.#writeLocalCache()
    savePortfolioAllocationTargetLocal(portfolioAllocationTarget)
    persist(repo.savePortfolioAllocationTarget(portfolioAllocationTarget))
  }
}

/** @param {import('../types.js').FinanceData} [initialData] */
export function createFinanceStore(initialData) {
  return new FinanceStore(initialData)
}

/** @param {FinanceStore} store */
export function setFinanceStore(store) {
  return setContext(KEY, store)
}

/** @returns {FinanceStore} */
export function getFinanceStore() {
  const store = getContext(KEY)
  if (!store) {
    throw new Error('getFinanceStore must be called within a component tree wrapped by setFinanceStore')
  }
  return store
}

export { KEY as FINANCE_CONTEXT_KEY }

