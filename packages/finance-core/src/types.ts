// 数据模型 —— 对应设计文档第 10 节实体定义
// 金额单位统一为美元 (number)。时间统一用「距今月数」monthOffset 表示，0 = 当前月。

export type AccountType =
  | "checking"
  | "savings"
  | "hsa"
  | "brokerage"
  | "retirement"
  | "credit-card"
  | "auto-loan"
  | "mortgage"
  | "property"
  | "other";

export type CreditMode = "paid-in-full" | "revolving";
export type AutoPayMode = "statement" | "minimum" | "full-balance" | "none";

/**
 * 还款日哨兵值：表示「每月最后一天」(2 月→28/29，4 月→30，等)。
 * 存为普通整数，引擎 dateOnDay 会自动把超过当月天数的值钳到当月最后一天，
 * 因此无需新增数据库列。避免把 Apple Card 这类卡硬编码为固定的 30/31。
 */
export const DUE_DAY_LAST_OF_MONTH = 99;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** 资产为正余额；负债存储为正的「欠款金额」，由 type 判定 asset/liability。 */
  balance: number;
  /** 年化收益率 (储蓄/投资)，例如 0.06。 */
  annualReturn?: number;
  /** 年化利率/APR (信用卡/贷款)，例如 0.2199。 */
  apr?: number;
  /** 是否计入「流动现金」(checking/savings 通常为 true)。 */
  liquid?: boolean;
  /** 信用卡专用：全额还清 vs 滚动余额。 */
  creditMode?: CreditMode;
  /** 信用卡专用：本期账单金额 (statement balance)，到期需支付。 */
  statementBalance?: number;
  /** 信用卡/贷款：每月还款日 (1-28)，或 DUE_DAY_LAST_OF_MONTH 表示「每月最后一天」。 */
  dueDay?: number;
  /**
   * 信用卡：实际扣款日 (1-28 或 DUE_DAY_LAST_OF_MONTH)。用户常在到期日前提前还款，
   * 现金会更早离开账户。设置后，现金流/日历/安全垫按此日建模；未设置则回退 dueDay。
   */
  paymentDay?: number;
  /** 信用卡：自动还款方式。 */
  autoPayMode?: AutoPayMode;
  /** 还款扣款账户 id (指向某个 checking/savings 账户)。 */
  paymentAccountId?: string;
  /** 信用卡年费金额。 */
  annualFee?: number;
  /** 年费扣款日期 ISO。 */
  annualFeeDate?: string;
  /** 贷款专用：月供。 */
  monthlyPayment?: number;
  /** 贷款专用：剩余期数 (月)。 */
  termMonths?: number;
  /** 该账户成本基础 (用于卖出计税，可选)。 */
  basis?: number;
  /** 最近更新日期 ISO 字符串。 */
  updatedAt?: string;
  /** 备注。 */
  note?: string;
  /** 为 true 时启动校准不再用持仓快照覆盖 balance/basis。 */
  balanceManual?: boolean;
  /**
   * 退休/HSA 等账户的基金占比（来自券商「Top Positions」或对账单）。
   * 与 Robinhood 持仓快照分开存储。
   */
  fundAllocations?: AccountFundAllocation[];
  /**
   * Fidelity「Asset allocation」穿透后的底层大类（如 Domestic/Foreign Stock、Bonds）。
   * 优先用于全组合股债现金估算。
   */
  underlyingAllocation?: AccountUnderlyingSlice[];
}

/** 401(k)/HSA 账户内单只基金或现金仓的占比。 */
export interface AccountFundAllocation {
  ticker: string;
  securityName?: string;
  weightPct: number;
  assetClass: "equity" | "bond" | "cash" | "other";
  asOfDate?: string;
}

/** 退休账户底层资产穿透（通常来自目标日期基金 look-through）。 */
export interface AccountUnderlyingSlice {
  id: string;
  label: string;
  weightPct: number;
  assetClass: "equity" | "bond" | "cash" | "other";
  /** 穿透来源基金，如 OGSV */
  sourceTicker?: string;
  valueUsd?: number;
}

export type CashFlowType = "income" | "expense";
/** 周期性收支频率。一次性收支统一由 ScenarioEvent (windfall/one-time-purchase) 表达。 */
export type Frequency = "monthly" | "annual";

/** 工资/收入发放频率。biweekly/weekly 会按发薪日历分摊，部分月份自然发 3 次。 */
export type PayFrequency = "monthly" | "semimonthly" | "biweekly" | "weekly";

