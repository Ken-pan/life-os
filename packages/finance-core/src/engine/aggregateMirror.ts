// Cross-feed mirror detection.
//
// An account aggregator (e.g. Rocket Money) re-imports the same card charges the
// bank/card feeds already provide, but with normalized merchant names ("Amazon
// Purchase" instead of the card descriptor "AMAZON MKTPL*942YV4SB3"). The legacy
// exact-merchant-string mirror check misses these, so the aggregate copy is
// double-counted in spending AND gets matched to the same merchant order as the
// real charge.
//
// This detector is intentionally conservative: an aggregate-feed row is only a
// mirror when a same-date, same-amount, non-aggregate expense twin exists. Rows
// that the aggregate feed captured but that have no real-account twin are left
// untouched (they may be genuine purchases the card feed never surfaced).

/** One ledger row, reduced to the fields mirror detection needs. */
export interface MirrorCandidateRow {
  id: string
  /** ISO date `YYYY-MM-DD`. */
  date: string
  /** Signed amount; only the absolute value is compared. */
  amount: number
  account: string
  /** True for outgoing spend (flow === 'expense'). */
  isExpense: boolean
  /** True when the row currently counts toward spending analytics. */
  inSpending: boolean
  /** True when the row already carries an exclude_reason (already deduped). */
  excluded: boolean
  /**
   * True when the row originates from an account aggregator that shadows real
   * card/bank feeds (Rocket Money etc.). The caller owns this policy — typically
   * `account === 'Unknown' || captureSource === 'rocketmoney'`.
   */
  isAggregateFeed: boolean
}

export interface MirrorMatch {
  /** Aggregate-feed row that duplicates a real charge — should be excluded. */
  mirrorId: string
  /** The real-account row(s) it mirrors — kept as authoritative. */
  keptTwinIds: string[]
  date: string
  /** Absolute amount in cents. */
  amountCents: number
}

function amountCents(v: number): number {
  return Math.round(Math.abs(v) * 100)
}

/** Only active expense-spending rows participate in mirror grouping. */
function isActiveExpense(r: MirrorCandidateRow): boolean {
  return r.isExpense && r.inSpending && !r.excluded
}

/**
 * Find aggregate-feed rows that mirror a real-account charge (same date + amount).
 * Deterministic: results are ordered by date then amount then mirror id.
 */
export function detectAggregateMirrors(
  rows: readonly MirrorCandidateRow[],
): MirrorMatch[] {
  // Group active expense rows by date + absolute amount.
  const groups = new Map<string, MirrorCandidateRow[]>()
  for (const r of rows) {
    if (!r.id || !isActiveExpense(r)) continue
    const key = `${r.date}|${amountCents(r.amount)}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  const matches: MirrorMatch[] = []
  for (const bucket of groups.values()) {
    const realTwins = bucket.filter((r) => !r.isAggregateFeed)
    // No authoritative real-account row → nothing to mirror against; keep as-is.
    if (realTwins.length === 0) continue
    const keptTwinIds = realTwins.map((r) => r.id)
    for (const r of bucket) {
      if (!r.isAggregateFeed) continue
      matches.push({
        mirrorId: r.id,
        keptTwinIds,
        date: r.date,
        amountCents: amountCents(r.amount),
      })
    }
  }

  matches.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.amountCents - b.amountCents ||
      a.mirrorId.localeCompare(b.mirrorId),
  )
  return matches
}

/** Default aggregate-feed policy: Rocket Money / unlabeled aggregate account. */
export function isAggregateFeedAccount(
  account: string | null | undefined,
  captureSource?: string | null,
): boolean {
  return account === 'Unknown' || captureSource === 'rocketmoney'
}
