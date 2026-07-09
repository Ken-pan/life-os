import { describe, expect, it } from 'vitest'
import type { Account, CashFlowItem } from './types.js'
import type { Txn } from './engine/transactions.js'
import {
  accountRowUnchangedInApp,
  buildAppSnapshot,
  computeEnvelopePayloadHashSync,
  filterNewCaptureTxnRows,
  flowForCaptureRow,
  holdingsCaptureToSnapshot,
  dedupeCapturedPositions,
  isCaptureEnvelope,
  nameMatches,
  newTxnToExtensionSyncPayload,
  sanitizeExtensionSyncTxnPayload,
  planAccountsBalanceUpdate,
  planHoldingsBalanceUpdate,
  planNewTransactions,
  planRecurringUpdates,
  recurringRowAlreadyInApp,
  resolveTxnScrollStopBefore,
  type CaptureEnvelope,
  type CapturedTxnRow,
  type TransactionsCaptureData,
} from './extension-sync.js'

const accounts: Account[] = [
  {
    id: 'acct-robinhood-6853',
    name: 'Robinhood individual',
    type: 'brokerage',
    balance: 130000,
  },
  { id: 'acct-chk', name: 'BofA Checking', type: 'checking', balance: 200 },
  { id: 'acct-sav', name: 'Marcus Savings', type: 'savings', balance: 4000 },
  {
    id: 'acct-cc',
    name: 'BofA Credit Card',
    type: 'credit-card',
    balance: 6800,
  },
]

function holdingsEnvelope(
  overrides: Partial<CaptureEnvelope> = {},
): CaptureEnvelope {
  return {
    v: 1,
    id: 'robinhood_holdings_test',
    source: 'robinhood',
    kind: 'holdings',
    capturedAt: '2026-07-02T20:00:00Z',
    asOfDate: '2026-07-02',
    asOfTimeLocal: '13:00',
    timezone: 'America/Los_Angeles',
    data: {
      institution: 'Robinhood',
      accountLabel: 'Robinhood individual',
      totalValue: 125032.6,
      positions: [
        { ticker: 'GOOGL', shares: 65.55, price: 358.68, todayPct: -0.7 },
        { ticker: 'VOO', shares: 31.6, price: 700.12 },
      ],
    },
    ...overrides,
  }
}

describe('holdingsCaptureToSnapshot', () => {
  it('生成稳定 id 的快照并绑定 Robinhood 券商账户', () => {
    const { snapshot } = holdingsCaptureToSnapshot(holdingsEnvelope(), accounts)
    expect(snapshot.id).toBe('hs_ext_robinhood_2026-07-02')
    expect(snapshot.accountId).toBe('acct-robinhood-6853')
    expect(snapshot.positionCount).toBe(2)
    expect(snapshot.etfCount).toBe(1)
    const googl = snapshot.positions.find((p) => p.ticker === 'GOOGL')!
    expect(googl.marketValue).toBeCloseTo(65.55 * 358.68, 1)
    expect(googl.todayReturnPct).toBe(-0.7)
    expect(googl.todayReturnAmount).toBeCloseTo(-165.74, 1)
    // 扩展详情字段透传
    const rich = holdingsCaptureToSnapshot(
      holdingsEnvelope({
        data: {
          institution: 'Robinhood',
          accountLabel: 'Robinhood individual',
          positions: [
            {
              ticker: 'GOOGL',
              shares: 65.54627,
              price: 359.07,
              todayPct: -0.59,
              todayReturnAmount: -140.13,
              averageCostPerShare: 178.23,
              totalReturnAmount: 11853.84,
              marketValue: 23535.84,
            },
          ],
        },
      }),
      accounts,
    ).snapshot.positions[0]
    expect(rich.averageCostPerShare).toBe(178.23)
    expect(rich.totalReturnAmount).toBe(11853.84)
    expect(rich.todayReturnAmount).toBe(-140.13)
    // 同源同日再次抓取 → 相同 id（覆盖而非堆积）
    const again = holdingsCaptureToSnapshot(
      holdingsEnvelope({ id: 'other' }),
      accounts,
    )
    expect(again.snapshot.id).toBe(snapshot.id)
  })
})

