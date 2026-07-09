// Shared helpers ported from ReviewView.tsx.

/** @typedef {'all' | 'high' | 'duplicates' | 'transfer' | 'uncategorized' | 'recurring' | 'resolved'} ReviewFilterId */

/** @type {readonly ReviewFilterId[]} */
export const REVIEW_FILTER_IDS = [
  'all',
  'high',
  'duplicates',
  'transfer',
  'uncategorized',
  'recurring',
  'resolved',
]

/** @param {(key: string, params?: Record<string, unknown>) => string} tl */
export function reviewFilters(tl) {
  return [
    { id: /** @type {ReviewFilterId} */ ('all'), label: tl('review.filterAll') },
    { id: /** @type {ReviewFilterId} */ ('high'), label: tl('review.filterHigh') },
    { id: /** @type {ReviewFilterId} */ ('duplicates'), label: tl('review.filterDuplicates') },
    { id: /** @type {ReviewFilterId} */ ('transfer'), label: tl('review.filterTransfer') },
    { id: /** @type {ReviewFilterId} */ ('uncategorized'), label: tl('review.filterUncategorized') },
    { id: /** @type {ReviewFilterId} */ ('recurring'), label: tl('review.filterRecurring') },
    { id: /** @type {ReviewFilterId} */ ('resolved'), label: tl('review.filterResolved') },
  ]
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tl */
export function proposedActionLabels(tl) {
  return {
    increase: tl('review.actionIncrease'),
    decrease: tl('review.actionDecrease'),
    keep: tl('review.actionKeep'),
  }
}

/** @param {import('@life-os/finance-core/engine/realityLoop').NormalizedTransactionDraft[]} drafts */
export function flattenReviewItems(drafts) {
  /** @type {import('$lib/repo.js').ImportFinalizePayload['reviewItems']} */
  const rows = []
  for (const row of drafts) {
    for (const flag of row.reviewFlags) {
      rows.push({
        transaction_fingerprint: row.transactionFingerprint,
        review_type: flag.type,
        severity: flag.severity,
        reason: flag.reason,
        suggested_action: flag.suggestedAction,
        status: 'open',
      })
    }
  }
  return rows
}

/**
 * @param {import('@life-os/finance-core/engine/realityLoop').NormalizedTransactionDraft[]} drafts
 * @param {...import('@life-os/finance-core/engine/realityLoop').ReviewType} types
 */
export function pickByFlag(drafts, ...types) {
  return drafts
    .filter((r) => r.reviewFlags.some((f) => types.includes(f.type)))
    .slice(0, 8)
}

/**
 * @param {import('@life-os/finance-core/engine/realityLoop').NormalizedTransactionDraft[]} drafts
 * @param {(key: string, params?: Record<string, unknown>) => string} tl
 */
export function buildImpactLines(drafts, tl) {
  /** @param {import('@life-os/finance-core/engine/realityLoop').ReviewType} type */
  const flagCount = (type) =>
    drafts.filter((r) => r.reviewFlags.some((f) => f.type === type)).length
  return [
    tl('review.impactMirror', { count: flagCount('mirror_duplicate_candidate') }),
    tl('review.impactSameFileDup', { count: flagCount('same_account_duplicate_candidate') }),
    tl('review.impactTransfer', { count: flagCount('likely_transfer') }),
    tl('review.impactCcPayment', { count: flagCount('likely_credit_card_payment') }),
    tl('review.impactUncategorized', { count: flagCount('large_uncategorized') }),
  ]
}

/**
 * @param {import('$lib/repo.js').ReviewItemRecord} item
 * @param {ReviewFilterId} filter
 */
export function matchReviewFilter(item, filter) {
  if (filter === 'all') return item.status === 'open'
  if (filter === 'resolved') return item.status !== 'open'
  if (filter === 'high') return item.severity === 'high'
  if (filter === 'duplicates') {
    return item.reviewType.includes('duplicate') || item.reviewType.includes('reimport')
  }
  if (filter === 'transfer') {
    return item.reviewType.includes('transfer') || item.reviewType.includes('credit_card_payment')
  }
  if (filter === 'uncategorized') return item.reviewType.includes('uncategorized')
  if (filter === 'recurring') return item.reviewType.includes('recurring')
  return true
}

/** @param {string} v */
export function showDelimiter(v) {
  if (v === '\t') return 'TAB'
  return v
}

/** @param {string} v @param {number} len */
export function truncate(v, len) {
  return v.length > len ? `${v.slice(0, len - 1)}…` : v
}

/** @param {string} name */
export function maskFileName(name) {
  const idx = name.lastIndexOf('.')
  const base = idx >= 0 ? name.slice(0, idx) : name
  const ext = idx >= 0 ? name.slice(idx) : ''
  const visible = base.slice(0, 3)
  return `${visible}${'*'.repeat(Math.max(0, base.length - 3))}${ext}`
}

/** @param {string} input */
export function hashSimple(input) {
  let out = 0
  for (let i = 0; i < input.length; i += 1) {
    out = (out * 31 + input.charCodeAt(i)) >>> 0
  }
  return out.toString(16)
}
