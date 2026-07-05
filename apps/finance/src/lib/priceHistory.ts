// 日线历史行情：Yahoo chart API（经 /api/ychart 代理绕过 CORS）。
// 持久化到 Supabase holding_daily_candles，打开 app 时按水位线增量补齐；
// 内存 + localStorage 作读缓存，未登录时降级为仅本地缓存 + Yahoo。

import type { DailyCandle } from "../engine/advisor";
import {
  loadHoldingDailyCandleState,
  upsertHoldingDailyCandles,
} from "./repo";

const CACHE_PREFIX = "finance_os_daily_history_v2:";
export const MAX_DAILY_CANDLES = 320;
const MIN_USABLE_CANDLES = 20;
const YAHOO_MAX_ATTEMPTS = 3;
const YAHOO_RETRY_BASE_MS = 400;
const SYNC_CONCURRENCY = 4;

interface CacheEntry {
  fetchedOn: string; // YYYY-MM-DD
  candles: DailyCandle[];
}

/** 进程内读缓存：避免同会话重复打 Supabase。 */
const memoryCache = new Map<string, DailyCandle[]>();
/** 今日已成功同步（含「无新数据」）的 symbol，避免重复打 Yahoo。 */
const syncedToday = new Map<string, string>();
const syncInflight = new Map<string, Promise<void>>();
/** 整批 symbols 的后台同步 promise，供 fetch 等待首屏空数据场景。 */
let batchSyncInflight: Promise<void> | null = null;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

function readCache(symbol: string): DailyCandle[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + symbol);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.fetchedOn !== todayISO()) return null;
    if (!Array.isArray(entry.candles) || entry.candles.length === 0) return null;
    return entry.candles;
  } catch {
    return null;
  }
}

function writeCache(symbol: string, candles: DailyCandle[]): void {
  if (candles.length === 0) return;
  memoryCache.set(symbol, candles);
  try {
    const entry: CacheEntry = { fetchedOn: todayISO(), candles };
    localStorage.setItem(CACHE_PREFIX + symbol, JSON.stringify(entry));
  } catch {
    // 存储满时忽略，仅影响缓存。
  }
}

function latestCandleDate(candles: DailyCandle[]): string | null {
  return candles.length > 0 ? candles[candles.length - 1].date : null;
}

interface YahooChartPayload {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
  };
}

/** 合并多组日线，同日期后者覆盖前者，按日期升序并截断。 */
export function mergeDailyCandles(...lists: DailyCandle[][]): DailyCandle[] {
  const byDate = new Map<string, number>();
  for (const list of lists) {
    for (const candle of list) {
      if (!candle.date || !Number.isFinite(candle.close) || candle.close <= 0) continue;
      byDate.set(candle.date, candle.close);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }))
    .slice(-MAX_DAILY_CANDLES);
}

/** 是否应触发 Yahoo 增量抓取（最新交易日早于今天）。 */
export function needsDailyRefresh(latestDate: string | null | undefined): boolean {
  if (!latestDate) return true;
  return latestDate < todayISO();
}

/** 数据是否足够计算技术信号（条数 + 新鲜度）。 */
export function isDailyHistoryUsable(candles: DailyCandle[]): boolean {
  if (candles.length < MIN_USABLE_CANDLES) return false;
  return !needsDailyRefresh(latestCandleDate(candles));
}

/** 按距水位线天数选择 Yahoo range，长缺口用更大窗口。 */
export function pickYahooRange(watermark: string | null | undefined): "1y" | "3mo" | "1mo" {
  if (!watermark) return "1y";
  const gapDays = Math.floor(
    (Date.parse(`${todayISO()}T12:00:00Z`) - Date.parse(`${watermark}T12:00:00Z`)) / 86_400_000
  );
  if (gapDays > 120) return "1y";
  if (gapDays > 35) return "3mo";
  return "1mo";
}

