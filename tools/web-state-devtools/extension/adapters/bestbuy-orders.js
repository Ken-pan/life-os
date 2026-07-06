/**
 * Best Buy purchase history adapter v0 — purchasehistory + order detail pages.
 */
;(function initBestBuyOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /\b(BBY\d{2}-\d{10,14})\b/i
  const ALT_ORDER_ID_RE = /\b(\d{3}-\d{7}-\d{4})\b/
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/
  const SHORT_DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/bestbuy\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /purchasehistory|profile\/ss\/orders|orderDetails|order-details/i.test(
          p,
        ) || u.searchParams.has('orderId')
      )
    } catch {
      return false
    }
  }

  function text(el) {
    return el?.textContent?.trim().replace(/\s+/g, ' ') || ''
  }

  function normalizeOrderId(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    const bby = s.match(ORDER_ID_RE)?.[1]
    if (bby) return bby.toUpperCase()
    const alt = s.match(ALT_ORDER_ID_RE)?.[1]
    if (alt) return alt
    if (/^BBY/i.test(s) && s.includes('-')) return s.toUpperCase()
    return null
  }

  function parseDateFromText(raw) {
    if (!raw) return undefined
    const month = raw.match(MONTH_DATE_RE)?.[0]
    if (month) return month
    const slash = raw.match(SHORT_DATE_RE)?.[1]
    if (slash) return slash
    const placed = raw.match(
      /(?:Order placed|Placed on|Purchase date|Ordered)\s*[:\s]+(.+?)(?:\||$|Total|Status)/i,
    )?.[1]
    return placed?.trim()
  }

  function extractStatusNear(el) {
    if (!el) return undefined
    const raw = text(el)
    const m = raw.match(
      /\b(Delivered|Shipped|Cancelled|Canceled|Ready for pickup|Picked up|Processing|Preparing|In progress|Completed|Returned|Refunded)\b/i,
    )
    return m?.[1]
  }

  function extractLineItems(root) {
    const items = []
    const seen = new Set()
    if (!root) return items

    for (const a of root.querySelectorAll(
      'a[href*="/site/"], a[href*="skuId="], a[href*="/product/"]',
    )) {
      const title = text(a)
      if (!title || title.length < 4 || title.length > 200) continue
      if (/^(See details|View|Track|Help|Sign in)/i.test(title)) continue
      const href = a.href || ''
      const key = href || title
      if (seen.has(key)) continue
      seen.add(key)
      const container =
        a.closest('[class*="item"]') ||
        a.closest('li') ||
        a.parentElement?.parentElement
      const price =
        text(container).match(PRICE_RE)?.[0] ||
        container
          ?.querySelector('[class*="price"], [data-testid*="price"]')
          ?.textContent?.match(PRICE_RE)?.[0]
      items.push({
        title,
        price: price || undefined,
        detailUrl: href || undefined,
        quantity: 1,
      })
    }

    return items.slice(0, 20)
  }

  function parseBlock(raw, detailUrl) {
    const orderId =
      normalizeOrderId(raw) ||
      normalizeOrderId(detailUrl?.match(/orders\/([^/?#]+)/i)?.[1])
    if (!orderId) return null

    const orderDate = parseDateFromText(raw)
    const orderTotal =
      raw.match(/\b(?:Order total|Total|Grand total)\s*(\$[\d,]+\.\d{2})\b/i)
        ?.[1] || raw.match(PRICE_RE)?.[0]

    return {
      orderId,
      orderDate,
      orderTotal,
      detailUrl,
      status: extractStatusNear({ textContent: raw }),
    }
  }

  function collectFromLinks() {
    /** @type {Map<string, Record<string, unknown>>} */
    const byId = new Map()

    for (const link of document.querySelectorAll('a[href]')) {
      const href = link.href || ''
      if (
        !/purchasehistory|profile\/ss\/orders|orderDetails|order-details/i.test(
          href,
        )
      )
        continue

      const orderId =
        normalizeOrderId(href.match(/orders\/([^/?#]+)/i)?.[1]) ||
        normalizeOrderId(
          (() => {
            try {
              return new URL(href).searchParams.get('orderId')
            } catch {
              return null
            }
          })(),
        ) ||
        normalizeOrderId(href.match(/orderId=([^&]+)/i)?.[1]) ||
        normalizeOrderId(text(link))

      if (!orderId) continue

      const container =
        link.closest('[class*="order"]') ||
        link.closest('li') ||
        link.closest('article') ||
        link.closest('section') ||
        link.parentElement?.parentElement?.parentElement

      const block = parseBlock(text(container), href) || { orderId, detailUrl: href }
      const prev = byId.get(orderId) || { orderId, lineItems: [] }
      byId.set(orderId, {
        ...prev,
        ...block,
        orderId,
        detailUrl: href.includes('order') ? href : prev.detailUrl || href,
        lineItems: mergeLineItems(prev.lineItems || [], extractLineItems(container)),
        status: block.status || prev.status || extractStatusNear(container),
      })
    }

    return byId
  }

  function collectFromTestIds(byId) {
    for (const el of document.querySelectorAll(
      '[data-testid*="order"], [data-testid*="purchase"], [class*="order-card"], [class*="purchase-item"]',
    )) {
      const raw = text(el)
      const parsed = parseBlock(raw)
      if (!parsed) continue
      const prev = byId.get(parsed.orderId) || { lineItems: [] }
      byId.set(parsed.orderId, {
        ...prev,
        ...parsed,
        lineItems: mergeLineItems(prev.lineItems || [], extractLineItems(el)),
        status: parsed.status || prev.status || extractStatusNear(el),
      })
    }
  }

  function collectFromTextBlocks(byId) {
    for (const el of document.querySelectorAll('main li, main article, main section div')) {
      const raw = text(el)
      if (!ORDER_ID_RE.test(raw) && !ALT_ORDER_ID_RE.test(raw)) continue
      if (raw.length > 2500) continue
      const parsed = parseBlock(raw)
      if (!parsed) continue
      const prev = byId.get(parsed.orderId) || { lineItems: [] }
      byId.set(parsed.orderId, {
        ...prev,
        ...parsed,
        lineItems: mergeLineItems(prev.lineItems || [], extractLineItems(el)),
      })
    }
  }

  function mergeLineItems(a, b) {
    const seen = new Set()
    const out = []
    for (const item of [...a, ...b]) {
      const key = item.title || item.detailUrl
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out.slice(0, 20)
  }

  function synthesizeDetailUrls(byId) {
    const origin = location.origin
    for (const entry of byId.values()) {
      if (entry.orderId && !entry.detailUrl) {
        entry.detailUrl = `${origin}/profile/ss/orders/${encodeURIComponent(entry.orderId)}`
      }
    }
  }

  function parseOrderList() {
    const byId = collectFromLinks()
    collectFromTestIds(byId)
    collectFromTextBlocks(byId)
    synthesizeDetailUrls(byId)
    return [...byId.values()].filter((o) => o.orderId)
  }

  function parseOrderDetail() {
    const bodyText = text(document.body)
    const orderId =
      normalizeOrderId(location.pathname.match(/orders\/([^/?#]+)/i)?.[1]) ||
      normalizeOrderId(new URLSearchParams(location.search).get('orderId')) ||
      normalizeOrderId(bodyText)

    if (!orderId) return null

    const orderTotal =
      bodyText.match(/\b(?:Order total|Total|Grand total)\s*(\$[\d,]+\.\d{2})\b/i)
        ?.[1] || bodyText.match(PRICE_RE)?.[0]

    return {
      orderId,
      orderDate: parseDateFromText(bodyText),
      orderTotal,
      status: extractStatusNear(document.body),
      detailUrl: location.href,
      lineItems: extractLineItems(document.body),
    }
  }

  window.__WSD_ADAPTERS__.push({
    id: 'bestbuy-orders',
    site: 'bestbuy',
    entity: 'orders',
    matches,
    run() {
      if (!matches(location.href)) return null
      const isDetail =
        /profile\/ss\/orders\/[^/?#]+/i.test(location.pathname) ||
        /orderDetails|order-details/i.test(location.pathname + location.search)
      if (isDetail) {
        const detail = parseOrderDetail()
        return detail
          ? { site: 'bestbuy', entity: 'orders', items: [detail] }
          : null
      }
      const items = parseOrderList()
      return {
        site: 'bestbuy',
        entity: 'orders',
        page: location.pathname,
        items,
        note: items.length
          ? undefined
          : 'No orders parsed — sign in, scroll purchase history, then re-capture',
      }
    },
  })
})()
