// 历史交易分析引擎 —— 纯函数集合。
// 不再依赖任何静态数据文件：所有函数都接收一个 Txn[]（来自 Supabase 的真实流水），
// 输出月度趋势、类别构成、商户、周期账单、统计与元信息等可用洞察。
//
// 金额符号约定：
//   花销 spending = -budgetImpact（支出为正、退款为负，二者自动相抵为「净花销」）
//   收入 income   = -amount，仅 flow === "income" 的行
// 仅 inSpending 的行计入花销分析；内部转账、信用卡还款、镜像重复等被排除。

import type { PurchaseEnrichment } from "./purchaseEnrichment";

export type FlowType =
  | "expense"
  | "credit_card_payment"
  | "income"
  | "internal_transfer"
  | "zero_activity"
  | "refund_or_reversal"
  | "ignored"
  | "reconcile_adjustment";

/** 解析后的交易记录（与 Supabase transactions 表一一对应）。 */
export interface Txn {
  /** 数据库主键（手动记账/编辑/删除时需要）。导入种子行也带上。 */
  id?: string;
  date: string;
  /** 年月，例如 "2026-05"。 */
  month: string;
  merchant: string;
  category: string;
  account: string;
  flow: FlowType;
  /** 原始签名金额（正=支出/刷卡，负=收入/退款/还款）。 */
  amount: number;
  /** 预算影响：负=花销，正=退款。花销分析用 -budgetImpact。 */
  budgetImpact: number;
  /** 是否计入花销分析。 */
  inSpending: boolean;
  /** 是否计入现金流历史。 */
  inCashFlow: boolean;
  excludeReason?: string;
  /** 来源：导入 vs 手动记账。 */
  source?: "import" | "manual";
  /** 外部购买上下文（如 Amazon 订单明细）。 */
  purchaseEnrichment?: PurchaseEnrichment;
  /**
   * 人工复核结论（FINC.PURCHASE.6.a）：与本行 purchaseEnrichment 的 source+orderId
   * 对应的 purchase_associations 状态。confirmed=已确认正确、rejected=已否决该关联。
   * 由 loadTransactions 装填；决定显示态时优先于自动分类。
   */
  reviewState?: "confirmed" | "rejected";
}

/** 新建一笔时的输入（id/month 由系统补全）。 */
export type NewTxn = Omit<Txn, "id" | "month"> & {
  /** 扩展抓取侧稳定 ID（Rocket Money 等）；有则 DB unique 去重。 */
  platformId?: string;
};


/**
 * 计入「钱花在哪」的行：计入花销分析、且不是资金搬运。
 * 花销总额、月度趋势、分类占比、商户榜都必须用这一个口径，否则同一个页面里
 * 会出现「账本已隐藏取现，但分类图里它仍是最大项」这种自相矛盾。
 */
export function countsAsSpending(t: Txn): boolean {
  return t.inSpending && !isMoneyMovement(t);
}

/** 单笔交易计入花销分析的「净花销额」（支出为正、退款为负）。 */
export function spendingOf(t: Txn): number {
  return countsAsSpending(t) ? -t.budgetImpact : 0;
}

/**
 * 当天/当期真正花出去的钱：只算支出本身，不把退款冲抵进来。
 *
 * 「这个月花了多少」（净额，spendingOf）和「哪天花了钱」是两个问题。后者要的是
 * 流出本身：一笔 7/1 买、7/3 退的消费，7/1 确实花了钱，7/3 并没有「花掉负数」。
 * 把退款混进来还会让单笔异常主导整张图——实测某天一笔 $6,645 的进账被误分类成
 * refund_or_reversal，直接把当月「花销」翻成负数，而真实消费是每天 $10–$558。
 */
export function outflowOf(t: Txn): number {
  return t.flow === "expense" && countsAsSpending(t) ? -t.budgetImpact : 0;
}

