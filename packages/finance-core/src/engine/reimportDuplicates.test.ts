import { describe, expect, it } from 'vitest'
import {
  assignWriteRuns,
  detectReimportDuplicates,
  type ReimportCandidateRow,
} from './reimportDuplicates'

function row(
  partial: Partial<ReimportCandidateRow> & { id: string; createdAt: string },
): ReimportCandidateRow {
  return {
    date: '2026-07-01',
    amount: 38.76,
    merchant: 'Amazon Purchase',
    account: 'Unknown',
    isExpense: true,
    inSpending: true,
    excluded: false,
    ...partial,
  }
}

describe('assignWriteRuns', () => {
  it('keeps rows written milliseconds apart in one run', () => {
    // Real shape: an import inserts row-by-row, ~200-300ms apart.
    const rows = [
      row({ id: 'a', createdAt: '2026-07-04T18:42:40.157Z' }),
      row({ id: 'b', createdAt: '2026-07-04T18:42:40.421Z' }),
      row({ id: 'c', createdAt: '2026-07-04T18:42:40.701Z' }),
    ]
    const runs = assignWriteRuns(rows)
    expect([...new Set(runs.values())]).toEqual([0])
  })

  it('splits runs separated by minutes', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-07-04T18:42:40.157Z' }),
      row({ id: 'b', createdAt: '2026-07-04T18:57:04.806Z' }),
    ]
    const runs = assignWriteRuns(rows)
    expect(runs.get('a')).toBe(0)
    expect(runs.get('b')).toBe(1)
  })

  it('does not split a long run whose rows chain within the gap', () => {
    // First and last row are 4 minutes apart, but no single gap exceeds 60s —
    // one big import, not four runs.
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({
        id: `r${i}`,
        createdAt: new Date(Date.parse('2026-07-04T18:42:40Z') + i * 30_000).toISOString(),
      }),
    )
    const runs = assignWriteRuns(rows)
    expect([...new Set(runs.values())]).toEqual([0])
  })
})

