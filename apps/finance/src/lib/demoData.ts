// 本地演示模式数据（FIN.DEMO）—— 一整套自洽、可离线渲染的模拟财务快照。
// 仅供 localhost 走查用（见 demoMode.ts），绝不进云端。数值虚构但结构与真实一致，
// 覆盖：多账户 + 券商持仓快照 + 周期收支 + 目标桶 + 方案/事件/决策 + ~3 个月流水。
import { DATA_VERSION, defaultAssumptions } from '@life-os/finance-core/defaults'
import type { FinanceData } from '../types'
import type { Txn } from '@life-os/finance-core/engine/transactions'
import type { ReviewItemRecord } from '@life-os/finance-core/repo'

const DAY = 86_400_000

/**
 * 以「今天」为锚，返回 offsetDays 天前的 ISO 日期（YYYY-MM-DD）。
 * 用本地年月日拼接（非 toISOString 的 UTC 切片），避免时区把「今天」偏移一天，
 * 保证现金日历 / 今日相对日期在本地时区正确。
 */
function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * DAY)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 账户 id 常量，供流水引用账户名保持一致。 */
const ACCOUNTS = {
  checking: 'demo-acc-checking',
  savings: 'demo-acc-savings',
  card: 'demo-acc-card',
  brokerage: 'demo-acc-brokerage',
  retirement: 'demo-acc-401k',
  hsa: 'demo-acc-hsa',
  autoLoan: 'demo-acc-auto',
}

const CHECKING_NAME = 'Everyday Checking'
const SAVINGS_NAME = 'High-Yield Savings'
const CARD_NAME = 'Sapphire Card'
const BROKERAGE_NAME = 'Robinhood 个人'