/**
 * 聚合器给取现/支票的分类。取现被导入成 flow=expense，于是计入花销分析——
 * 但它只是把钱从账户挪成现金，去向不明，且很大一部分最终用于信用卡还款
 * （已另行计入）。留在「花在哪」里会盖过真实消费：实测某月一笔 $2,451 取现
 * 同时霸占了最大分类（占 73%）和商户榜首，而真实消费是 Bills $189 / Shopping $182。
 */
const CASH_MOVEMENT_CATEGORIES = new Set(["Cash & Checks"]);

/**
 * 资金搬运：钱在自己的账户之间移动或变成现金，不是花销。
 * 内部转账、信用卡还款、取现/支票，以及为对账保留、已被排除出分析的镜像重复行。
 *
 * 注意与 `spendingOnly`（= !inSpending）的区别：收入的 inSpending 同样是 false，
 * 但收入不是资金搬运。想回答「钱花在哪」时要滤掉的是这里定义的搬运行，
 * 用 spendingOnly 会连收入一起藏掉。
 */
export function isMoneyMovement(t: Txn): boolean {
  if (t.flow === "internal_transfer" || t.flow === "credit_card_payment") return true;
  if (CASH_MOVEMENT_CATEGORIES.has(t.category)) return true;
  return !t.inSpending && t.flow !== "income" && Boolean(t.excludeReason);
}

/**
 * 单笔交易的收入额（仅 income 行，正数）。
 * 约定为 amount 负=收入，但历史导入可能保留银行原始符号（正=入账），
 * 因此这里做符号容错：income 行一律取绝对值。
 */
export function incomeOf(t: Txn): number {
  return t.flow === "income" ? Math.abs(t.amount) : 0;
}

export interface TxnMeta {
  rowCount: number;
  dateRange: { start: string; end: string };
  /** 数据截止日（= 最新一笔交易日期）。 */
  asOf: string;
  currency: string;
}

/** 从流水推导元信息（替代原静态文件里的 meta）。 */
export function computeMeta(txns: Txn[], currency = "USD"): TxnMeta {
  if (txns.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { rowCount: 0, dateRange: { start: today, end: today }, asOf: today, currency };
  }
  let start = txns[0].date;
  let end = txns[0].date;
  for (const t of txns) {
    if (t.date < start) start = t.date;
    if (t.date > end) end = t.date;
  }
  return { rowCount: txns.length, dateRange: { start, end }, asOf: end, currency };
}

export interface TxnStatistics {
  totalRows: number;
  spendingRows: number;
  incomeRows: number;
  creditCardPaymentRows: number;
  internalTransferRows: number;
  refundRows: number;
  /** 被排除出花销分析但仍保留用于现金流对账的行数。 */
  mirrorDuplicateRowsExcludedFromAnalytics: number;
}

/** 从流水推导统计（替代原静态文件里的 statistics）。 */
export function computeStatistics(txns: Txn[]): TxnStatistics {
  const s: TxnStatistics = {
    totalRows: txns.length,
    spendingRows: 0,
    incomeRows: 0,
    creditCardPaymentRows: 0,
    internalTransferRows: 0,
    refundRows: 0,
    mirrorDuplicateRowsExcludedFromAnalytics: 0,
  };
  for (const t of txns) {
    if (t.inSpending) s.spendingRows += 1;
    if (t.flow === "income") s.incomeRows += 1;
    if (t.flow === "credit_card_payment") s.creditCardPaymentRows += 1;
    if (t.flow === "internal_transfer") s.internalTransferRows += 1;
    if (t.flow === "refund_or_reversal") s.refundRows += 1;
    if (!t.inSpending && t.flow !== "income" && t.excludeReason) {
      s.mirrorDuplicateRowsExcludedFromAnalytics += 1;
    }
  }
  return s;
}

