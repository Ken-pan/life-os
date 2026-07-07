/**
 * Target orders adapter v2 — /orders list + /orders/{id} detail (2024–2026).
 * List: card root div#{orderId}, "View purchase" link aria-label has date + total.
 * Detail: h2 shipment groups + h3 titles, item buttons aria-label="item details for …".
 */
;(function initTargetOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /\b(\d{12,18})\b/
  const INSTORE_ORDER_ID_RE = /^\d{4}-\d{4}-\d{4}-\d{4}$/
  const ORDER_HREF_RE = /\/orders\/(\d{12,18})/
  const INSTORE_HREF_RE = /\/orders\/stores\/([\d-]+)/
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/
  const ABBR_MONTH_DATE_RE =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}$/
  const VIEW_PURCHASE_ARIA_RE =
    /^View purchase made on (.+?) for (\$[\d,]+\.\d{2})$/i
  const INSTORE_VIEW_PURCHASE_ARIA_RE =
    /^View purchase from (.+?) at (.+)$/i
  const GENERIC_TITLE_RE =
    /^(item|product|view details|details|buy again|add to cart|return complete|track|help)$/i
  const QTY_IN_TEXT_RE =
    /\s[-–—]\s*(?:quantity|qty)\s*[:]\s*(\d+)\s*$/i
  const QTY_BADGE_RE =
    /\b(?:qty|quantity)\s*[:.]?\s*(\d+)\b|(?:^|\s)x(\d+)(?:\s|$)/i

  const SEL = {
    viewPurchaseLink: 'a[aria-label^="View purchase made on"]',
    instoreViewPurchaseLink: 'a[href*="/orders/stores/"]',
    instoreOrderCard: '[data-test="store-order-details-link"]',
    tabInstore: '[data-test="tabInstore"], #tab-Instore',
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

  function normalizeInstoreOrderId(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    return INSTORE_ORDER_ID_RE.test(s) ? s : null
  }

  function orderIdFromHref(href) {
    if (!href) return null
    return (
      normalizeOrderId(href.match(ORDER_HREF_RE)?.[1]) ||
      normalizeInstoreOrderId(href.match(INSTORE_HREF_RE)?.[1])
    )
  }

  function detailUrlFor(orderId) {
    if (!orderId) return undefined
    if (INSTORE_ORDER_ID_RE.test(orderId)) {
      return `${location.origin}/orders/stores/${encodeURIComponent(orderId)}`
    }
    return `${location.origin}/orders/${encodeURIComponent(orderId)}`
  }

  function parseDateFromText(raw) {
    if (!raw) return undefined
    const month = raw.match(MONTH_DATE_RE)?.[0]
    if (month) return month
    const abbr = raw.match(ABBR_MONTH_DATE_RE)?.[0]
    if (abbr) return abbr
    const placed = raw.match(
      /(?:Ordered|Order placed|Placed on|Purchase date|made on)\s*[:\s]+(.+?)(?:\||$|Total|Status|for\s+\$)/i,
    )?.[1]
    return placed?.trim()
  }

  function toIsoDate(raw, contextYear) {
    if (!raw) return undefined
    const t = Date.parse(String(raw))
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
    const abbr = raw.match(ABBR_MONTH_DATE_RE)?.[0]
    if (abbr) {
      const parsed = Date.parse(abbr)
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10)
    }
    const m = String(raw).match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})?$/i,
    )
    if (m) {
      const year = m[3] || contextYear || new Date().getFullYear()
      const parsed = Date.parse(`${m[1]} ${m[2]}, ${year}`)
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10)
    }
    return undefined
  }

  function isGenericTitle(raw) {
    const t = (raw || '').trim()
    if (!t || t.length < 4) return true
    if (GENERIC_TITLE_RE.test(t)) return true
    if (/^(View|Track|Help|Buy again|Add to cart)/i.test(t)) return true
    if (/Common Questions|Get top deals|About Us|Help|Stores|Services|Footer|Terms|Privacy/i.test(t))
      return true
    return false
  }

  function parseQuantitySignals(rawText, scope) {
    const signals = []
    const fromText = String(rawText || '')
    const inTitle = fromText.match(QTY_IN_TEXT_RE)
    if (inTitle) signals.push({ qty: Number(inTitle[1]), raw: inTitle[0].trim(), priority: 3 })

    const badgeMatch = fromText.match(QTY_BADGE_RE)
    if (badgeMatch) {
      const qty = Number(badgeMatch[1] || badgeMatch[2])
      if (qty > 0 && qty <= 99) signals.push({ qty, raw: badgeMatch[0], priority: 2 })
    }

    if (scope) {
      for (const el of scope.querySelectorAll(
        '[class*="quantity"], [data-test*="quantity"], span, p',
      )) {
        const t = text(el)
        if (!t || t.length > 20) continue
        const m = t.match(QTY_BADGE_RE)
        if (m) {
          const qty = Number(m[1] || m[2])
          if (qty > 0 && qty <= 99) signals.push({ qty, raw: t, priority: 1 })
        }
      }
    }

    if (!signals.length) return { quantity: 1, quantityRaw: undefined }
    signals.sort((a, b) => b.priority - a.priority || b.qty - a.qty)
    const best = signals[0]
    return { quantity: best.qty, quantityRaw: best.raw }
  }

  function cleanProductTitle(raw) {
    let t = decodeEntities(String(raw || '').trim())
    t = t.replace(QTY_IN_TEXT_RE, '').trim()
    t = t.replace(/\s+/g, ' ').trim()
    return t
  }

  function buildLineItem(rawTitle, scope, imgEl) {
    const cleaned = cleanProductTitle(rawTitle)
    if (isGenericTitle(cleaned)) return null
    const row = scope || imgEl?.parentElement
    const { quantity, quantityRaw } = parseQuantitySignals(rawTitle, row)
    const imageUrl =
      extractProductImageUrl(row) ||
      (imgEl ? extractProductImageUrl(imgEl.parentElement) || imgEl.src : undefined)
    const imageAlt = imgEl?.getAttribute('alt')?.trim()
    return {
      title: cleaned,
      imageUrl: imageUrl || undefined,
      imageAlt: imageAlt && !/logo|icon|target/i.test(imageAlt) ? imageAlt : undefined,
      quantity,
      quantityRaw,
    }
  }

  function isCleanStatus(t) {
    if (!t || t.length > 80) return false
    if (/Common Questions|Get top deals|Footer|You.?ve saved/i.test(t)) return false
    return /^(Delivered|Shipped|Cancelled|Canceled|Ready for pickup|Picked up|Processing|Preparing|In transit|On the way|Out for delivery|Completed|Returned|Refunded|Arriving|Sent on|Order Delivered|Order Cancelled|Order Cancelled|Purchased|Return complete|Return started|Return requested|Refund issued)/i.test(
      t,
    )
  }

  function normalizeStatus(raw) {
    const t = (raw || '').trim()
    if (!t) return undefined
    if (/^Order /i.test(t)) return t.replace(/^Order /i, '').trim()
    return t
  }

  function normalizeOrderStatus(raw) {
    const statusRaw = normalizeStatus(raw) || undefined
    if (!statusRaw) return { status: undefined, statusRaw: undefined, returnInfo: undefined }

    let status = statusRaw
    if (/^return complete$/i.test(statusRaw)) status = 'returned'
    else if (/^return(ed)?$/i.test(statusRaw)) status = 'returned'
    else if (/^refund(ed)?$|^refund issued$/i.test(statusRaw)) status = 'refunded'
    else if (/^cancel(l)?ed$/i.test(statusRaw)) status = 'cancelled'
    else if (/return (started|requested|in progress)/i.test(statusRaw))
      status = 'return_in_progress'
    else if (/pickup expired|unable to fulfill/i.test(statusRaw))
      status = 'cancelled_or_unfulfilled'
    else if (/^purchased$/i.test(statusRaw)) status = 'purchased'
    else if (/^delivered$/i.test(statusRaw)) status = 'delivered'
    else if (/^picked up$/i.test(statusRaw)) status = 'picked_up'

    return {
      status,
      statusRaw,
      returnInfo: parseReturnInfo(statusRaw, undefined),
    }
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
    if (/^cancel(l)?ed$/i.test(label)) {
      return { status: 'cancelled', label, eventDate: undefined }
    }
    if (/^refund(ed)?$|^refund issued$/i.test(label)) {
      return {
        status: 'refunded',
        label,
        refundAmount: parseMoney(orderTotal),
      }
    }
    if (/^return(ed)?$/i.test(label)) {
      return {
        status: 'returned',
        label,
        refundAmount: parseMoney(orderTotal),
      }
    }
    if (/^return complete$/i.test(label)) {
      return {
        status: 'returned',
        label,
        refundAmount: parseMoney(orderTotal),
      }
    }
    if (/return (started|requested|in progress)/i.test(label)) {
      return { status: 'return_in_progress', label, eventDate: undefined }
    }
    if (/pickup expired|unable to fulfill/i.test(label)) {
      return { status: 'cancelled_or_unfulfilled', label, eventDate: undefined }
    }
    return undefined
  }

  function wrapOrder(base) {
    const statusInfo = normalizeOrderStatus(base.status)
    const rawDateText = base.orderDate
    const orderDateIso = toIsoDate(rawDateText)
    const totalRaw = base.orderTotal
    return {
      ...base,
      orderDate: rawDateText,
      rawDateText,
      orderDateIso,
      orderTotal: totalRaw,
      totalRaw,
      totalSource: totalRaw ? 'receipt' : undefined,
      status: statusInfo.status || base.status,
      statusRaw: statusInfo.statusRaw,
      returnInfo: parseReturnInfo(statusInfo.statusRaw || base.status, totalRaw),
    }
  }

  function extractProductImageUrl(scope) {
    if (!scope) return undefined
    const imgs = scope.querySelectorAll
      ? scope.querySelectorAll('img')
      : scope.tagName === 'IMG'
        ? [scope]
        : []
    for (const img of imgs) {
      const candidates = [
        img.currentSrc,
        img.getAttribute('src'),
        img.getAttribute('data-src'),
        ...(img.getAttribute('srcset') || '')
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0]),
        ...(img.getAttribute('data-srcset') || '')
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0]),
      ].filter(Boolean)
      for (const src of candidates) {
        if (!src || src.startsWith('data:')) continue
        if (!/target\.scene7\.com|targetimg1\.com|target\.com\//i.test(src)) continue
        if (/logo|icon|sprite|placeholder|1x1|pixel|svg/i.test(src)) continue
        return src.replace(/\?$/, '')
      }
    }
    return undefined
  }

  function lineItemKey(item) {
    return `${item.title}|${item.quantity || 1}|${item.imageUrl || ''}`
  }

  function mergeLineItems(a, b) {
    const seen = new Set()
    const out = []
    for (const item of [...a, ...b]) {
      const key = item.detailUrl || lineItemKey(item)
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
      const alt = img.getAttribute('alt')?.trim()
      if (!alt || alt.length < 4 || /target|logo|icon|delivered|canceled/i.test(alt))
        continue
      const row = img.closest('li') || img.closest('[class*="item"]') || img.parentElement
      const item = buildLineItem(alt, row, img)
      if (!item) continue
      const key = lineItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }

    for (const a of root.querySelectorAll('a[href*="/p/"], a[href*="/A-"]')) {
      const title = text(a)
      if (isGenericTitle(title)) continue
      const href = a.href || ''
      const row = a.closest('li') || a.closest('[class*="item"]') || a.parentElement
      const item = buildLineItem(title, row)
      if (!item) continue
      item.detailUrl = href.startsWith('http') ? href : undefined
      const key = item.detailUrl || lineItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
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
    const statusRaw = extractStatusFromCard(card)

    return wrapOrder({
      orderId,
      orderDate,
      orderTotal,
      status: statusRaw,
      channel: 'Online',
      sourceView: 'online',
      detailUrl: detailUrlFor(orderId),
      lineItems: lineItemsFromCard(card),
    })
  }

  function parseInstorePurchaseLink(link) {
    const href = link.href || ''
    const orderId = normalizeInstoreOrderId(href.match(INSTORE_HREF_RE)?.[1])
    if (!orderId) return null

    const cardRoot =
      document.getElementById(orderId) ||
      link.closest(`div#${CSS.escape(orderId)}`) ||
      link.closest('[class*="orderCard"]')?.parentElement
    const card =
      cardRoot?.querySelector('[data-test="store-order-details-link"]')?.closest(
        '[class*="orderCard"]',
      ) ||
      link.closest('[data-test="store-order-details-link"]')?.closest(
        '[class*="orderCard"]',
      ) ||
      link.closest('[class*="orderCard"]')

    const aria = link.getAttribute('aria-label') || ''
    const ariaMatch = aria.match(INSTORE_VIEW_PURCHASE_ARIA_RE)
    const headerDate =
      card?.querySelector('p.h-text-bold')?.textContent?.trim() ||
      cardRoot?.querySelector('p.h-text-bold')?.textContent?.trim()
    const orderDate =
      ariaMatch?.[1] || parseDateFromText(headerDate) || headerDate || undefined
    const storeName = ariaMatch?.[2]

    const blockText = text(card || cardRoot)
    const orderTotal =
      blockText.match(/\$[\d,]+\.\d{2}/)?.[0] ||
      [...(card || cardRoot)?.querySelectorAll('p') || []]
        .map((p) => text(p).match(PRICE_RE)?.[0])
        .find(Boolean)

    const statusRaw = extractStatusFromCard(card || cardRoot)

    return wrapOrder({
      orderId,
      orderDate,
      orderTotal,
      status: statusRaw,
      channel: 'In store',
      sourceView: 'in_store',
      storeName,
      detailUrl: detailUrlFor(orderId),
      lineItems: lineItemsFromCard(card || cardRoot),
    })
  }

  function parseInstoreOrderList() {
    /** @type {Map<string, Record<string, unknown>>} */
    const byId = new Map()

    for (const link of document.querySelectorAll(SEL.instoreViewPurchaseLink)) {
      const label = link.getAttribute('aria-label') || text(link)
      if (!/view purchase/i.test(label)) continue
      const parsed = parseInstorePurchaseLink(link)
      if (!parsed) continue
      const prev = byId.get(parsed.orderId) || { lineItems: [] }
      byId.set(parsed.orderId, {
        ...prev,
        ...parsed,
        lineItems: mergeLineItems(prev.lineItems || [], parsed.lineItems || []),
      })
    }

    for (const wrapper of document.querySelectorAll(SEL.instoreOrderCard)) {
      const card = wrapper.closest('[class*="orderCard"]')
      const root = card?.parentElement
      const orderId = normalizeInstoreOrderId(root?.id)
      if (!orderId || byId.has(orderId)) continue
      const link = wrapper.querySelector('a[href*="/orders/stores/"]')
      if (link) {
        const parsed = parseInstorePurchaseLink(link)
        if (parsed) byId.set(parsed.orderId, parsed)
        continue
      }
      const headerDate = card?.querySelector('p.h-text-bold')?.textContent?.trim()
      const blockText = text(card)
      const orderTotal = blockText.match(PRICE_RE)?.[0]
      const statusRaw = extractStatusFromCard(card)
      byId.set(orderId, wrapOrder({
        orderId,
        orderDate: parseDateFromText(headerDate) || headerDate,
        orderTotal,
        status: statusRaw,
        channel: 'In store',
        sourceView: 'in_store',
        detailUrl: detailUrlFor(orderId),
        lineItems: lineItemsFromCard(card),
      }))
    }

    return [...byId.values()].filter((o) => o.orderId)
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

    const instore = parseInstoreOrderList()
    for (const order of instore) {
      const prev = byId.get(order.orderId) || { lineItems: [] }
      byId.set(order.orderId, {
        ...prev,
        ...order,
        lineItems: mergeLineItems(prev.lineItems || [], order.lineItems || []),
      })
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
      const rawTitle = aria.replace(/^item details for /i, '').trim()
      const row =
        btn.closest('li') ||
        btn.closest('[class*="item"]') ||
        btn.parentElement?.parentElement?.parentElement
      const item = buildLineItem(rawTitle, row)
      if (!item) continue
      const key = lineItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      const price = text(row).match(PRICE_RE)?.[0]
      item.price = price || undefined
      const itemStatus = extractStatusFromCard(row)
      if (itemStatus) {
        const si = normalizeOrderStatus(itemStatus)
        item.status = si.status
        item.statusRaw = si.statusRaw
      }
      items.push(item)
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
      const rawTitle = text(node)
      if (isGenericTitle(rawTitle)) continue
      const row = node.closest('li') || node.parentElement
      const item = buildLineItem(rawTitle, row)
      if (!item) continue
      const key = lineItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      if (currentStatus) {
        const si = normalizeOrderStatus(currentStatus)
        item.status = si.status
        item.statusRaw = si.statusRaw
      }
      items.push(item)
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
      normalizeInstoreOrderId(location.pathname.match(INSTORE_HREF_RE)?.[1]) ||
      normalizeOrderId(text(root).match(ORDER_ID_RE)?.[1])
    if (!orderId) return null

    const orderTotal = parseDetailOrderTotal(root)
    const bodyText = text(root)
    const orderDate = parseDateFromText(bodyText)
    const statusRaw =
      [...root.querySelectorAll('h2')].map((h) => normalizeStatus(text(h))).find(isCleanStatus) ||
      extractStatusFromCard(root)

    return wrapOrder({
      orderId,
      orderDate,
      orderTotal,
      status: statusRaw,
      channel: INSTORE_HREF_RE.test(location.pathname) ? 'In store' : undefined,
      sourceView: INSTORE_HREF_RE.test(location.pathname) ? 'in_store' : 'online',
      detailUrl: location.href.split('?')[0],
      lineItems: parseDetailLineItems(root),
    })
  }

  function isDetailPage() {
    return (
      ORDER_HREF_RE.test(location.pathname) ||
      INSTORE_HREF_RE.test(location.pathname)
    )
  }

  function activeSourceView() {
    const instoreTab = document.querySelector(SEL.tabInstore)
    if (instoreTab?.getAttribute('aria-selected') === 'true') return 'in_store'
    return 'online'
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
        sourceView: activeSourceView(),
        items,
        note: items.length
          ? undefined
          : 'No orders — sign in to Target, open /orders (Online or In-store tab), then re-capture',
      }
    },
  })
})()
