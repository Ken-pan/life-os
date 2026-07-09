export type { LiveQuote } from '@life-os/finance-core/quotes/types'
import type { LiveQuote } from '@life-os/finance-core/quotes/types'

interface YahooSparkEntry {
  timestamp?: number[]
  close?: (number | null)[]
  symbol?: string
}

interface YahooChartPayload {
  chart?: {
    result?: {
      meta?: {
        symbol?: string
        regularMarketPrice?: number
        regularMarketTime?: number
      }
    }[]
  }
}

function quoteFromTimestamp(
  symbol: string,
  price: number,
  tsSec: number,
): LiveQuote {
  const d = new Date(tsSec * 1000)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { symbol: symbol.toUpperCase(), price, date, time }
}

function parseYahooSparkEntry(
  symbol: string,
  entry: YahooSparkEntry,
): LiveQuote | null {
  const timestamps = entry.timestamp
  const closes = entry.close
  if (!timestamps?.length || !closes?.length) return null
  const ts = timestamps[timestamps.length - 1]
  const price = closes[closes.length - 1]
  if (!Number.isFinite(ts) || price == null || !Number.isFinite(price))
    return null
  return quoteFromTimestamp(symbol, price, ts)
}

function parseYahooChartPayload(
  symbol: string,
  payload: YahooChartPayload,
): LiveQuote | null {
  const meta = payload.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice
  if (!Number.isFinite(price)) return null
  const ts = meta?.regularMarketTime ?? Math.floor(Date.now() / 1000)
  return quoteFromTimestamp(meta?.symbol ?? symbol, price!, ts)
}

/** 单只实时价：Yahoo chart API（经 /api/ychart 代理）。 */
export async function fetchLiveQuote(
  symbol: string,
): Promise<LiveQuote | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const endpoint = `/api/ychart/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`
  const response = await fetch(endpoint, { method: 'GET' })
  if (!response.ok) return null
  const body = (await response.json()) as YahooChartPayload
  return parseYahooChartPayload(sym, body)
}

const BATCH_CONCURRENCY = 4

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++
        results[i] = await fn(items[i])
      }
    },
  )
  await Promise.all(workers)
  return results
}

/** 批量实时价：优先 Yahoo spark 一次请求，失败则限并发逐只拉取。 */
export async function fetchLiveQuotes(
  symbols: string[],
): Promise<Record<string, LiveQuote>> {
  const uniq = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ]
  if (uniq.length === 0) return {}
  if (uniq.length === 1) {
    const quote = await fetchLiveQuote(uniq[0])
    return quote ? { [quote.symbol]: quote } : {}
  }

  try {
    const endpoint = `/api/ychart/v8/finance/spark?symbols=${encodeURIComponent(uniq.join(','))}&range=1d&interval=1d`
    const response = await fetch(endpoint, { method: 'GET' })
    if (response.ok) {
      const payload = (await response.json()) as Record<string, YahooSparkEntry>
      const out: Record<string, LiveQuote> = {}
      for (const sym of uniq) {
        const quote = parseYahooSparkEntry(sym, payload[sym] ?? {})
        if (quote) out[quote.symbol] = quote
      }
      if (Object.keys(out).length > 0) return out
    }
  } catch {
    // spark 失败时回退逐只拉取。
  }

  const quotes = await mapWithConcurrency(
    uniq,
    BATCH_CONCURRENCY,
    async (symbol) => {
      try {
        return await fetchLiveQuote(symbol)
      } catch {
        return null
      }
    },
  )
  const out: Record<string, LiveQuote> = {}
  for (const q of quotes) {
    if (q) out[q.symbol] = q
  }
  return out
}
