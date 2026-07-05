// Robinhood 持仓详情缓存与合并（background + content script 共用）。
(() => {
  const RH_DETAILS_KEY = "fos_rh_position_details";
  const RH_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function deriveTodayReturnAmount(marketValue, todayPct) {
    if (todayPct == null || !Number.isFinite(todayPct) || marketValue <= 0) return undefined;
    return round2((marketValue * todayPct) / (100 + todayPct));
  }

  function detailNeedsRefresh(detail) {
    if (!detail || typeof detail !== "object") return true;
    if (detail.averageCostPerShare == null || detail.averageCostPerShare <= 0) return true;
    if (!detail.capturedAt) return true;
    const ts = Date.parse(detail.capturedAt);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > RH_DETAIL_TTL_MS;
  }

  function normalizeQuote(quotedValue, shares, detail) {
    if (quotedValue == null || quotedValue <= 0 || shares <= 0) {
      return { price: quotedValue, marketValue: undefined };
    }
    const mvFromPrice = round2(quotedValue * shares);
    if (detail?.marketValue != null && detail.marketValue > 0) {
      const errAsPrice = Math.abs(mvFromPrice - detail.marketValue);
      const errAsEquity = Math.abs(quotedValue - detail.marketValue);
      if (errAsEquity + 1 < errAsPrice) {
        return { price: detail.marketValue / shares, marketValue: detail.marketValue };
      }
      return { price: quotedValue, marketValue: detail.marketValue };
    }
    if (quotedValue >= 10_000) {
      const impliedPrice = quotedValue / shares;
      if (impliedPrice > 0.000_001 && impliedPrice < quotedValue * 0.5) {
        return { price: impliedPrice, marketValue: quotedValue };
      }
    }
    return { price: quotedValue, marketValue: mvFromPrice };
  }

  function mergeListWithDetail(listPos, detail) {
    if (!detail) return listPos;
    const shares = detail.shares ?? listPos.shares;
    const { price, marketValue } = normalizeQuote(listPos.price, shares, detail);
    const mv = detail.marketValue ?? marketValue ?? round2(shares * price);
    const averageCostPerShare = detail.averageCostPerShare ?? listPos.averageCostPerShare;
    const todayPct = detail.todayReturnPct ?? listPos.todayPct;
    const todayReturnAmount =
      detail.todayReturnAmount ??
      listPos.todayReturnAmount ??
      deriveTodayReturnAmount(mv, todayPct);
    const totalReturnAmount =
      detail.totalReturnAmount ??
      listPos.totalReturnAmount ??
      (averageCostPerShare != null
        ? round2((price - averageCostPerShare) * shares)
        : undefined);
    return {
      ...listPos,
      shares,
      price,
      marketValue: mv,
      averageCostPerShare,
      todayPct,
      todayReturnAmount,
      totalReturnAmount,
    };
  }

  function mergePositionsWithCache(positions, cache) {
    return positions.map((p) => {
      const key = String(p.ticker ?? "").trim().toUpperCase();
      return mergeListWithDetail(p, cache[key]);
    });
  }

  function tickersNeedingEnrich(tickers, cache, max = 30) {
    const out = [];
    for (const raw of tickers) {
      const ticker = String(raw ?? "").trim().toUpperCase();
      if (!ticker) continue;
      if (detailNeedsRefresh(cache[ticker])) out.push(ticker);
      if (out.length >= max) break;
    }
    return out;
  }

  const api = {
    RH_DETAILS_KEY,
    RH_DETAIL_TTL_MS,
    detailNeedsRefresh,
    mergeListWithDetail,
    mergePositionsWithCache,
    tickersNeedingEnrich,
    deriveTodayReturnAmount,
    normalizeQuote,
  };

  if (typeof self !== "undefined") self.FOS_RH = api;
  if (typeof window !== "undefined") window.FOS_RH = api;
})();
