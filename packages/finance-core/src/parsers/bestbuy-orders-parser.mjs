/**
 * Pure Best Buy order date parsing helpers (testable, no DOM).
 * Browser adapter mirrors this logic for in-page extraction.
 */

export const INSTORE_ORDER_ID_RE = /^\d{3}-\d{2}-\d{4}-\d{6}$/
export const BBY_ONLINE_ORDER_ID_RE = /^BBY\d{2}-/i
export const VISIBLE_DATE_TEXT_RE =
  /^(?:Order placed|Purchased)\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i

/**
 * Best Buy in-store order ids encode the purchase date in the tail as `-MMDDYY`
 * (e.g. `470-70-6673-041526` → 2026-04-15). Online ids (`BBY01-807…`) do not.
 */
export function bestBuyReceiptIdEncodedDate(orderId) {
  if (!orderId || BBY_ONLINE_ORDER_ID_RE.test(orderId)) return undefined
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

/** @deprecated alias — use bestBuyReceiptIdEncodedDate */
export function bestBuyInStoreOrderDate(orderId) {
  return bestBuyReceiptIdEncodedDate(orderId)
}

export function parseVisibleDateText(raw) {
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

export function isoToDisplayDate(iso) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function isBestBuyInStoreOrder(order) {
  return (
    /in store/i.test(order.channel ?? '') ||
    INSTORE_ORDER_ID_RE.test(order.orderId ?? '')
  )
}

export function isReturnedInStoreStatus(status) {
  return /return/i.test(status ?? '')
}

/**
 * True when scraped orderDate equals statusDate on an in-store returned row —
 * usually the return/harvest event date, not the purchase date.
 */
export function isPollutedInStoreReturnDate(order) {
  if (!isBestBuyInStoreOrder(order)) return false
  if (!isReturnedInStoreStatus(order.status)) return false
  const visible = order.orderDate?.trim()
  const statusDate = order.statusDate?.trim()
  return Boolean(visible && statusDate && visible === statusDate)
}

/**
 * Canonical orderDate selection:
 * 1. Explicit visible purchase/order date
 * 2. Receipt/in-store ID encoded date
 * 3. Never silently use harvest/return statusDate as purchase date for in-store returns
 */
export function normalizeBestBuyOrderDate(order) {
  const warnings = []
  const visibleRaw = order.orderDate
  const statusDateRaw = order.statusDate
  const orderDateRaw = visibleRaw ?? statusDateRaw ?? undefined
  const isInStore = isBestBuyInStoreOrder(order)
  const polluted = isPollutedInStoreReturnDate(order)

  if (visibleRaw && !polluted) {
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

  if (isInStore) {
    const encoded = bestBuyReceiptIdEncodedDate(order.orderId)
    if (encoded) {
      const extra = polluted
        ? ['bestbuy_order_date_from_status_date_replaced_by_receipt_id']
        : []
      return {
        orderDate: isoToDisplayDate(encoded),
        orderDateIso: encoded,
        orderDateRaw,
        orderDateSource: 'receipt_id',
        parserWarnings: [...warnings, ...extra].length
          ? [...warnings, ...extra]
          : undefined,
      }
    }
    if (polluted) {
      warnings.push('bestbuy_instore_return_missing_receipt_date')
    }
  }

  if (!isInStore && visibleRaw) {
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
  }

  if (!isInStore && statusDateRaw && !isReturnedInStoreStatus(order.status)) {
    const iso = parseVisibleDateText(statusDateRaw)
    if (iso) {
      return {
        orderDate: String(statusDateRaw).trim(),
        orderDateIso: iso,
        orderDateRaw,
        orderDateSource: 'visible_text',
        parserWarnings: warnings.length ? warnings : undefined,
      }
    }
  }

  return {
    orderDate: undefined,
    orderDateIso: undefined,
    orderDateRaw,
    orderDateSource: 'unknown',
    parserWarnings: [
      ...warnings,
      polluted
        ? 'bestbuy_rejected_status_date_as_order_date'
        : 'bestbuy_order_date_unknown',
    ],
  }
}

export function applyBestBuyOrderDateNormalization(order) {
  const normalized = normalizeBestBuyOrderDate(order)
  const parserWarnings = [
    ...(order.parserWarnings || []),
    ...(normalized.parserWarnings || []),
  ].filter((w, i, a) => a.indexOf(w) === i)
  return {
    ...order,
    orderDate: normalized.orderDate,
    orderDateIso: normalized.orderDateIso,
    orderDateRaw: normalized.orderDateRaw,
    orderDateSource: normalized.orderDateSource,
    parserWarnings: parserWarnings.length ? parserWarnings : undefined,
  }
}
