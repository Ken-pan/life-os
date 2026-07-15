import { describe, it, expect } from 'vitest'
import {
  accountNamesOf,
  categoriesOf,
  computeMeta,
  computeRecurring,
  computeStatistics,
  monthlySeries,
  dailySeries,
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

describe('dailySeries', () => {
  const days: Txn[] = [
    {
      id: 'd1', date: '2026-07-01', month: '2026-07', merchant: 'A',
      category: 'Groceries', account: 'Amex', flow: 'expense',
      amount: 30, budgetImpact: -30, inSpending: true, inCashFlow: true,
    },
    {
      id: 'd2', date: '2026-07-01', month: '2026-07', merchant: 'B',
      category: 'Dining & Drinks', account: 'Amex', flow: 'expense',
      amount: 12, budgetImpact: -12, inSpending: true, inCashFlow: true,
    },
    {
      id: 'd3', date: '2026-07-04', month: '2026-07', merchant: 'C',
      category: 'Shopping', account: 'Amex', flow: 'expense',
      amount: 50, budgetImpact: -50, inSpending: true, inCashFlow: true,
    },
  ]

  it('每天一个点，空白日补 0 而不是跳过', () => {
    const out = dailySeries(days, { from: '2026-07-01', to: '2026-07-05' })
    // 5 天全在，含没有交易的 07-02/03/05 —— 缺日会让 x 轴间距失真。
    expect(out.map((p) => p.month)).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ])
    expect(out.map((p) => p.spending)).toEqual([42, 0, 0, 50, 0])
  })

  it('同一天多笔累加', () => {
    const out = dailySeries(days, { from: '2026-07-01', to: '2026-07-01' })
    expect(out[0].spending).toBe(42)
    expect(out[0].count).toBe(2)
  })

  it('窗口外的交易不计入', () => {
    const out = dailySeries(days, { from: '2026-07-02', to: '2026-07-05' })
    expect(out.reduce((a, p) => a + p.spending, 0)).toBe(50)
  })

  it('资金搬运不计入——与分类图/商户榜同一口径', () => {
    const withMovement: Txn[] = [
      ...days,
      {
        id: 'atm', date: '2026-07-02', month: '2026-07', merchant: 'Withdrawal',
        category: 'Cash & Checks', account: 'Chase', flow: 'expense',
        amount: 300, budgetImpact: -300, inSpending: true, inCashFlow: true,
      },
    ]
    const out = dailySeries(withMovement, { from: '2026-07-01', to: '2026-07-05' })
    expect(out.find((p) => p.month === '2026-07-02')?.spending).toBe(0)
  })

  it('退款不冲抵花销——「哪天花了钱」问的是流出，不是净额', () => {
    const withRefund: Txn[] = [
      ...days,
      {
        id: 'ref', date: '2026-07-04', month: '2026-07', merchant: 'Store',
        category: 'Shopping', account: 'Amex', flow: 'refund_or_reversal',
        amount: -6645, budgetImpact: 6645, inSpending: true, inCashFlow: true,
      },
    ]
    const out = dailySeries(withRefund, { from: '2026-07-01', to: '2026-07-05' })
    const d4 = out.find((p) => p.month === '2026-07-04')
    // 当天确实花了 $50；退款不该把它冲成 -$6,595。
    expect(d4?.spending).toBe(50)
    // 也不该出现负值——负柱子画的不是花销。
    expect(out.every((p) => p.spending >= 0)).toBe(true)
  })

  it('工资/进账不计入花销', () => {
    const withIncome: Txn[] = [
      ...days,
      {
        id: 'pay', date: '2026-07-02', month: '2026-07', merchant: 'Ingram Micro',
        category: 'Software & Tech', account: 'Unknown', flow: 'income',
        amount: -3322.74, budgetImpact: 0, inSpending: false, inCashFlow: true,
      },
    ]
    const out = dailySeries(withIncome, { from: '2026-07-01', to: '2026-07-05' })
    expect(out.find((p) => p.month === '2026-07-02')?.spending).toBe(0)
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

  describe('hideMoneyMovement', () => {
    const movement: Txn[] = [
      {
        id: 'cc',
        date: '2026-05-20',
        month: '2026-05',
        merchant: 'Chase Credit Card',
        category: 'Credit Card Payment',
        account: 'Chase Checking',
        flow: 'credit_card_payment',
        amount: 800,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: true,
      },
      {
        id: 'tr',
        date: '2026-05-19',
        month: '2026-05',
        merchant: 'Transfer to Savings',
        category: 'Transfer',
        account: 'Chase Checking',
        flow: 'internal_transfer',
        amount: 500,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: true,
      },
      {
        id: 'mirror',
        date: '2026-05-18',
        month: '2026-05',
        merchant: 'Mirrored row',
        category: 'Shopping',
        account: 'Amex',
        flow: 'expense',
        amount: 40,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: false,
        excludeReason: 'aggregate-mirror-duplicate',
      },
      {
        id: 'pay',
        date: '2026-05-15',
        month: '2026-05',
        merchant: 'Employer',
        category: 'Income',
        account: 'Chase Checking',
        flow: 'income',
        amount: -5000,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: true,
      },
      {
        id: 'buy',
        date: '2026-05-14',
        month: '2026-05',
        merchant: 'Whole Foods',
        category: 'Groceries',
        account: 'Amex',
        flow: 'expense',
        amount: 60,
        budgetImpact: -60,
        inSpending: true,
        inCashFlow: true,
      },
    ]

    it('滤掉内部转账、信用卡还款与镜像重复', () => {
      const ids = searchTxns(movement, { hideMoneyMovement: true }).map((t) => t.id)
      expect(ids).not.toContain('cc')
      expect(ids).not.toContain('tr')
      expect(ids).not.toContain('mirror')
    })

    it('保留收入——收入的 inSpending 也是 false，但它不是资金搬运', () => {
      const ids = searchTxns(movement, { hideMoneyMovement: true }).map((t) => t.id)
      expect(ids).toContain('pay')
      expect(ids).toContain('buy')
      // 这正是不能直接用 spendingOnly 的原因。
      expect(searchTxns(movement, { spendingOnly: true }).map((t) => t.id)).not.toContain('pay')
    })

    it('取现算资金搬运：去向不明，且多用于信用卡还款（还款已另计）', () => {
      const withdrawal: Txn = {
        id: 'atm',
        date: '2026-05-13',
        month: '2026-05',
        merchant: 'Withdrawal 05/13',
        category: 'Cash & Checks',
        account: 'Chase Checking',
        flow: 'expense',
        amount: 2451,
        budgetImpact: -2451,
        // 聚合器把取现导入成 expense，所以 inSpending 是 true——
        // 正因如此，只看 inSpending 的分类图会让它霸榜。
        inSpending: true,
        inCashFlow: true,
      }
      const list = [withdrawal, ...movement]

      expect(searchTxns(list, { hideMoneyMovement: true }).map((t) => t.id)).not.toContain('atm')
      // 账本藏了、图表却还算它，会让同一个页面自相矛盾。
      expect(categoryBreakdown(list, {}).map((c) => c.category)).not.toContain('Cash & Checks')
      expect(topMerchants(list, {}).map((m) => m.merchant)).not.toContain('Withdrawal 05/13')
      expect(monthlySeries(list).find((m) => m.month === '2026-05')?.spending).toBe(60)
    })

    it('显式选中某个 flow 时不再隐藏该 flow', () => {
      const ids = searchTxns(movement, {
        hideMoneyMovement: true,
        flow: 'internal_transfer',
      }).map((t) => t.id)
      expect(ids).toEqual(['tr'])
    })
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