describe('dedupeCapturedPositions', () => {
  it('合并重复 ticker', () => {
    const merged = dedupeCapturedPositions([
      { ticker: 'TSLA', shares: 10, price: 400, todayPct: 1 },
      { ticker: 'TSLA', shares: 10, price: 400, averageCostPerShare: 220 },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].averageCostPerShare).toBe(220)
  })
})

describe('planHoldingsBalanceUpdate', () => {
  it('用页面总值更新唯一匹配的券商账户', () => {
    const plan = planHoldingsBalanceUpdate(holdingsEnvelope(), accounts)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].id).toBe('acct-robinhood-6853')
    expect(plan.updates[0].balance).toBe(125032.6)
  })

  it('balanceManual 锁定的账户跳过', () => {
    const locked = accounts.map((a) =>
      a.id === 'acct-robinhood-6853' ? { ...a, balanceManual: true } : a,
    )
    const plan = planHoldingsBalanceUpdate(holdingsEnvelope(), locked)
    expect(plan.updates).toHaveLength(0)
    expect(plan.notes.join()).toContain('balanceManual')
  })

  it('余额差异小于阈值时不更新', () => {
    const near = accounts.map((a) =>
      a.id === 'acct-robinhood-6853' ? { ...a, balance: 125032.4 } : a,
    )
    const plan = planHoldingsBalanceUpdate(holdingsEnvelope(), near)
    expect(plan.updates).toHaveLength(0)
  })

  it('Fidelity 的 holdings totalValue 是多账户聚合值，不写任何账户', () => {
    const withFidBrokerage: Account[] = [
      ...accounts,
      {
        id: 'acct-fid-brk',
        name: 'Fidelity Brokerage',
        type: 'brokerage',
        balance: 100,
      },
    ]
    const env = holdingsEnvelope({
      source: 'fidelity',
      data: {
        institution: 'Fidelity',
        accountLabel: 'Fidelity portfolio',
        totalValue: 59466.58, // 401k + HSA 聚合
        positions: [{ ticker: 'FXAIX', shares: 10, price: 100 }],
      },
    })
    expect(
      planHoldingsBalanceUpdate(env, withFidBrokerage).updates,
    ).toHaveLength(0)
  })

  it('账户在抓取之后更新过（时序保护）则跳过，且写入时 updatedAt 记抓取时刻', () => {
    // capture 于 7/2 20:00Z；账户 7/3 手动更新过 → 旧数据不倒灌
    const newer = accounts.map((a) =>
      a.id === 'acct-robinhood-6853'
        ? { ...a, updatedAt: '2026-07-03T00:00:00Z' }
        : a,
    )
    const blocked = planHoldingsBalanceUpdate(holdingsEnvelope(), newer)
    expect(blocked.updates).toHaveLength(0)
    expect(blocked.notes.join()).toContain('之后已更新过')
    // 账户更旧 → 正常写入，updatedAt = capturedAt
    const older = accounts.map((a) =>
      a.id === 'acct-robinhood-6853'
        ? { ...a, updatedAt: '2026-07-01T00:00:00Z' }
        : a,
    )
    const applied = planHoldingsBalanceUpdate(holdingsEnvelope(), older)
    expect(applied.updates).toHaveLength(1)
    expect(applied.updates[0].updatedAt).toBe('2026-07-02T20:00:00Z')
  })
})

