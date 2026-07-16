/**
 * Best Buy orders adapter v1 — structure from Web State DevTools page model.
 * List:         purchasehistory/purchases (virtuoso + OrderItemHeader)
 * Online detail: profile/ss/orders/order-details/{id}/view (line-item-header-*)
 * Store detail:  purchasehistory/purchase-details?purchaseKey={space-separated}
 *                (.pff-purchase-details-* — shares NOTHING with the online detail
 *                 DOM: no order-item, no line-item-header-*, no data-testid at all)
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
    detailRoot:
      '.order-details-page, [data-testid="order-details-page"], [class*="OrderDetailsPage"]',
    lineItemLink:
      'a[id^="line-item-header-"], a[data-testid*="line-item"], [data-testid*="LineItem"] a',
    productImage: 'img[src*="bbystatic.com"], img[src*="bestbuy.com/"]',
    // In-store receipt page. Most fields wrap a `*-title` label node together
    // with their value, so values are read by stripping the label rather than by
    // text-order heuristics ("Net Total:" contains "Total:", which any
    // /Total:\s*(\$…)/ scan matches on the wrong field). storeLocation is the
    // exception — its label is a SIBLING, see storeLocationValue().
    storeDetailRoot: '.pff-purchase-details-page',
    storeDate: '.pff-purchase-details-summary__purchase-date',
    storeOrderNumber: '.pff-purchase-details-summary__order-number',
    storeTotal: '.pff-purchase-details-summary__total',
    storeNetTotal: '.pff-purchase-details-summary__net-total',
    storeSalesTax: '.pff-purchase-details-summary__sales-tax',
    storeLocation: '.pff-purchase-details-store-location__store-location-text',
    storeItemWrapper: '.pff-purchase-details-item-list__item-wrapper',
    storeSkuLink: '.pff-purchase-details-item-list__item-sku-link',
    storeItemStatus: '.pff-purchase-details-item-list__item-status-title',
  }

  function matches(url) {
    try {
      const u = new URL(url)
      if (!/bestbuy\./i.test(u.hostname)) return false
      const p = u.pathname + u.search
      return (
        /purchasehistory|profile\/ss\/(?:marketplace\/)?orders|order-details/i.test(
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
    // In-store receipts live on a completely different route from online orders:
    //   /purchasehistory/purchase-details?purchaseKey=477%2060%209341%20070926
    // keyed by the SPACE-separated receipt number, not the dashed orderId we
    // derive from it. Pointing them at the online /order-details/ route (as this
    // did) 404s back to the purchase list, which is why in-store rows came back
    // with zero line items and — before the follow got an identity guard —
    // inherited the neighbouring online order's amount and date.
    if (INSTORE_ORDER_ID_RE.test(orderId)) {
      const purchaseKey = encodeURIComponent(orderId.replace(/-/g, ' '))
      return `${location.origin}/purchasehistory/purchase-details?purchaseKey=${purchaseKey}`
    }
    const id = encodeURIComponent(orderId)
    if (/^BBY03-/i.test(orderId)) {
      return `${location.origin}/profile/ss/marketplace/orders/order-details/${id}/view`
    }
    return `${location.origin}/profile/ss/orders/order-details/${id}/view`
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

  const INSTORE_ORDER_ID_RE = /^\d{3}-\d{2}-\d{4}-\d{6}$/

  function bestBuyReceiptIdEncodedDate(orderId) {
    if (!orderId || ORDER_ID_RE.test(orderId)) return undefined
    const m = String(orderId).match(/-(\d{2})(\d{2})(\d{2})$/)
    if (!m) return undefined
    const [, mm, dd, yy] = m
    const month = Number(mm)
    const day = Number(dd)
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const iso = `20${yy}-${mm}-${dd}`
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return undefined
    if (t > Date.now() + 2 * 86_400_000) return undefined
    return iso
  }

  function parseVisibleDateText(raw) {
    if (!raw) return undefined
    const trimmed = String(raw).trim()
    const t = Date.parse(trimmed)
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
    const m = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/i)
    if (m) {
      const parsed = Date.parse(`${m[1]} ${m[2]}, ${m[3]}`)
      if (!Number.isNaN(parsed))
        return new Date(parsed).toISOString().slice(0, 10)
    }
    return undefined
  }

  function isoToDisplayDate(iso) {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function isBestBuyInStoreOrder(order) {
    return (
      /in store/i.test(order.channel ?? '') ||
      INSTORE_ORDER_ID_RE.test(order.orderId ?? '')
    )
  }

  function normalizeBestBuyOrderDate(order) {
    const warnings = []
    const visibleRaw = order.orderDate
    const statusDateRaw = order.statusDate
    const orderDateRaw = visibleRaw ?? statusDateRaw ?? undefined
    const isInStore = isBestBuyInStoreOrder(order)

    // An in-store receipt id (477-60-9341-070926) ends in the transaction's own
    // MMDDYY, so it is self-describing and cannot be mis-attributed. Scraped
    // text can be: the list is a virtualized window where an in-store row does
    // not carry its own date node, so it picked up whichever neighbouring online
    // order was rendered beside it — 12 of 15 in-store rows landed on one wrong
    // shared date. Trust the id over the DOM, and keep the scraped value in
    // orderDateRaw so a disagreement stays auditable rather than silently lost.
    if (isInStore) {
      const encoded = bestBuyReceiptIdEncodedDate(order.orderId)
      if (encoded) {
        const visibleIso = visibleRaw ? parseVisibleDateText(visibleRaw) : undefined
        if (visibleIso && visibleIso !== encoded) {
          warnings.push('bestbuy_visible_date_disagrees_with_receipt_id')
        }
        return {
          orderDate: isoToDisplayDate(encoded),
          orderDateIso: encoded,
          orderDateRaw,
          orderDateSource: 'receipt_id',
          parserWarnings: warnings.length ? warnings : undefined,
        }
      }
      warnings.push('bestbuy_instore_receipt_id_undecodable')
    }

    if (visibleRaw) {
      const iso = parseVisibleDateText(visibleRaw)
      if (iso) {
        return {
          orderDate: String(visibleRaw).trim(),
          orderDateIso: iso,
          orderDateRaw,
          orderDateSource: 'visible_text',
          parserWarnings: warnings.length ? warnings : undefined,
        }
      }
      warnings.push('bestbuy_visible_date_unparseable')
    }

    return {
      orderDate: undefined,
      orderDateIso: undefined,
      orderDateRaw,
      orderDateSource: 'unknown',
      parserWarnings: [...warnings, 'bestbuy_order_date_unknown'],
    }
  }

  function applyOrderDateFields(order) {
    const normalized = normalizeBestBuyOrderDate(order)
    return {
      ...order,
      orderDate: normalized.orderDate,
      orderDateIso: normalized.orderDateIso,
      orderDateRaw: normalized.orderDateRaw,
      orderDateSource: normalized.orderDateSource,
      parserWarnings: normalized.parserWarnings,
    }
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
    const returnInfo = parseReturnInfo(status, statusDate, fields.orderTotal)

    return applyOrderDateFields({
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
    })
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

  /** Value of a labelled summary node, with its `*-title` label text removed. */
  function strippedFieldValue(root, sel) {
    const el = root.querySelector(sel)
    if (!el) return undefined
    const full = text(el)
    const label = text(el.querySelector('[class*="-title"]'))
    const value = label && full.startsWith(label) ? full.slice(label.length) : full
    return value.trim() || undefined
  }

  /**
   * Store location breaks the label/value shape every other summary field uses:
   * its label node is `…__store-location-text` (not `…-title`), and the value is
   * an unclassed SIBLING of it, not a child. strippedFieldValue therefore finds
   * no label to strip and hands back the label itself ("Store Location").
   * Read the sibling instead. Verified on a live receipt: "LYNNWOOD WA".
   */
  function storeLocationValue(root) {
    const label = root.querySelector(SEL.storeLocation)
    const value = text(label?.nextElementSibling)
    // Guard against the label leaking through if the DOM shape changes again.
    if (!value || /^store location$/i.test(value)) return undefined
    return value
  }

  /**
   * In-store receipt detail (/purchasehistory/purchase-details?purchaseKey=…).
   * Richer than the online order detail: it carries SKU, Model, per-item totals,
   * store location and the net/tax split, none of which the online route exposes.
   */
  function parseStoreDetail() {
    const root = document.querySelector(SEL.storeDetailRoot)
    if (!root) return null

    const storeTransactionId = strippedFieldValue(root, SEL.storeOrderNumber)
    // The receipt number is the only identity anchor here — the URL's
    // purchaseKey is the same value, but reading it back from the DOM proves we
    // landed on the receipt we asked for rather than a redirect.
    if (!storeTransactionId || !STORE_TXN_RE.test(storeTransactionId)) return null
    const orderId = storeTransactionId.replace(/\s+/g, '-')

    const lineItems = []
    for (const row of root.querySelectorAll(SEL.storeItemWrapper)) {
      const title = text(row.querySelector(SEL.storeSkuLink))
      if (!title) continue
      const rowText = text(row)
      const href = row.querySelector(SEL.storeSkuLink)?.href || ''
      // Model runs to the `SKU:` label rather than to whitespace: protection
      // plans carry prices in the model itself ("MTHLY MBR TABLET ADH $300-$499").
      const model = rowText.match(/Model:\s*(.+?)\s*SKU:/)?.[1]
      const qty = rowText.match(/Quantity:\s*(\d+)/)?.[1]
      lineItems.push({
        title,
        // Anchored on the Item Total label, not the first price in the row —
        // the model string above would otherwise win. The sign is part of the
        // value: a returned item reads "Item Total: -$379.00", and requiring a
        // bare `\$` silently dropped it, leaving 7 of 44 items priceless and the
        // receipt unbalanced. With the minus, receipt 362-41-8579-061326 adds up
        // exactly: 845.29 + 83.70 - 379.00 = 549.99 = its Net Total.
        price: rowText.match(/Item Total:\s*(-?\$[\d,]+\.\d{2})/)?.[1],
        // Status is per ITEM, not per receipt: one receipt mixes "Returned" and
        // "Purchased in Store" rows. Read from its own node — scanning rowText
        // gets it backwards in BOTH directions: the rendered text concatenates
        // ("…Item Total: -$379.00Returned" has no word boundary before
        // "Returned", so a returned item reads as not returned), while an
        // unreturned row carrying the note "Item previously returned or Price
        // Matched." reads as returned.
        status: text(row.querySelector(SEL.storeItemStatus)) || undefined,
        model: model || undefined,
        sku: rowText.match(/SKU:\s*(\d+)/)?.[1],
        detailUrl: href.startsWith('http') ? href : undefined,
        imageUrl: extractProductImageUrl(row),
        quantity: qty ? Number(qty) : 1,
      })
    }

    return applyOrderDateFields({
      orderId,
      storeTransactionId,
      orderDate: strippedFieldValue(root, SEL.storeDate),
      orderTotal: strippedFieldValue(root, SEL.storeTotal),
      netTotal: strippedFieldValue(root, SEL.storeNetTotal),
      salesTax: strippedFieldValue(root, SEL.storeSalesTax),
      storeLocation: storeLocationValue(root),
      channel: 'In store',
      // The receipt shows per-item status ("Purchased in Store"), not the
      // order-level status/return the list carries. Left undefined so the list
      // row stays the source of truth instead of being overwritten with a guess.
      detailUrl: location.href,
      lineItems: lineItems.slice(0, 30),
    })
  }

  function parseOrderDetail() {
    const root =
      document.querySelector(SEL.detailRoot) ||
      document.querySelector('main[class*="order"]') ||
      document.querySelector('main')
    if (!root) return null

    const bodyText = text(root)
    const pathId = location.pathname
      .match(/order-details\/([^/]+)/i)?.[1]
      ?.toUpperCase()
    const orderId =
      pathId ||
      bodyText.match(ORDER_ID_RE)?.[1]?.toUpperCase() ||
      bodyText.match(STORE_TXN_RE)?.[1]?.replace(/\s+/g, '-')
    if (!orderId) return null

    const lineItems = []
    const seen = new Set()
    for (const a of root.querySelectorAll(SEL.lineItemLink)) {
      const title = text(a) || a.getAttribute('aria-label') || ''
      if (!title || title.length < 4) continue
      if (/^(item details for|view product)/i.test(title)) continue
      const href = a.href || a.getAttribute('href') || ''
      const key = a.id || href || title
      if (seen.has(key)) continue
      seen.add(key)
      const row =
        a.closest('li') ||
        a.closest('[id^="lineId__"]') ||
        a.closest('[data-testid*="line-item"]') ||
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

    // Marketplace / sparse layouts: product image + adjacent title
    if (!lineItems.length) {
      for (const img of root.querySelectorAll(SEL.productImage)) {
        const row =
          img.closest('[data-testid*="line"]') ||
          img.closest('li') ||
          img.closest('article') ||
          img.parentElement?.parentElement
        if (!row) continue
        const rowText = text(row)
        const title =
          row.querySelector('h2,h3,h4,a')?.textContent?.trim() ||
          rowText.split(PRICE_RE)[0]?.trim()
        if (!title || title.length < 4 || seen.has(title)) continue
        if (/order (placed|total)|purchased in store/i.test(title)) continue
        seen.add(title)
        lineItems.push({
          title: title.replace(/\s+/g, ' ').slice(0, 300),
          price: rowText.match(PRICE_RE)?.[0],
          imageUrl: extractProductImageUrl(row),
          quantity: 1,
        })
      }
    }

    const orderTotal =
      bodyText.match(/\bOrder total\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      bodyText.match(/\bTotal\s*(\$[\d,]+\.\d{2})\b/i)?.[1] ||
      bodyText.match(PRICE_RE)?.[0]

    const status = text(root.querySelector(SEL.statusTitle)) || undefined
    const statusDate = text(root.querySelector(SEL.statusDesc)) || undefined

    return applyOrderDateFields({
      orderId,
      orderDate:
        bodyText.match(
          /(?:Order placed|Placed on|Purchased)\s*[:\s]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
        )?.[1] || undefined,
      orderTotal,
      channel: bodyText.match(/Purchased in store|In store/i)
        ? 'In store'
        : undefined,
      status,
      statusDate,
      returnInfo: parseReturnInfo(status, statusDate, orderTotal),
      detailUrl: location.href,
      lineItems: lineItems.slice(0, 30),
    })
  }

  window.__WSD_ADAPTERS__.push({
    id: 'bestbuy-orders',
    packId: 'web-state-builtin',
    site: 'bestbuy',
    entity: 'orders',
    matches,
    run() {
      if (!matches(location.href)) return null
      // Store receipts are neither the online detail route nor the list: without
      // this branch they fall through to parseOrderList(), find no order-item,
      // and report an empty page instead of a receipt.
      if (document.querySelector(SEL.storeDetailRoot)) {
        const store = parseStoreDetail()
        return store ? { site: 'bestbuy', entity: 'orders', items: [store] } : null
      }
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
