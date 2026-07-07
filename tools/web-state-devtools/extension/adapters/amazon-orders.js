/**
 * Amazon orders adapter v3 — scoped to `.order-card.js-order-card` (2024–2026).
 * List: one card = one order; line items only from `.delivery-box`.
 * Detail: yohtmlc / item-view rows, or hzod layout with thumbnail qty badge.
 */
;(function initAmazonOrdersAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const ORDER_ID_RE = /\b(\d{3}-\d{7}-\d{7})\b/
  const PRICE_RE = /\$[\d,]+\.\d{2}/
  const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i
  const MONTH_DATE_RE =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/

  const SEL = {
    orderCard: '.order-card.js-order-card',
    orderHeader: '.order-header',
    deliveryBox: '.delivery-box',
    detailLink: 'a[href*="order-details"][href*="orderID="]',
    productLink:
      'a[href*="/dp/"], a[href*="/gp/product/"]',
  }

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
    if (!raw || raw.length > 2000) return null
    if (!/order placed/i.test(raw) || !ORDER_ID_RE.test(raw)) return null
    const orderId = raw.match(ORDER_ID_RE)?.[1]
    if (!orderId) return null

    let orderDate = raw.match(/Order placed\s+(.+?)\s+Total\b/i)?.[1]?.trim()
    if (orderDate && !MONTH_DATE_RE.test(orderDate)) {
      const m = orderDate.match(MONTH_DATE_RE)
      orderDate = m ? m[0] : orderDate.split(/\s+Total/i)[0]?.trim()
    }

    const orderTotal = raw.match(/\bTotal\s+(\$[\d,]+\.\d{2})\b/i)?.[1]

    const shipTo = raw
      .match(/Ship to\s+(.+?)\s+(?:United States|Order #)/i)?.[1]
      ?.trim()

    return { orderId, orderDate, orderTotal, shipTo }
  }

  function isCleanStatus(t) {
    if (!t || t.length > 80) return false
    if (/[{;=]|uet\(|function|Continue shopping|Buy it again/i.test(t))
      return false
    if (/return window closed|return or replace/i.test(t)) return false
    return /^(Arriving|Delivered|Cancelled|Canceled|Shipped|Returned|Refund|Out for delivery|Estimated delivery|Payment|Pending)/i.test(
      t,
    ) || /^Refund issued$|^Return complete$/i.test(t)
  }

  const GENERIC_RETURN_UI_RE =
    /return window closed|return or replace|eligible for return|start a return|view return\/refund status|buy it again/i
  const EXPLICIT_RETURN_EVIDENCE_RE =
    /(?:refund issued|refund credited|refund total|replacement sent|return complete|return received|\breturned\b|\brefunded\b)/i
  const EXPLICIT_REFUND_AMOUNT_RE =
    /Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i
  const ACTIVE_DELIVERY_STATUS_RE =
    /^(?:Arriving|Delivered|Shipped|Out for delivery|Estimated delivery|Payment|Pending|Purchased)/i
  const EXPLICIT_RETURN_STATUS_LABEL_RE =
    /^(?:Return complete|Refund issued|Refunded|Returned|Cancelled|Canceled)$/i

  function hasExplicitReturnEvidence(text, statusLabel) {
    const label = (statusLabel || '').trim()
    const blob = `${label} ${text || ''}`.trim()
    if (!blob) return false
    if (
      GENERIC_RETURN_UI_RE.test(blob) &&
      !EXPLICIT_RETURN_EVIDENCE_RE.test(blob)
    ) {
      return false
    }
    if (EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)) return true
    if (/^returned$/i.test(label)) return true
    if (EXPLICIT_REFUND_AMOUNT_RE.test(blob)) return true
    if (EXPLICIT_RETURN_EVIDENCE_RE.test(blob)) return true
    if (/return initiated|drop off|return started|return in progress/i.test(blob))
      return true
    return false
  }

  function extractReturnEvidenceFromCard(card) {
    if (!card) return ''
    const parts = []
    const delivery = card.querySelector(SEL.deliveryBox)
    if (delivery) {
      for (const el of delivery.querySelectorAll(
        'h4, h5, h6, .a-text-bold, .delivery-box__primary-text, span',
      )) {
        const t = text(el)
        if (isCleanStatus(t)) parts.push(t)
      }
    }
    for (const el of card.querySelectorAll(
      '[class*="return"], [class*="refund"], [data-component*="return"]',
    )) {
      const t = text(el)
      if (t && t.length < 200 && !GENERIC_RETURN_UI_RE.test(t)) parts.push(t)
    }
    return [...new Set(parts)].join(' ').trim()
  }

  function extractReturnEvidenceFromDetail(root, subtotalText) {
    const parts = [subtotalText || '']
    const status = extractStatusFromCard(root)
    if (status) parts.push(status)
    for (const el of root.querySelectorAll(
      '#od-subtotals, [class*="return"], [class*="refund"]',
    )) {
      const t = text(el)
      if (t && t.length < 500) parts.push(t)
    }
    return parts.join(' ').trim()
  }

  function parseReturnInfo(status, statusDate, orderTotal, evidenceText) {
    const label = (status || '').trim()
    const evidence = (evidenceText || '').trim()
    const blob = `${label} ${evidence}`.trim()
    const warnings = []
    if (!label && !evidence) return { returnInfo: undefined, warnings }

    if (
      GENERIC_RETURN_UI_RE.test(blob) &&
      !EXPLICIT_RETURN_EVIDENCE_RE.test(blob) &&
      !EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)
    ) {
      return { returnInfo: undefined, warnings }
    }

    let returnStatus = null
    if (/^refund issued$|^refund credited$|^refunded$/i.test(label)) {
      returnStatus = 'refunded'
    } else if (/^return complete$/i.test(label) || /^returned$/i.test(label)) {
      returnStatus = /refund/i.test(blob) ? 'refunded' : 'returned'
    } else if (/^cancelled$|^canceled$/i.test(label)) {
      returnStatus = 'cancelled'
    } else if (/return initiated|drop off|return started/i.test(blob)) {
      returnStatus = 'return_in_progress'
    } else if (EXPLICIT_RETURN_EVIDENCE_RE.test(evidence)) {
      if (/refund issued|refund credited|refund total|\brefunded\b/i.test(evidence)) {
        returnStatus = 'refunded'
      } else if (
        /return complete|return received|\breturned\b|replacement sent/i.test(
          evidence,
        )
      ) {
        returnStatus = /refund/i.test(evidence) ? 'refunded' : 'returned'
      }
    }

    const refundLine = evidence.match(EXPLICIT_REFUND_AMOUNT_RE)
    if (!returnStatus && refundLine) returnStatus = 'refunded'
    if (!returnStatus) return { returnInfo: undefined, warnings }

    if (!hasExplicitReturnEvidence(evidence, label)) {
      warnings.push('amazon_return_info_suppressed_no_explicit_evidence')
      return { returnInfo: undefined, warnings }
    }

    if (
      ACTIVE_DELIVERY_STATUS_RE.test(label) &&
      !EXPLICIT_RETURN_STATUS_LABEL_RE.test(label) &&
      !EXPLICIT_REFUND_AMOUNT_RE.test(evidence)
    ) {
      warnings.push('amazon_return_info_suppressed_no_explicit_evidence')
      return { returnInfo: undefined, warnings }
    }

    const refundAmount =
      returnStatus === 'cancelled'
        ? undefined
        : (refundLine ? parseMoney(refundLine[1]) : null) ??
          (EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)
            ? parseMoney(orderTotal)
            : null) ??
          undefined

    return {
      returnInfo: {
        status: returnStatus,
        label: label || undefined,
        eventDate: statusDate || undefined,
        refundAmount,
      },
      warnings,
      returnEvidenceText: evidence || undefined,
    }
  }

  function isProductLink(a) {
    const href = a.href || ''
    if (!ASIN_RE.test(href)) return false
    if (
      /plattr=|buyagain|subscribe-and-save|review-your-purchases|product-support|help\/contact|invoice/i.test(
        href,
      )
    ) {
      return false
    }
    const title = text(a)
    if (!title || title.length < 4) return false
    if (
      /^(Buy it again|View order details|View invoice|Get product support|Ask Product Question|Write a product review)$/i.test(
        title,
      )
    ) {
      return false
    }
    if (/fed_asin_title|asin_title|ppx_yo2ov_dt_b_fed|hzod_title_dt_b_fed/i.test(href))
      return true
    return !/amazon\.com\/dp\/product\//i.test(href)
  }

  function asinFromHref(href) {
    return href?.match(ASIN_RE)?.[1]?.toUpperCase() || null
  }

  /** Amazon product image — prefer data-a-hires, upgrade thumb to SL500 for UI. */
  function isProductImageUrl(url) {
    if (!url || url.startsWith('data:')) return false
    if (/sprite|nav-sprite|grey-pixel|transparent|1x1|spacer|prime-day|logo/i.test(url))
      return false
    return (
      /media-amazon|images-amazon|ssl-images-amazon/i.test(url) ||
      /\/images\/I\//i.test(url)
    )
  }

  function readImageFromEl(img) {
    if (!img) return null
    for (const attr of ['data-a-hires', 'data-src', 'data-lazy-src']) {
      const v = img.getAttribute(attr)
      if (v && isProductImageUrl(v)) return v
    }
    const src = img.currentSrc || img.src
    return isProductImageUrl(src) ? src : null
  }

  function normalizeAmazonImageUrl(url) {
    if (!url) return undefined
    try {
      const u = new URL(url, location.origin)
      if (u.protocol === 'http:') u.protocol = 'https:'
      let href = u.href
      href = href.replace(/\._[A-Z]{2,3}\d+_[A-Z]{2,3}\d+_\./, '._SL500_.')
      href = href.replace(/\._(?:SS|SX|SY|US|UY|UL|AC|SR)\d+_\./, '._SL500_.')
      return href
    } catch {
      return url
    }
  }

  function extractProductImageUrl(row, titleEl) {
    /** @type {Element[]} */
    const scopes = []
    if (row instanceof Element) scopes.push(row)
    const itemRow = findItemRow(titleEl)
    if (itemRow && !scopes.includes(itemRow)) scopes.push(itemRow)
    if (titleEl instanceof Element) {
      let n = titleEl.parentElement
      for (let i = 0; i < 8 && n; i++) {
        if (!scopes.includes(n)) scopes.push(n)
        n = n.parentElement
      }
    }
    for (const scope of scopes) {
      for (const pic of scope.querySelectorAll(
        'picture source[srcset], img[srcset]',
      )) {
        const srcset = pic.getAttribute('srcset') || ''
        const first = srcset.split(',')[0]?.trim().split(/\s+/)[0]
        if (first && isProductImageUrl(first))
          return normalizeAmazonImageUrl(first)
      }
      for (const img of scope.querySelectorAll('img')) {
        const raw = readImageFromEl(img)
        if (raw) return normalizeAmazonImageUrl(raw)
      }
      for (const el of scope.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage
        const m = bg?.match(/url\(["']?(https?:[^"')]+)/i)
        if (m?.[1] && isProductImageUrl(m[1]))
          return normalizeAmazonImageUrl(m[1])
      }
    }
    return undefined
  }

  function parseMoney(value) {
    if (value == null || value === '') return null
    const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  function findItemRow(fromEl) {
    if (!fromEl) return null
    const li = fromEl.closest('li')
    if (li) return li

    const legacy = fromEl.closest(
      '.yohtmlc-item, .item-view, [data-component="itemRow"], .shipment-item, .item-box',
    )
    if (legacy) return legacy

    // hzod detail layout: thumbnail column (qty badge) + info column (title link)
    let node = fromEl.parentElement
    for (let i = 0; i < 12 && node; i++) {
      if (node.id === 'orderDetails') break
      const cols = [...node.children].filter((c) => c.tagName === 'DIV')
      if (cols.length >= 2 && node.contains(fromEl)) {
        const badge = [...cols[0].querySelectorAll('span')].find((s) =>
          /^[1-9]\d{0,2}$/.test(text(s)),
        )
        if (badge) return node
      }
      node = node.parentElement
    }
    return null
  }

  /** Qty from "Qty: N", thumbnail badge, or unitPrice × subtotal inference. */
  function extractQuantity(scope, titleEl, options = {}) {
    const row = findItemRow(titleEl) || (scope instanceof Element ? scope : null)
    const blob = text(row || scope || titleEl?.parentElement)

    const labeled = blob.match(/\bQty\.?\s*:?\s*(\d+)\b/i)
    if (labeled) return Number(labeled[1])

    if (row) {
      // List + detail: integer badge on product thumbnail (not pagination).
      const badgeSelectors = [
        ':scope > span > div > div > div:first-child span',
        ':scope > span > div > div > div:first-child div > span',
        ':scope > div > div > div:first-child span',
      ]
      for (const sel of badgeSelectors) {
        try {
          const badge = row.matches?.('li') ? row.querySelector(sel) : row.querySelector(sel)
          const n = parseInt(text(badge), 10)
          if (n >= 1 && n <= 999) return n
        } catch {
          /* invalid selector in older browsers */
        }
      }

      const titleRect = titleEl?.getBoundingClientRect?.()
      const badges = []
      for (const span of row.querySelectorAll('span')) {
        const t = text(span)
        if (!/^[1-9]\d{0,2}$/.test(t)) continue
        if (span.closest('a[href*="/dp/"], .a-color-price, [class*="price"]'))
          continue
        const r = span.getBoundingClientRect?.()
        if (titleRect && r && r.left >= titleRect.left - 20) continue
        badges.push(Number(t))
      }
      if (badges.length === 1) return badges[0]
    }

    const unitPrice = options.unitPrice ?? findUnitPrice(row || scope, titleEl)
    const subtotal = options.itemsSubtotal
    if (unitPrice && subtotal) {
      const qty = Math.round(subtotal / unitPrice)
      if (
        qty >= 1 &&
        qty <= 999 &&
        Math.abs(qty * unitPrice - subtotal) < 0.03
      ) {
        return qty
      }
    }

    return 1
  }

  function findUnitPrice(scope, titleEl) {
    const row = findItemRow(titleEl) || (scope instanceof Element ? scope : null)
    if (!row) return null
    const rowText = text(row)
    const labeled = rowText.match(/\bUnit price\s+(\$[\d,]+\.\d{2})/i)?.[1]
    if (labeled) return parseMoney(labeled)
    for (const el of row.querySelectorAll('span, div')) {
      const t = text(el)
      if (!PRICE_RE.test(t) || t.length > 16) continue
      const val = parseMoney(t)
      if (val != null && val > 0 && val < 10_000) return val
    }
    return null
  }

  function readItemsSubtotal() {
    const block = text(document.querySelector('#od-subtotals'))
    const m = block.match(/Item\(s\) Subtotal:\s*(\$[\d,]+\.\d{2})/i)
    return m ? parseMoney(m[1]) : null
  }

  function extractLineItemsFromDeliveryBox(root) {
    const items = []
    const seen = new Set()
    if (!root) return items

    for (const a of root.querySelectorAll(SEL.productLink)) {
      if (!isProductLink(a)) continue
      const href = a.href || ''
      const asin = asinFromHref(href)
      const key = asin || text(a).slice(0, 120)
      if (!key || seen.has(key)) continue
      seen.add(key)

      const row = findItemRow(a) || a.parentElement
      const rowText = text(row)
      const unitPrice = findUnitPrice(row, a)
      const price =
        rowText.match(/\b(?:Price|Item\s+total)\s+(\$[\d,]+\.\d{2})\b/i)?.[1] ||
        (unitPrice != null ? `$${unitPrice.toFixed(2)}` : rowText.match(PRICE_RE)?.[0])
      const quantity = extractQuantity(row, a, { unitPrice })

      items.push({
        title: text(a).slice(0, 300),
        asin: asin || undefined,
        price: price || undefined,
        quantity,
        imageUrl: extractProductImageUrl(row, a),
        detailUrl: href,
      })
    }
    return items
  }

  function extractStatusFromCard(card) {
    const delivery = card.querySelector(SEL.deliveryBox)
    if (!delivery) return undefined

    for (const el of delivery.querySelectorAll(
      'h4, h5, h6, .a-text-bold, .delivery-box__primary-text, span',
    )) {
      const t = text(el)
      if (isCleanStatus(t)) return t
    }

    const block = text(delivery)
    const m = block.match(
      /(Delivered[^|.{]{0,40}|Cancelled[^|.{]{0,40}|Canceled[^|.{]{0,40}|Arriving[^|.{]{0,40}|Shipped[^|.{]{0,40}|Returned[^|.{]{0,40}|Refund issued[^|.{]{0,20}|Return complete[^|.{]{0,20})/i,
    )
    const candidate = m?.[1]?.trim()
    return isCleanStatus(candidate) ? candidate : undefined
  }

  function deriveReturnInfoDecision(status, returnInfo, returnEvidenceText) {
    if (returnInfo) return 'present'
    const label = (status || '').trim()
    const evidence = returnEvidenceText || ''
    if (
      EXPLICIT_RETURN_STATUS_LABEL_RE.test(label) ||
      /^returned$/i.test(label) ||
      /return initiated|drop off|return started|return in progress/i.test(
        `${label} ${evidence}`,
      )
    ) {
      return 'present'
    }
    if (hasExplicitReturnEvidence(evidence, label)) return 'present'
    if (ACTIVE_DELIVERY_STATUS_RE.test(label) || /^(?:deliver|arriv|ship|purchas)/i.test(label)) {
      return 'absent_verified'
    }
    if (!label) return 'unknown'
    return 'unknown'
  }

  function parseOrderCard(card) {
    const headerEl = card.querySelector(SEL.orderHeader) || card
    const header = parseHeaderBlock(text(headerEl))
    if (!header?.orderId) return null

    const detailLink = card.querySelector(SEL.detailLink)
    const detailUrl = detailLink?.href || undefined

    const deliveryBox = card.querySelector(SEL.deliveryBox)
    const lineItems = extractLineItemsFromDeliveryBox(deliveryBox)
    const status = extractStatusFromCard(card)
    const evidenceText = extractReturnEvidenceFromCard(card)
    const parsedReturn = parseReturnInfo(
      status,
      undefined,
      header.orderTotal,
      evidenceText,
    )

    return {
      orderId: header.orderId,
      orderDate: header.orderDate,
      orderTotal: header.orderTotal,
      shipTo: header.shipTo,
      status,
      returnInfo: parsedReturn.returnInfo,
      returnEvidenceText: parsedReturn.returnEvidenceText,
      returnInfoDecision: deriveReturnInfoDecision(
        status,
        parsedReturn.returnInfo,
        parsedReturn.returnEvidenceText,
      ),
      parserWarnings: parsedReturn.warnings?.length
        ? parsedReturn.warnings
        : undefined,
      detailUrl,
      lineItems,
    }
  }

  function parseOrderList() {
    const cards = document.querySelectorAll(SEL.orderCard)
    if (cards.length) {
      const items = []
      const seen = new Set()
      for (const card of cards) {
        const parsed = parseOrderCard(card)
        if (!parsed?.orderId || seen.has(parsed.orderId)) continue
        seen.add(parsed.orderId)
        if (!parsed.detailUrl) {
          parsed.detailUrl = `${location.origin}/your-orders/order-details?orderID=${encodeURIComponent(parsed.orderId)}`
        }
        items.push(parsed)
      }
      if (items.length) return items
    }

    /** Fallback: legacy layout without `.order-card` class */
    const byId = new Map()
    for (const el of document.querySelectorAll(
      `${SEL.orderHeader}, [class*="order-header"]`,
    )) {
      const card =
        el.closest('.order-card') ||
        el.closest('.a-box-group')?.parentElement ||
        el.parentElement?.parentElement
      if (!card) continue
      const parsed = parseOrderCard(card)
      if (!parsed?.orderId || byId.has(parsed.orderId)) continue
      if (!parsed.detailUrl) {
        parsed.detailUrl = `${location.origin}/your-orders/order-details?orderID=${encodeURIComponent(parsed.orderId)}`
      }
      byId.set(parsed.orderId, parsed)
    }
    return [...byId.values()]
  }

  function parseOrderDetail() {
    const orderId =
      new URL(location.href).searchParams.get('orderID') ||
      text(document.body).match(ORDER_ID_RE)?.[1]

    if (!orderId) return null

    const root = document.querySelector('#orderDetails') || document.body
    const headerEl =
      root.querySelector('.order-header, .order-info') || root
    const header = parseHeaderBlock(text(headerEl)) || {}

    const lineItems = []
    const seen = new Set()
    const itemsSubtotal = readItemsSubtotal()

    function pushLineItem(titleEl, scope) {
      if (!titleEl || !isProductLink(titleEl)) return
      const href = titleEl.href || ''
      const asin = asinFromHref(href)
      const key = asin || text(titleEl)
      if (!key || seen.has(key)) return
      seen.add(key)

      const row =
        findItemRow(titleEl) || (scope instanceof Element ? scope : null)
      const rowText = text(row || scope || titleEl)
      const unitPrice = findUnitPrice(row || scope, titleEl)
      const price =
        rowText.match(/\b(?:Price|Item\s+total)\s+(\$[\d,]+\.\d{2})\b/i)?.[1] ||
        (unitPrice != null ? `$${unitPrice.toFixed(2)}` : null) ||
        [...(row?.querySelectorAll('.a-color-price, .a-price') || [])]
          .map(text)
          .find((v) => PRICE_RE.test(v))
          ?.match(PRICE_RE)?.[0]
      const quantity = extractQuantity(row || scope, titleEl, {
        unitPrice,
        itemsSubtotal:
          lineItems.length === 0 && itemsSubtotal ? itemsSubtotal : undefined,
      })

      lineItems.push({
        title: text(titleEl).slice(0, 300),
        asin: asin || undefined,
        price: price || undefined,
        quantity,
        imageUrl: extractProductImageUrl(row, titleEl),
        detailUrl: href,
      })
    }

    for (const row of root.querySelectorAll(
      '.yohtmlc-item, .a-fixed-left-grid.item-view, [data-component="itemRow"], .item-view',
    )) {
      const titleEl = row.querySelector(
        'a.a-link-normal[href*="/dp/"], a.a-link-normal[href*="/gp/product"], .yohtmlc-product-title a, .yohtmlc-product-title',
      )
      pushLineItem(titleEl, row)
    }

    if (!lineItems.length) {
      const productLinks = root.querySelectorAll(
        'a[href*="/dp/"][href*="fed_asin_title"], a[href*="/gp/product/"][href*="fed_asin_title"]',
      )
      for (const titleEl of productLinks) {
        pushLineItem(titleEl, findItemRow(titleEl))
      }
    }

    if (
      lineItems.length === 1 &&
      lineItems[0].quantity === 1 &&
      itemsSubtotal
    ) {
      const titleEl = root.querySelector('a[href*="fed_asin_title"]')
      const unitPrice =
        parseMoney(lineItems[0].price) ??
        findUnitPrice(findItemRow(titleEl), titleEl)
      if (unitPrice) {
        const qty = Math.round(itemsSubtotal / unitPrice)
        if (
          qty >= 2 &&
          qty <= 999 &&
          Math.abs(qty * unitPrice - itemsSubtotal) < 0.03
        ) {
          lineItems[0].quantity = qty
        }
      }
    }

    const subtotals = document.querySelector('#od-subtotals')
    const subtotalText = text(subtotals)
    const orderTotal =
      header.orderTotal ||
      subtotalText.match(/\bGrand Total:\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      text(document.body).match(
        /\b(?:Order total|Grand total|Total)\s+(\$[\d,]+\.\d{2})\b/i,
      )?.[1]

    let orderDate = header.orderDate
    if (!orderDate) {
      orderDate = text(document.body).match(
        /Order placed\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/i,
      )?.[1]
    }

    const status = extractStatusFromCard(root) || undefined
    const evidenceText = extractReturnEvidenceFromDetail(root, subtotalText)
    const parsedReturn = parseReturnInfo(
      status,
      undefined,
      orderTotal,
      evidenceText,
    )

    return {
      orderId,
      orderDate,
      orderTotal,
      shipTo: header.shipTo,
      status,
      returnInfo: parsedReturn.returnInfo,
      returnEvidenceText: parsedReturn.returnEvidenceText,
      returnInfoDecision: deriveReturnInfoDecision(
        status,
        parsedReturn.returnInfo,
        parsedReturn.returnEvidenceText,
      ),
      parserWarnings: parsedReturn.warnings?.length
        ? parsedReturn.warnings
        : undefined,
      detailUrl: location.href,
      lineItems: lineItems.slice(0, 30),
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
          : 'No orders parsed — scroll list then re-capture',
      }
    },
  })
})()