describe('planAccountsBalanceUpdate', () => {
  const env: CaptureEnvelope = {
    v: 1,
    id: 'rm_accounts_test',
    source: 'rocketmoney',
    kind: 'accounts',
    capturedAt: '2026-07-02T20:00:00Z',
    asOfDate: '2026-07-02',
    data: {
      accounts: [
        { name: 'Checking', balance: 125, kindHint: 'checking' },
        { name: 'Savings', balance: 4467, kindHint: 'savings' },
        { name: 'Card Balance', balance: 7229, kindHint: 'credit' },
        { name: 'Investments', balance: 185334, kindHint: 'investment' },
      ],
    },
  }

  it('按类型唯一匹配更新 checking/savings/credit，Investments 无法唯一匹配则跳过', () => {
    const plan = planAccountsBalanceUpdate(env, accounts)
    const ids = plan.updates.map((a) => a.id).sort()
    expect(ids).toEqual(['acct-cc', 'acct-chk', 'acct-sav'])
    const cc = plan.updates.find((a) => a.id === 'acct-cc')!
    expect(cc.balance).toBe(7229) // 负债存正欠款
  })

  it('Net Worth 近似值（3 位有效数字）在舍入误差内不更新，超出才更新', () => {
    const mk = (balance: number, approximate: boolean): CaptureEnvelope => ({
      ...env,
      data: {
        accounts: [
          {
            name: 'Robinhood individual',
            balance,
            approximate,
            institution: 'Robinhood',
          },
        ],
      },
    })
    // 精确值 130000，页面显示 $130k：落在近似容差内，不动
    expect(
      planAccountsBalanceUpdate(mk(130000, true), accounts).updates,
    ).toHaveLength(0)
    // 差 400（> 0.6%*130500 无，0.6%*129600=778 → 400 在容差内）
    expect(
      planAccountsBalanceUpdate(mk(129600, true), accounts).updates,
    ).toHaveLength(0)
    // 差 5000：明显变化，更新
    const plan = planAccountsBalanceUpdate(mk(125000, true), accounts)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].balance).toBe(125000)
    // 同样差 400 若是精确值则更新
    expect(
      planAccountsBalanceUpdate(mk(129600, false), accounts).updates,
    ).toHaveLength(1)
  })

  it('名称多重命中时用机构名收窄（Robinhood Savings vs Chase Savings）', () => {
    const twoSavings: Account[] = [
      {
        id: 'sav-chase',
        name: 'CHASE SAVINGS',
        type: 'savings',
        balance: 4380,
      },
      {
        id: 'sav-rh',
        name: 'Robinhood Savings',
        type: 'savings',
        balance: 100,
      },
    ]
    const envNw: CaptureEnvelope = {
      ...env,
      data: {
        accounts: [
          {
            name: 'Savings',
            balance: 0.77,
            kindHint: 'savings',
            institution: 'Robinhood',
          },
        ],
      },
    }
    const plan = planAccountsBalanceUpdate(envNw, twoSavings)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].id).toBe('sav-rh')
    expect(plan.updates[0].balance).toBe(0.77)
  })

  it('401(k) 长名与信用卡产品名可用 token 匹配多张同类型账户', () => {
    const many: Account[] = [
      {
        id: 'acct-401k',
        name: 'Ingram Micro 401k',
        type: 'retirement',
        balance: 57000,
      },
      {
        id: 'acct-hsa',
        name: 'Health Savings Account (Fidelity 1152)',
        type: 'hsa',
        balance: 1800,
      },
      {
        id: 'cc-prime',
        name: 'Chase Prime Visa',
        type: 'credit-card',
        balance: 1200,
      },
      {
        id: 'cc-ur',
        name: 'Chase Ultimate Rewards',
        type: 'credit-card',
        balance: 800,
      },
      {
        id: 'cc-target',
        name: 'Target Circle Card',
        type: 'credit-card',
        balance: 300,
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `cc-other-${i}`,
        name: `Other Card ${i}`,
        type: 'credit-card' as const,
        balance: 100 + i,
      })),
    ]
    const envRm: CaptureEnvelope = {
      ...env,
      data: {
        accounts: [
          {
            name: 'INGRAM MICRO 401(K) INVESTMENT SAVINGS PLAN',
            balance: 57572.08,
            institution: 'Fidelity',
          },
          {
            name: 'Health Savings Account',
            balance: 1890,
            kindHint: 'hsa',
            institution: 'Fidelity',
          },
          {
            name: 'Prime Visa',
            balance: 2100,
            kindHint: 'credit',
            institution: 'Chase',
          },
          {
            name: 'Ultimate Rewards®',
            balance: 950,
            kindHint: 'credit',
            institution: 'Chase',
          },
          {
            name: 'Target Circle Card',
            balance: 410,
            kindHint: 'credit',
            institution: 'Target',
          },
        ],
      },
    }
    const plan = planAccountsBalanceUpdate(envRm, many)
    const byId = Object.fromEntries(plan.updates.map((a) => [a.id, a.balance]))
    expect(byId['acct-401k']).toBe(57572.08)
    expect(byId['acct-hsa']).toBe(1890)
    expect(byId['cc-prime']).toBe(2100)
    expect(byId['cc-ur']).toBe(950)
    expect(byId['cc-target']).toBe(410)
  })

  it('Fidelity 账户列表：retirement/hsa kindHint 唯一匹配', () => {
    const fidAccounts: Account[] = [
      ...accounts,
      {
        id: 'acct-401k',
        name: 'Ingram Micro 401k',
        type: 'retirement',
        balance: 57000,
      },
      { id: 'acct-hsa', name: 'Fidelity HSA', type: 'hsa', balance: 1800 },
    ]
    const envFid: CaptureEnvelope = {
      ...env,
      source: 'fidelity',
      data: {
        accounts: [
          {
            name: 'IM 401K SAVINGS PLAN',
            balance: 57572.08,
            kindHint: 'retirement',
            institution: 'Fidelity',
          },
          {
            name: 'Health Savings Account',
            balance: 1894.5,
            kindHint: 'hsa',
            institution: 'Fidelity',
          },
        ],
      },
    }
    const plan = planAccountsBalanceUpdate(envFid, fidAccounts)
    const byId = Object.fromEntries(plan.updates.map((a) => [a.id, a.balance]))
    expect(byId['acct-401k']).toBe(57572.08)
    expect(byId['acct-hsa']).toBe(1894.5)
  })
})

