import { describe, expect, it } from 'vitest'
import {
  detectAggregateMirrors,
  isAggregateFeedAccount,
  type MirrorCandidateRow,
} from './aggregateMirror'

function row(p: Partial<MirrorCandidateRow> & { id: string }): MirrorCandidateRow {
  return {
    id: p.id,
    date: p.date ?? '2026-01-13',
    amount: p.amount ?? 12.31,
    account: p.account ?? 'CREDIT CARD',
    isExpense: p.isExpense ?? true,
    inSpending: p.inSpending ?? true,
    excluded: p.excluded ?? false,
    isAggregateFeed: p.isAggregateFeed ?? false,
  }
}

describe('detectAggregateMirrors', () => {
  it('flags an aggregate row that mirrors a real same-date same-amount charge', () => {
    const real = row({ id: 'real', account: 'CREDIT CARD' })
    const mirror = row({ id: 'mirror', account: 'Unknown', isAggregateFeed: true })
    const out = detectAggregateMirrors([real, mirror])
    expect(out).toHaveLength(1)
    expect(out[0].mirrorId).toBe('mirror')
    expect(out[0].keptTwinIds).toEqual(['real'])
  })

  it('never flags a real-account row, even when duplicated', () => {
    const a = row({ id: 'a' })
    const b = row({ id: 'b' })
    // Two real rows, no aggregate feed → not our concern (genuine dupes handled elsewhere).
    expect(detectAggregateMirrors([a, b])).toEqual([])
  })

  it('keeps an aggregate row that has no real twin', () => {
    const solo = row({ id: 'solo', account: 'Unknown', isAggregateFeed: true })
    expect(detectAggregateMirrors([solo])).toEqual([])
  })

  it('does not mirror across different dates or amounts', () => {
    const real = row({ id: 'real', date: '2026-01-13', amount: 12.31 })
    const otherDate = row({ id: 'm1', date: '2026-01-14', isAggregateFeed: true })
    const otherAmt = row({ id: 'm2', amount: 12.32, isAggregateFeed: true })
    expect(detectAggregateMirrors([real, otherDate, otherAmt])).toEqual([])
  })

  it('compares on absolute cents (float-safe) and ignores sign', () => {
    const real = row({ id: 'real', amount: 110.54 })
    const mirror = row({ id: 'mirror', amount: -110.54, isAggregateFeed: true })
    const out = detectAggregateMirrors([real, mirror])
    expect(out.map((m) => m.mirrorId)).toEqual(['mirror'])
  })

  it('excludes both aggregate copies when the feed doubled one real charge', () => {
    const real = row({ id: 'real', amount: 5 })
    const m1 = row({ id: 'm1', amount: 5, isAggregateFeed: true })
    const m2 = row({ id: 'm2', amount: 5, isAggregateFeed: true })
    const out = detectAggregateMirrors([real, m1, m2])
    expect(out.map((m) => m.mirrorId).sort()).toEqual(['m1', 'm2'])
    for (const m of out) expect(m.keptTwinIds).toEqual(['real'])
  })

  it('skips rows already excluded or not in spending', () => {
    const real = row({ id: 'real' })
    const alreadyExcluded = row({
      id: 'x',
      isAggregateFeed: true,
      excluded: true,
    })
    const notSpending = row({
      id: 'y',
      isAggregateFeed: true,
      inSpending: false,
    })
    expect(detectAggregateMirrors([real, alreadyExcluded, notSpending])).toEqual(
      [],
    )
  })

  it('ignores non-expense rows (income/transfer with equal amounts)', () => {
    const income = row({ id: 'inc', isExpense: false })
    const mirror = row({ id: 'mirror', isExpense: false, isAggregateFeed: true })
    expect(detectAggregateMirrors([income, mirror])).toEqual([])
  })
})

describe('isAggregateFeedAccount', () => {
  it('treats Unknown account and rocketmoney capture as aggregate feed', () => {
    expect(isAggregateFeedAccount('Unknown')).toBe(true)
    expect(isAggregateFeedAccount('CREDIT CARD', 'rocketmoney')).toBe(true)
    expect(isAggregateFeedAccount('CREDIT CARD')).toBe(false)
    expect(isAggregateFeedAccount(null)).toBe(false)
  })
})