export interface MonthPoint {
  /** Bucket label. A month ("2026-07") from monthlySeries, a day ("2026-07-09")
   *  from dailySeries — the chart only uses it as an x-axis key. */
  month: string;
  income: number;
  spending: number;
  net: number;
  count: number;
}

/** 月度收入/花销/净额时间序列（按月份升序）。 */
/**
 * 按天聚合 [from, to]（含端点，YYYY-MM-DD）。
 *
 * 「本月」用月粒度只会得到一个点——一根柱子画不出趋势，也看不出钱花在哪几天。
 *
 * spending 用 outflowOf 而非 spendingOf：这张图回答的是「哪天花了钱」，退款和
 * 工资不是花销，混进来只会让异常值主导（见 outflowOf 注释）。
 *
 * 没有交易的日子补 0 而不是跳过：图表按索引等距排 x 轴，缺日会把 7-01 和 7-09
 * 画成相邻两点，让间隔失真、看起来像天天在花钱。
 */
export function dailySeries(
  txns: Txn[],
  opts: { from: string; to: string },
): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (
    let d = new Date(`${opts.from}T12:00:00`);
    d.toISOString().slice(0, 10) <= opts.to;
    d.setDate(d.getDate() + 1)
  ) {
    const day = d.toISOString().slice(0, 10);
    map.set(day, { month: day, income: 0, spending: 0, net: 0, count: 0 });
  }

  for (const t of txns) {
    if (t.date < opts.from || t.date > opts.to) continue;
    const p = map.get(t.date);
    if (!p) continue;
    const out = outflowOf(t);
    if (out > 0) {
      p.spending += out;
      p.count += 1;
    }
    p.income += incomeOf(t);
  }

  const out = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const p of out) {
    p.income = round2(p.income);
    p.spending = round2(p.spending);
    p.net = round2(p.income - p.spending);
  }
  return out;
}

export function monthlySeries(txns: Txn[]): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (const t of txns) {
    let p = map.get(t.month);
    if (!p) {
      p = { month: t.month, income: 0, spending: 0, net: 0, count: 0 };
      map.set(t.month, p);
    }
    const s = spendingOf(t);
    if (countsAsSpending(t)) {
      p.spending += s;
      p.count += 1;
    }
    p.income += incomeOf(t);
  }
  const out = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const p of out) {
    p.income = round2(p.income);
    p.spending = round2(p.spending);
    p.net = round2(p.income - p.spending);
  }
  return out;
}

export interface CategorySlice {
  category: string;
  amount: number;
  count: number;
  pct: number;
}

/** 类别花销构成（净花销，降序）。可选时间窗 [from, to]（含），格式 "YYYY-MM-DD"。 */
export function categoryBreakdown(
  txns: Txn[],
  opts: { from?: string; to?: string } = {}
): CategorySlice[] {
  const map = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const t of txns) {
    if (!countsAsSpending(t)) continue;
    if (opts.from && t.date < opts.from) continue;
    if (opts.to && t.date > opts.to) continue;
    const s = spendingOf(t);
    const cur = map.get(t.category) ?? { amount: 0, count: 0 };
    cur.amount += s;
    cur.count += 1;
    map.set(t.category, cur);
    total += s;
  }
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      amount: round2(v.amount),
      count: v.count,
      pct: total !== 0 ? v.amount / total : 0,
    }))
    .filter((s) => s.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface MerchantSlice {
  merchant: string;
  amount: number;
  count: number;
}

/** 花销最高的商户。 */
export function topMerchants(
  txns: Txn[],
  opts: { from?: string; to?: string; limit?: number } = {}
): MerchantSlice[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const t of txns) {
    if (!countsAsSpending(t)) continue;
    if (opts.from && t.date < opts.from) continue;
    if (opts.to && t.date > opts.to) continue;
    const cur = map.get(t.merchant) ?? { amount: 0, count: 0 };
    cur.amount += spendingOf(t);
    cur.count += 1;
    map.set(t.merchant, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, amount: round2(v.amount), count: v.count }))
    .filter((m) => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, opts.limit ?? 12);
}

