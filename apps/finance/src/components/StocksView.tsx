import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceData } from "../types";
import { useFinance } from "../store/store";
import { createBundledRobinhoodSnapshot } from "../engine/holdings";
import {
  buildPositionRows,
  computeAllocation,
  computeAllocationTrend,
  computeInvestedScopeTotals,
  computeLiveTotals,
  sortPositionRows,
  sortedSnapshots,
  snapshotAsOfLabel,
  type PriceTrailPoint,
  type HoldingsSort,
  type PositionRowView,
} from "../engine/holdingsPortfolio";
import { computeThemeConcentration } from "../engine/portfolioAllocation";
import { useHoldingsLive } from "../hooks/useHoldingsLive";
import { prefetchDailyCandleHistories } from "../lib/priceHistory";
import { LiveStatusBar } from "./stocks/LiveStatusBar";
import { PortfolioAllocationSection } from "./stocks/PortfolioAllocationSection";
import { HoldingsWatchlist } from "./stocks/HoldingsWatchlist";
import { SnapshotPicker } from "./stocks/SnapshotPicker";
import { SnapshotComparePanel } from "./stocks/SnapshotComparePanel";
import { StocksSummaryKpis } from "./stocks/StocksSummaryKpis";
import { PositionDrawer } from "./stocks/PositionDrawer";
import { InvestmentAdvisor } from "./stocks/InvestmentAdvisor";
import type { LiveHistoryPoint } from "../hooks/useHoldingsLive";
import type { MonthlySavingCapacity } from "../engine/metrics";
import { useLocale } from "../i18n/context";

function readSnapshotIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("snapshot");
  return id?.trim() || null;
}

function parseSnapshotTs(date: string, time?: string): number {
  const hourMin = time?.trim() ? `${time.trim()}:00` : "00:00:00";
  const ts = Date.parse(`${date}T${hourMin}`);
  return Number.isFinite(ts) ? ts : Date.now();
}

function buildSnapshotTrails(
  snapshots: { asOfDate: string; asOfTimeLocal?: string; positions: { ticker: string; marketPrice: number }[] }[]
): Record<string, PriceTrailPoint[]> {
  const out: Record<string, PriceTrailPoint[]> = {};
  const asc = snapshots
    .slice()
    .sort(
      (a, b) =>
        parseSnapshotTs(a.asOfDate, a.asOfTimeLocal) -
        parseSnapshotTs(b.asOfDate, b.asOfTimeLocal)
    );
  for (const snapshot of asc) {
    const ts = parseSnapshotTs(snapshot.asOfDate, snapshot.asOfTimeLocal);
    for (const position of snapshot.positions) {
      const ticker = position.ticker?.trim().toUpperCase();
      if (!ticker || !Number.isFinite(position.marketPrice) || position.marketPrice <= 0) continue;
      if (!out[ticker]) out[ticker] = [];
      out[ticker].push({ ts, price: position.marketPrice, source: "snapshot" });
    }
  }
  return out;
}

function mergeTrails(
  snapshotTrails: Record<string, PriceTrailPoint[]>,
  liveHistory: Record<string, LiveHistoryPoint[]>
): Record<string, PriceTrailPoint[]> {
  const out: Record<string, PriceTrailPoint[]> = {};
  const symbols = new Set([...Object.keys(snapshotTrails), ...Object.keys(liveHistory)]);
  for (const symbol of symbols) {
    const points: PriceTrailPoint[] = [
      ...(snapshotTrails[symbol] ?? []),
      ...((liveHistory[symbol] ?? []).map((point) => ({
        ts: point.ts,
        price: point.price,
        source: "live" as const,
      }))),
    ]
      .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price) && point.price > 0)
      .sort((a, b) => a.ts - b.ts);
    if (points.length > 0) out[symbol] = points;
  }
  return out;
}