/** 演示用完整 FinanceData（账户/持仓/收支/目标/方案/事件/决策）。 */
export function buildDemoFinanceData(): FinanceData {
  const now = new Date().toISOString()

  const positions = [
    { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'etf', shares: 42, price: 512.4, cost: 388.2 },
    { ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', shares: 60, price: 231.5, cost: 165.9 },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', shares: 30, price: 172.8, cost: 61.4 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', type: 'stock', shares: 18, price: 468.1, cost: 402.5 },
    { ticker: 'SCHD', name: 'Schwab US Dividend ETF', type: 'etf', shares: 55, price: 28.6, cost: 26.1 },
    { ticker: 'COST', name: 'Costco Wholesale', type: 'stock', shares: 6, price: 942.3, cost: 720.0 },
  ] as const

  const holdingPositions = positions.map((p, i) => {
    const marketValue = round2(p.shares * p.price)
    const basis = round2(p.shares * p.cost)
    const totalReturn = round2(marketValue - basis)
    return {
      id: `demo-pos-${i}`,
      ticker: p.ticker,
      securityName: p.name,
      assetType: p.type as 'stock' | 'etf',
      shares: p.shares,
      marketPrice: p.price,
      marketValue,
      averageCostPerShare: p.cost,
      impliedCostBasis: basis,
      totalReturnAmount: totalReturn,
      totalReturnPctDisplayed: round2((totalReturn / basis) * 100),
      todayReturnAmount: round2(marketValue * 0.006),
      todayReturnPct: 0.6,
    }
  })

  const holdingsMarketValue = round2(
    holdingPositions.reduce((s, p) => s + p.marketValue, 0),
  )
  const impliedCostBasis = round2(
    holdingPositions.reduce((s, p) => s + (p.impliedCostBasis ?? 0), 0),
  )

  return {
    version: DATA_VERSION,
    accounts: [
      {
        id: ACCOUNTS.checking,
        name: CHECKING_NAME,
        type: 'checking',
        balance: 8420.55,
        liquid: true,
        updatedAt: now,
      },
      {
        id: ACCOUNTS.savings,
        name: SAVINGS_NAME,
        type: 'savings',
        balance: 26500,
        annualReturn: 0.041,
        liquid: true,
        updatedAt: now,
      },
      {
        id: ACCOUNTS.card,
        name: CARD_NAME,
        type: 'credit-card',
        balance: 1840.32,
        apr: 0.2249,
        creditMode: 'paid-in-full',
        statementBalance: 1840.32,
        dueDay: 15,
        paymentDay: 12,
        autoPayMode: 'statement',
        paymentAccountId: ACCOUNTS.checking,
        annualFee: 95,
        updatedAt: now,
      },
      {
        id: ACCOUNTS.brokerage,
        name: BROKERAGE_NAME,
        type: 'brokerage',
        balance: holdingsMarketValue,
        basis: impliedCostBasis,
        annualReturn: 0.07,
        updatedAt: now,
      },
      {
        id: ACCOUNTS.retirement,
        name: 'Fidelity 401(k)',
        type: 'retirement',
        balance: 84200,
        annualReturn: 0.065,
        balanceManual: true,
        fundAllocations: [
          { ticker: 'FXAIX', securityName: 'Fidelity 500 Index', weightPct: 62, assetClass: 'equity' },
          { ticker: 'FTIHX', securityName: 'Total Intl Index', weightPct: 20, assetClass: 'equity' },
          { ticker: 'FXNAX', securityName: 'US Bond Index', weightPct: 15, assetClass: 'bond' },
          { ticker: 'CASH', weightPct: 3, assetClass: 'cash' },
        ],
        updatedAt: now,
      },
      {
        id: ACCOUNTS.hsa,
        name: 'HSA 投资账户',
        type: 'hsa',
        balance: 12750,
        annualReturn: 0.06,
        balanceManual: true,
        updatedAt: now,
      },
      {
        id: ACCOUNTS.autoLoan,
        name: 'Auto Loan',
        type: 'auto-loan',
        balance: 14200,
        apr: 0.0489,
        monthlyPayment: 412,
        termMonths: 38,
        dueDay: 5,
        paymentAccountId: ACCOUNTS.checking,
        updatedAt: now,
      },
    ],
    holdingsSnapshots: [
      {
        id: 'demo-snap-1',
        accountId: ACCOUNTS.brokerage,
        institution: 'Robinhood',
        accountLabel: BROKERAGE_NAME,
        asOfDate: isoDay(1),
        importedAt: now,
        sourceType: 'demo',
        sourceDescription: '演示数据',
        reconciliationStatus: 'complete',
        holdingsMarketValue,
        impliedCostBasis,
        unrealizedGain: round2(holdingsMarketValue - impliedCostBasis),
        weightedTotalReturnPct: round2(
          ((holdingsMarketValue - impliedCostBasis) / impliedCostBasis) * 100,
        ),
        todayReturnAmountApprox: round2(holdingsMarketValue * 0.006),
        todayReturnPctApprox: 0.6,
        positionCount: holdingPositions.length,
        stockCount: holdingPositions.filter((p) => p.assetType === 'stock').length,
        etfCount: holdingPositions.filter((p) => p.assetType === 'etf').length,
        positions: holdingPositions,
      },
    ],
    cashFlows: [
      {
        id: 'demo-cf-salary',
        name: '税后工资',
        type: 'income',
        frequency: 'monthly',
        amount: 6800,
        payFrequency: 'biweekly',
        anchorDate: isoDay(9),
      },
      { id: 'demo-cf-rent', name: '房租', type: 'expense', frequency: 'monthly', amount: 2150, essential: true, category: 'Housing', dueDay: 1 },
      { id: 'demo-cf-grocery', name: '日常采购', type: 'expense', frequency: 'monthly', amount: 720, essential: true, category: 'Groceries' },
      { id: 'demo-cf-utilities', name: '水电网', type: 'expense', frequency: 'monthly', amount: 245, essential: true, category: 'Utilities', dueDay: 18 },
      { id: 'demo-cf-subs', name: '订阅服务', type: 'expense', frequency: 'monthly', amount: 68, category: 'Subscriptions' },
      { id: 'demo-cf-insurance', name: '车/租客保险', type: 'expense', frequency: 'monthly', amount: 175, essential: true, category: 'Insurance', dueDay: 22 },
      { id: 'demo-cf-dining', name: '外出就餐', type: 'expense', frequency: 'monthly', amount: 420, category: 'Dining' },
    ],
    events: [
      {
        id: 'demo-ev-bonus',
        scenarioId: 'scenario_baseline',
        name: '年终奖金',
        eventType: 'windfall',
        enabled: true,
        monthOffset: 5,
        amount: 8000,
      },
      // 基准场景上的「长期会变化的事」——涨薪 / 支出增减 / 伴侣分摊，
      // 渲染在 预测 › 长期规划 的清单里（该清单只显示 salary/expense/partner 三类）。
      {
        id: 'demo-ev-raise',
        scenarioId: 'scenario_baseline',
        name: '半年后涨薪',
        eventType: 'salary-change',
        enabled: true,
        monthOffset: 6,
        amount: 500,
      },
      {
        id: 'demo-ev-rent-up',
        scenarioId: 'scenario_baseline',
        name: '续租房租上调',
        eventType: 'expense-change',
        enabled: true,
        monthOffset: 4,
        amount: 150,
      },
      {
        id: 'demo-ev-gym',
        scenarioId: 'scenario_baseline',
        name: '新增健身房会员',
        eventType: 'expense-change',
        enabled: true,
        monthOffset: 2,
        amount: 45,
      },
      {
        id: 'demo-ev-partner',
        scenarioId: 'scenario_baseline',
        name: '伴侣分摊水电',
        eventType: 'partner-contribution',
        enabled: true,
        monthOffset: 4,
        contributionPercent: 0.5,
        expenseCategory: 'Utilities',
      },
      {
        id: 'demo-ev-laptop',
        scenarioId: 'scenario_baseline',
        name: '换新笔记本',
        eventType: 'one-time-purchase',
        enabled: true,
        monthOffset: 3,
        amount: 1600,
        fundingSource: 'savings',
      },
      {
        id: 'demo-ev-car',
        scenarioId: 'demo-sc-car',
        name: '换车首付',
        eventType: 'one-time-purchase',
        enabled: true,
        monthOffset: 8,
        amount: 6000,
        fundingSource: 'savings',
      },
    ],
    scenarios: [
      { id: 'scenario_baseline', name: '基准', scenarioType: 'custom', status: 'saved' },
      { id: 'demo-sc-car', name: '两年后换车', scenarioType: 'purchase', status: 'saved', description: '$6k 首付 + 月供 $340', comparisonColorToken: 'chart-series-2' },
      { id: 'demo-sc-rent', name: '房租上涨 8%', scenarioType: 'rent_change', status: 'draft', description: '续租涨到 $2,320/月', comparisonColorToken: 'chart-series-3' },
    ],
    activeScenarioId: 'scenario_baseline',
    decisionRecords: [
      {
        id: 'demo-dec-1',
        scenarioId: 'demo-sc-car',
        decisionStatus: 'considering',
        decisionSummary: '是否两年后换车',
        reason: '当前车龄尚可，等奖金到账再定',
        reviewOn: isoDay(-60),
        decidedAt: isoDay(6),
        createdAt: now,
      },
      {
        id: 'demo-dec-2',
        scenarioId: 'demo-sc-rent',
        decisionStatus: 'chosen',
        decisionSummary: '续租而非搬家',
        reason: '搬家一次性成本高于一年多付的房租，且通勤更近',
        decidedAt: isoDay(18),
        reviewOn: isoDay(-150),
        createdAt: now,
      },
      {
        id: 'demo-dec-3',
        scenarioId: 'demo-sc-car',
        decisionStatus: 'deferred',
        decisionSummary: '暂缓升级到电车',
        reason: '等年底 tax credit 政策明朗再评估',
        decidedAt: isoDay(32),
        reviewOn: isoDay(-90),
        createdAt: now,
      },
    ],
    goals: [
      { id: 'goal-emergency', name: '应急储备 Emergency', metric: 'liquid', target: 28500, current: 26500, priority: 'critical', reservePolicy: 'earmarked_operating_cash', reserve: true },
      { id: 'demo-goal-house', name: '购房首付', metric: 'accessible', target: 80000, current: 34200, priority: 'high', monthlyAllocation: 1200, targetDate: isoDay(-720), reservePolicy: 'protected_account' },
      { id: 'demo-goal-trip', name: '日本旅行', metric: 'liquid', target: 6000, current: 2100, priority: 'normal', monthlyAllocation: 300, targetDate: isoDay(-210), reservePolicy: 'milestone_only', reserve: true },
    ],
    assumptions: { ...defaultAssumptions, savingsBudget: 1800, emergencyReserveTarget: 28500 },
    portfolioAllocationTarget: { stockPct: 45, etfPct: 45, top1MaxPct: 25, top3MaxPct: 55, driftThresholdPct: 5 },
    updatedAt: now,
    privacy: false,
    locale: 'zh-CN',
  }
}

/** 演示用交易流水（约 3 个月，覆盖收入/消费/还款/转账/退款）。 */
export function buildDemoTransactions(): Txn[] {
  const rows: Txn[] = []
  let seq = 0
  const push = (
    offsetDays: number,
    merchant: string,
    category: string,
    account: string,
    amount: number,
    flow: Txn['flow'] = 'expense',
    extra: Partial<Txn> = {},
  ) => {
    const date = isoDay(offsetDays)
    const isExpense = flow === 'expense'
    const isIncome = flow === 'income'
    rows.push({
      id: `demo-txn-${seq++}`,
      date,
      month: date.slice(0, 7),
      merchant,
      category,
      account,
      flow,
      amount,
      budgetImpact: isExpense ? -Math.abs(amount) : isIncome ? 0 : 0,
      inSpending: isExpense,
      inCashFlow: flow !== 'internal_transfer',
      source: 'import',
      ...extra,
    })
  }

  // 三次发薪（biweekly）
  push(9, '雇主直存', 'Income', CHECKING_NAME, -3140, 'income')
  push(23, '雇主直存', 'Income', CHECKING_NAME, -3140, 'income')
  push(37, '雇主直存', 'Income', CHECKING_NAME, -3140, 'income')

  // 每月固定支出（近三个月各一次）
  for (const m of [1, 31, 61]) {
    push(m, '公寓管理', 'Housing', CHECKING_NAME, 2150)
    push(m + 3, 'PG&E 电力', 'Utilities', CHECKING_NAME, 138.42)
    push(m + 4, 'Comcast 网络', 'Utilities', CARD_NAME, 79.99)
    push(m + 6, 'Geico 保险', 'Insurance', CARD_NAME, 175)
    push(m + 2, 'Netflix', 'Subscriptions', CARD_NAME, 22.99)
    push(m + 2, 'Spotify', 'Subscriptions', CARD_NAME, 11.99)
  }

  // 日常消费
  const groceries: Array<[number, string, number]> = [
    [2, 'Whole Foods', 92.4], [5, 'Trader Joe’s', 61.2], [8, 'Costco', 214.8],
    [12, 'Safeway', 47.6], [16, 'Whole Foods', 78.1], [21, 'Trader Joe’s', 55.3],
    [27, 'Costco', 188.5], [34, 'Safeway', 63.0], [41, 'Whole Foods', 88.9],
  ]
  for (const [d, m, a] of groceries) push(d, m, 'Groceries', CARD_NAME, a)

  const dining: Array<[number, string, number]> = [
    [1, 'Blue Bottle', 6.75], [3, 'Chipotle', 14.2], [6, 'Sushi Ran', 68.4],
    [9, 'Blue Bottle', 5.5], [14, 'Tacos El Gordo', 22.9], [19, 'Din Tai Fung', 84.3],
    [25, 'Philz Coffee', 6.25], [33, 'Ramen Nagi', 31.5], [40, 'Blue Bottle', 6.75],
  ]
  for (const [d, m, a] of dining) push(d, m, 'Dining', CARD_NAME, a)

  const shopping: Array<[number, string, number]> = [
    [4, 'Amazon', 43.18], [11, 'Uniqlo', 89.9], [18, 'Amazon', 27.6],
    [24, 'Apple Store', 129], [30, 'REI', 156.4], [38, 'Amazon', 61.25],
  ]
  for (const [d, m, a] of shopping) push(d, m, 'Shopping', CARD_NAME, a)

  const transport: Array<[number, string, number]> = [
    [7, 'Shell 加油', 52.3], [15, 'Uber', 18.7], [26, 'Shell 加油', 49.1], [35, 'Clipper 交通卡', 40],
  ]
  for (const [d, m, a] of transport) push(d, m, 'Transport', CARD_NAME, a)

  // 信用卡还款（每月），内部转账（存入储蓄），一次退款
  push(12, CARD_NAME + ' 还款', 'Credit Card', CHECKING_NAME, 1620.5, 'credit_card_payment')
  push(42, CARD_NAME + ' 还款', 'Credit Card', CHECKING_NAME, 1785.2, 'credit_card_payment')
  push(10, '转入储蓄', 'Transfer', CHECKING_NAME, 1200, 'internal_transfer')
  push(38, '转入储蓄', 'Transfer', CHECKING_NAME, 1200, 'internal_transfer')
  push(20, 'Amazon 退款', 'Shopping', CARD_NAME, -27.6, 'refund_or_reversal', { budgetImpact: 27.6, inSpending: true })
  push(5, '车贷月供', 'Debt', CHECKING_NAME, 412, 'expense')
  push(35, '车贷月供', 'Debt', CHECKING_NAME, 412, 'expense')

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * 演示用「审查队列」条目（review › queue）。
 * 真实数据来自 Supabase finance_review_items（loadReviewItems），演示模式下无登录会话，
 * 云端读取恒返回空，故这里直接注入一批自洽的待审查项供走查。
 */
export function buildDemoReviewItems(): ReviewItemRecord[] {
  const IMPORT = 'demo-import-2026-07'
  return [
    {
      id: 'demo-ri-1',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'mirror_duplicate_candidate',
      severity: 'high',
      status: 'open',
      reason: 'Everyday Checking 与 Sapphire Card 各有一笔 $214.80 Costco，日期相邻，疑似镜像重复。',
      suggestedAction: '确认是否同一笔消费，保留其一并删除重复项。',
      createdAt: isoDay(2),
    },
    {
      id: 'demo-ri-2',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'likely_transfer',
      severity: 'medium',
      status: 'open',
      reason: '$1,200「转入储蓄」被计成支出，疑似账户间转账而非真实消费。',
      suggestedAction: '标记为内部转账，从消费口径中排除。',
      createdAt: isoDay(4),
    },
    {
      id: 'demo-ri-3',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'likely_credit_card_payment',
      severity: 'medium',
      status: 'open',
      reason: '$1,620.50「Sapphire Card 还款」可能被同时计入支出与还款，存在重复。',
      suggestedAction: '标记为信用卡还款，避免与卡内消费重复计入。',
      createdAt: isoDay(5),
    },
    {
      id: 'demo-ri-4',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'large_uncategorized',
      severity: 'medium',
      status: 'open',
      reason: '$156.40 REI 为未归类的大额消费，会影响预算分类准确度。',
      suggestedAction: '补一个消费类别（如 Shopping / Outdoor）。',
      createdAt: isoDay(9),
    },
    {
      id: 'demo-ri-5',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'likely_recurring',
      severity: 'low',
      status: 'open',
      reason: 'Netflix $22.99 连续三个月出现，建议登记为固定订阅以进入现金流日历。',
      suggestedAction: '登记为周期性支出（Subscriptions）。',
      createdAt: isoDay(12),
    },
    {
      id: 'demo-ri-6',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'possible_account_alias',
      severity: 'low',
      status: 'open',
      reason: '「Sapphire Card」与导入文件里的「Chase Sapphire」疑为同一账户的不同写法。',
      suggestedAction: '合并账户别名，避免拆成两个账户。',
      createdAt: isoDay(15),
    },
    {
      id: 'demo-ri-7',
      importId: IMPORT,
      transactionId: null,
      reviewType: 'likely_refund',
      severity: 'low',
      status: 'resolved',
      reason: '$27.60 Amazon 退款已关联到原始订单。',
      suggestedAction: '标记为退款并冲抵原消费。',
      resolution: 'user-confirmed',
      createdAt: isoDay(20),
      resolvedAt: isoDay(19),
    },
  ]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
