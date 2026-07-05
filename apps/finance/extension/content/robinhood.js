// Robinhood 抓取（2026-07 MHTML 实测）。
// 列表页：VirtualizedSidebar + PositionCell（仅 % 无 $ 盈亏；QuoteWrapper 可能是单价或市值）
// 详情页 /stocks/TICKER：caption-text + table.table 含均价/今日盈亏/累计盈亏
// 缺失详情时由 background 后台批量打开个股页补齐后再入队。

(() => {
  const { parseMoney, parseShares, parsePct, makeEnvelope, enqueue, captureWhenStable, onUrlChange } =
    window.FOS;
  const FOS_RH = window.FOS_RH;
  if (!FOS_RH) {
    console.error("[FOS] rhDetailsShared.js 未加载，Robinhood 抓取不可用");
    return;
  }
  const RH_DETAILS_KEY = FOS_RH.RH_DETAILS_KEY;

  function getVirtualListRoot() {
    return (
      document.querySelector('[data-testid="VirtualizedSidebar"] .ReactVirtualized__List') ??
      document.querySelector(".ReactVirtualized__List")
    );
  }

  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  /** Virtualized 列表会在 DOM 保留缓冲行：必须落在列表滚动视口内才算有效。 */
  function isCellInListViewport(cell, listRoot) {
    if (!isVisible(cell)) return false;
    if (!listRoot) return true;
    const lr = listRoot.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    return (
      cr.bottom > lr.top + 1 &&
      cr.top < lr.bottom - 1 &&
      cr.right > lr.left + 1 &&
      cr.left < lr.right - 1
    );
  }

  function readPortfolioValue() {
    const root = document.querySelector('[data-testid="PortfolioValue"]');
    if (!root) return null;
    const labeled = root.querySelector("[aria-label]");
    return labeled ? parseMoney(labeled.getAttribute("aria-label")) : null;
  }

  function positionScore(p) {
    let score = 0;
    if (p.averageCostPerShare != null) score += 4;
    if (p.totalReturnAmount != null) score += 2;
    if (p.todayReturnAmount != null) score += 2;
    if (p.todayPct != null) score += 1;
    return score;
  }

  function mergePosition(a, b) {
    const primary = positionScore(b) > positionScore(a) ? b : a;
    const secondary = primary === a ? b : a;
    return {
      ticker: primary.ticker,
      securityName: primary.securityName ?? secondary.securityName,
      shares: primary.shares > 0 ? primary.shares : secondary.shares,
      price: primary.price > 0 ? primary.price : secondary.price,
      todayPct: primary.todayPct ?? secondary.todayPct,
      todayReturnAmount: primary.todayReturnAmount ?? secondary.todayReturnAmount,
      totalReturnAmount: primary.totalReturnAmount ?? secondary.totalReturnAmount,
      averageCostPerShare: primary.averageCostPerShare ?? secondary.averageCostPerShare,
      marketValue: primary.marketValue ?? secondary.marketValue,
    };
  }

  function dedupePositions(positions) {
    const byTicker = new Map();
    for (const p of positions) {
      const key = p.ticker;
      const prev = byTicker.get(key);
      byTicker.set(key, prev ? mergePosition(prev, p) : p);
    }
    return [...byTicker.values()];
  }

  async function loadCachedDetails() {
    const obj = await chrome.storage.local.get(RH_DETAILS_KEY);
    return obj[RH_DETAILS_KEY] ?? {};
  }

  async function savePositionDetail(detail) {
    if (!detail?.ticker) return null;
    const cache = await loadCachedDetails();
    const key = String(detail.ticker).trim().toUpperCase();
    cache[key] = {
      ...cache[key],
      ...detail,
      ticker: key,
      capturedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ [RH_DETAILS_KEY]: cache });
    try {
      await chrome.runtime.sendMessage({
        type: "FOS_RH_DETAIL_SAVED",
        ticker: key,
        detail: cache[key],
      });
    } catch {
      // background 可能尚未就绪
    }
    return cache[key];
  }

  function readListPositions() {
    const listRoot = getVirtualListRoot();
    const cells = document.querySelectorAll('[data-testid="PositionCell"]');
    const out = [];
    for (const cell of cells) {
      if (!isCellInListViewport(cell, listRoot)) continue;
      const link = cell.querySelector('a[href*="/stocks/"]');
      const tickerMatch = link?.getAttribute("href")?.match(/\/stocks\/([A-Z][A-Z0-9.]*)/);
      if (!tickerMatch) continue;
      const shares = parseShares(cell.textContent);
      if (shares == null || shares <= 0) continue;
      const priceEl = cell.querySelector('[data-testid="PriceChangeQuoteWrapper"]');
      const quoted = parseMoney(priceEl?.textContent);
      if (quoted == null || quoted <= 0) continue;
      const pctEl = cell.querySelector('[data-testid="PriceChangeValueWrapper"]');
      const todayPct = parsePct(pctEl?.textContent) ?? undefined;
      const { price, marketValue } = FOS_RH.normalizeQuote(quoted, shares, null);
      const mv = marketValue ?? Math.round(shares * price * 100) / 100;
      out.push({
        ticker: tickerMatch[1],
        shares,
        price,
        todayPct,
        marketValue: mv,
        todayReturnAmount: FOS_RH.deriveTodayReturnAmount(mv, todayPct),
      });
    }
    return dedupePositions(out);
  }

  /** 个股详情页：Your average cost / Today's return / Total return */
  function readStockDetailMetrics() {
    const m = location.pathname.match(/\/stocks\/([A-Z][A-Z0-9.]*)/i);
    if (!m) return null;

    const ticker = m[1].toUpperCase();
    let averageCostPerShare;
    let marketValue;

    for (const cap of document.querySelectorAll(".caption-text")) {
      const label = cap.textContent.trim();
      const h2 = cap.parentElement?.querySelector("h2");
      if (label === "Your average cost") averageCostPerShare = parseMoney(h2?.textContent);
      if (label === "Your market value") marketValue = parseMoney(h2?.textContent);
    }

    let todayReturnAmount;
    let todayReturnPct;
    let totalReturnAmount;
    let totalReturnPct;
    let shares;

    for (const tr of document.querySelectorAll("table.table tbody tr")) {
      const label = tr.querySelector("td")?.textContent?.trim() ?? "";
      const rowText = tr.textContent ?? "";
      const bold = tr.querySelector(".bold");
      if (label.startsWith("Today's return")) {
        todayReturnAmount = parseMoney(bold?.textContent);
        todayReturnPct = parsePct(rowText);
      } else if (label.startsWith("Total return")) {
        totalReturnAmount = parseMoney(bold?.textContent);
        totalReturnPct = parsePct(rowText);
      } else if (label === "Shares") {
        const cells = tr.querySelectorAll("td");
        const raw = cells[cells.length - 1]?.textContent ?? "";
        const parsed = Number(String(raw).replace(/,/g, ""));
        if (Number.isFinite(parsed) && parsed > 0) shares = parsed;
      }
    }

    if (
      averageCostPerShare == null &&
      marketValue == null &&
      todayReturnAmount == null &&
      totalReturnAmount == null
    ) {
      return null;
    }

    return {
      ticker,
      averageCostPerShare: averageCostPerShare ?? undefined,
      marketValue: marketValue ?? undefined,
      shares: shares ?? undefined,
      todayReturnAmount: todayReturnAmount ?? undefined,
      todayReturnPct: todayReturnPct ?? undefined,
      totalReturnAmount: totalReturnAmount ?? undefined,
      totalReturnPct: totalReturnPct ?? undefined,
    };
  }

  function isListPage() {
    return Boolean(document.querySelector('[data-testid="VirtualizedSidebar"]'));
  }

  function isDetailPage() {
    return /\/stocks\/[A-Z0-9.]+/i.test(location.pathname);
  }

  let lastListSig = null;
  let lastDetailSig = null;

  function startListCapture() {
    if (!isListPage()) return;
    captureWhenStable({
      probe: () => {
        const positions = readListPositions();
        if (positions.length === 0) return null;
        return { positions, totalValue: readPortfolioValue() ?? undefined };
      },
      capture: (result) => {
        void (async () => {
          const cache = await loadCachedDetails();
          const merged = FOS_RH.mergePositionsWithCache(result.positions, cache);
          const sig = JSON.stringify(
            merged.map((p) => [p.ticker, p.shares, p.price, p.averageCostPerShare])
          );
          if (sig === lastListSig) return;
          lastListSig = sig;

          const holdingsPayload = {
            institution: "Robinhood",
            accountLabel: "Robinhood individual",
            totalValue: result.totalValue,
            positions: merged,
          };

          const tickers = merged.map((p) => p.ticker);
          const stale = FOS_RH.tickersNeedingEnrich(tickers, cache);

          if (stale.length > 0) {
            chrome.runtime.sendMessage({
              type: "FOS_RH_START_ENRICH",
              tickers: stale,
              holdings: holdingsPayload,
            });
            console.info(
              `[FOS] Robinhood 列表 ${merged.length} 只，后台补齐 ${stale.length} 只详情（均价/盈亏）…`
            );
            return;
          }

          const env = makeEnvelope("robinhood", "holdings", holdingsPayload);
          await enqueue(env);
          console.info(`[FOS] Robinhood 持仓已抓取：${merged.length} 只（详情已齐全）`);
        })();
      },
    });
  }

  function startDetailCapture() {
    if (!isDetailPage()) return;
    captureWhenStable({
      probe: () => readStockDetailMetrics(),
      capture: (detail) => {
        void (async () => {
          const sig = JSON.stringify(detail);
          if (sig === lastDetailSig) return;
          lastDetailSig = sig;
          const saved = await savePositionDetail(detail);
          console.info(`[FOS] Robinhood 详情已缓存：${detail.ticker}`, saved);
        })();
      },
    });
  }

  function startCapture() {
    startListCapture();
    startDetailCapture();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "FOS_RH_FORCE_DETAIL_CAPTURE") {
      lastDetailSig = null;
      startDetailCapture();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  startCapture();
  onUrlChange(() => {
    lastListSig = null;
    lastDetailSig = null;
    startCapture();
  });
})();
