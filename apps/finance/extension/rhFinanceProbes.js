/**
 * Robinhood DOM probes + virtual-list scroll — shared by Finance OS Sync and WSD.
 */
;(() => {
  if (window.RH_PROBES) return

  function parseMoney(text) {
    if (!text) return null
    const cleaned = String(text).replace(/[,\s]/g, '')
    const m = cleaned.match(/^([+-]?)\$?([+-]?)([\d.]+)$/)
    if (!m) return null
    const sign = m[1] === '-' || m[2] === '-' ? -1 : 1
    const v = Number(m[3])
    return Number.isFinite(v) ? sign * v : null
  }

  function parseShares(text) {
    const m = String(text ?? '').match(/([\d,.]+)\s*shares?/i)
    if (!m) return null
    const v = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(v) ? v : null
  }

  function parsePct(text) {
    const m = String(text ?? '').match(/([+-]?[\d,.]+)\s*%/)
    if (!m) return null
    const v = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(v) ? v : null
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  function getVirtualListRoot() {
    return (
      document.querySelector(
        '[data-testid="VirtualizedSidebar"] .ReactVirtualized__List',
      ) ?? document.querySelector('.ReactVirtualized__List')
    )
  }

  function getVirtualScroller() {
    const root = getVirtualListRoot()
    if (!root) return null
    let el = root.parentElement
    while (el) {
      const oy = getComputedStyle(el).overflowY
      if (
        (oy === 'auto' || oy === 'scroll') &&
        el.scrollHeight > el.clientHeight + 8
      ) {
        return el
      }
      el = el.parentElement
    }
    return root
  }

  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const style = window.getComputedStyle(el)
    return (
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    )
  }

  function isCellInListViewport(cell, listRoot) {
    if (!isVisible(cell)) return false
    if (!listRoot) return true
    const lr = listRoot.getBoundingClientRect()
    const cr = cell.getBoundingClientRect()
    return (
      cr.bottom > lr.top + 1 &&
      cr.top < lr.bottom - 1 &&
      cr.right > lr.left + 1 &&
      cr.left < lr.right - 1
    )
  }

  function readPortfolioValue() {
    const root = document.querySelector('[data-testid="PortfolioValue"]')
    if (!root) return null
    const labeled = root.querySelector('[aria-label]')
    return labeled ? parseMoney(labeled.getAttribute('aria-label')) : null
  }

  function readListPositionsFromDom(listRoot = getVirtualListRoot()) {
    const FOS_RH = window.FOS_RH
    const out = []
    for (const cell of document.querySelectorAll(
      '[data-testid="PositionCell"]',
    )) {
      if (!isCellInListViewport(cell, listRoot)) continue
      const link = cell.querySelector('a[href*="/stocks/"]')
      const tickerMatch = link
        ?.getAttribute('href')
        ?.match(/\/stocks\/([A-Z][A-Z0-9.]*)/)
      if (!tickerMatch) continue
      const shares = parseShares(cell.textContent)
      if (shares == null || shares <= 0) continue
      const priceEl = cell.querySelector(
        '[data-testid="PriceChangeQuoteWrapper"]',
      )
      const quoted = parseMoney(priceEl?.textContent)
      if (quoted == null || quoted <= 0) continue
      const pctEl = cell.querySelector(
        '[data-testid="PriceChangeValueWrapper"]',
      )
      const todayPct = parsePct(pctEl?.textContent) ?? undefined
      let price = quoted
      let marketValue = Math.round(shares * price * 100) / 100
      let todayReturnAmount
      if (FOS_RH?.normalizeQuote) {
        const norm = FOS_RH.normalizeQuote(quoted, shares, null)
        price = norm.price
        marketValue = norm.marketValue ?? marketValue
        todayReturnAmount = FOS_RH.deriveTodayReturnAmount(
          marketValue,
          todayPct,
        )
      }
      out.push({
        ticker: tickerMatch[1],
        shares,
        price,
        todayPct,
        marketValue,
        todayReturnAmount,
      })
    }
    return out
  }

  function dedupePositions(positions) {
    const by = new Map()
    for (const p of positions) {
      const prev = by.get(p.ticker)
      if (!prev) {
        by.set(p.ticker, p)
        continue
      }
      const score = (x) =>
        (x.averageCostPerShare != null ? 4 : 0) +
        (x.totalReturnAmount != null ? 2 : 0) +
        (x.todayReturnAmount != null ? 2 : 0)
      by.set(
        p.ticker,
        score(p) >= score(prev) ? { ...prev, ...p } : { ...p, ...prev },
      )
    }
    return [...by.values()]
  }

  function readListPositions() {
    return dedupePositions(readListPositionsFromDom())
  }

  /** Scroll virtual sidebar to collect off-screen holdings (WSD verify + passive sync). */
  async function scrollAndReadAllPositions(maxSteps = 24) {
    const scroller = getVirtualScroller()
    const listRoot = getVirtualListRoot()
    const collected = new Map()
    const mergeVisible = () => {
      for (const p of readListPositionsFromDom(listRoot)) {
        collected.set(p.ticker, p)
      }
    }
    mergeVisible()
    if (!scroller) return dedupePositions([...collected.values()])

    let idle = 0
    for (let step = 0; step < maxSteps; step++) {
      const before = scroller.scrollTop
      scroller.scrollTop = before + scroller.clientHeight * 0.9
      await sleep(180)
      const prev = collected.size
      mergeVisible()
      if (collected.size === prev) idle += 1
      else idle = 0
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
      if (atBottom && idle >= 2) break
      if (scroller.scrollTop === before && idle >= 2) break
    }
    scroller.scrollTop = 0
    return dedupePositions([...collected.values()])
  }

  async function prepareListPage() {
    const positions = await scrollAndReadAllPositions()
    return { positions, totalValue: readPortfolioValue() ?? undefined }
  }

  function readStockDetailMetrics() {
    const m = location.pathname.match(/\/stocks\/([A-Z][A-Z0-9.]*)/i)
    if (!m) return null
    const ticker = m[1].toUpperCase()
    let averageCostPerShare
    let marketValue
    for (const cap of document.querySelectorAll('.caption-text')) {
      const label = cap.textContent.trim()
      const h2 = cap.parentElement?.querySelector('h2')
      if (label === 'Your average cost')
        averageCostPerShare = parseMoney(h2?.textContent)
      if (label === 'Your market value')
        marketValue = parseMoney(h2?.textContent)
    }
    let todayReturnAmount
    let todayReturnPct
    let totalReturnAmount
    let totalReturnPct
    let shares
    for (const tr of document.querySelectorAll('table.table tbody tr')) {
      const label = tr.querySelector('td')?.textContent?.trim() ?? ''
      const rowText = tr.textContent ?? ''
      const bold = tr.querySelector('.bold')
      if (label.startsWith("Today's return")) {
        todayReturnAmount = parseMoney(bold?.textContent)
        todayReturnPct = parsePct(rowText)
      } else if (label.startsWith('Total return')) {
        totalReturnAmount = parseMoney(bold?.textContent)
        totalReturnPct = parsePct(rowText)
      } else if (label === 'Shares') {
        const cells = tr.querySelectorAll('td')
        const raw = cells[cells.length - 1]?.textContent ?? ''
        const parsed = Number(String(raw).replace(/,/g, ''))
        if (Number.isFinite(parsed) && parsed > 0) shares = parsed
      }
    }
    if (
      averageCostPerShare == null &&
      marketValue == null &&
      todayReturnAmount == null &&
      totalReturnAmount == null
    ) {
      return null
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
    }
  }

  function isListPage() {
    return Boolean(document.querySelector('[data-testid="VirtualizedSidebar"]'))
  }

  /** Wait until portfolio sidebar has at least one position row (or list chrome appears). */
  async function waitForListReady(maxWaitMs = 20000) {
    const deadline = Date.now() + maxWaitMs
    while (Date.now() < deadline) {
      if (isListPage()) {
        const visible = readListPositionsFromDom().length
        if (visible > 0) {
          return { ready: true, positions: visible }
        }
      }
      await sleep(400)
    }
    const positions = readListPositions().length
    return { ready: isListPage(), positions }
  }

  function isDetailPage() {
    return /\/stocks\/[A-Z0-9.]+/i.test(location.pathname)
  }

  window.RH_PROBES = {
    parseMoney,
    parseShares,
    parsePct,
    getVirtualListRoot,
    getVirtualScroller,
    readPortfolioValue,
    readListPositions,
    scrollAndReadAllPositions,
    prepareListPage,
    readStockDetailMetrics,
    isListPage,
    isDetailPage,
    waitForListReady,
    sleep,
  }
})()
