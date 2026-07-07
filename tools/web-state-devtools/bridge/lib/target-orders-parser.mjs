/**
 * Pure Target order parsing helpers (testable, no DOM).
 * Browser adapter mirrors this logic for in-page extraction.
 */

export const INSTORE_ORDER_ID_RE = /^\d{4}-\d{4}-\d{4}-\d{4}$/
export const GENERIC_TITLE_RE =
  /^(item|product|view details|details|buy again|add to cart|return complete|track|help)$/i
export const QTY_IN_TEXT_RE = /\s[-–—]\s*(?:quantity|qty)\s*[:]\s*(\d+)\s*$/i
export const QTY_BADGE_RE =
  /\b(?:qty|quantity)\s*[:.]?\s*(\d+)\b|(?:^|\s)x(\d+)(?:\s|$)/i

export function isGenericTitle(raw) {
  const t = (raw || '').trim()
  if (!t || t.length < 4) return true
  if (GENERIC_TITLE_RE.test(t)) return true
  if (/^(View|Track|Help|Buy again|Add to cart)/i.test(t)) return true
  if (/Common Questions|Get top deals|About Us|Help|Stores|Services|Footer/i.test(t))
    return true
  return false
}

export function cleanProductTitle(raw) {
  let t = String(raw || '').trim()
  t = t.replace(QTY_IN_TEXT_RE, '').trim()
  return t.replace(/\s+/g, ' ').trim()
}

export function parseQuantityFromText(rawText) {
  const fromText = String(rawText || '')
  const inTitle = fromText.match(QTY_IN_TEXT_RE)
  if (inTitle) return { quantity: Number(inTitle[1]), quantityRaw: inTitle[0].trim() }

  const badgeMatch = fromText.match(QTY_BADGE_RE)
  if (badgeMatch) {
    const qty = Number(badgeMatch[1] || badgeMatch[2])
    if (qty > 0 && qty <= 99) return { quantity: qty, quantityRaw: badgeMatch[0] }
  }
  return { quantity: 1, quantityRaw: undefined }
}

export function normalizeOrderStatus(raw) {
  const statusRaw = (raw || '').trim() || undefined
  if (!statusRaw) return { status: undefined, statusRaw: undefined }

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

  return { status, statusRaw }
}

export function toIsoDate(raw) {
  if (!raw) return undefined
  const t = Date.parse(String(raw))
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  const m = String(raw).match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})?$/i,
  )
  if (m) {
    const year = m[3] || new Date().getFullYear()
    const parsed = Date.parse(`${m[1]} ${m[2]}, ${year}`)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10)
  }
  return undefined
}

export function isInstoreOrderId(id) {
  return INSTORE_ORDER_ID_RE.test(String(id || ''))
}

/** Canonical in-store view value for new exports. */
export const SOURCE_VIEW_IN_STORE = 'in_store'
export const SOURCE_VIEW_ONLINE = 'online'

/** Accept legacy `instore` and canonical `in_store`. */
export function isInStoreSourceView(sourceView) {
  return sourceView === 'in_store' || sourceView === 'instore'
}

/** Normalize legacy harvest values to canonical enum. */
export function canonicalSourceView(sourceView) {
  if (sourceView === 'instore') return SOURCE_VIEW_IN_STORE
  if (sourceView === 'online') return SOURCE_VIEW_ONLINE
  return sourceView
}

export function mergeKeyFromOrder(order) {
  return order.detailUrl || order.orderId || null
}