export interface SpendingSummary {
  trailing12mSpending: number;
  trailing12mIncome: number;
  avgMonthlySpending: number;
  avgMonthlyIncome: number;
  /** 用于均值的完整月份数。 */
  monthsCounted: number;
  latestMonth: MonthPoint | null;
  /** 最近 12 个完整月里花销最高/最低月。 */
  highestMonth: MonthPoint | null;
  lowestMonth: MonthPoint | null;
}

/**
 * 近 12 个月花销基线汇总。
 * 排除「当前不完整月」(数据 asOf 所在月)，仅用其之前的 12 个完整月，
 * 这样均值不会被尚未走完的当月拉低。
 */
export interface RangeSummary {
  /** 区间内花出去的钱（outflowOf，不被退款/进账冲抵）。 */
  spending: number;
  /** 区间内到账收入。 */
  income: number;
  /** 区间天数（含端点）。 */
  days: number;
  /** 日均花销。 */
  avgPerDay: number;
  /** 花得最多的一天。 */
  peakDay: { date: string; spending: number } | null;
  /** 区间内有花销的天数。 */
  activeDays: number;
}

/**
 * 区间统计。KPI 卡原本写死 trailing 12 个完整月（spendingSummary），
 * 和顶部的范围控件直接矛盾：选「本月」时，上面写着「近 12 月平均」。
 *
 * from 省略 = 不限起点（「全部」）。
 */
