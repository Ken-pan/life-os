import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIVE_PRICE_HISTORY_STORAGE_KEY } from "../lib/localDataKeys";
import { fetchLiveQuotes, type LiveQuote } from "../lib/quotes";
import { loadHoldingPriceTrails, upsertHoldingPriceTrailPoints } from "../lib/repo";

export type LiveTrackStatus = "idle" | "loading" | "live" | "partial" | "stale" | "error" | "paused";

export interface LiveHistoryPoint {
  ts: number;
  price: number;
}
const HISTORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_SAMPLES_PER_SYMBOL = 480;
const MIN_SAMPLE_GAP_MS = 8_000;
const REMOTE_SYNC_DEBOUNCE_MS = 2_000;
const MAX_REMOTE_SYNC_POINTS = 1200;

function loadHistory(): Record<string, LiveHistoryPoint[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LIVE_PRICE_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LiveHistoryPoint[]>;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const out: Record<string, LiveHistoryPoint[]> = {};
    for (const [symbol, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      const cleaned = list
        .filter((point) => Number.isFinite(point?.ts) && Number.isFinite(point?.price) && point.price > 0)
        .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_SAMPLES_PER_SYMBOL);
      if (cleaned.length > 0) out[symbol] = cleaned;
    }
    return out;
  } catch {
    return {};
  }
}

function saveHistory(history: Record<string, LiveHistoryPoint[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIVE_PRICE_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // 存储不可写时静默降级，不影响行情刷新。
  }
}

function pollIntervalForSize(size: number): number {
  if (size <= 8) return 15_000;
  if (size <= 25) return 30_000;
  return 45_000;
}

function mergePointLists(
  a: LiveHistoryPoint[] | undefined,
  b: LiveHistoryPoint[] | undefined
): LiveHistoryPoint[] {
  const merged = [...(a ?? []), ...(b ?? [])]
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price) && point.price > 0)
    .sort((x, y) => x.ts - y.ts);
  const deduped: LiveHistoryPoint[] = [];
  for (const point of merged) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(point);
      continue;
    }
    if (Math.abs(prev.ts - point.ts) <= 1_000 && Math.abs(prev.price - point.price) < 1e-8) continue;
    deduped.push(point);
  }
  const now = Date.now();
  return deduped
    .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
    .slice(-MAX_SAMPLES_PER_SYMBOL);
}

export function useHoldingsLive(
  symbols: string[],
  trackingEnabled: boolean,
  tabActive = true
) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [status, setStatus] = useState<LiveTrackStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, LiveHistoryPoint[]>>(() => loadHistory());
  const syncedWatermarkRef = useRef<Record<string, number>>({});
  const remoteLoadedKeyRef = useRef<string>("");

  const normalizedSymbols = useMemo(
    () => [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))],
    [symbols]
  );
  const symbolKey = normalizedSymbols.join("|");
  const pollIntervalMs = pollIntervalForSize(normalizedSymbols.length);

  const refresh = useCallback(async () => {
    const uniq = normalizedSymbols;
    if (uniq.length === 0) {
      setStatus("idle");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus("loading");
    try {
      const next = await fetchLiveQuotes(uniq);
      const got = Object.keys(next).length;
      const hasCachedQuotes = Object.keys(quotes).length > 0;
      if (got === 0) {
        setStatus(hasCachedQuotes ? "stale" : "error");
        setError("实时行情暂不可用，界面沿用快照价格。");
        return;
      }
      setQuotes((prev) => ({ ...prev, ...next }));
      setHistory((prev) => {
        const now = Date.now();
        const nextHistory = { ...prev };
        for (const [symbol, quote] of Object.entries(next)) {
          if (!Number.isFinite(quote.price) || quote.price <= 0) continue;
          const list = [...(nextHistory[symbol] ?? [])];
          const last = list[list.length - 1];
          if (last && Math.abs(last.price - quote.price) < 1e-8 && now - last.ts < pollIntervalMs + 5_000) {
            continue;
          }
          if (last && now - last.ts < MIN_SAMPLE_GAP_MS) {
            list[list.length - 1] = { ts: now, price: quote.price };
          } else {
            list.push({ ts: now, price: quote.price });
          }
          nextHistory[symbol] = list
            .filter((point) => now - point.ts <= HISTORY_RETENTION_MS)
            .slice(-MAX_SAMPLES_PER_SYMBOL);
        }
        return nextHistory;
      });
      setUpdatedAt(new Date().toISOString());
      if (got < uniq.length) {
        setStatus("partial");
        setError(`${uniq.length - got} 只代码未拿到最新价，其余已更新。`);
      } else {
        setStatus("live");
        setError(null);
      }
    } catch (e) {
      setStatus(Object.keys(quotes).length > 0 ? "stale" : "error");
      setError(e instanceof Error ? e.message : "拉取实时行情失败");
    } finally {
      setLoading(false);
    }
  }, [normalizedSymbols, pollIntervalMs, quotes]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    if (!symbolKey) return;
    if (remoteLoadedKeyRef.current === symbolKey) return;
    let cancelled = false;
    remoteLoadedKeyRef.current = symbolKey;
    void (async () => {
      try {
        const remote = await loadHoldingPriceTrails(normalizedSymbols);
        if (cancelled) return;
        setHistory((prev) => {
          const next = { ...prev };
          for (const symbol of normalizedSymbols) {
            const merged = mergePointLists(
              next[symbol],
              remote[symbol]?.map((point) => ({ ts: point.ts, price: point.price }))
            );
            if (merged.length > 0) next[symbol] = merged;
          }
          return next;
        });
        for (const symbol of normalizedSymbols) {
          const remotePoints = remote[symbol];
          if (!remotePoints || remotePoints.length === 0) continue;
          syncedWatermarkRef.current[symbol] = Math.max(
            syncedWatermarkRef.current[symbol] ?? 0,
            remotePoints[remotePoints.length - 1].ts
          );
        }
      } catch {
        // 远端轨迹不可用时静默降级，继续使用本地缓存。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedSymbols, symbolKey]);

  useEffect(() => {
    if (normalizedSymbols.length === 0) return;
    const pending = normalizedSymbols.flatMap((symbol) => {
      const list = history[symbol] ?? [];
      const watermark = syncedWatermarkRef.current[symbol] ?? 0;
      return list
        .filter((point) => point.ts > watermark)
        .map((point) => ({
          symbol,
          ts: point.ts,
          price: point.price,
          sourceType: "live" as const,
        }));
    });
    if (pending.length === 0) return;
    const trimmed = pending.slice(-MAX_REMOTE_SYNC_POINTS);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await upsertHoldingPriceTrailPoints(trimmed);
          const nextWatermark = { ...syncedWatermarkRef.current };
          for (const point of trimmed) {
            nextWatermark[point.symbol] = Math.max(nextWatermark[point.symbol] ?? 0, point.ts);
          }
          syncedWatermarkRef.current = nextWatermark;
        } catch {
          // 写远端失败时保留待同步点，下轮继续尝试。
        }
      })();
    }, REMOTE_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [history, normalizedSymbols]);

  useEffect(() => {
    if (!trackingEnabled || !tabActive || normalizedSymbols.length === 0) {
      return;
    }
    const run = () => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    };
    run();
    const timer = window.setInterval(run, pollIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && tabActive) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, symbolKey, trackingEnabled, tabActive, pollIntervalMs, normalizedSymbols.length]);

  return {
    quotes,
    history,
    status: !trackingEnabled || !tabActive ? "paused" : normalizedSymbols.length === 0 ? "idle" : status,
    loading,
    updatedAt,
    error,
    refresh,
    pollIntervalMs,
  };
}