export interface CashFlowItem {
  id: string;
  name: string;
  type: CashFlowType;
  frequency: Frequency;
  /** income 默认按税后填写 (take-home)。对 biweekly/weekly 视为「月度等额」，由引擎换算单次发薪额。 */
  amount: number;
  /** 是否为必要支出 (影响应急金跑道月数计算)。 */
  essential?: boolean;
  /** 生效起始月 (距今)，默认 0。 */
  startMonth?: number;
  /** 结束月 (距今)，含。不填表示永久。 */
  endMonth?: number;
  category?: string;
  /** `lockbox-contribution`：401(k)/HSA payroll 供款，不从 checking 扣，直接计入锁定投资。 */
  /** 收入发放频率 (默认 monthly)。 */
  payFrequency?: PayFrequency;
  /** 发薪锚点日期 ISO (biweekly/weekly 用，决定哪些月发 3 次)。 */
  anchorDate?: string;
  /** 每月发生日 (1-28)：支出的扣款日 / 月度收入的到账日。用于 30 天现金流日历。 */
  dueDay?: number;
}

export type ScenarioEventType =
  | "salary-change"
  | "expense-change"
  | "one-time-purchase"
  | "partner-contribution"
  | "windfall";

export type FundingSource = "checking" | "savings" | "invested" | "credit-card";

export interface ScenarioEvent {
  id: string;
  /** 事件所属场景。缺省时归属 baseline。 */
  scenarioId?: string;
  name: string;
  eventType: ScenarioEventType;
  enabled: boolean;
  /** 事件发生月 (距今)。 */
  monthOffset: number;
  /** 通用金额：一次性消费/windfall 总额；salary/expense 为月度增减额。 */
  amount?: number;
  /** 事件日历日期 ISO (设置后据此推导 monthOffset，UI 用日期选择)。 */
  date?: string;
  /** salary-change：用百分比表示涨幅 (0.05) 时填此项；否则用 amount 作为新月收入。 */
  percent?: number;
  /** partner-contribution：分担比例 (0.5 表示对方承担 50%)。 */
  contributionPercent?: number;
  /** partner-contribution 针对的支出类别 (按 CashFlowItem.category 匹配)。 */
  expenseCategory?: string;
  /** one-time-purchase 的付款来源。 */
  fundingSource?: FundingSource;
}

export type ScenarioStatus = "draft" | "saved" | "chosen" | "archived";
export type ScenarioType =
  | "custom"
  | "purchase"
  | "recurring_cost"
  | "rent_change"
  | "travel"
  | "career_break"
  | "partner_contribution"
  | "cash_vs_finance";

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  scenarioType: ScenarioType;
  status: ScenarioStatus;
  comparisonColorToken?: string;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string;
}

export type DecisionStatus =
  | "considering"
  | "chosen"
  | "declined"
  | "deferred"
  | "reviewed";

