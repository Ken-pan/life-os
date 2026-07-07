/**
 * Target orders adapter v0 — /orders list + order detail pages.
 */
;(function initTargetOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_NUM_RE =
    /\b(?:Order\s*(?:#|number|no\.?)?\s*)([A-Z0-9-]{8,20})\b/i
  const ORDER_ID_IN_HREF_RE =
    /(?:\/orders\/|orderId=|order_id=|orderNumber=)([A-Z0-9-]{6,20})/i
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/
  const SHORT_DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/target\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /\/orders\b|order-details|orderstatus|account\/orders/i.test(p) ||
        u.searchParams.has('orderId') ||
        u.searchParams.has('orderNumber')
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
    const s = String(raw).trim().replace(/^#/, '')
    if (s.length < 6 || s.length > 24) return null
    if (!/^[A-Z0-9-]+$/i.test(s)) return null
    if (/^(http|www|target|order|details)$/i.test(s)) return null
    return s.toUpperCase()
  }

  function orderIdFromHref(href) {
    if (!href) return null
    return (
      normalizeOrderId(href.match(ORDER_ID_IN_HREF_RE)?.[1]) ||
      normalizeOrderId(
        (() => {
          try {
            const u = new URL(href)
            return (
              u.searchParams.get('orderId') ||
              u.searchParams.get('orderNumber') ||
              u.searchParams.get('order')
            )
          } catch {
            return null
          }
        })(),
      )
    )
  }

  function parseDateFromText(raw) {
    if (!raw) return undefined
    const month = raw.match(MONTH_DATE_RE)?.[0]
    if (month) return month
    const slash = raw.match(SHORT_DATE_RE)?.[1]
    if (slash) return slash
    const placed = raw.match(
      /(?:Ordered|Order placed|Placed on|Purchase date)\s*[:\s]+(.+?)(?:\||$|Total|Status|Order)/i,
    )?.[1]
    return placed?.trim()
  }

  function extractStatusNear(el) {
    if (!el) return undefined
    const raw = text(el)
    const m = raw.match(
      /\b(Delivered|Shipped|Cancelled|Canceled|Ready for pickup|Picked up|Processing|Preparing|In transit|On the way|Out for delivery|Completed|Returned|Refunded|Arriving)\b/i,
    )
    return m?.[1]
  }

  function extractLineItems(root) {
    const items = []
    const seen = new Set()
    if (!root) return items

    for (const a of root.querySelectorAll(
      'a[href*="/p/"], a[href*="A-"], a[href*="/product/"], a[data-test*="productTitle"]',
    )) {
      const title = text(a)
      if (!title || title.length < 4 || title.length > 200) continue
      if (/^(View|Track|Help|Sign in|Order)/i.test(title)) continue
      const href = a.href || ''
      const key = href || title
      if (seen.has(key)) continue
      seen.add(key)
      const container =
        a.closest('[data-test*="cartItem"]') ||
        a.closest('[data-test*="orderItem"]') ||
        a.closest('[class*="item"]') ||
        a.closest('li') ||
        a.parentElement?.parentElement
      const price =
        text(container).match(PRICE_RE)?.[0] ||
        container
          ?.querySelector('[data-test*="price"], [class*="price"]')
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
      orderIdFromHref(detailUrl) ||
      normalizeOrderId(raw.match(ORDER_NUM_RE)?.[1]) ||
      normalizeOrderId(raw.match(/\b([A-Z0-9]{2}\d{6,}[A-Z0-9]*)\b/)?.[1])
    if (!orderId) return null

    const orderDate = parseDateFromText(raw)
    const orderTotal =
      raw.match(
        /\b(?:Order total|Total|Grand total)\s*(\$[\d,]+\.\d{2})\b/i,
      )?.[1] || raw.match(PRICE_RE)?.[0]

    return {
      orderId,
      orderDate,
      orderTotal,
      detailUrl,
      status: extractStatusNear({ textContent: raw }),
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

  function collectFromLinks() {
    /** @type {Map<string, Record<string, unknown>>} */
    const byId = new Map()

    for (const link of document.querySelectorAll('a[href]')) {
      const href = link.href || ''
      if (
        !/\/orders|order-details|orderId|orderNumber|account\/orders/i.test(
          href,
        )
      )
        continue

      const orderId =
        orderIdFromHref(href) ||
        normalizeOrderId(text(link).match(ORDER_NUM_RE)?.[1])
      if (!orderId) continue

      const container =
        link.closest('[data-test*="order"]') ||
        link.closest('[class*="order"]') ||
        link.closest('li') ||
        link.closest('article') ||
        link.parentElement?.parentElement?.parentElement

      const block = parseBlock(text(container), href) || {
        orderId,
        detailUrl: href,
      }
      const prev = byId.get(orderId) || { orderId, lineItems: [] }
      byId.set(orderId, {
        ...prev,
        ...block,
        orderId,
        detailUrl: /order|details/i.test(href) ? href : prev.detailUrl || href,
        lineItems: mergeLineItems(
          prev.lineItems || [],
          extractLineItems(container),
        ),
        status: block.status || prev.status || extractStatusNear(container),
      })
    }

    return byId
  }

  function collectFromTestIds(byId) {
    for (const el of document.querySelectorAll(
      '[data-test*="order"], [data-test*="Order"], [class*="OrderCard"], [class*="order-card"]',
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
    for (const el of document.querySelectorAll(
      'main li, main article, main [role="listitem"], main section div',
    )) {
      const raw = text(el)
      if (!ORDER_NUM_RE.test(raw) && !ORDER_ID_IN_HREF_RE.test(raw)) continue
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

  function synthesizeDetailUrls(byId) {
    const origin = location.origin
    for (const entry of byId.values()) {
      if (entry.orderId && !entry.detailUrl) {
        entry.detailUrl = `${origin}/account/orders/${encodeURIComponent(entry.orderId)}`
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
      orderIdFromHref(location.href) ||
      normalizeOrderId(bodyText.match(ORDER_NUM_RE)?.[1]) ||
      normalizeOrderId(bodyText.match(/\b([A-Z0-9]{2}\d{6,}[A-Z0-9]*)\b/)?.[1])

    if (!orderId) return null

    const orderTotal =
      bodyText.match(
        /\b(?:Order total|Total|Grand total)\s*(\$[\d,]+\.\d{2})\b/i,
      )?.[1] || bodyText.match(PRICE_RE)?.[0]

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
    id: 'target-orders',
    site: 'target',
    entity: 'orders',
    matches,
    run() {
      if (!matches(location.href)) return null
      const isDetail =
        /\/orders\/[^/?#]+/i.test(location.pathname) ||
        /order-details|account\/orders/i.test(location.pathname) ||
        location.searchParams?.has?.('orderId')
      if (isDetail) {
        const detail = parseOrderDetail()
        return detail
          ? { site: 'target', entity: 'orders', items: [detail] }
          : null
      }
      const items = parseOrderList()
      return {
        site: 'target',
        entity: 'orders',
        page: location.pathname,
        items,
        note: items.length
          ? undefined
          : 'No orders parsed — sign in, scroll orders page, then re-capture',
      }
    },
  })
})()
