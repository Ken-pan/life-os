import { describe, it, expect } from 'vitest'
import {
  accountNamesOf,
  categoriesOf,
  computeMeta,
  computeRecurring,
  computeStatistics,
  monthlySeries,
  categoryBreakdown,
  topMerchants,
  spendingSummary,
  searchTxns,
  type Txn,
} from './transactions'

const sample: Txn[] = [
  {
    id: '1',
    date: '2026-05-30',
    month: '2026-05',
    merchant: 'Whole Foods',
    category: 'Groceries',
    account: 'Chase Checking',
    flow: 'expense',
    amount: 120,
    budgetImpact: -120,
    inSpending: true,
    inCashFlow: true,
  },
  {
    id: '2',
    date: '2026-05-29',
    month: '2026-05',
    merchant: 'Employer Payroll',
    category: 'Income',
    account: 'Chase Checking',
    flow: 'income',
    amount: -3500,
    budgetImpact: 0,
    inSpending: false,
    inCashFlow: true,
  },
  {
    id: '3',
    date: '2026-04-12',
    month: '2026-04',
    merchant: 'Landlord',
    category: 'Housing > Rent',
    account: 'Chase Checking',
    flow: 'expense',
    amount: 2200,
    budgetImpact: -2200,
    inSpending: true,
    inCashFlow: true,
  },
  {
    id: '4',
    date: '2026-04-20',
    month: '2026-04',
    merchant: 'Lyft',
    category: 'Auto & Transport',
    account: 'Chase Credit',
    flow: 'expense',
    amount: 30,
    budgetImpact: -30,
    inSpending: true,
    inCashFlow: true,
  },
  {
    id: '5',
    date: '2026-04-21',
    month: '2026-04',
    merchant: 'Lyft',
    category: 'Auto & Transport',
    account: 'Chase Credit',
    flow: 'expense',
    amount: 25,
    budgetImpact: -25,
    inSpending: true,
    inCashFlow: true,
  },
  {
    id: '6',
    date: '2026-05-05',
    month: '2026-05',
    merchant: 'Card Payment',
    category: 'Transfers > Credit card payment',
    account: 'Chase Checking',
    flow: 'credit_card_payment',
    amount: 800,
    budgetImpact: 0,
    inSpending: false,
    inCashFlow: true,
    excludeReason: 'credit card payment',
  },
]

describe('月度聚合', () => {
  const series = monthlySeries(sample)

  it('月份升序', () => {
    expect(series[0].month).toBe('2026-04')
    expect(series[series.length - 1].month).toBe('2026-05')
  })

  it('月度收入/花销/净额计算正确', () => {
    const may = series.find((p) => p.month === '2026-05')
    expect(may).toBeTruthy()
    expect(may?.income).toBe(3500)
    expect(may?.spending).toBe(120)
    expect(may?.net).toBe(3380)
  })

  it('净额 = 收入 - 花销', () => {
    for (const p of series) {
      expect(p.net).toBeCloseTo(p.income - p.spending, 1)
    }
  })
})

describe('类别构成', () => {
  it('时间窗内可正确聚合类别', () => {
    const slices = categoryBreakdown(sample, {
      from: '2026-04-01',
      to: '2026-04-30',
    })
    const rent = slices.find((s) => s.category === 'Housing > Rent')
    expect(rent?.amount).toBe(2200)
  })

  it('占比之和约为 1', () => {
    const slices = categoryBreakdown(sample)
    const sum = slices.reduce((a, s) => a + s.pct, 0)
    expect(sum).toBeCloseTo(1, 2)
  })
})

describe('商户与汇总', () => {
  it('top 商户按金额降序且为正', () => {
    const m = topMerchants(sample, { limit: 10 })
    expect(m.length).toBeGreaterThan(0)
    for (let i = 1; i < m.length; i++) {
      expect(m[i - 1].amount >= m[i].amount).toBe(true)
    }
    expect(m[0].amount).toBeGreaterThan(0)
  })

  it('近 12 月花销基线为正且合理', () => {
    const s = spendingSummary(monthlySeries(sample))
    expect(s.avgMonthlySpending).toBeGreaterThan(0)
    expect(s.monthsCounted).toBeGreaterThan(0)
    expect(s.monthsCounted).toBeLessThanOrEqual(12)
  })
})

describe('流水检索', () => {
  it('按商户关键字过滤', () => {
    const res = searchTxns(sample, { search: 'lyft' })
    expect(res.length).toBeGreaterThan(0)
    expect(res.every((t) => t.merchant.toLowerCase().includes('lyft'))).toBe(
      true,
    )
  })

  it('spendingOnly 仅返回计入花销的行', () => {
    const res = searchTxns(sample, { spendingOnly: true })
    expect(res.every((t) => t.inSpending)).toBe(true)
  })

  it('按 purchaseEnrichment 商品标题检索（Best Buy / Target）', () => {
    const enriched: Txn = {
      id: 'bb',
      date: '2026-04-15',
      month: '2026-04',
      merchant: 'Best Buy',
      category: 'Shopping',
      account: 'Card',
      flow: 'expense',
      amount: 159.24,
      budgetImpact: -159.24,
      inSpending: true,
      inCashFlow: true,
      purchaseEnrichment: {
        source: 'bestbuy',
        orderId: '470-70-6673-041526',
        lineItems: [{ title: 'Logitech MX Master 4' }],
      },
    }
    const targetTxn: Txn = {
      ...enriched,
      id: 'tg',
      merchant: 'Target',
      purchaseEnrichment: {
        source: 'target',
        orderId: '912002853391034',
        lineItems: [{ title: 'Fabric Decorative Storage Bin' }],
      },
    }
    const list = [enriched, targetTxn]
    expect(searchTxns(list, { search: 'mx master' })).toHaveLength(1)
    expect(searchTxns(list, { search: '912002853391034' })).toHaveLength(1)
    expect(searchTxns(list, { search: 'decorative storage' })).toHaveLength(1)
  })
})

describe('元信息与统计', () => {
  it('可从流水推导 meta', () => {
    const meta = computeMeta(sample)
    expect(meta.rowCount).toBe(sample.length)
    expect(meta.dateRange.start).toBe('2026-04-12')
    expect(meta.dateRange.end).toBe('2026-05-30')
  })

  it('可从流水推导统计', () => {
    const stats = computeStatistics(sample)
    expect(stats.totalRows).toBe(sample.length)
    expect(stats.incomeRows).toBe(1)
    expect(stats.creditCardPaymentRows).toBe(1)
  })

  it('可推导周期性商户、类别与账户列表', () => {
    const recurring = computeRecurring(sample, { minMonths: 1 })
    expect(recurring.some((r) => r.merchant === 'Lyft')).toBe(true)
    expect(categoriesOf(sample)).toContain('Groceries')
    expect(accountNamesOf(sample)).toContain('Chase Checking')
  })
})