export function StocksView({
  data,
  tabActive = true,
  onGoSettings,
  savingCapacity,
}: {
  data: FinanceData;
  tabActive?: boolean;
  onGoSettings?: () => void;
  savingCapacity?: MonthlySavingCapacity;
}) {
  const { t, locale } = useLocale();
  const store = useFinance();
  const snapshots = useMemo(() => sortedSnapshots(data.holdingsSnapshots), [data.holdingsSnapshots]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(snapshots[0]?.id ?? null);
  const [compareOlderId, setCompareOlderId] = useState<string | null>(snapshots[1]?.id ?? null);
  const [compareNewerId, setCompareNewerId] = useState<string | null>(snapshots[0]?.id ?? null);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [sort, setSort] = useState<HoldingsSort>("weight");
  const [selectedRow, setSelectedRow] = useState<PositionRowView | null>(null);

  // 内置持仓快照作为内部数据自动加载：store 里没有任何快照时静默写入一次，
  // 不向用户暴露任何「导入」入口。autoLoadedRef 防止 StrictMode 下重复写入。
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (data.holdingsSnapshots.length > 0) return;
    autoLoadedRef.current = true;
    try {
      const { snapshot } = createBundledRobinhoodSnapshot(data.accounts);
      store.upsertHoldingsSnapshot(snapshot);
      setActiveSnapshotId(snapshot.id);
    } catch {
      // 内置数据异常时静默跳过，页面回退到占位提示。
    }
  }, [data.holdingsSnapshots.length, data.accounts, store]);

  useEffect(() => {
    const fromUrl = readSnapshotIdFromUrl();
    if (fromUrl && snapshots.some((s) => s.id === fromUrl)) {
      setActiveSnapshotId(fromUrl);
    }
  }, [snapshots]);

  useEffect(() => {
    if (snapshots.length < 2) return;
    if (!compareOlderId || !snapshots.some((s) => s.id === compareOlderId)) {
      setCompareOlderId(snapshots[1]?.id ?? null);
    }
    if (!compareNewerId || !snapshots.some((s) => s.id === compareNewerId)) {
      setCompareNewerId(snapshots[0]?.id ?? null);
    }
  }, [snapshots, compareOlderId, compareNewerId]);

  const activeSnapshot = snapshots.find((s) => s.id === activeSnapshotId) ?? snapshots[0] ?? null;
  const symbols = useMemo(
    () => activeSnapshot?.positions.map((p) => p.ticker) ?? [],
    [activeSnapshot?.id, activeSnapshot?.positions]
  );

  const live = useHoldingsLive(
    symbols,
    trackingEnabled && Boolean(activeSnapshot),
    tabActive
  );

  // 进入股票页时后台预热日线（不阻塞渲染；InvestmentAdvisor 读缓存优先）。
  const dailySyncKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tabActive || symbols.length === 0) return;
    const key = symbols.join(",");
    if (dailySyncKeyRef.current === key) return;
    dailySyncKeyRef.current = key;
    prefetchDailyCandleHistories(symbols);
  }, [tabActive, symbols]);

  const snapshotTrails = useMemo(() => buildSnapshotTrails(snapshots), [snapshots]);
  const mergedTrails = useMemo(
    () => mergeTrails(snapshotTrails, live.history),
    [snapshotTrails, live.history]
  );

  const rows = useMemo(() => {
    if (!activeSnapshot) return [];
    return sortPositionRows(buildPositionRows(activeSnapshot, live.quotes, mergedTrails), sort);
  }, [activeSnapshot, live.quotes, mergedTrails, sort]);

  const allocation = useMemo(() => computeAllocation(rows), [rows]);
  const totals = useMemo(
    () => computeLiveTotals(rows, activeSnapshot?.holdingsMarketValue ?? 0),
    [rows, activeSnapshot?.holdingsMarketValue]
  );
  const investedScope = useMemo(
    () =>
      computeInvestedScopeTotals(
        totals.liveTotal,
        data.accounts,
        activeSnapshot?.impliedCostBasis
      ),
    [totals.liveTotal, data.accounts, activeSnapshot?.impliedCostBasis]
  );
  const allocationTrend = useMemo(() => computeAllocationTrend(snapshots), [snapshots]);
  const themeConcentration = useMemo(
    () =>
      computeThemeConcentration(
        rows.map((r) => ({ ticker: r.position.ticker, value: r.snapshotValue }))
      ),
    [rows, locale]
  );

  // 进入页面时算一次即可：陈旧与否按「天」衡量，不需要随渲染刷新。
  // 注意 asOfTimeLocal 可能是 "07:22-07:23" 这类区间，不能进 parseSnapshotTs，只按日期算。
  const [nowTs] = useState(() => Date.now());
  const snapshotAsOfTs = activeSnapshot ? Date.parse(activeSnapshot.asOfDate) : Number.NaN;
  const snapshotAgeDays = Number.isFinite(snapshotAsOfTs)
    ? Math.floor((nowTs - snapshotAsOfTs) / 86_400_000)
    : 0;

  if (snapshots.length === 0) {
    return (
      <div className="empty">
        <h3>{t("stocks.view.emptyTitle")}</h3>
        <p className="muted-note mb-0">{t("stocks.view.emptyNote")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* 页面标题由 AppShell banner 提供，这里只保留数据口径与新鲜度 */}
      {activeSnapshot && (
        <header className="portfolio-page-head">
          <div className="portfolio-page-scope">
            <span className="tag">{activeSnapshot.accountLabel ?? "Robinhood"}</span>
            {investedScope.lockedBalance > 0 ? (
              <span className="tag">{t("stocks.view.tagIncludesRetirement")}</span>
            ) : (
              <span className="tag warn">{t("stocks.view.tagTaxableOnly")}</span>
            )}
            <span className="text-secondary text-sm">
              {t("stocks.view.updatedAt", { label: snapshotAsOfLabel(activeSnapshot) })}
            </span>
            {snapshotAgeDays >= 7 && (
              <span className="tag warn">
                {t("stocks.view.snapshotStale", { days: snapshotAgeDays })}
              </span>
            )}
            {!tabActive && trackingEnabled && (
              <span className="tag warn">{t("stocks.view.quotesPaused")}</span>
            )}
          </div>
        </header>
      )}

      <PortfolioAllocationSection
        data={data}
        allocation={allocation}
        activeSnapshot={activeSnapshot}
        taxableSecurities={totals.liveTotal}
        onGoSettings={onGoSettings}
        trend={allocationTrend}
        themes={themeConcentration}
        kpiSlot={
          <StocksSummaryKpis
            scope={investedScope}
            todayReturnAmount={activeSnapshot?.todayReturnAmountApprox}
            todayReturnPct={activeSnapshot?.todayReturnPctApprox}
            unrealizedGain={activeSnapshot?.unrealizedGain}
            weightedTotalReturnPct={activeSnapshot?.weightedTotalReturnPct}
            positionCount={activeSnapshot?.positionCount ?? 0}
            privacy={data.privacy}
          />
        }
      />

      <InvestmentAdvisor
        data={data}
        rows={rows}
        totalValue={totals.liveTotal}
        savingCapacity={savingCapacity}
        tabActive={tabActive}
      />

      <h2 className="portfolio-layer-title portfolio-layer-details">{t("stocks.view.detailsLayer")}</h2>

      <HoldingsWatchlist
        rows={rows}
        privacy={data.privacy}
        sort={sort}
        onSortChange={setSort}
        onSelect={setSelectedRow}
      />

      <details className="card stocks-secondary-tools">
        <summary>
          {t("stocks.view.quoteControls.title")}
          <span className="tag inline-meta">{t("stocks.view.quoteControls.secondary")}</span>
        </summary>
        <div className="stocks-refresh-actions">
          <button className="btn ghost" onClick={() => setTrackingEnabled((v) => !v)}>
            {trackingEnabled
              ? t("stocks.view.quoteControls.pause")
              : t("stocks.view.quoteControls.resume")}
          </button>
          <button
            className="btn"
            onClick={() => void live.refresh()}
            disabled={live.loading || !activeSnapshot}
          >
            {live.loading
              ? t("stocks.view.quoteControls.refreshing")
              : t("stocks.view.quoteControls.refreshNow")}
          </button>
        </div>
        <LiveStatusBar
          status={live.status}
          updatedAt={live.updatedAt}
          pollIntervalSec={live.pollIntervalMs / 1000}
          error={live.error}
        />
      </details>

      <details className="card stocks-secondary-tools">
        <summary>
          {t("stocks.view.history.title")}
          <span className="tag inline-meta">
            {t("stocks.view.history.count", { count: snapshots.length })}
          </span>
        </summary>
        {snapshots.length < 2 && (
          <p className="muted-note mt-2">{t("stocks.view.history.hint")}</p>
        )}
        <div className="grid gap-3 mt-3">
          <SnapshotComparePanel
            snapshots={snapshots}
            olderId={compareOlderId}
            newerId={compareNewerId}
            privacy={data.privacy}
            onOlderChange={setCompareOlderId}
            onNewerChange={setCompareNewerId}
          />

          <SnapshotPicker
            snapshots={snapshots}
            activeId={activeSnapshot?.id ?? null}
            privacy={data.privacy}
            onSelect={setActiveSnapshotId}
            onDelete={(id) => {
              store.removeHoldingsSnapshot(id);
              if (activeSnapshotId === id) {
                const rest = snapshots.filter((s) => s.id !== id);
                setActiveSnapshotId(rest[0]?.id ?? null);
              }
            }}
          />
        </div>
      </details>

      {selectedRow && (
        <PositionDrawer
          row={selectedRow}
          privacy={data.privacy}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
