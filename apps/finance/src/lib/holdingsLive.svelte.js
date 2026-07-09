// Port of src/hooks/useHoldingsLive.ts → Svelte 5 runes factory (call from component init).
import { LIVE_PRICE_HISTORY_STORAGE_KEY } from './localDataKeys.js'
import { fetchLiveQuotes } from './quotes.js'
import { loadHoldingPriceTrails, upsertHoldingPriceTrailPoints } from './repo.js'

/** @typedef {'idle' | 'loading' | 'live' | 'partial' | 'stale' | 'error' | 'paused'} LiveTrackStatus */

/** @typedef {{ ts: number, price: number }} LiveHistoryPoint */

const HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
const MAX_SAMPLES_PER_SYMBOL = 480
const MIN_SAMPLE_GAP_MS = 8_000
const REMOTE_SYNC_DEBOUNCE_MS = 2_000
const MAX_REMOTE_SYNC_POINTS = 1200

function loadHistory() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LIVE_PRICE_HISTORY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const now = Date.now()
    /** @type {Record<string, LiveHistoryPoint[]>} */
    const out = {}
    for (const [symbol, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue
      const cleaned = list
        .filter((point) => Number.isFinite(point?.ts) && Number.isFinite(point?.price) && point.price > 0)
        .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_SAMPLES_PER_SYMBOL)
      if (cleaned.length > 0) out[symbol] = cleaned
    }
    return out
  } catch {
    return {}
  }
}

/** @param {Record<string, LiveHistoryPoint[]>} history */
function saveHistory(history) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LIVE_PRICE_HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // 存储不可写时静默降级
  }
}

/** @param {number} size */
function pollIntervalForSize(size) {
  if (size <= 8) return 15_000
  if (size <= 25) return 30_000
  return 45_000
}

/** @param {LiveHistoryPoint[] | undefined} a @param {LiveHistoryPoint[] | undefined} b */
function mergePointLists(a, b) {
  const merged = [...(a ?? []), ...(b ?? [])]
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price) && point.price > 0)
    .sort((x, y) => x.ts - y.ts)
  /** @type {LiveHistoryPoint[]} */
  const deduped = []
  for (const point of merged) {
    const prev = deduped[deduped.length - 1]
    if (!prev) {
      deduped.push(point)
      continue
    }
    if (Math.abs(prev.ts - point.ts) <= 1_000 && Math.abs(prev.price - point.price) < 1e-8) continue
    deduped.push(point)
  }
  const now = Date.now()
  return deduped
    .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
    .slice(-MAX_SAMPLES_PER_SYMBOL)
}

/**
 * Reactive live quotes tracker. Call once during component initialization.
 * @param {() => string[]} getSymbols
 * @param {() => boolean} getTrackingEnabled
 * @param {() => boolean} getTabActive
 */
