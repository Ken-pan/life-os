/**
 * Target orders adapter v2 — /orders list + /orders/{id} detail (2024–2026).
 * List: card root div#{orderId}, "View purchase" link aria-label has date + total.
 * Detail: h2 shipment groups + h3 titles, item buttons aria-label="item details for …".
 */
;(function initTargetOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /\b(\d{12,18})\b/
  const ORDER_HREF_RE = /\/orders\/(\d{12,18})/
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/
  const VIEW_PURCHASE_ARIA_RE =
    /^View purchase made on (.+?) for (\$[\d,]+\.\d{2})$/i

  const SEL = {
    viewPurchaseLink: 'a[aria-label^="View purchase made on"]',
    main: 'main, #content, [role="main"]',
    itemDetailsBtn: 'button[aria-label^="item details for "]',
    paymentSummary:
      '[class*="rightSticky"], [class*="PaymentSummary"], [class*="OrderDetailsPageLayout"]',
  }

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/target\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /\/orders\b|order-details|account\/orders/i.test(p) ||
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

  function decodeEntities(raw) {
    if (!raw) return raw
    const el = document.createElement('textarea')
    el.innerHTML = raw
    return el.value.replace(/\s+/g, ' ').trim()
  }

  function normalizeOrderId(raw) {
    if (!raw) return null
    const s = String(raw).trim().replace(/^#/, '')
    if (!ORDER_ID_RE.test(s)) return null
    return s
  }

  function orderIdFromHref(href) {
    if (!href) return null
    return normalizeOrderId(href.match(ORDER_HREF_RE)?.[1])
  }

  function detailUrlFor(orderId) {
    if (!orderId) return undefined
    return `${location.origin}/orders/${encodeURIComponent(orderId)}`
  }

  function parseDateFromText(raw) {
    if (!raw) return undefined
    const month = raw.match(MONTH_DATE_RE)?.[0]
    if (month) return month
    const placed = raw.match(
      /(?:Ordered|Order placed|Placed on|Purchase date|made on)\s*[:\s]+(.+?)(?:\||$|Total|Status|for\s+\$)/i,
    )?.[1]
    return placed?.trim()
  }

  function isCleanStatus(t) {
    if (!t || t.length > 80) return false
    if (/Common Questions|Get top deals|Footer|You.?ve saved/i.test(t)) return false
    return /^(Delivered|Shipped|Cancelled|Canceled|Ready for pickup|Picked up|Processing|Preparing|In transit|On the way|Out for delivery|Completed|Returned|Refunded|Arriving|Sent on|Order Delivered|Order Canceled|Order Cancelled)/i.test(
      t,
    )
  }

  function normalizeStatus(raw) {
    const t = (raw || '').trim()
    if (!t) return undefined
    if (/^Order /i.test(t)) return t.replace(/^Order /i, '').trim()
    return t
  }

  function extractStatusFromCard(root) {
    if (!root) return undefined
    for (const h of root.querySelectorAll('h2, h3, [data-test*="status"], [class*="status"]')) {
      const s = normalizeStatus(text(h))
      if (isCleanStatus(s)) return s
    }
    const blob = text(root)
    const m = blob.match(
      /\b(Delivered|Shipped|Cancelled|Canceled|Ready for pickup|Picked up|Processing|In transit|Out for delivery|Returned|Refunded|Arriving|Sent on [A-Za-z]{3}, [A-Za-z]{3} \d{1,2})\b/i,
    )
    return m?.[1]
  }

  function parseMoney(value) {
    if (value == null || value === '') return undefined
    const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }

  function parseReturnInfo(status, orderTotal) {
    const label = (status || '').trim()
    if (!label) return undefined
    if (/^cancelled$|^canceled$/i.test(label)) {
      return { status: 'cancelled', label, eventDate: undefined }
    }
    if (/^returned$/i.test(label) || /^refunded$/i.test(label)) {
      return {
        status: /refund/i.test(label) ? 'refunded' : 'returned',
        label,
        refundAmount: parseMoney(orderTotal),
      }
    }
    return undefined
  }

  function extractProductImageUrl(scope) {
    if (!scope) return undefined
    for (const img of scope.querySelectorAll(
      'img[src*="target.scene7.com"], img[src*="targetimg1.com"], img[src*="target.com/"]',
    )) {
      const src = img.getAttribute('src') || img.currentSrc || ''
      if (!src || /logo|icon|sprite|placeholder/i.test(src)) continue
      return src.replace(/\?$/, '')
    }
    return undefined
  }

  function mergeLineItems(a, b) {
    const seen = new Set()
    const out = []
    for (const item of [...a, ...b]) {
      const key = item.detailUrl || item.title
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out.slice(0, 30)
  }

  function lineItemsFromCard(root) {
    const items = []
    const seen = new Set()
    if (!root) return items

    for (const img of root.querySelectorAll('img[alt]')) {
      const alt = decodeEntities(img.getAttribute('alt')?.trim())
      if (!alt || alt.length < 4 || /target|logo|icon|delivered|canceled/i.test(alt))
        continue
      if (seen.has(alt)) continue
      seen.add(alt)
      items.push({
        title: alt,
        imageUrl: extractProductImageUrl(img.parentElement) || img.src || undefined,
        quantity: 1,
      })
    }

    for (const a of root.querySelectorAll('a[href*="/p/"], a[href*="/A-"]')) {
      const title = text(a)
      if (!title || title.length < 4 || /^(View|Track|Help)/i.test(title)) continue
      const href = a.href || ''
      const key = href || title
      if (seen.has(key)) continue
      seen.add(key)
      const row = a.closest('li') || a.closest('[class*="item"]') || a.parentElement
      items.push({
        title,
        detailUrl: href.startsWith('http') ? href : undefined,
        imageUrl: extractProductImageUrl(row),
        quantity: 1,
      })
    }

    return items
  }

  function parseViewPurchaseLink(link) {
    const href = link.href || ''
    const orderId = orderIdFromHref(href)
    if (!orderId) return null

    const aria = link.getAttribute('aria-label') || ''
    const ariaMatch = aria.match(VIEW_PURCHASE_ARIA_RE)
    const card =
      document.getElementById(orderId) ||
      link.closest(`div#${orderId}`) ||
      link.closest('[class*="order"], [class*="Order"], article, li') ||
      link.parentElement?.parentElement?.parentElement

    const blockText = text(card)
    const orderTotal =
      ariaMatch?.[2] ||
      blockText.match(/\b(?:Order total|Total)\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      blockText.match(PRICE_RE)?.[0]
    const orderDate =
      ariaMatch?.[1] || parseDateFromText(blockText) || undefined
    const status = extractStatusFromCard(card)

    return {
      orderId,
      orderDate,
      orderTotal,
      status,
      returnInfo: parseReturnInfo(status, orderTotal),
      detailUrl: detailUrlFor(orderId),
      lineItems: lineItemsFromCard(card),
    }
  }

  function parseOrderList() {
    /** @type {Map<string, Record<string, unknown>>} */
    const byId = new Map()

    for (const link of document.querySelectorAll(SEL.viewPurchaseLink)) {
      const parsed = parseViewPurchaseLink(link)
      if (!parsed) continue
      const prev = byId.get(parsed.orderId) || { lineItems: [] }
      byId.set(parsed.orderId, {
        ...prev,
        ...parsed,
        lineItems: mergeLineItems(prev.lineItems || [], parsed.lineItems || []),
      })
    }

    // Fallback: legacy link scan when aria-label cards are absent
    if (byId.size === 0) {
      for (const link of document.querySelectorAll('a[href*="/orders/"]')) {
        if (!/View purchase/i.test(text(link)) && !ORDER_HREF_RE.test(link.href || ''))
          continue
        const parsed = parseViewPurchaseLink(link)
        if (!parsed) continue
        byId.set(parsed.orderId, parsed)
      }
    }

    return [...byId.values()].filter((o) => o.orderId)
  }

  function parseDetailOrderTotal(root) {
    const summary =
      root.querySelector(SEL.paymentSummary) ||
      root.querySelector('[class*="OrderSummary"]')
    const summaryText = text(summary)
    if (summaryText) {
      const labeled =
        summaryText.match(/\bTotal\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
        summaryText.match(/Tax\$[\d,]+\.\d{2}Total(\$[\d,]+\.\d{2})/i)?.[1]
      if (labeled) return labeled
    }

    const bodyText = text(root)
    const grand =
      bodyText.match(/\b(?:Order total|Grand total)\s*(\$[\d,]+\.\d{2})\b/i)?.[1]
    if (grand) return grand

    const prices = bodyText.match(new RegExp(PRICE_RE.source, 'g')) || []
    return prices.length ? prices[prices.length - 1] : undefined
  }

  function parseDetailLineItems(root) {
    const items = []
    const seen = new Set()

    for (const btn of root.querySelectorAll(SEL.itemDetailsBtn)) {
      const aria = btn.getAttribute('aria-label') || ''
      const title = decodeEntities(aria.replace(/^item details for /i, '').trim())
      if (!title || title.length < 4 || seen.has(title)) continue
      seen.add(title)
      const row =
        btn.closest('li') ||
        btn.closest('[class*="item"]') ||
        btn.parentElement?.parentElement?.parentElement
      const price = text(row).match(PRICE_RE)?.[0]
      items.push({
        title,
        price: price || undefined,
        imageUrl: extractProductImageUrl(row),
        quantity: 1,
      })
    }

    if (items.length) return items.slice(0, 30)

    // Fallback: h3 product titles grouped under shipment h2 headings
    let currentStatus
    for (const node of root.querySelectorAll('h2, h3')) {
      if (node.tagName === 'H2') {
        const s = normalizeStatus(text(node))
        if (isCleanStatus(s)) currentStatus = s
        continue
      }
      const title = decodeEntities(text(node))
      if (!title || title.length < 4) continue
      if (/Common Questions|Get top deals|About Us|Help|Stores|Services/i.test(title))
        continue
      if (seen.has(title)) continue
      seen.add(title)
      const row = node.closest('li') || node.parentElement
      items.push({
        title,
        imageUrl: extractProductImageUrl(row),
        quantity: 1,
        status: currentStatus,
      })
    }

    return items.slice(0, 30)
  }

  function parseOrderDetail() {
    const root =
      document.querySelector(SEL.main) ||
      document.querySelector('#content') ||
      document.body

    const orderId =
      orderIdFromHref(location.href) ||
      normalizeOrderId(text(root).match(ORDER_NUM_RE)?.[1])
    if (!orderId) return null

    const orderTotal = parseDetailOrderTotal(root)
    const bodyText = text(root)
    const orderDate = parseDateFromText(bodyText)
    const status =
      [...root.querySelectorAll('h2')].map((h) => normalizeStatus(text(h))).find(isCleanStatus) ||
      extractStatusFromCard(root)

    return {
      orderId,
      orderDate,
      orderTotal,
      status,
      returnInfo: parseReturnInfo(status, orderTotal),
      detailUrl: location.href.split('?')[0],
      lineItems: parseDetailLineItems(root),
    }
  }

  function isDetailPage() {
    return ORDER_HREF_RE.test(location.pathname)
  }

  window.__WSD_ADAPTERS__.push({
    id: 'target-orders',
    site: 'target',
    entity: 'orders',
    matches,
    run() {
      if (!matches(location.href)) return null
      if (isDetailPage()) {
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
          : 'No orders — sign in to Target, open /orders, then re-capture',
      }
    },
  })
})()