export interface DecisionRecord {
  id: string;
  scenarioId: string;
  decisionStatus: DecisionStatus;
  decisionSummary: string;
  reason?: string;
  expectedOutcomeJson?: Record<string, unknown>;
  actualOutcomeJson?: Record<string, unknown>;
  decidedAt?: string;
  reviewOn?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 资产口径：
 * - accessible「能动的钱」：可动用、税后实际值（流动现金 + 应急储备 + 房产 + 券商税后 − 负债）
 * - locked「不能动的钱」：401k / HSA
 */
export type GoalMetric =
  | "net-worth"
  | "liquid"
  | "invested"
  | "accessible"
  | "locked";

/** 预测页可视化口径，与目标口径一致。 */
export type ForecastMetric = GoalMetric;
export type GoalPriority = "critical" | "high" | "normal";
export type GoalReservePolicy =
  | "milestone_only"
  | "earmarked_operating_cash"
  | "protected_account";

export interface Goal {
  id: string;
  name: string;
  metric: GoalMetric;
  target: number;
  /** 已存入金额 (bucket 当前余额)。 */
  current?: number;
  /** 优先级。 */
  priority?: GoalPriority;
  /** 资金来源账户 id。 */
  fundingAccountId?: string;
  /** 每月分配金额。 */
  monthlyAllocation?: number;
  /** 目标日期 ISO。 */
  targetDate?: string;
  /** 专款策略：里程碑追踪 / 运营现金 earmark / 保护账户。 */
  reservePolicy?: GoalReservePolicy;
  /** monthlyAllocation 每月执行日 (1-28)。 */
  monthlyAllocationDay?: number;
  /**
   * 是否为「预留 bucket」：其 current 金额会从 safe-to-spend 中扣除 (专款专用)。
   * 长期里程碑目标 (net-worth/invested) 通常为 false。
   * @deprecated 使用 reservePolicy，保留仅用于旧数据兼容。
   */
  reserve?: boolean;
}

export type DisplayMode = "today" | "future";

export type HoldingAssetType = "stock" | "etf" | "other";

export interface HoldingPosition {
  id: string;
  ticker: string;
  securityName: string;
  assetType: HoldingAssetType;
  shares: number;
  marketPrice: number;
  marketValue: number;
  averageCostPerShare?: number;
  impliedCostBasis?: number;
  portfolioWeightPct?: number;
  portfolioDiversityDisplayedPct?: number;
  todayReturnAmount?: number;
  todayReturnPct?: number;
  totalReturnAmount?: number;
  totalReturnPctDisplayed?: number;
  sourceCapturedAt?: string;
}

export interface HoldingsSnapshot {
  id: string;
  accountId?: string;
  institution?: string;
  accountLabel: string;
  asOfDate: string;
  asOfTimeLocal?: string;
  timezone?: string;
  importedAt: string;
  sourceType: string;
  sourceDescription?: string;
  note?: string;
  needsUserConfirmation?: boolean;
  reconciliationStatus?: "incomplete" | "complete";
  holdingsMarketValue: number;
  impliedCostBasis?: number;
  unrealizedGain?: number;
  weightedTotalReturnPct?: number;
  todayReturnAmountApprox?: number;
  todayReturnPctApprox?: number;
  positionCount: number;
  stockCount?: number;
  etfCount?: number;
  positions: HoldingPosition[];
}

export interface AssumptionSet {
  /** 投资年化回报：保守 / 基准 / 激进。 */
  conservativeReturn: number;
  baselineReturn: number;
  aggressiveReturn: number;
  inflation: number;
  /** 现金/储蓄年化收益。 */
  cashYield: number;
  /**
   * 资本利得税率（应税券商账户卖出未实现收益时的预估税率）。
   * 用于把「能动的钱」按税后实际可操作值计算，默认 0.15。
   */
  capitalGainsTaxRate?: number;
  /** 税后年薪增长率。 */
  salaryGrowth: number;
  /** 应急储备目标金额。 */
  emergencyReserveTarget: number;
  /** 预测年限。 */
  horizonYears: number;
  /** 显示口径：今天购买力 vs 未来名义。 */
  displayMode: DisplayMode;
  /** 剩余现金分配规则。 */
  checkingBuffer: number;
  /** 月结余投入投资的比例 (0~1)，其余留在储蓄。 */
  investRatio: number;
  /**
   * 每月计划存款总额（规划页顶部滑块）。下面各「专款专用」存款桶按百分比从中分配。
   * 缺省时按月结余 / 现有桶分配额估算。
   */
  savingsBudget?: number;
}

/** 带日期的账户余额断言（P1B L2 对账锚点）。 */
export interface BalanceAssertion {
  id: string;
  accountId: string;
  /** 断言在该日「日初」成立（对齐 beancount balance 语义）。 */
  date: string;
  amount: number;
  note?: string;
  /** 若对账时生成了补差交易，回链其 id。 */
  adjustmentTxnId?: string;
  createdAt?: string;
}

/** 资产配置 Hub 自定义目标（存于 user_settings.portfolio_allocation_target）。 */
export interface PortfolioAllocationTarget {
  stockPct?: number;
  etfPct?: number;
  top1MaxPct?: number;
  top3MaxPct?: number;
  driftThresholdPct?: number;
}

export interface FinanceData {
  version: number;
  accounts: Account[];
  holdingsSnapshots: HoldingsSnapshot[];
  cashFlows: CashFlowItem[];
  events: ScenarioEvent[];
  scenarios?: Scenario[];
  activeScenarioId?: string;
  decisionRecords?: DecisionRecord[];
  goals: Goal[];
  assumptions: AssumptionSet;
  /** 资产配置目标；云端同步，离线时回退 localStorage。 */
  portfolioAllocationTarget?: PortfolioAllocationTarget;
  updatedAt: string;
  /** 隐私模式：隐藏金额。 */
  privacy: boolean;
  /** 界面语言（BCP 47）。 */
  locale?: "zh-CN" | "en-US";
  /** 未能自动关联银行流水的商户订单（如 Target RedCard 月结）。 */
  merchantOrderCatalog?: MerchantOrderCatalog;
}

/** @see finance_user_settings.merchant_order_catalog */
export interface MerchantOrderCatalog {
  updatedAt?: string;
  bestbuy?: {
    orders: Array<Record<string, unknown>>;
    syncedAt?: string;
  };
  target?: {
    orders: Array<Record<string, unknown>>;
    syncedAt?: string;
  };
}