describe('detectReimportDuplicates', () => {
  it('flags the same line written by a later run', () => {
    // The real regression: 2026-07-04 sync ran twice, 14 minutes apart.
    const first = row({ id: 'first', createdAt: '2026-07-04T18:42:41.311Z' })
    const second = row({ id: 'second', createdAt: '2026-07-04T18:57:06.063Z' })
    const out = detectReimportDuplicates([first, second])
    expect(out).toHaveLength(1)
    expect(out[0].duplicateId).toBe('second')
    expect(out[0].keptIds).toEqual(['first'])
    expect(out[0].gapMinutes).toBe(14)
  })

  it('keeps genuine same-day repeat charges captured by one run', () => {
    // Five $2.90 subway rides on one day, all from one bulk insert. Shape-only
    // dedup would destroy four real charges.
    const rides = Array.from({ length: 5 }, (_, i) =>
      row({
        id: `ride-${i}`,
        date: '2025-09-28',
        amount: 2.9,
        merchant: 'MTA*NYCT PAYGO',
        account: 'Apple Card',
        createdAt: '2026-05-31T02:11:41.162Z',
      }),
    )
    expect(detectReimportDuplicates(rides)).toEqual([])
  })

  it('trims a re-synced group down to the multiplicity one run saw', () => {
    const mk = (id: string, createdAt: string) =>
      row({
        id,
        date: '2025-09-28',
        amount: 2.9,
        merchant: 'MTA*NYCT PAYGO',
        account: 'Apple Card',
        createdAt,
      })
    // Run 1 saw 2 rides; run 2 re-wrote the same 2.
    const out = detectReimportDuplicates([
      mk('a1', '2026-05-31T02:11:41.100Z'),
      mk('a2', '2026-05-31T02:11:41.300Z'),
      mk('b1', '2026-05-31T03:00:00.100Z'),
      mk('b2', '2026-05-31T03:00:00.300Z'),
    ])
    expect(out.map((m) => m.duplicateId)).toEqual(['b1', 'b2'])
  })

  it('trusts the more complete run when an earlier one captured less', () => {
    // Run 1 scrolled less far and saw 1 of 2 real charges; run 2 saw both.
    // Truth is 2 — keep 2, drop the surplus, do not collapse to 1.
    const mk = (id: string, createdAt: string) =>
      row({ id, date: '2026-07-01', amount: 46.43, merchant: 'T&T Supermarket', createdAt })
    const out = detectReimportDuplicates([
      mk('run1-a', '2026-07-04T18:42:40.900Z'),
      mk('run2-a', '2026-07-04T18:57:05.500Z'),
      mk('run2-b', '2026-07-04T18:57:05.700Z'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].duplicateId).toBe('run2-b')
  })

  it('does not pair rows across different dates, amounts, merchants or accounts', () => {
    const base = row({ id: 'base', createdAt: '2026-07-04T18:42:40Z' })
    const otherDate = row({ id: 'd', date: '2026-07-02', createdAt: '2026-07-04T18:57:00Z' })
    const otherAmt = row({ id: 'm', amount: 38.77, createdAt: '2026-07-04T18:57:00Z' })
    const otherMerchant = row({ id: 'n', merchant: 'Target', createdAt: '2026-07-04T18:57:00Z' })
    const otherAccount = row({ id: 'x', account: 'Apple Card', createdAt: '2026-07-04T18:57:00Z' })
    const out = detectReimportDuplicates([base, otherDate, otherAmt, otherMerchant, otherAccount])
    expect(out).toEqual([])
  })

  it('matches merchants case- and whitespace-insensitively', () => {
    const a = row({ id: 'a', merchant: 'Amazon Purchase', createdAt: '2026-07-04T18:42:40Z' })
    const b = row({ id: 'b', merchant: '  amazon   purchase ', createdAt: '2026-07-04T18:57:00Z' })
    expect(detectReimportDuplicates([a, b])).toHaveLength(1)
  })

  it('ignores rows already excluded or out of spending, and income', () => {
    const keep = row({ id: 'keep', createdAt: '2026-07-04T18:42:40Z' })
    const alreadyExcluded = row({ id: 'e', createdAt: '2026-07-04T18:57:00Z', excluded: true })
    const notSpending = row({ id: 's', createdAt: '2026-07-04T18:58:00Z', inSpending: false })
    const income = row({ id: 'i', createdAt: '2026-07-04T18:59:00Z', isExpense: false })
    expect(detectReimportDuplicates([keep, alreadyExcluded, notSpending, income])).toEqual([])
  })

  it('compares on absolute amount', () => {
    const a = row({ id: 'a', amount: 38.76, createdAt: '2026-07-04T18:42:40Z' })
    const b = row({ id: 'b', amount: -38.76, createdAt: '2026-07-04T18:57:00Z' })
    expect(detectReimportDuplicates([a, b])).toHaveLength(1)
  })

  it('is deterministic', () => {
    const rows = [
      row({ id: 'z', createdAt: '2026-07-04T18:57:06Z' }),
      row({ id: 'a', createdAt: '2026-07-04T18:42:41Z' }),
      row({ id: 'm', date: '2026-07-02', createdAt: '2026-07-04T18:57:05Z' }),
      row({ id: 'b', date: '2026-07-02', createdAt: '2026-07-04T18:42:40Z' }),
    ]
    const once = detectReimportDuplicates(rows)
    const twice = detectReimportDuplicates([...rows].reverse())
    expect(once).toEqual(twice)
    // Ordered by date first: 'z' is 2026-07-01, 'm' is 2026-07-02.
    expect(once.map((m) => m.duplicateId)).toEqual(['z', 'm'])
  })

  it('leaves a clean ledger alone', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-07-04T18:42:40Z' }),
      row({ id: 'b', date: '2026-07-02', createdAt: '2026-07-04T18:42:41Z' }),
    ]
    expect(detectReimportDuplicates(rows)).toEqual([])
  })
})