describe('planRecurringUpdates', () => {
  const cashFlows: CashFlowItem[] = [
    {
      id: 'cf-broadband',
      name: 'Astound Broadband',
      type: 'expense',
      frequency: 'monthly',
      amount: 55,
    },
    {
      id: 'cf-openai',
      name: 'OpenAI',
      type: 'expense',
      frequency: 'monthly',
      amount: 20,
    },
    {
      id: 'cf-membership',
      name: 'Credit Card Membership Fee',
      type: 'expense',
      frequency: 'annual',
      amount: 95,
    },
    {
      id: 'cf-income',
      name: 'Salary',
      type: 'income',
      frequency: 'monthly',
      amount: 8000,
    },
  ]
  const env: CaptureEnvelope = {
    v: 1,
    id: 'rm_recurring_test',
    source: 'rocketmoney',
    kind: 'recurring',
    capturedAt: '2026-07-02T20:00:00Z',
    asOfDate: '2026-07-02',
    data: {
      rows: [
        {
          name: 'Astound Broadband',
          frequency: 'Monthly',
          group: 'Subscriptions',
          amount: 60,
        },
        {
          name: 'OpenAI',
          frequency: 'Monthly',
          group: 'Subscriptions',
          amount: 20,
        },
        {
          name: 'Credit Card Membership Fee',
          frequency: 'Irregular',
          group: 'Subscriptions',
          amount: 95,
        },
        {
          name: 'Planet Fitness',
          frequency: 'Monthly',
          group: 'Subscriptions',
          amount: 6,
        },
      ],
    },
  }

  it('名称匹配且月付金额变化则更新；金额一致跳过；Irregular 不核对；未收录记 missing', () => {
    const plan = planRecurringUpdates(env, cashFlows)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].id).toBe('cf-broadband')
    expect(plan.updates[0].amount).toBe(60)
    expect(plan.missing.map((m) => m.name)).toEqual(['Planet Fitness'])
    expect(plan.notes.join('\n')).toContain('Planet Fitness')
  })

  it('income 类 cashFlow 不参与匹配', () => {
    const envIncome: CaptureEnvelope = {
      ...env,
      data: {
        rows: [
          { name: 'Salary', frequency: 'Monthly', group: 'Other', amount: 1 },
        ],
      },
    }
    const plan = planRecurringUpdates(envIncome, cashFlows)
    expect(plan.updates).toHaveLength(0)
    expect(plan.missing).toHaveLength(1)
  })
})