export function parseYahooChart(payload: YahooChartPayload): DailyCandle[] {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    const d = new Date(timestamps[i] * 1000);
    out.push({
      date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`,
      close,
    });
  }
  return out.slice(-MAX_DAILY_CANDLES);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function fetchYahooDaily(
  symbol: string,
  range: "1y" | "3mo" | "1mo"
): Promise<DailyCandle[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  const endpoint = `/api/ychart/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < YAHOO_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return parseYahooChart((await response.json()) as YahooChartPayload);
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastErr = error;
    }
    if (attempt < YAHOO_MAX_ATTEMPTS - 1) {
      await sleep(YAHOO_RETRY_BASE_MS * (attempt + 1));
    }
  }
  void lastErr;
  return [];
}

function markSyncedToday(symbol: string): void {
  syncedToday.set(symbol, todayISO());
}

function alreadySyncedToday(symbol: string): boolean {
  return syncedToday.get(symbol) === todayISO();
}

/** 单只标的：Yahoo 增量 → upsert Supabase（可传入已知水位线，避免重复读库）。 */
export async function syncDailyCandleHistory(
  symbol: string,
  knownWatermark?: string | null
): Promise<void> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  if (alreadySyncedToday(sym)) return;

  const existing = syncInflight.get(sym);
  if (existing) {
    await existing;
    return;
  }

  const task = (async () => {
    try {
      let latest: string | null;
      if (knownWatermark !== undefined) {
        latest = knownWatermark;
      } else {
        const state = await loadHoldingDailyCandleState([sym]);
        latest = state.watermarks[sym] ?? null;
      }
      if (!needsDailyRefresh(latest)) {
        markSyncedToday(sym);
        return;
      }

      const range = pickYahooRange(latest);
      const fetched = await fetchYahooDaily(sym, range);
      if (fetched.length === 0) return;

      const toUpsert = latest ? fetched.filter((c) => c.date > latest) : fetched;
      if (toUpsert.length > 0) {
        await upsertHoldingDailyCandles(
          toUpsert.map((c) => ({ symbol: sym, date: c.date, close: c.close }))
        );
        const merged = mergeDailyCandles(memoryCache.get(sym) ?? [], fetched);
        writeCache(sym, merged);
      }
      markSyncedToday(sym);
    } catch {
      // 单只失败不影响其它 symbol；下轮打开会重试。
    }
  })();

  syncInflight.set(sym, task);
  try {
    await task;
  } finally {
    syncInflight.delete(sym);
  }
}

/** 批量增量同步（限并发）；可在进入股票页时后台触发。 */
export async function syncDailyCandleHistories(
  symbols: string[],
  concurrency = SYNC_CONCURRENCY
): Promise<void> {
  const uniq = normalizeSymbols(symbols).filter((sym) => !alreadySyncedToday(sym));
  if (uniq.length === 0) return;

  const run = async () => {
    const { watermarks } = await loadHoldingDailyCandleState(uniq);
    const stale = uniq.filter((sym) => needsDailyRefresh(watermarks[sym]));
    if (stale.length === 0) {
      for (const sym of uniq) markSyncedToday(sym);
      return;
    }

    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, stale.length) }, async () => {
      while (index < stale.length) {
        const sym = stale[index++];
        await syncDailyCandleHistory(sym, watermarks[sym] ?? null);
      }
    });
    await Promise.all(workers);
  };

  if (!batchSyncInflight) {
    batchSyncInflight = run().finally(() => {
      batchSyncInflight = null;
    });
  }
  await batchSyncInflight;
}

/** 后台预热：不阻塞 UI，与 StocksView 挂载配合。 */
export function prefetchDailyCandleHistories(symbols: string[]): void {
  void syncDailyCandleHistories(symbols);
}

