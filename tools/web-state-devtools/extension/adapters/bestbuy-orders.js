/**
 * Best Buy orders adapter v1 — structure from Web State DevTools page model.
 * List: purchasehistory/purchases (virtuoso + OrderItemHeader)
 * Detail: profile/ss/orders/order-details/{id}/view (line-item-header-*)
 */
;(function initBestBuyOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /(BBY\d{2}-\d{10,14})/i
  const STORE_TXN_RE = /(\d{3}\s+\d{2}\s+\d{4}\s+\d{6})/
  const PRICE_RE = /\$[\d,]+\.\d{2}/

  const SEL = {
    listRoot: '[data-testid="OrderList-TestID"]',
    orderItem: '[data-testid="order-item"]',
    orderHeader: '[data-testid="OrderItemHeader"]',
    statusTitle: '[data-testid="OrderStatusTitle-None-TestID"]',
    statusDesc: '[data-testid="OrderStatusDescription-None-TestID"]',
    detailRoot: '.order-details-page',
    lineItemLink: 'a[id^="line-item-header-"]',
    productImage: 'img[src*="bbystatic.com"], img[src*="bestbuy.com/"]',
  }

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/bestbuy\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /purchasehistory|profile\/ss\/orders|order-details|order-details/i.test(
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

  function detailUrlFor(orderId) {
    if (!orderId) return undefined
    return `${location.origin}/profile/ss/orders/order-details/${encodeURIComponent(orderId)}/view`
  }

  function extractProductImageUrl(scope) {
    if (!scope) return undefined
    const imgSel =
      'img[src*="bbystatic.com"], img[src*="bestbuy.com/"], img[data-src*="bbystatic.com"]'
    for (const img of scope.querySelectorAll(imgSel)) {
      const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.currentSrc ||
        ''
      if (!src || /placeholder|sprite|logo|icon|avatar/i.test(src)) continue
      if (!/bbystatic\.com|bestbuy\.com\/image/i.test(src)) continue
      return src.replace(/\?$/, '')
    }
    const row = scope.closest?.('[id^="lineId__"]') || scope
    if (row !== scope) return extractProductImageUrl(row)
    return undefined
  }

  function parseHeaders(headers) {
    /** @type {Record<string, string>} */
    const out = {}
    for (let i = 0; i < headers.length - 1; i++) {
      const label = headers[i]
      const value = headers[i + 1]
      if (/^Order placed$|^Purchased$/i.test(label)) {
        out.orderDate = value
        i++
      } else if (label === 'Total' && PRICE_RE.test(value)) {
        out.orderTotal = value
        i++
      } else if (/^Online order$|^In store$/i.test(label)) {
        out.channel = label
        const next = headers[i + 1]
        if (label === 'Online order' && ORDER_ID_RE.test(next)) {
          out.orderId = next.match(ORDER_ID_RE)[1].toUpperCase()
          i++
        } else if (label === 'In store' && STORE_TXN_RE.test(next)) {
          out.storeTransactionId = next.match(STORE_TXN_RE)[1]
          out.orderId = out.storeTransactionId.replace(/\s+/g, '-')
          i++
        }
      }
    }
    if (!out.orderId) {
      const joined = headers.join(' ')
      const bby = joined.match(ORDER_ID_RE)?.[1]
      if (bby) out.orderId = bby.toUpperCase()
    }
    return out
  }

  function parseMoney(value) {
    if (value == null || value === '') return undefined
    const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }

  function parseReturnInfo(status, statusDate, orderTotal) {
    const label = (status || '').trim()
    if (!label) return undefined
    if (/^returned$/i.test(label)) {
      return {
        status: 'returned',
        label,
        eventDate: statusDate || undefined,
        refundAmount: parseMoney(orderTotal),
      }
    }
    if (/^cancelled$|^canceled$/i.test(label)) {
      return {
        status: 'cancelled',
        label,
        eventDate: statusDate || undefined,
      }
    }
    return undefined
  }

  function parseFromRawText(raw) {
    /** @type {Record<string, string>} */
    const out = {}
    out.orderDate = raw.match(
      /(?:Order placed|Purchased)\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    )?.[1]
    out.orderTotal = raw.match(/Total\s*(\$[\d,]+\.\d{2})/i)?.[1]
    if (/Online order/i.test(raw)) {
      out.channel = 'Online order'
      out.orderId = raw.match(ORDER_ID_RE)?.[1]?.toUpperCase()
    } else if (/In store/i.test(raw)) {
      out.channel = 'In store'
      const txn = raw.match(STORE_TXN_RE)?.[1]
      if (txn) {
        out.storeTransactionId = txn
        out.orderId = txn.replace(/\s+/g, '-')
      }
    }
    if (!out.orderId) {
      const bby = raw.match(ORDER_ID_RE)?.[1]
      if (bby) out.orderId = bby.toUpperCase()
    }
    return out
  }

  function parseOrderItemEl(el) {
    const raw = text(el)
    const headers = [...el.querySelectorAll(SEL.orderHeader)]
      .map(text)
      .filter(Boolean)
    const fields =
      headers.length >= 4 ? parseHeaders(headers) : parseFromRawText(raw)
    if (!fields.orderId) Object.assign(fields, parseFromRawText(raw))
    if (!fields.orderId) return null

    const status = text(el.querySelector(SEL.statusTitle)) || undefined
    const statusDate = text(el.querySelector(SEL.statusDesc)) || undefined
    if (!fields.orderDate && statusDate) fields.orderDate = statusDate
    const returnInfo = parseReturnInfo(status, statusDate, fields.orderTotal)

    return {
      orderId: fields.orderId,
      orderDate: fields.orderDate,
      orderTotal: fields.orderTotal,
      channel: fields.channel,
      storeTransactionId: fields.storeTransactionId,
      status: status || undefined,
      statusDate: statusDate || undefined,
      returnInfo,
      detailUrl: detailUrlFor(
        fields.orderId.match(ORDER_ID_RE) ? fields.orderId : fields.orderId,
      ),
      lineItems: [],
    }
  }

  function parseOrderList() {
    const root =
      document.querySelector(SEL.listRoot) ||
      document.querySelector('[data-testid="virtuoso-item-list"]') ||
      document.body
    const byId = new Map()
    for (const el of root.querySelectorAll(SEL.orderItem)) {
      const parsed = parseOrderItemEl(el)
      if (!parsed) continue
      byId.set(parsed.orderId, { ...byId.get(parsed.orderId), ...parsed })
    }
    return [...byId.values()]
  }

  function parseOrderDetail() {
    const root = document.querySelector(SEL.detailRoot)
    if (!root) return null

    const bodyText = text(root)
    const orderId =
      location.pathname.match(/order-details\/([^/]+)/i)?.[1]?.toUpperCase() ||
      bodyText.match(ORDER_ID_RE)?.[1]?.toUpperCase()
    if (!orderId) return null

    const lineItems = []
    const seen = new Set()
    for (const a of root.querySelectorAll(SEL.lineItemLink)) {
      const title = text(a) || a.getAttribute('aria-label') || ''
      if (!title || title.length < 4) continue
      const href = a.href || a.getAttribute('href') || ''
      const key = a.id || href || title
      if (seen.has(key)) continue
      seen.add(key)
      const row =
        a.closest('li') ||
        a.closest('[id^="lineId__"]') ||
        a.parentElement?.parentElement?.parentElement
      const price = text(row).match(PRICE_RE)?.[0]
      const imageUrl = extractProductImageUrl(row || a.closest('div'))
      lineItems.push({
        title,
        price: price || undefined,
        detailUrl: href.startsWith('http') ? href : undefined,
        imageUrl,
        quantity: 1,
      })
    }

    const orderTotal =
      bodyText.match(/\bOrder total\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      bodyText.match(/\bTotal\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      bodyText.match(PRICE_RE)?.[0]

    const status = text(root.querySelector(SEL.statusTitle)) || undefined
    const statusDate = text(root.querySelector(SEL.statusDesc)) || undefined

    return {
      orderId,
      orderDate:
        bodyText.match(
          /(?:Order placed|Placed on|Purchased)\s*[:\s]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
        )?.[1] || undefined,
      orderTotal,
      status,
      statusDate,
      returnInfo: parseReturnInfo(status, statusDate, orderTotal),
      detailUrl: location.href,
      lineItems: lineItems.slice(0, 30),
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
        /order-details\/[^/]+\/view/i.test(location.pathname) ||
        document.querySelector(SEL.detailRoot)
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
          : 'No orders — wait for [data-testid=order-item] or sign in',
      }
    },
  })
})()
