// 一次性交易回读请求的记账。
//
// 历史里出现连续多天完全没有记录的缺口时（见 engine coverageGaps），随扩展
// 快照带上 txnBackfill，让下一次抓取滚过缺口把数据补回来。「一次」由这里保证：
// 请求发出后，只要收到过一批 transactions 抓取结果（无论有没有补到东西——
// 也可能那段确实没消费），同一段缺口就不再请求，避免每次同步都深翻整个账本。
//
// 状态放 localStorage 而不是云端：回读是「这台浏览器上的这只扩展」的行为，
// 不是账本数据的一部分。

const KEY = 'fos_txn_backfill_v1'
// 请求悬空太久（一直没同步）就作废：不要在一个月后突然出现一次莫名的深翻。
const PENDING_TTL_DAYS = 30

/** @typedef {{ from: string, to: string, status: 'pending' | 'done', requestedAt: string, doneAt?: string, reason?: string }} BackfillState */

/** @returns {BackfillState | null} */
export function readBackfillState() {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v.from === 'string' && typeof v.to === 'string' ? v : null
  } catch {
    return null
  }
}

/** @param {BackfillState | null} state */
function writeBackfillState(state) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage 不可用时回读退化为「每次都请求」以外的行为：干脆不请求 */
  }
}

/** @param {string} a @param {string} b */
const minIso = (a, b) => (a < b ? a : b)
/** @param {string} a @param {string} b */
const maxIso = (a, b) => (a > b ? a : b)

/**
 * 纯决策：给定当前缺口与已有状态，算出「这次快照要不要带回读请求」和新状态。
 * 独立成纯函数是为了可测——localStorage 的读写在外面。
 *
 * @param {{ from: string, to: string }[]} gaps
 * @param {BackfillState | null} state
 * @param {string} nowIso ISO 时间戳
 * @returns {{ request: { from: string, to: string } | null, state: BackfillState | null }}
 */
export function decideBackfill(gaps, state, nowIso) {
  if (state?.status === 'pending') {
    const ageDays =
      (new Date(nowIso).getTime() - new Date(state.requestedAt).getTime()) / 86400000
    if (ageDays > PENDING_TTL_DAYS) {
      return {
        request: null,
        state: { ...state, status: 'done', doneAt: nowIso, reason: 'expired' },
      }
    }
  }

  if (gaps.length === 0) return { request: null, state }

  const merged = gaps.reduce(
    (acc, g) => ({ from: minIso(acc.from, g.from), to: maxIso(acc.to, g.to) }),
    { from: gaps[0].from, to: gaps[0].to },
  )

  // 这段已经读过一次（哪怕什么都没读到）：不再打扰。
  if (state?.status === 'done' && state.from <= merged.from && state.to >= merged.to) {
    return { request: null, state }
  }

  if (state?.status === 'pending') {
    // 请求还没被消费，顺带把新发现的缺口并进去。
    const next = {
      ...state,
      from: minIso(state.from, merged.from),
      to: maxIso(state.to, merged.to),
    }
    return { request: { from: next.from, to: next.to }, state: next }
  }

  const fresh = { from: merged.from, to: merged.to, status: 'pending', requestedAt: nowIso }
  return { request: { from: fresh.from, to: fresh.to }, state: fresh }
}

/**
 * 给 emitSnapshot 用：决策 + 落盘，返回要放进快照的 txnBackfill（或 null）。
 * @param {{ from: string, to: string }[]} gaps
 */
export function planTxnBackfill(gaps, nowIso = new Date().toISOString()) {
  const prev = readBackfillState()
  const { request, state } = decideBackfill(gaps, prev, nowIso)
  if (state !== prev) writeBackfillState(state)
  return request
}

/** 收到 transactions 抓取结果时调用：这次读已经发生，pending 关单。 */
export function markBackfillRead(nowIso = new Date().toISOString()) {
  const state = readBackfillState()
  if (state?.status !== 'pending') return
  writeBackfillState({ ...state, status: 'done', doneAt: nowIso })
}
