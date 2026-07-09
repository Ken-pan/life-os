/**
 * Pure Amazon order return/refund parsing helpers (testable, no DOM).
 * Browser adapter mirrors this logic for in-page extraction.
 */

export const ACTIVE_DELIVERY_STATUS_RE =
  /^(?:Arriving|Delivered|Shipped|Out for delivery|Estimated delivery|Payment|Pending|Purchased)/i

export const EXPLICIT_RETURN_STATUS_LABEL_RE =
  /^(?:Return complete|Refund issued|Refunded|Returned|Cancelled|Canceled)$/i

export const EXPLICIT_RETURN_EVIDENCE_RE =
  /(?:refund issued|refund credited|refund total|replacement sent|return complete|return received|\breturned\b|\brefunded\b|\bcancel(?:l)?ed\b)/i

export const EXPLICIT_REFUND_AMOUNT_RE =
  /Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i

export const GENERIC_RETURN_UI_RE =
  /return window closed|return or replace|eligible for return|start a return|view return\/refund status|buy it again/i

export const RETURN_PROGRESS_RE =
  /return initiated|drop off|return started|return in progress/i

export const PARSER_WARNING_SUPPRESSED =
  'amazon_return_info_suppressed_no_explicit_evidence'

export function parseMoney(value) {
  if (value == null || value === '') return null
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseMerchantDate(value) {
  if (!value) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}

/**
 * True only when text contains explicit return/refund/cancel completion evidence.
 * Generic eligibility UI ("Return or replace", "Return window closed") is NOT evidence.
 */
export function hasExplicitReturnEvidence(text, statusLabel) {
  const label = (statusLabel || '').trim()
  const blob = `${label} ${text || ''}`.trim()
  if (!blob) return false

  if (GENERIC_RETURN_UI_RE.test(blob) && !EXPLICIT_RETURN_EVIDENCE_RE.test(blob)) {
    return false
  }

  if (EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)) return true
  if (/^returned$/i.test(label)) return true
  if (EXPLICIT_REFUND_AMOUNT_RE.test(blob)) return true
  if (EXPLICIT_RETURN_EVIDENCE_RE.test(blob)) return true
  if (RETURN_PROGRESS_RE.test(blob)) return true

  return false
}

export function isActiveDeliveryStatus(status) {
  return ACTIVE_DELIVERY_STATUS_RE.test((status || '').trim())
}

/**
 * Parse Amazon returnInfo from status line + narrow evidence text only.
 * Never uses orderTotal as refundAmount without explicit Refund line.
 */
export function parseAmazonReturnInfo(
  status,
  {
    statusDate,
    orderTotal,
    evidenceText,
    returnPanelText,
  } = {},
) {
  const label = (status || '').trim()
  const evidence = [evidenceText, returnPanelText].filter(Boolean).join(' ').trim()
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
  } else if (RETURN_PROGRESS_RE.test(blob)) {
    returnStatus = 'return_in_progress'
  } else if (EXPLICIT_RETURN_EVIDENCE_RE.test(evidence)) {
    if (/refund issued|refund credited|refund total|\brefunded\b/i.test(evidence)) {
      returnStatus = 'refunded'
    } else if (/return complete|return received|\breturned\b|replacement sent/i.test(evidence)) {
      returnStatus = /refund/i.test(evidence) ? 'refunded' : 'returned'
    }
  }

  const refundLine = evidence.match(EXPLICIT_REFUND_AMOUNT_RE)
  if (!returnStatus && refundLine) returnStatus = 'refunded'

  if (!returnStatus) return { returnInfo: undefined, warnings }

  const explicitEvidence = hasExplicitReturnEvidence(evidence, label)
  if (!explicitEvidence) {
    warnings.push(PARSER_WARNING_SUPPRESSED)
    return { returnInfo: undefined, warnings }
  }

  if (isActiveDeliveryStatus(label) && !EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)) {
    const statusOnlyEvidence =
      EXPLICIT_RETURN_STATUS_LABEL_RE.test(label) ||
      EXPLICIT_REFUND_AMOUNT_RE.test(evidence) ||
      (EXPLICIT_RETURN_EVIDENCE_RE.test(evidence) && !GENERIC_RETURN_UI_RE.test(evidence))
    if (!statusOnlyEvidence) {
      warnings.push(PARSER_WARNING_SUPPRESSED)
      return { returnInfo: undefined, warnings }
    }
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
      eventDate: parseMerchantDate(statusDate),
      refundAmount,
    },
    warnings,
    returnEvidenceText: evidence || undefined,
  }
}

/**
 * Conservative re-parse for existing raw exports without preserved evidence text.
 * Keeps returnInfo only when status line itself is explicit return/refund/cancel.
 */
export function reparseReturnInfoFromStatusOnly(order) {
  const status = (order.status || '').trim()
  const warnings = []

  if (!status) {
    if (order.returnInfo) {
      warnings.push(PARSER_WARNING_SUPPRESSED)
      return { returnInfo: undefined, warnings }
    }
    return { returnInfo: undefined, warnings }
  }

  if (EXPLICIT_RETURN_STATUS_LABEL_RE.test(status) || /^returned$/i.test(status)) {
    const { returnInfo, warnings: w } = parseAmazonReturnInfo(status, {
      statusDate: order.statusDate,
      orderTotal: order.orderTotal,
      evidenceText: order.returnEvidenceText || status,
    })
    return { returnInfo, warnings: [...warnings, ...w] }
  }

  if (isActiveDeliveryStatus(status) && order.returnInfo) {
    warnings.push(PARSER_WARNING_SUPPRESSED)
    return { returnInfo: undefined, warnings }
  }

  if (order.returnInfo && !hasExplicitReturnEvidence(order.returnEvidenceText, status)) {
    warnings.push(PARSER_WARNING_SUPPRESSED)
    return { returnInfo: undefined, warnings }
  }

  return { returnInfo: order.returnInfo, warnings }
}

/**
 * Detect false-positive: delivery-like status + returnInfo without explicit evidence.
 */
export function isFalsePositiveReturnInfo(order) {
  const status = (order.status || '').trim()
  const ri = order.returnInfo?.status
  if (!ri) return false
  const active = isActiveDeliveryStatus(status) || /deliver|arriv|ship|purchas/i.test(status)
  if (!active) return false
  return !hasExplicitReturnEvidence(order.returnEvidenceText || '', status)
}

/**
 * Explicit merge decision for Amazon returnInfo.
 * - present: explicit return/refund/cancel evidence
 * - absent_verified: active delivery/purchase status with no return evidence
 * - unknown: ambiguous or missing status
 */
export function deriveAmazonReturnInfoDecision(order) {
  const preset = order?.returnInfoDecision
  if (
    preset === 'present' ||
    preset === 'absent_verified' ||
    preset === 'unknown'
  ) {
    return preset
  }

  const status = (order?.status || '').trim()
  const evidence = order?.returnEvidenceText || ''

  if (order?.returnInfo) return 'present'

  if (
    EXPLICIT_RETURN_STATUS_LABEL_RE.test(status) ||
    /^returned$/i.test(status) ||
    RETURN_PROGRESS_RE.test(`${status} ${evidence}`)
  ) {
    return 'present'
  }

  if (hasExplicitReturnEvidence(evidence, status)) {
    return 'present'
  }

  if (
    isActiveDeliveryStatus(status) ||
    /^(?:deliver|arriv|ship|purchas)/i.test(status)
  ) {
    return 'absent_verified'
  }

  if (!status) return 'unknown'

  return 'unknown'
}
