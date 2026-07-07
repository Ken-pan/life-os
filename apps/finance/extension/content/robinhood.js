// Robinhood 抓取 — DOM 探测与虚拟列表滚动见 rhFinanceProbes.js（与 WSD 共用）。
// 缺失详情时由 background 复用已有 tab 批量补齐后再入队。

;(() => {
  const { makeEnvelope, enqueue, captureWhenStable, onUrlChange } = window.FOS
  const FOS_RH = window.FOS_RH
  const RH = window.RH_PROBES
  if (!FOS_RH || !RH) {
    console.error('[FOS] rhDetailsShared.js / rhFinanceProbes.js 未加载')
    return
  }
  const RH_DETAILS_KEY = FOS_RH.RH_DETAILS_KEY

  async function loadCachedDetails() {
    const obj = await chrome.storage.local.get(RH_DETAILS_KEY)
    return obj[RH_DETAILS_KEY] ?? {}
  }

  async function savePositionDetail(detail) {
    if (!detail?.ticker) return null
    const cache = await loadCachedDetails()
    const key = String(detail.ticker).trim().toUpperCase()
    cache[key] = {
      ...cache[key],
      ...detail,
      ticker: key,
      capturedAt: new Date().toISOString(),
    }
    await chrome.storage.local.set({ [RH_DETAILS_KEY]: cache })
    try {
      await chrome.runtime.sendMessage({
        type: 'FOS_RH_DETAIL_SAVED',
        ticker: key,
        detail: cache[key],
      })
    } catch {
      // background 可能尚未就绪
    }
    return cache[key]
  }

  function mergeWithCache(positions, cache) {
    return FOS_RH.mergePositionsWithCache(positions, cache)
  }

  async function enqueueHoldings(positions, totalValue) {
    const cache = await loadCachedDetails()
    const merged = mergeWithCache(positions, cache)
    const holdingsPayload = {
      institution: 'Robinhood',
      accountLabel: 'Robinhood individual',
      totalValue,
      positions: merged,
    }
    const tickers = merged.map((p) => p.ticker)
    const stale = FOS_RH.tickersNeedingEnrich(tickers, cache)
    await enqueue(makeEnvelope('robinhood', 'holdings', holdingsPayload))
    if (stale.length > 0) {
      chrome.runtime.sendMessage({
        type: 'FOS_RH_START_ENRICH',
        tickers: stale,
        holdings: holdingsPayload,
      })
      console.info(
        `[FOS] Robinhood 列表 ${merged.length} 只已入队，后台补齐 ${stale.length} 只详情…`,
      )
      return
    }
    console.info(
      `[FOS] Robinhood 持仓已抓取：${merged.length} 只（详情已齐全）`,
    )
  }

  let lastListSig = null
  let lastDetailSig = null
  let fullListScanDone = false

  function startListCapture() {
    if (!RH.isListPage()) return
    captureWhenStable({
      probe: () => {
        const positions = RH.readListPositions()
        if (positions.length === 0) return null
        return { positions, totalValue: RH.readPortfolioValue() ?? undefined }
      },
      capture: (result) => {
        void (async () => {
          const sig = JSON.stringify(
            result.positions.map((p) => [
              p.ticker,
              p.shares,
              p.price,
              p.averageCostPerShare,
            ]),
          )
          if (sig === lastListSig) return
          lastListSig = sig
          await enqueueHoldings(result.positions, result.totalValue)
        })()
      },
      maxWaitMs: 3500,
      quietMs: 600,
    })

    if (!fullListScanDone) {
      fullListScanDone = true
      void (async () => {
        await RH.sleep(2800)
        if (!RH.isListPage()) return
        const all = await RH.scrollAndReadAllPositions()
        if (all.length === 0) return
        const sig = JSON.stringify(
          all.map((p) => [p.ticker, p.shares, p.price]),
        )
        if (sig === lastListSig) return
        lastListSig = sig
        await enqueueHoldings(all, RH.readPortfolioValue() ?? undefined)
        console.info(`[FOS] Robinhood 全列表扫描：${all.length} 只`)
      })()
    }
  }

  function startDetailCapture() {
    if (!RH.isDetailPage()) return
    captureWhenStable({
      probe: () => RH.readStockDetailMetrics(),
      capture: (detail) => {
        void (async () => {
          const sig = JSON.stringify(detail)
          if (sig === lastDetailSig) return
          lastDetailSig = sig
          const saved = await savePositionDetail(detail)
          console.info(`[FOS] Robinhood 详情已缓存：${detail.ticker}`, saved)
        })()
      },
    })
  }

  function startCapture() {
    startListCapture()
    startDetailCapture()
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'FOS_RH_FORCE_DETAIL_CAPTURE') {
      lastDetailSig = null
      startDetailCapture()
      sendResponse({ ok: true })
      return true
    }
    if (msg?.type === 'FOS_RH_PING') {
      const positions = RH.readListPositions()
      sendResponse({
        ok: true,
        isListPage: RH.isListPage(),
        positions: positions.length,
      })
      return true
    }
    if (msg?.type === 'FOS_RH_FORCE_LIST_CAPTURE') {
      void (async () => {
        if (msg.waitForReady !== false) {
          await RH.waitForListReady(25000)
        }
        const all = await RH.scrollAndReadAllPositions()
        if (all.length > 0) {
          lastListSig = null
          await enqueueHoldings(all, RH.readPortfolioValue() ?? undefined)
        }
        sendResponse({
          ok: true,
          positions: all.length,
          isListPage: RH.isListPage(),
        })
      })()
      return true
    }
    return false
  })

  void chrome.storage.local
    .get('fos_pending_crawl')
    .then(({ fos_pending_crawl }) => {
      if (fos_pending_crawl === 'robinhood') {
        void chrome.storage.local.remove('fos_pending_crawl')
        void (async () => {
          await RH.waitForListReady(25000)
          const all = await RH.scrollAndReadAllPositions()
          if (all.length > 0) {
            await enqueueHoldings(all, RH.readPortfolioValue() ?? undefined)
          }
        })()
      }
    })

  startCapture()
  onUrlChange(() => {
    lastListSig = null
    lastDetailSig = null
    fullListScanDone = false
    startCapture()
  })
})()