export function createHoldingsLive(getSymbols, getTrackingEnabled, getTabActive) {
  let quotes = $state(/** @type {Record<string, import('./quotes.js').LiveQuote>} */ ({}))
  let status = $state(/** @type {LiveTrackStatus} */ ('idle'))
  let loading = $state(false)
  let updatedAt = $state(/** @type {string | null} */ (null))
  let error = $state(/** @type {string | null} */ (null))
  let history = $state(/** @type {Record<string, LiveHistoryPoint[]>} */ (loadHistory()))
  let pollIntervalMs = $state(15_000)

  const syncedWatermarkRef = { current: /** @type {Record<string, number>} */ ({}) }
  const remoteLoadedKeyRef = { current: '' }

  async function refresh() {
    const uniq = [
      ...new Set(getSymbols().map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ]
    if (uniq.length === 0) {
      status = 'idle'
      return
    }
    loading = true
    error = null
    status = 'loading'
    const interval = pollIntervalForSize(uniq.length)
    try {
      const next = await fetchLiveQuotes(uniq)
      const got = Object.keys(next).length
      const hasCachedQuotes = Object.keys(quotes).length > 0
      if (got === 0) {
        status = hasCachedQuotes ? 'stale' : 'error'
        error = '实时行情暂不可用，界面沿用快照价格。'
        return
      }
      quotes = { ...quotes, ...next }
      const now = Date.now()
      const nextHistory = { ...history }
      for (const [symbol, quote] of Object.entries(next)) {
        if (!Number.isFinite(quote.price) || quote.price <= 0) continue
        const list = [...(nextHistory[symbol] ?? [])]
        const last = list[list.length - 1]
        if (last && Math.abs(last.price - quote.price) < 1e-8 && now - last.ts < interval + 5_000) {
          continue
        }
        if (last && now - last.ts < MIN_SAMPLE_GAP_MS) {
          list[list.length - 1] = { ts: now, price: quote.price }
        } else {
          list.push({ ts: now, price: quote.price })
        }
        nextHistory[symbol] = list
          .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
          .slice(-MAX_SAMPLES_PER_SYMBOL)
      }
      history = nextHistory
      updatedAt = new Date().toISOString()
      if (got < uniq.length) {
        status = 'partial'
        error = `${uniq.length - got} 只代码未拿到最新价，其余已更新。`
      } else {
        status = 'live'
        error = null
      }
    } catch (e) {
      status = Object.keys(quotes).length > 0 ? 'stale' : 'error'
      error = e instanceof Error ? e.message : '拉取实时行情失败'
    } finally {
      loading = false
    }
  }

  $effect(() => {
    saveHistory(history)
  })

  $effect(() => {
    const normalizedSymbols = [
      ...new Set(getSymbols().map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ]
    const symbolKey = normalizedSymbols.join('|')
    if (!symbolKey) return
    if (remoteLoadedKeyRef.current === symbolKey) return
    let cancelled = false
    remoteLoadedKeyRef.current = symbolKey
    void (async () => {
      try {
        const remote = await loadHoldingPriceTrails(normalizedSymbols)
        if (cancelled) return
        const next = { ...history }
        for (const symbol of normalizedSymbols) {
          const merged = mergePointLists(
            next[symbol],
            remote[symbol]?.map((point) => ({ ts: point.ts, price: point.price })),
          )
          if (merged.length > 0) next[symbol] = merged
        }
        history = next
        for (const symbol of normalizedSymbols) {
          const remotePoints = remote[symbol]
          if (!remotePoints || remotePoints.length === 0) continue
          syncedWatermarkRef.current[symbol] = Math.max(
            syncedWatermarkRef.current[symbol] ?? 0,
            remotePoints[remotePoints.length - 1].ts,
          )
        }
      } catch {
        // 远端轨迹不可用时静默降级
      }
    })()
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const normalizedSymbols = [
      ...new Set(getSymbols().map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ]
    if (normalizedSymbols.length === 0) return
    const pending = normalizedSymbols.flatMap((symbol) => {
      const list = history[symbol] ?? []
      const watermark = syncedWatermarkRef.current[symbol] ?? 0
      return list
        .filter((point) => point.ts > watermark)
        .map((point) => ({
          symbol,
          ts: point.ts,
          price: point.price,
          sourceType: /** @type {const} */ ('live'),
        }))
    })
    if (pending.length === 0) return
    const trimmed = pending.slice(-MAX_REMOTE_SYNC_POINTS)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await upsertHoldingPriceTrailPoints(trimmed)
          for (const point of trimmed) {
            syncedWatermarkRef.current[point.symbol] = Math.max(
              syncedWatermarkRef.current[point.symbol] ?? 0,
              point.ts,
            )
          }
        } catch {
          // 写远端失败时保留待同步点
        }
      })()
    }, REMOTE_SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  })

  $effect(() => {
    const normalizedSymbols = [
      ...new Set(getSymbols().map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ]
    const trackingEnabled = getTrackingEnabled()
    const tabActive = getTabActive()
    pollIntervalMs = pollIntervalForSize(normalizedSymbols.length)

    if (!trackingEnabled || !tabActive || normalizedSymbols.length === 0) {
      return
    }

    const run = () => {
      if (document.visibilityState === 'hidden') return
      void refresh()
    }
    run()
    const timer = window.setInterval(run, pollIntervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tabActive) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  const displayStatus = $derived.by(() => {
    const normalizedSymbols = [
      ...new Set(getSymbols().map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ]
    if (!getTrackingEnabled() || !getTabActive()) return /** @type {LiveTrackStatus} */ ('paused')
    if (normalizedSymbols.length === 0) return /** @type {LiveTrackStatus} */ ('idle')
    return status
  })

  return {
    get quotes() {
      return quotes
    },
    get history() {
      return history
    },
    get status() {
      return displayStatus
    },
    get loading() {
      return loading
    },
    get updatedAt() {
      return updatedAt
    },
    get error() {
      return error
    },
    get pollIntervalMs() {
      return pollIntervalMs
    },
    refresh,
  }
}
