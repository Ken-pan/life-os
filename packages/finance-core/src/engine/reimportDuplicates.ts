// Re-import duplicate detection.
//
// A sync/import run that overlaps an earlier one re-writes ledger rows the earlier
// run already wrote. Unlike aggregateMirror (which finds an aggregator's copy of a
// *different* feed's charge), these duplicates sit in the SAME account with the same
// date, amount and merchant — they are the same statement line written twice.
//
// The hard part is that same-date + same-amount + same-merchant is NOT by itself a
// duplicate: five $2.90 subway rides in one day are five real charges, and the card
// statement really does list them five times. Deleting on shape alone destroys real
// spending.
//
// The discriminator is WHEN each row was written. Rows written by one run are what
// that run saw on the statement; a run is authoritative about multiplicity. So:
//
//   true multiplicity of a group = the most rows any single run contributed
//
// Five rides captured by one run → that run says 5 → keep 5. The same line captured
// by two runs → each run says 1 → keep 1, the second is a duplicate. This also
// survives partial captures: if an early run scrolled less far and saw 1 while a
// later run saw 2, the answer is 2, not 1.

/** One ledger row, reduced to the fields duplicate detection needs. */
export interface ReimportCandidateRow {
  id: string
  /** ISO date `YYYY-MM-DD`. */
  date: string
  /** Signed amount; only the absolute value is compared. */
  amount: number
  merchant: string
  account: string
  /** ISO timestamp of when this row was written to the ledger. */
  createdAt: string
  /** True for outgoing spend (flow === 'expense'). */
  isExpense: boolean
  /** True when the row currently counts toward spending analytics. */
  inSpending: boolean
  /** True when the row already carries an exclude_reason (already deduped). */
  excluded: boolean
}

export interface ReimportDuplicateMatch {
  /** Row that duplicates an earlier write of the same statement line. */
  duplicateId: string
  /** The earlier row(s) it duplicates — kept as authoritative. */
  keptIds: string[]
  date: string
  /** Absolute amount in cents. */
  amountCents: number
  merchant: string
  account: string
  /** Minutes between the earliest write in the group and this duplicate's write. */
  gapMinutes: number
}

/**
 * Writes more than this far apart belong to different runs.
 *
 * Rows inside one run land row-by-row, milliseconds apart (each its own INSERT);
 * separate runs are minutes apart. 60s sits far above the former and far below the
 * latter, so it is not a tuning knob in practice.
 */
export const DEFAULT_RUN_GAP_MS = 60_000

function amountCents(v: number): number {
  return Math.round(Math.abs(v) * 100)
}

function normalizeMerchant(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Only active expense-spending rows participate in duplicate grouping. */
function isActiveExpense(r: ReimportCandidateRow): boolean {
  return r.isExpense && r.inSpending && !r.excluded
}

function groupKey(r: ReimportCandidateRow): string {
  return `${r.date}|${amountCents(r.amount)}|${normalizeMerchant(r.merchant)}|${r.account}`
}

/**
 * Cluster rows into write runs by created_at gaps.
 *
 * Clustering is global rather than per-group on purpose: a run is a real event (one
 * sync / one import), and a big import's first and last row can be minutes apart
 * even though they are the same run. Judging gaps only within a group would split
 * such a run in two and invent duplicates.
 *
 * @returns row id → run index (0-based, ordered by time)
 */
export function assignWriteRuns(
  rows: readonly ReimportCandidateRow[],
  runGapMs: number = DEFAULT_RUN_GAP_MS,
): Map<string, number> {
  const sorted = [...rows]
    .filter((r) => r.id && r.createdAt)
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    )

  const runs = new Map<string, number>()
  let runIndex = 0
  let prev: number | null = null
  for (const r of sorted) {
    const ts = Date.parse(r.createdAt)
    if (prev !== null && ts - prev > runGapMs) runIndex++
    runs.set(r.id, runIndex)
    prev = ts
  }
  return runs
}

/**
 * Find rows that duplicate an earlier run's write of the same statement line.
 *
 * Conservative by construction: a group is only trimmed down to the multiplicity
 * some single run actually observed, so genuine same-day repeat charges survive.
 * Deterministic: results are ordered by date, then amount, then duplicate id.
 */
export function detectReimportDuplicates(
  rows: readonly ReimportCandidateRow[],
  runGapMs: number = DEFAULT_RUN_GAP_MS,
): ReimportDuplicateMatch[] {
  const active = rows.filter((r) => r.id && r.createdAt && isActiveExpense(r))
  const runs = assignWriteRuns(active, runGapMs)

  const groups = new Map<string, ReimportCandidateRow[]>()
  for (const r of active) {
    const key = groupKey(r)
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  const matches: ReimportDuplicateMatch[] = []
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue

    // How many rows did each run contribute to this group?
    const perRun = new Map<number, number>()
    for (const r of bucket) {
      const run = runs.get(r.id) ?? 0
      perRun.set(run, (perRun.get(run) ?? 0) + 1)
    }
    // A single run is authoritative about how many times the line really occurs.
    const keepCount = Math.max(...perRun.values())
    if (bucket.length <= keepCount) continue

    const sorted = [...bucket].sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    const kept = sorted.slice(0, keepCount)
    const keptIds = kept.map((r) => r.id)
    const firstWrite = Date.parse(sorted[0].createdAt)

    for (const r of sorted.slice(keepCount)) {
      matches.push({
        duplicateId: r.id,
        keptIds,
        date: r.date,
        amountCents: amountCents(r.amount),
        merchant: r.merchant,
        account: r.account,
        gapMinutes: Math.round((Date.parse(r.createdAt) - firstWrite) / 60_000),
      })
    }
  }

  matches.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.amountCents - b.amountCents ||
      a.duplicateId.localeCompare(b.duplicateId),
  )
  return matches
}
