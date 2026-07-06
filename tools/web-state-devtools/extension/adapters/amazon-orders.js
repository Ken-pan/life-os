/**
 * Amazon orders adapter v2 — your-orders/orders (2024–2026 layouts).
 * Parses header blocks ("Order placed … Total $X.XX … Order # …") + detail links.
 */
;(function initAmazonOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /\b(\d{3}-\d{7}-\d{7})\b/
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/amazon\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /your-orders|order-history|order-details|your-account\/order/i.test(
          p,
        ) || u.searchParams.has('orderID')
      )
    } catch {
      return false
    }
  }

  function text(el) {
    return el?.textContent?.trim().replace(/\s+/g, ' ') || ''
  }

  function parseHeaderBlock(raw) {
    if (!raw || raw.length > 3000) return null
    if (!/order placed/i.test(raw) || !ORDER_ID_RE.test(raw)) return null
    const orderId = raw.match(ORDER_ID_RE)?.[1]
    if (!orderId) return null

    let orderDate = raw.match(/Order placed\s+(.+?)\s+Total\b/i)?.[1]?.trim()
    if (orderDate && !MONTH_DATE_RE.test(orderDate)) {
      const m = orderDate.match(MONTH_DATE_RE)
      orderDate = m ? m[0] : orderDate.split(/\s+Total/i)[0]?.trim()
    }

    let orderTotal =
      raw.match(/\bTotal\s+(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      raw.match(PRICE_RE)?.[0]

    const shipTo = raw
      .match(/Ship to\s+(.+?)\s+(?:United States|Order #)/i)?.[1]
      ?.trim()

    return { orderId, orderDate, orderTotal, shipTo }
  }

  function parseAriaTotals() {
    /** @type {Map<string, string>} */
    const totals = new Map()
    for (const el of document.querySelectorAll('[aria-label*="Total" i]')) {
      const label = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ')
      const price = label.match(PRICE_RE)?.[0]
      if (!price) continue
      let node = el.parentElement
      for (let i = 0; i < 8 && node; i++) {
        const id = text(node).match(ORDER_ID_RE)?.[1]
        if (id) {
          totals.set(id, price)
          break
        }
        node = node.parentElement
      }
    }
    return totals
  }

  function extractLineItems(root) {
    const items = []
    const seen = new Set()
    if (!root) return items
    for (const a of root.querySelectorAll(
      'a[href*="/dp/"], a[href*="/gp/product/"], a.a-link-normal[href*="amazon.com"]',
    )) {
      const href = a.href || ''
      if (!/\/dp\/|\/gp\/product/.test(href)) continue
      const title = text(a).slice(0, 300)
      if (!title || title.length < 4 || seen.has(title)) continue
      seen.add(title)
      items.push({ title, detailUrl: href })
    }
    return items.slice(0, 15)
  }

  function isCleanStatus(t) {
    if (!t || t.length > 80) return false
    if (/[{;=]|uet\(|function|Continue shopping/i.test(t)) return false
    return /^(Arriving|Delivered|Cancelled|Canceled|Shipped|Returned|Refund|Out for delivery|Estimated delivery|Payment|Pending)/i.test(
      t,
    )
  }

  function extractStatusNear(root) {
    if (!root) return undefined
    const block = root.closest('section') || root
    for (const el of block.querySelectorAll(
      'h4, h5, h6, .a-text-bold, span, div',
    )) {
      const t = text(el)
      if (isCleanStatus(t)) return t
    }
    const m = text(root).match(
      /(Delivered[^|.{]{0,40}|Cancelled[^|.{]{0,40}|Canceled[^|.{]{0,40}|Arriving[^|.{]{0,40}|Shipped[^|.{]{0,40})/i,
    )
    const candidate = m?.[1]?.trim()
    return isCleanStatus(candidate) ? candidate : undefined
  }

  function collectHeaderBlocks() {
    /** @type {Map<string, Record<string, unknown>>} */
    const byId = new Map()
    const ariaTotals = parseAriaTotals()

    const candidates = document.querySelectorAll(
      'section div, section > div > div, [class*="order-card"], .order-info',
    )

    for (const el of candidates) {
      const raw = text(el)
      const parsed = parseHeaderBlock(raw)
      if (!parsed) continue
      const prev = byId.get(parsed.orderId) || {}
      byId.set(parsed.orderId, {
        ...prev,
        ...parsed,
        orderTotal:
          parsed.orderTotal ||
          ariaTotals.get(parsed.orderId) ||
          prev.orderTotal,
        lineItems: [...(prev.lineItems || []), ...extractLineItems(el)].slice(
          0,
          15,
        ),
      })
    }

    return byId
  }

  function attachDetailLinks(byId) {
    for (const link of document.querySelectorAll(
      'a[href*="order-details"], a[href*="orderID="]',
    )) {
      const href = link.href || ''
      if (!/order-details|orderID=/i.test(href)) continue
      const orderId =
        href.match(/orderID=([^&]+)/i)?.[1] ||
        text(link).match(ORDER_ID_RE)?.[1]
      if (!orderId) continue

      const entry = byId.get(orderId) || { orderId, lineItems: [] }
      if (href.includes('order-details')) entry.detailUrl = href

      const container =
        link.closest('section > div > div') ||
        link.closest('section div') ||
        link.parentElement
      const parentSection = link.closest('section')
      if (parentSection) {
        const items = extractLineItems(parentSection)
        if (items.length) {
          entry.lineItems = mergeLineItems(entry.lineItems || [], items)
        }
      }
      if (!entry.status) entry.status = extractStatusNear(container)
      if (!entry.orderDate && container) {
        const p = parseHeaderBlock(text(container))
        if (p) Object.assign(entry, { ...p, lineItems: entry.lineItems })
      }
      byId.set(orderId, entry)
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
    return out.slice(0, 15)
  }

  function synthesizeDetailUrls(byId) {
    const origin = location.origin
    for (const entry of byId.values()) {
      if (entry.orderId && !entry.detailUrl) {
        entry.detailUrl = `${origin}/gp/your-account/order-details?orderID=${encodeURIComponent(entry.orderId)}`
      }
    }
  }

  function assignSectionStatuses(byId) {
    for (const section of document.querySelectorAll('section')) {
      let currentStatus = null
      for (const el of section.querySelectorAll(
        ':scope > div, h2, h3, h4, h5',
      )) {
        const t = text(el)
        if (
          /^(Arriving|Delivered|Cancelled|Canceled|Shipped|Return|Refund)/i.test(
            t,
          ) &&
          t.length < 80 &&
          !ORDER_ID_RE.test(t)
        ) {
          currentStatus = t
          continue
        }
        const id = t.match(ORDER_ID_RE)?.[1]
        if (id && byId.has(id) && currentStatus && !byId.get(id).status) {
          byId.get(id).status = currentStatus
        }
      }
    }
  }

  function parseOrderList() {
    const byId = collectHeaderBlocks()
    attachDetailLinks(byId)
    assignSectionStatuses(byId)
    synthesizeDetailUrls(byId)

    if (!byId.size) {
      for (const link of document.querySelectorAll(
        'a[href*="order-details"]',
      )) {
        const href = link.href || ''
        const orderId = href.match(/orderID=([^&]+)/i)?.[1]
        if (!orderId || byId.has(orderId)) continue
        byId.set(orderId, {
          orderId,
          detailUrl: href,
          lineItems: extractLineItems(link.closest('section') || document.body),
        })
      }
    }

    return [...byId.values()]
  }

  function parseOrderDetail() {
    const orderId =
      new URL(location.href).searchParams.get('orderID') ||
      text(document.body).match(ORDER_ID_RE)?.[1]

    if (!orderId) return null

    const bodyText = text(document.body)
    const header = parseHeaderBlock(bodyText) || {}

    const lineItems = []
    for (const row of document.querySelectorAll(
      '.a-fixed-left-grid.item-view, .yohtmlc-item, [data-component="itemRow"], .a-row.a-spacing-base, .item-view',
    )) {
      const titleEl = row.querySelector(
        'a.a-link-normal[href*="/dp/"], a.a-link-normal[href*="/gp/product"], .yohtmlc-product-title a, .yohtmlc-product-title',
      )
      const title = text(titleEl).slice(0, 300)
      if (!title || title.length < 3) continue
      const qtyMatch = text(row).match(/Qty\.?\s*(\d+)/i)
      const price = text(row).match(PRICE_RE)?.[0]
      lineItems.push({
        title,
        price: price || undefined,
        quantity: qtyMatch ? Number(qtyMatch[1]) : 1,
        detailUrl: titleEl?.href || undefined,
      })
    }

    const orderTotal =
      header.orderTotal ||
      bodyText.match(
        /\b(?:Order total|Grand total|Total)\s+(\$[\d,]+\.\d{2})\b/i,
      )?.[1] ||
      [
        ...document.querySelectorAll(
          '[aria-label*="Total" i], .a-color-price, .a-size-base.a-color-price',
        ),
      ]
        .map(
          (el) =>
            text(el).match(PRICE_RE)?.[0] ||
            el.getAttribute('aria-label')?.match(PRICE_RE)?.[0],
        )
        .find(Boolean) ||
      bodyText.match(/\bTotal\s+(\$[\d,]+\.\d{2})\b/i)?.[1]

    return {
      orderId,
      orderDate: header.orderDate,
      orderTotal,
      status: extractStatusNear(document.body),
      detailUrl: location.href,
      lineItems: lineItems.slice(0, 20),
    }
  }

  window.__WSD_ADAPTERS__.push({
    id: 'amazon-orders',
    site: 'amazon',
    entity: 'orders',
    matches,
    run() {
      if (!matches(location.href)) return null
      const isDetail =
        location.search.includes('orderID') ||
        /order-details/i.test(location.pathname)
      if (isDetail) {
        const detail = parseOrderDetail()
        return detail
          ? { site: 'amazon', entity: 'orders', items: [detail] }
          : null
      }
      const items = parseOrderList()
      return {
        site: 'amazon',
        entity: 'orders',
        page: location.pathname,
        items,
        note: items.length
          ? undefined
          : 'No orders parsed — try scrolling full page then re-capture',
      }
    },
  })
})()