export function rangeSummary(
  txns: Txn[],
  opts: { from?: string; to: string } = { to: "9999-12-31" },
): RangeSummary {
  const byDay = new Map<string, number>();
  let spending = 0;
  let income = 0;
  let earliest = opts.to;

  for (const t of txns) {
    if (opts.from && t.date < opts.from) continue;
    if (t.date > opts.to) continue;
    if (t.date < earliest) earliest = t.date;
    const out = outflowOf(t);
    if (out > 0) {
      spending += out;
      byDay.set(t.date, (byDay.get(t.date) ?? 0) + out);
    }
    income += incomeOf(t);
  }

  const from = opts.from ?? earliest;
  const days =
    Math.max(
      1,
      Math.round(
        (Date.parse(`${opts.to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) /
          86_400_000,
      ) + 1,
    );

  let peakDay: RangeSummary["peakDay"] = null;
  for (const [date, amount] of byDay) {
    if (!peakDay || amount > peakDay.spending) peakDay = { date, spending: round2(amount) };
  }

  return {
    spending: round2(spending),
    income: round2(income),
    days,
    avgPerDay: round2(spending / days),
    peakDay,
    activeDays: byDay.size,
  };
}

export function spendingSummary(series: MonthPoint[]): SpendingSummary {
  if (series.length === 0) {
    return {
      trailing12mSpending: 0,
      trailing12mIncome: 0,
      avgMonthlySpending: 0,
      avgMonthlyIncome: 0,
      monthsCounted: 0,
      latestMonth: null,
      highestMonth: null,
      lowestMonth: null,
    };
  }
  // asOf 月 = 序列里最新的月份（含不完整的当月）。
  const asOfMonth = series[series.length - 1].month;
  const complete = series.filter((p) => p.month < asOfMonth);
  const window = complete.slice(-12);
  const counted = window.length || series.length;
  const used = window.length ? window : series;
  const trailingSpend = used.reduce((a, p) => a + p.spending, 0);
  const trailingIncome = used.reduce((a, p) => a + p.income, 0);
  const sorted = [...used].sort((a, b) => a.spending - b.spending);
  return {
    trailing12mSpending: round2(trailingSpend),
    trailing12mIncome: round2(trailingIncome),
    avgMonthlySpending: round2(trailingSpend / counted),
    avgMonthlyIncome: round2(trailingIncome / counted),
    monthsCounted: counted,
    latestMonth: series[series.length - 1] ?? null,
    highestMonth: sorted[sorted.length - 1] ?? null,
    lowestMonth: sorted[0] ?? null,
  };
}

export interface RecurringCandidate {
  merchant: string;
  distinctMonths: number;
  transactionCount: number;
  averageAmount: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * 客户端推导「疑似周期性账单 / 订阅」：在多个不同月份反复出现的同一商户花销。
 * 替代原离线预计算的 recurringCandidates。
 */
export function computeRecurring(
  txns: Txn[],
  opts: { minMonths?: number; limit?: number } = {}
): RecurringCandidate[] {
  const minMonths = opts.minMonths ?? 3;
  const map = new Map<
    string,
    { months: Set<string>; count: number; total: number; first: string; last: string }
  >();
  for (const t of txns) {
    if (!t.inSpending) continue;
    const amt = spendingOf(t);
    if (amt <= 0) continue;
    let agg = map.get(t.merchant);
    if (!agg) {
      agg = { months: new Set(), count: 0, total: 0, first: t.date, last: t.date };
      map.set(t.merchant, agg);
    }
    agg.months.add(t.month);
    agg.count += 1;
    agg.total += amt;
    if (t.date < agg.first) agg.first = t.date;
    if (t.date > agg.last) agg.last = t.date;
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({
      merchant,
      distinctMonths: v.months.size,
      transactionCount: v.count,
      averageAmount: round2(v.total / v.count),
      firstSeen: v.first,
      lastSeen: v.last,
    }))
    .filter((r) => r.distinctMonths >= minMonths)
    .sort((a, b) => b.distinctMonths - a.distinctMonths || b.averageAmount - a.averageAmount)
    .slice(0, opts.limit ?? 24);
}

/** 出现过的去重类别（升序），用于筛选下拉。 */
export function categoriesOf(txns: Txn[]): string[] {
  return [...new Set(txns.map((t) => t.category))].filter(Boolean).sort();
}

/** 出现过的去重账户名（按字母），用于筛选下拉。 */
export function accountNamesOf(txns: Txn[]): string[] {
  return [...new Set(txns.map((t) => t.account))].filter(Boolean).sort();
}

export interface LedgerQuery {
  search?: string;
  category?: string;
  account?: string;
  flow?: FlowType | "all";
  /** 仅显示计入花销分析的行。注意这会同时藏掉收入。 */
  spendingOnly?: boolean;
  /** 滤掉内部转账 / 信用卡还款 / 镜像重复；保留收入与花销。 */
  hideMoneyMovement?: boolean;
  from?: string;
  to?: string;
}

/** 流水检索（用于可搜索账本）。txns 应已按日期倒序。 */
export function searchTxns(txns: Txn[], q: LedgerQuery): Txn[] {
  const needle = q.search?.trim().toLowerCase();
  return txns.filter((t) => {
    if (q.spendingOnly && !t.inSpending) return false;
    // 显式按 flow 查询时不过滤：用户主动选「内部转账」就该看到内部转账。
    if (q.hideMoneyMovement && (!q.flow || q.flow === "all") && isMoneyMovement(t))
      return false;
    if (q.category && t.category !== q.category) return false;
    if (q.account && t.account !== q.account) return false;
    if (q.flow && q.flow !== "all" && t.flow !== q.flow) return false;
    if (q.from && t.date < q.from) return false;
    if (q.to && t.date > q.to) return false;
    if (needle) {
      const itemHay = (t.purchaseEnrichment?.lineItems ?? [])
        .map((li) => li.title)
        .join(" ");
      const enrichHay = [
        t.purchaseEnrichment?.orderId,
        t.purchaseEnrichment?.status,
        itemHay,
      ]
        .filter(Boolean)
        .join(" ");
      const hay = `${t.merchant} ${t.category} ${enrichHay}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