describe('planNewTransactions', () => {
  const rows: CapturedTxnRow[] = [
    {
      date: '2026-06-30',
      merchant: 'Paris Baguette',
      category: 'Dining & Drinks',
      amount: 6.3,
      credit: false,
      pending: false,
    },
    {
      date: '2026-06-30',
      merchant: 'Online/mobile Recurring',
      category: 'Internal Transfers',
      amount: 5.6,
      credit: true,
      pending: false,
    },
    {
      date: '2026-07-02',
      merchant: 'Lemonade',
      category: 'Bills & Utilities',
      amount: 5.08,
      credit: false,
      pending: true,
    },
    {
      date: '2026-06-29',
      merchant: 'Amazon Purchase',
      category: 'Shopping',
      amount: 39.99,
      credit: false,
      pending: false,
    },
  ]
  const env: CaptureEnvelope = {
    v: 1,
    id: 'rm_txn_test',
    source: 'rocketmoney',
    kind: 'transactions',
    capturedAt: '2026-07-02T20:00:00Z',
    asOfDate: '2026-07-02',
    data: { rows },
  }
  const existing: Txn[] = [
    {
      date: '2026-06-29',
      month: '2026-06',
      merchant: 'Amazon Purchase',
      category: 'Shopping',
      account: 'Rocket Money',
      flow: 'expense',
      amount: 39.99,
      budgetImpact: -39.99,
      inSpending: true,
      inCashFlow: true,
    },
  ]

  it('同日同商户同金额：按计数去重（multiset），两笔真交易都能入账', () => {
    const dupEnv: CaptureEnvelope = {
      ...env,
      data: {
        rows: [
          // 平台侧两笔独立交易（platformId 不同），key 相同
          {
            date: '2026-07-01',
            merchant: 'Blue Bottle',
            category: 'Dining & Drinks',
            amount: 5.75,
            credit: false,
            pending: false,
            platformId: 'id-1',
          },
          {
            date: '2026-07-01',
            merchant: 'Blue Bottle',
            category: 'Dining & Drinks',
            amount: 5.75,
            credit: false,
            pending: false,
            platformId: 'id-2',
          },
        ],
      },
    }
    // 已有 1 笔 → 消耗配额后再插 1 笔
    const oneExisting: Txn[] = [
      {
        date: '2026-07-01',
        month: '2026-07',
        merchant: 'Blue Bottle',
        category: 'Dining & Drinks',
        account: 'Rocket Money',
        flow: 'expense',
        amount: 5.75,
        budgetImpact: -5.75,
        inSpending: true,
        inCashFlow: true,
      },
    ]
    const plan = planNewTransactions(dupEnv, oneExisting)
    expect(plan.txns).toHaveLength(1)
    expect(plan.skippedDuplicate).toBe(1)
    // 已有 2 笔 → 全部视为重复
    const twoExisting = [...oneExisting, { ...oneExisting[0] }]
    expect(planNewTransactions(dupEnv, twoExisting).txns).toHaveLength(0)
    // 无 platformId 的同 key 行分不清真假重复：一个 capture 内只收第一条
    const keylessEnv: CaptureEnvelope = {
      ...env,
      data: {
        rows: (dupEnv.data as TransactionsCaptureData).rows.map(
          (r: CapturedTxnRow) => ({
            ...r,
            platformId: undefined,
          }),
        ),
      } as CaptureEnvelope['data'],
    }
    expect(planNewTransactions(keylessEnv, []).txns).toHaveLength(1)
  })

  it('跳过 pending 与已有重复，符号约定与手动记账一致', () => {
    const plan = planNewTransactions(env, existing)
    expect(plan.skippedPending).toBe(1)
    expect(plan.skippedDuplicate).toBe(1)
    expect(plan.txns).toHaveLength(2)
    const expense = plan.txns.find((t) => t.merchant === 'Paris Baguette')!
    expect(expense.flow).toBe('expense')
    expect(expense.amount).toBe(6.3)
    expect(expense.budgetImpact).toBe(-6.3)
    expect(expense.inSpending).toBe(true)
    const transfer = plan.txns.find(
      (t) => t.merchant === 'Online/mobile Recurring',
    )!
    expect(transfer.flow).toBe('internal_transfer')
    expect(transfer.amount).toBe(-5.6)
    expect(transfer.inSpending).toBe(false)
  })

  it('uses statement as merchant and real payment account, not import source label', () => {
    const stmtEnv: CaptureEnvelope = {
      ...env,
      data: {
        rows: [
          {
            date: '2026-07-03',
            merchant: 'Shopping',
            category: 'Shopping',
            statement: 'TARGET STORE T-1234',
            account: 'Chase ••4242',
            amount: 42.1,
            credit: false,
            pending: false,
            platformId: 'tgt-1',
          },
        ],
      },
    }
    const plan = planNewTransactions(stmtEnv, [])
    expect(plan.txns).toHaveLength(1)
    expect(plan.txns[0].merchant).toBe('TARGET STORE T-1234')
    expect(plan.txns[0].account).toBe('Chase ••4242')
  })

  it('falls back to Unknown account when capture has no card', () => {
    const plan = planNewTransactions(env, [])
    const expense = plan.txns.find((t) => t.merchant === 'Paris Baguette')!
    expect(expense.account).toBe('Unknown')
  })
})