/** 未登录降级：Yahoo 全量 + localStorage 当日缓存。 */
async function fetchDailyHistoryLocal(symbol: string): Promise<DailyCandle[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  const cached = memoryCache.get(sym) ?? readCache(sym);
  if (cached) return cached;
  const candles = await fetchYahooDaily(sym, "1y");
  if (candles.length > 0) writeCache(sym, candles);
  return candles;
}

function bestKnownCandles(
  sym: string,
  stored: Record<string, DailyCandle[]>
): DailyCandle[] {
  const layers = [memoryCache.get(sym), readCache(sym), stored[sym]].filter(
    (list): list is DailyCandle[] => Array.isArray(list) && list.length > 0
  );
  return mergeDailyCandles(...layers);
}

/** 拉取单只标的日线（Supabase 优先，失败降级 localStorage + Yahoo）。 */
export async function fetchDailyHistory(symbol: string): Promise<DailyCandle[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  const cached = bestKnownCandles(sym, {});
  if (isDailyHistoryUsable(cached)) return cached;

  try {
    const { candles, watermarks } = await loadHoldingDailyCandleState([sym]);
    let merged = bestKnownCandles(sym, candles);
    if (isDailyHistoryUsable(merged)) {
      writeCache(sym, merged);
      if (needsDailyRefresh(watermarks[sym])) void syncDailyCandleHistory(sym, watermarks[sym]);
      return merged;
    }

    if (needsDailyRefresh(watermarks[sym])) {
      await syncDailyCandleHistory(sym, watermarks[sym] ?? null);
      const refreshed = await loadHoldingDailyCandleState([sym]);
      merged = bestKnownCandles(sym, refreshed.candles);
    }

    if (merged.length > 0) {
      writeCache(sym, merged);
      return merged;
    }
  } catch {
    // 云端不可用时降级。
  }
  return fetchDailyHistoryLocal(sym);
}

/**
 * 批量拉取日线：
 * - 有可用缓存时立即返回，后台增量同步；
 * - 首屏无数据时等待同步完成。
 */
export async function fetchDailyHistories(
  symbols: string[],
  concurrency = SYNC_CONCURRENCY
): Promise<Record<string, DailyCandle[]>> {
  const uniq = normalizeSymbols(symbols);
  const out: Record<string, DailyCandle[]> = {};
  if (uniq.length === 0) return out;

  let stored: Record<string, DailyCandle[]> = {};
  let watermarks: Record<string, string> = {};
  try {
    const state = await loadHoldingDailyCandleState(uniq);
    stored = state.candles;
    watermarks = state.watermarks;
  } catch {
    // 读库失败时仍尝试本地/Yahoo。
  }

  const stale: string[] = [];
  const blocking: string[] = [];

  for (const sym of uniq) {
    const merged = bestKnownCandles(sym, stored);
    if (merged.length > 0) out[sym] = merged;
    if (needsDailyRefresh(watermarks[sym] ?? latestCandleDate(merged))) {
      if (!alreadySyncedToday(sym)) stale.push(sym);
    }
    if (!isDailyHistoryUsable(merged)) blocking.push(sym);
  }

  const syncPromise =
    stale.length > 0 ? syncDailyCandleHistories(stale, concurrency) : Promise.resolve();

  if (blocking.length > 0) {
    await syncPromise;
    try {
      const refreshed = await loadHoldingDailyCandleState(blocking);
      for (const sym of blocking) {
        const merged = bestKnownCandles(sym, refreshed.candles);
        if (merged.length > 0) {
          out[sym] = merged;
          writeCache(sym, merged);
        }
      }
    } catch {
      // fall through to local fetch
    }
  } else {
    void syncPromise;
  }

  const missing = uniq.filter((sym) => !out[sym] || out[sym].length === 0);
  if (missing.length === 0) return out;

  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
    while (index < missing.length) {
      const sym = missing[index++];
      const candles = await fetchDailyHistoryLocal(sym);
      if (candles.length > 0) out[sym] = candles;
    }
  });
  await Promise.all(workers);
  return out;
}