describe('flowForCaptureRow', () => {
  const base = { date: '2026-07-01', merchant: 'x', amount: 1, pending: false }
  it('按类别与方向映射 flow', () => {
    expect(
      flowForCaptureRow({ ...base, category: 'Income', credit: true }),
    ).toBe('income')
    expect(
      flowForCaptureRow({
        ...base,
        category: 'Credit Card Payment',
        credit: false,
      }),
    ).toBe('credit_card_payment')
    expect(
      flowForCaptureRow({
        ...base,
        category: 'Savings Transfer',
        credit: false,
      }),
    ).toBe('internal_transfer')
    expect(
      flowForCaptureRow({ ...base, category: 'Shopping', credit: true }),
    ).toBe('refund_or_reversal')
    expect(
      flowForCaptureRow({ ...base, category: 'Shopping', credit: false }),
    ).toBe('expense')
  })
})

describe('buildAppSnapshot', () => {
  const cashFlows: CashFlowItem[] = [
    {
      id: 'cf-1',
      name: 'OpenAI ChatGPT Plus',
      type: 'expense',
      frequency: 'monthly',
      amount: 20,
    },
  ]
  const txns: Txn[] = [
    {
      date: '2026-06-01',
      month: '2026-06',
      merchant: 'Coffee',
      category: 'Dining',
      account: 'Rocket Money',
      flow: 'expense',
      amount: 5,
      budgetImpact: -5,
      inSpending: true,
      inCashFlow: true,
    },
    {
      date: '2026-07-01',
      month: '2026-07',
      merchant: 'Coffee',
      category: 'Dining',
      account: 'Rocket Money',
      flow: 'expense',
      amount: 5,
      budgetImpact: -5,
      inSpending: true,
      inCashFlow: true,
    },
  ]

  it('导出账户、交易键与滚动停止点', () => {
    const snap = buildAppSnapshot(accounts, txns, cashFlows, [])
    expect(snap.v).toBe(1)
    expect(snap.accounts).toHaveLength(accounts.length)
    expect(snap.txnCount).toBe(2)
    expect(snap.txnOldestDate).toBe('2026-06-01')
    expect(snap.txnNewestDate).toBe('2026-07-01')
    expect(snap.txnFastStopBefore).toBe('2026-06-28')
    expect(snap.txnScrollStopBefore).toBe('2026-05-29')
    expect(snap.txnKeys).toHaveLength(2)
    expect(snap.cashFlows).toHaveLength(1)
  })

  it('隐私模式只导出最小同步元数据', () => {
    const snap = buildAppSnapshot(accounts, txns, cashFlows, [], {
      privacy: true,
    })
    expect(snap.privacyRedacted).toBe(true)
    expect(snap.accounts).toEqual([])
    expect(snap.cashFlows).toEqual([])
    expect(snap.holdings).toEqual([])
    expect(snap.txnKeys).toEqual([])
    expect(snap.txnCount).toBe(2)
    expect(snap.txnFastStopBefore).toBe('2026-06-28')
    expect(snap.txnScrollStopBefore).toBe('2026-05-29')
  })
})

describe('resolveTxnScrollStopBefore', () => {
  it('优先取更晚的增量停止日期，避免每次扫完整历史', () => {
    const snap = buildAppSnapshot([], [], [], [])
    const withOldest = buildAppSnapshot(
      [],
      [
        {
          date: '2026-06-10',
          month: '2026-06',
          merchant: 'x',
          category: 'x',
          account: 'Rocket Money',
          flow: 'expense',
          amount: 1,
          budgetImpact: -1,
          inSpending: true,
          inCashFlow: true,
        },
      ],
      [],
      [],
    )
    expect(resolveTxnScrollStopBefore(withOldest, '2026-07-01')).toBe(
      '2026-06-28',
    )
    expect(resolveTxnScrollStopBefore(withOldest, undefined)).toBe('2026-06-07')
    expect(resolveTxnScrollStopBefore(snap, '2026-07-01')).toBe('2026-06-28')
    expect(resolveTxnScrollStopBefore(null, undefined)).toBeUndefined()
  })
})

describe('filterNewCaptureTxnRows', () => {
  it('按 multiset 跳过 app 已有交易', () => {
    const snap = buildAppSnapshot(
      [],
      [
        {
          date: '2026-07-01',
          month: '2026-07',
          merchant: 'Paris Baguette',
          category: 'Dining',
          account: 'Rocket Money',
          flow: 'expense',
          amount: 6.3,
          budgetImpact: -6.3,
          inSpending: true,
          inCashFlow: true,
        },
      ],
      [],
      [],
    )
    const rows: CapturedTxnRow[] = [
      {
        date: '2026-07-01',
        merchant: 'Paris Baguette',
        category: 'Dining',
        amount: 6.3,
        credit: false,
        pending: false,
      },
      {
        date: '2026-07-02',
        merchant: 'New Shop',
        category: 'Shopping',
        amount: 10,
        credit: false,
        pending: false,
      },
    ]
    const { rows: need, skippedDuplicate } = filterNewCaptureTxnRows(
      rows,
      snap,
      'rocketmoney',
    )
    expect(need).toHaveLength(1)
    expect(need[0].merchant).toBe('New Shop')
    expect(skippedDuplicate).toBe(1)
  })
})

describe('accountRowUnchangedInApp', () => {
  it('余额在容差内则跳过', () => {
    const snap = buildAppSnapshot(accounts, [], [], [])
    expect(
      accountRowUnchangedInApp({ name: 'BofA Checking', balance: 200.2 }, snap),
    ).toBe(true)
    expect(
      accountRowUnchangedInApp({ name: 'BofA Checking', balance: 500 }, snap),
    ).toBe(false)
    const manualSnap = buildAppSnapshot(
      accounts.map((a) =>
        a.id === 'acct-robinhood-6853' ? { ...a, balanceManual: true } : a,
      ),
      [],
      [],
      [],
    )
    expect(
      accountRowUnchangedInApp(
        { name: 'Robinhood individual', balance: 130000 },
        manualSnap,
      ),
    ).toBe(false)
  })

  it('近似余额放宽容差', () => {
    const snap = buildAppSnapshot(
      [
        {
          id: 'x',
          name: 'Fidelity Brokerage',
          type: 'brokerage',
          balance: 57700,
        },
      ],
      [],
      [],
      [],
    )
    expect(
      accountRowUnchangedInApp(
        { name: 'Fidelity Brokerage', balance: 57750, approximate: true },
        snap,
      ),
    ).toBe(true)
  })
})

describe('recurringRowAlreadyInApp', () => {
  it('名称频率金额一致则跳过', () => {
    const snap = buildAppSnapshot(
      [],
      [],
      [
        {
          id: 'cf-1',
          name: 'OpenAI ChatGPT Plus',
          type: 'expense',
          frequency: 'monthly',
          amount: 20,
        },
      ],
      [],
    )
    expect(
      recurringRowAlreadyInApp(
        {
          name: 'OpenAI',
          frequency: 'Monthly',
          group: 'Subscriptions',
          amount: 20,
        },
        snap,
      ),
    ).toBe(true)
    expect(
      recurringRowAlreadyInApp(
        {
          name: 'Netflix',
          frequency: 'Monthly',
          group: 'Subscriptions',
          amount: 15,
        },
        snap,
      ),
    ).toBe(false)
  })
})

describe('nameMatches', () => {
  it('整词包含才算匹配，防止 substring 误配', () => {
    expect(nameMatches('Savings', 'CHASE SAVINGS')).toBe(true)
    expect(nameMatches('Robinhood individual', 'Robinhood Individual')).toBe(
      true,
    )
    expect(nameMatches('OpenAI', 'OpenAI ChatGPT Plus')).toBe(true)
    // substring 但不在词边界：不匹配
    expect(nameMatches('Rent', 'Parent Lending')).toBe(false)
    expect(nameMatches('HSA', 'CHASE SAVINGS')).toBe(false)
    expect(nameMatches('a', 'Apple Card')).toBe(false) // 过短
  })
})

describe('isCaptureEnvelope', () => {
  it('校验合法与非法 envelope', () => {
    expect(isCaptureEnvelope(holdingsEnvelope())).toBe(true)
    expect(isCaptureEnvelope(null)).toBe(false)
    expect(isCaptureEnvelope({ v: 2 })).toBe(false)
    expect(
      isCaptureEnvelope({
        v: 1,
        id: 'x',
        source: 'evil',
        kind: 'holdings',
        asOfDate: '2026-01-01',
        data: {},
      }),
    ).toBe(false)
    expect(
      isCaptureEnvelope({
        v: 1,
        id: 'x',
        source: 'rocketmoney',
        kind: 'recurring',
        asOfDate: '2026-01-01',
        data: { rows: [] },
      }),
    ).toBe(true)
  })
})

describe('computeEnvelopePayloadHashSync', () => {
  it('同一 envelope 产生稳定哈希', () => {
    const env = holdingsEnvelope({ id: 'stable-id' })
    expect(computeEnvelopePayloadHashSync(env)).toBe(
      computeEnvelopePayloadHashSync(env),
    )
  })

  it('payload 变化则哈希变化', () => {
    const a = holdingsEnvelope({ id: 'a' })
    const b = holdingsEnvelope({ id: 'b' })
    expect(computeEnvelopePayloadHashSync(a)).not.toBe(
      computeEnvelopePayloadHashSync(b),
    )
  })
})

describe('newTxnToExtensionSyncPayload', () => {
  it('maps platformId to platform_id', () => {
    const payload = newTxnToExtensionSyncPayload({
      date: '2026-06-01',
      merchant: 'Coffee',
      category: 'Dining',
      account: 'Rocket Money',
      flow: 'expense',
      amount: 5.5,
      budgetImpact: -5.5,
      inSpending: true,
      inCashFlow: true,
      source: 'import',
      platformId: 'rm-abc',
    })
    expect(payload.platform_id).toBe('rm-abc')
    expect(payload.flow_type).toBe('expense')
  })

  it('omits empty platform_id and exclude_reason', () => {
    const payload = newTxnToExtensionSyncPayload({
      date: '2026-06-01',
      merchant: 'Coffee',
      category: 'Dining',
      account: 'Rocket Money',
      flow: 'expense',
      amount: 5.5,
      budgetImpact: -5.5,
      inSpending: false,
      inCashFlow: true,
      source: 'import',
      platformId: '',
    })
    expect(payload.platform_id).toBeUndefined()
    expect(payload.exclude_reason).toBeUndefined()
  })
})

describe('sanitizeExtensionSyncTxnPayload', () => {
  it('strips empty strings but keeps booleans and numbers', () => {
    expect(
      sanitizeExtensionSyncTxnPayload({
        date: '2026-07-01',
        amount: 0,
        include_in_spending_analytics: false,
        category: '',
        note: '   ',
      }),
    ).toEqual({
      date: '2026-07-01',
      amount: 0,
      include_in_spending_analytics: false,
    })
  })
})
