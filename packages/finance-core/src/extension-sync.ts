// Chrome 扩展同步桥 —— 协议类型 + 纯转换函数。
// 扩展 (extension/) 在 Robinhood / RocketMoney / Fidelity 页面抓取 DOM，
// 通过 content script 以 window.postMessage 把 CaptureEnvelope 推给本 app；
// 本模块负责把 capture 转换成 app 已有的数据模型（持仓快照 / 账户余额 / 交易流水）。
// 所有函数均为纯函数，便于单测；实际落库由 ExtensionSyncBridge 组件调用 store 完成。

import type { Account, CashFlowItem, HoldingsSnapshot } from './types.js'
import type { Txn } from './engine/transactions.js'
import type { NewTxn } from './engine/transactions.js'
import {
  parseHoldingsSnapshotObject,
  type RawSnapshotFile,
} from './engine/holdings.js'
import {
  deriveTodayReturnAmount,
  deriveTotalReturnAmount,
} from './engine/holdingsEnrich.js'
import {
  resolveCaptureAccount,
  resolveCaptureMerchant,
} from './engine/ledgerDisplay.js'

// ===================== 消息协议 =====================

/** window.postMessage 消息类型（app 页面 ↔ 扩展 content script）。 */
export const BRIDGE_MSG = {
  /** app → 扩展：页面就绪，请求未同步的 captures。 */
  hello: 'FOS_BRIDGE_HELLO',
  /** 扩展 → app：请求当前账本快照（供抓取前去重 / 定水位线）。 */
  requestSnapshot: 'FOS_BRIDGE_REQUEST_SNAPSHOT',
  /** app → 扩展：账本快照（账户 / 交易键 / 订阅 / 持仓摘要）。 */
  snapshot: 'FOS_BRIDGE_SNAPSHOT',
  /** 扩展 → app：投递 captures（数组）。 */
  captures: 'FOS_BRIDGE_CAPTURES',
  /** app → 扩展：某个 capture 已处理完成。 */
  ack: 'FOS_BRIDGE_ACK',
  /** app → 扩展：React 桥已就绪，可投递 captures。 */
  ready: 'FOS_BRIDGE_READY',
  /** app → 扩展：一批 capture 处理结果摘要（供 popup 展示）。 */
  syncResult: 'FOS_BRIDGE_SYNC_RESULT',
} as const

/** 扩展 popup 可展示的同步结果摘要。 */
export interface BridgeSyncResult {
  ok: boolean
  processed: number
  failed: number
  pending: number
  summaries: string[]
  /** 应用侧处理失败、未 ACK 的 envelope id（扩展据此释放 in-flight） */
  failedEnvelopeIds?: string[]
}

export type CaptureSource = 'robinhood' | 'rocketmoney' | 'fidelity'
export type CaptureKind = 'holdings' | 'accounts' | 'transactions' | 'recurring'

export interface CapturedPosition {
  ticker: string
  securityName?: string
  shares: number
  price: number
  todayPct?: number
  todayReturnAmount?: number
  totalReturnAmount?: number
  /** 有些平台（Fidelity）直接给市值；缺省用 shares*price。 */
  marketValue?: number
  averageCostPerShare?: number
}

export interface HoldingsCaptureData {
  institution: string
  accountLabel: string
  /** 页面显示的账户总值（含现金），用于余额更新；持仓市值单独累加。 */
  totalValue?: number
  positions: CapturedPosition[]
}

export interface CapturedAccountRow {
  name: string
  balance: number
  /** 平台给的类型提示，如 "checking" / "savings" / "credit" / "retirement" / "hsa" / "brokerage"。 */
  kindHint?: string
  /** 账户所在机构（RocketMoney Net Worth / Fidelity 账户列表提供），辅助匹配。 */
  institution?: string
  /** true = 页面只给 3 位有效数字（如 RocketMoney Net Worth 的 "$57.7k"），更新时放宽容差。 */
  approximate?: boolean
}

export interface AccountsCaptureData {
  accounts: CapturedAccountRow[]
}

export interface CapturedRecurringRow {
  name: string
  /** 页面显示的频率文本："Monthly" / "Irregular" / "Yearly" 等。 */
  frequency: string
  /** 分区名："Subscriptions" / "Bills & Utilities" / "Other"。 */
  group: string
  amount: number
  /** 扣款账户尾号（"••3838"）。 */
  account?: string
  /** 下次扣款日 ISO（从 "in 24 days" 推算，尽力而为）。 */
  nextDate?: string
  platformId?: string
}

export interface RecurringCaptureData {
  rows: CapturedRecurringRow[]
}

export interface CapturedTxnRow {
  /** ISO 日期（扩展侧已完成年份推断）。 */
  date: string
  merchant: string
  category: string
  /** 显示金额绝对值。 */
  amount: number
  /** true = 页面显示 "+$xx"（入账/退款）。 */
  credit: boolean
  pending: boolean
  statement?: string
  /** 付款账户（如 Chase ••4242）；来自 Rocket Money 交易行，不是数据源名称。 */
  account?: string
  /** 平台侧稳定 ID（如 RocketMoney base64 transaction id），用于 capture 内去重。 */
  platformId?: string
}

export interface TransactionsCaptureData {
  rows: CapturedTxnRow[]
  /** true = 爬取从最新无空洞收集到 watermark/底部（扩展 background 据此推进水位线，app 不用）。 */
  complete?: boolean
}

export interface CaptureEnvelope {
  v: 1
  /** 扩展生成的唯一 id，app 用它做幂等 + ACK。 */
  id: string
  source: CaptureSource
  kind: CaptureKind
  capturedAt: string
  asOfDate: string
  asOfTimeLocal?: string
  timezone?: string
  pageUrl?: string
  data:
    | HoldingsCaptureData
    | AccountsCaptureData
    | TransactionsCaptureData
    | RecurringCaptureData
}

/** 应用一个 capture 后的执行报告（用于 UI toast 与调试）。 */
export interface SyncReport {
  envelopeId: string
  source: CaptureSource
  kind: CaptureKind
  summary: string
  notes: string[]
  syncedAt?: string
}

// ===================== 扩展抓取计划（app → 扩展快照） =====================

/** financeOS 导出给扩展的账本摘要，用于抓取前去重与定水位线。 */
export interface AppSnapshotAccount {
  id: string
  name: string
  type: Account['type']
  balance: number
  balanceManual?: boolean
}

export interface AppSnapshotCashFlow {
  name: string
  type: CashFlowItem['type']
  frequency: CashFlowItem['frequency']
  amount: number
}

export interface AppSnapshotHoldings {
  /** 快照 id，如 hs_ext_robinhood_2026-07-02 */
  id: string
  asOfDate: string
  accountLabel: string
  tickers: string[]
  positionCount: number
}

export interface AppSnapshot {
  v: 1
  exportedAt: string
  /** true 表示隐私模式下只导出最小同步元数据，不含金额/商户/持仓明细。 */
  privacyRedacted?: boolean
  accounts: AppSnapshotAccount[]
  /** planNewTransactions 同款去重键（date|merchant|amount），最近 N 笔。 */
  txnKeys: string[]
  txnCount: number
  txnOldestDate?: string
  txnNewestDate?: string
  /** 快速增量抓取停点：滚到最新交易日前的 buffer 即可，避免每次扫完整个历史。 */
  txnFastStopBefore?: string
  /** 滚动收集交易时，滚到该日期之前可停（含 buffer，扩展侧直接用）。 */
  txnScrollStopBefore?: string
  /**
   * 一次性回读请求：app 侧发现历史里有连续多天完全没有记录的缺口时带上，
   * 让扩展下一次抓取把停点放宽到 from 之前，把这段补回来。app 侧负责
   * 「只请求一次」的记账；扩展只管照做。
   */
  txnBackfill?: { from: string; to: string }
  cashFlows: AppSnapshotCashFlow[]
  holdings: AppSnapshotHoldings[]
}

const SNAPSHOT_TXN_KEY_MAX = 4000
const SCROLL_BUFFER_DAYS = 3

/** 与 planNewTransactions 一致的去重键（导出供扩展侧 JS 复用同一算法）。 */
export function txnDedupKey(
  date: string,
  merchant: string,
  amount: number,
): string {
  return `${date}|${normalize(merchant)}|${amount.toFixed(2)}`
}

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 从 app store 构建扩展抓取计划快照。
 * 扩展用它决定：交易滚到哪停、哪些行不必再抓、哪些账户余额已一致。
 */
export function buildAppSnapshot(
  accounts: Account[],
  txns: Txn[],
  cashFlows: CashFlowItem[],
  holdingsSnapshots: HoldingsSnapshot[],
  options: { privacy?: boolean; txnBackfill?: { from: string; to: string } | null } = {},
): AppSnapshot {
  const sorted = [...txns].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  const recent = sorted.slice(-SNAPSHOT_TXN_KEY_MAX)
  const txnKeys = options.privacy
    ? []
    : recent.map((t) => txnDedupKey(t.date, t.merchant, t.amount))
  const txnOldestDate = sorted[0]?.date
  const txnNewestDate = sorted[sorted.length - 1]?.date
  const txnFastStopBefore = txnNewestDate
    ? isoMinusDays(txnNewestDate, SCROLL_BUFFER_DAYS)
    : undefined
  const txnScrollStopBefore = txnOldestDate
    ? isoMinusDays(txnOldestDate, SCROLL_BUFFER_DAYS)
    : undefined

  return {
    v: 1,
    exportedAt: new Date().toISOString(),
    privacyRedacted: options.privacy ? true : undefined,
    accounts: options.privacy
      ? []
      : accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          balanceManual: a.balanceManual,
        })),
    txnKeys,
    txnCount: txns.length,
    txnOldestDate,
    txnNewestDate,
    txnFastStopBefore,
    txnScrollStopBefore,
    txnBackfill: options.txnBackfill ?? undefined,
    cashFlows: options.privacy
      ? []
      : cashFlows.map((c) => ({
          name: c.name,
          type: c.type,
          frequency: c.frequency,
          amount: c.amount,
        })),
    holdings: options.privacy
      ? []
      : holdingsSnapshots
          .slice()
          .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : -1))
          .slice(0, 12)
          .map((s) => ({
            id: s.id,
            asOfDate: s.asOfDate,
            accountLabel: s.accountLabel,
            tickers: s.positions.map((p) => p.ticker),
            positionCount: s.positionCount,
          })),
  }
}

export function isAppSnapshot(v: unknown): v is AppSnapshot {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Partial<AppSnapshot>
  return (
    s.v === 1 && typeof s.exportedAt === 'string' && Array.isArray(s.accounts)
  )
}

/**
 * 合并扩展本地水位线与 app 快照，默认取更晚的增量停止日期。
 * 旧的 txnScrollStopBefore 仍保留为深度兜底，但日常抓取不应每次扫完整个账本历史。
 */
export function resolveTxnScrollStopBefore(
  snapshot: AppSnapshot | null | undefined,
  extensionWatermark: string | undefined,
  bufferDays = SCROLL_BUFFER_DAYS,
): string | undefined {
  const stops: string[] = []
  if (extensionWatermark)
    stops.push(isoMinusDays(extensionWatermark, bufferDays))
  if (snapshot?.txnFastStopBefore) stops.push(snapshot.txnFastStopBefore)
  else if (snapshot?.txnNewestDate)
    stops.push(isoMinusDays(snapshot.txnNewestDate, bufferDays))
  else if (snapshot?.txnScrollStopBefore)
    stops.push(snapshot.txnScrollStopBefore)
  const normal = stops.length === 0 ? undefined : stops.sort()[stops.length - 1]
  // 回读请求要求这一次滚过缺口起点，水位线在这里不作数——它记录的是
  // 「新数据同步到哪」，回答不了「历史里缺了哪一段」。
  if (snapshot?.txnBackfill?.from) {
    const backfillStop = isoMinusDays(snapshot.txnBackfill.from, bufferDays)
    if (!normal || backfillStop < normal) return backfillStop
  }
  return normal
}

/** 扩展侧预过滤：去掉 app 里已有的交易行（与 planNewTransactions 同键）。 */
export function filterNewCaptureTxnRows(
  rows: CapturedTxnRow[],
  snapshot: AppSnapshot | null | undefined,
  source: CaptureSource,
): { rows: CapturedTxnRow[]; skippedDuplicate: number } {
  if (!snapshot?.txnKeys?.length) return { rows, skippedDuplicate: 0 }
  const remaining = new Map<string, number>()
  for (const k of snapshot.txnKeys) {
    remaining.set(k, (remaining.get(k) ?? 0) + 1)
  }
  const out: CapturedTxnRow[] = []
  let skippedDuplicate = 0
  for (const row of rows) {
    if (row.pending) {
      out.push(row)
      continue
    }
    const txn = captureRowToTxn(row, source)
    const key = txnDedupKey(txn.date, txn.merchant, txn.amount)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      skippedDuplicate += 1
      continue
    }
    out.push(row)
  }
  return { rows: out, skippedDuplicate }
}

/** 扩展侧：订阅行是否已在 app 中对账完毕（名称+频率+金额一致）。 */
export function recurringRowAlreadyInApp(
  row: CapturedRecurringRow,
  snapshot: AppSnapshot | null | undefined,
): boolean {
  if (!snapshot?.cashFlows?.length) return false
  const expenses = snapshot.cashFlows.filter((c) => c.type === 'expense')
  const freq = captureFrequency(row.frequency)
  if (!freq) return false
  const matched = expenses.filter((c) => nameMatches(c.name, row.name))
  if (matched.length !== 1) return false
  const target = matched[0]
  return target.frequency === freq && Math.abs(target.amount - row.amount) < 0.5
}

/** 扩展侧：账户余额 capture 行相对 app 是否无需更新（含近似值容差）。 */
export function accountRowUnchangedInApp(
  row: CapturedAccountRow,
  snapshot: AppSnapshot | null | undefined,
): boolean {
  if (!snapshot?.accounts?.length) return false
  const target = snapshot.accounts.find(
    (a) =>
      nameMatches(a.name, row.name) ||
      (row.institution && nameMatches(a.name, row.institution)),
  )
  if (!target || target.balanceManual) return false
  const next = Math.abs(row.balance)
  const epsilon = row.approximate
    ? Math.max(BALANCE_EPSILON, next * 0.006)
    : BALANCE_EPSILON
  return Math.abs(target.balance - next) < epsilon
}

// ===================== 持仓快照 =====================

/** 常见 ETF ticker 集合（DOM 上拿不到资产类型时的启发式判断）。 */
const KNOWN_ETFS = new Set([
  'VOO',
  'VTI',
  'SPY',
  'QQQ',
  'IVV',
  'VUG',
  'SCHD',
  'VYM',
  'VXUS',
  'BND',
  'AGG',
  'DIA',
  'IWM',
  'SMH',
  'SOXX',
  'VGT',
  'XLK',
  'VEA',
  'VWO',
  'GLD',
  'IAU',
  'VNQ',
  'SCHB',
  'SPLG',
  'QQQM',
  'FXAIX',
])

export function guessAssetType(ticker: string): 'stock' | 'etf' {
  return KNOWN_ETFS.has(ticker.toUpperCase()) ? 'etf' : 'stock'
}

function capturedPositionScore(p: CapturedPosition): number {
  let score = 0
  if (p.averageCostPerShare != null) score += 4
  if (p.totalReturnAmount != null) score += 2
  if (p.todayReturnAmount != null) score += 2
  if (p.todayPct != null) score += 1
  if (p.marketValue != null) score += 1
  return score
}

function mergeCapturedPosition(
  a: CapturedPosition,
  b: CapturedPosition,
): CapturedPosition {
  const primary = capturedPositionScore(b) > capturedPositionScore(a) ? b : a
  const secondary = primary === a ? b : a
  return {
    ticker: primary.ticker,
    securityName: primary.securityName ?? secondary.securityName,
    shares: primary.shares > 0 ? primary.shares : secondary.shares,
    price: primary.price > 0 ? primary.price : secondary.price,
    todayPct: primary.todayPct ?? secondary.todayPct,
    todayReturnAmount: primary.todayReturnAmount ?? secondary.todayReturnAmount,
    totalReturnAmount: primary.totalReturnAmount ?? secondary.totalReturnAmount,
    marketValue: primary.marketValue ?? secondary.marketValue,
    averageCostPerShare:
      primary.averageCostPerShare ?? secondary.averageCostPerShare,
  }
}

/** 扩展抓取同 ticker 重复行合并（Robinhood 双 DOM 等）。 */
export function dedupeCapturedPositions(
  positions: CapturedPosition[],
): CapturedPosition[] {
  const byTicker = new Map<string, CapturedPosition>()
  for (const position of positions) {
    const key = position.ticker.trim().toUpperCase()
    if (!key) continue
    const prev = byTicker.get(key)
    byTicker.set(key, prev ? mergeCapturedPosition(prev, position) : position)
  }
  return [...byTicker.values()]
}

function enrichCapturedPosition(p: CapturedPosition): CapturedPosition {
  const marketValue = p.marketValue ?? round2(p.shares * p.price)
  const todayReturnAmount =
    p.todayReturnAmount ?? deriveTodayReturnAmount(marketValue, p.todayPct)
  const totalReturnAmount =
    p.totalReturnAmount ??
    deriveTotalReturnAmount({
      shares: p.shares,
      marketPrice: p.price,
      averageCostPerShare: p.averageCostPerShare,
    })
  return {
    ...p,
    marketValue,
    todayReturnAmount,
    totalReturnAmount,
  }
}

/**
 * 把持仓 capture 转成 app 的 HoldingsSnapshot。
 * 快照 id 按「来源 + 日期」稳定生成：同一天重复同步会覆盖当日快照而不是堆积重复记录。
 */
export function holdingsCaptureToSnapshot(
  env: CaptureEnvelope,
  accounts: Account[],
): { snapshot: HoldingsSnapshot; warnings: string[] } {
  const data = env.data as HoldingsCaptureData
  const holdings = dedupeCapturedPositions(data.positions).map((p) => {
    const enriched = enrichCapturedPosition(p)
    const marketValue =
      enriched.marketValue ?? round2(enriched.shares * enriched.price)
    const assetType = guessAssetType(enriched.ticker)
    const impliedCostBasis =
      enriched.averageCostPerShare != null
        ? round2(enriched.averageCostPerShare * enriched.shares)
        : undefined
    return {
      ticker: enriched.ticker,
      securityName: enriched.securityName ?? enriched.ticker,
      assetType,
      shares: enriched.shares,
      marketPrice: enriched.price,
      marketValue,
      averageCostPerShare: enriched.averageCostPerShare,
      impliedCostBasis,
      todayReturnPct: enriched.todayPct,
      todayReturnAmount: enriched.todayReturnAmount,
      totalReturnAmount: enriched.totalReturnAmount,
      sourceCapturedAt:
        `${env.asOfDate} ${env.asOfTimeLocal ?? ''} ${env.timezone ?? ''}`.trim(),
    }
  })
  const totalMarketValue = round2(
    holdings.reduce((acc, h) => acc + h.marketValue, 0),
  )
  const weighted = holdings.map((h) => ({
    ...h,
    calculatedPortfolioWeightPct:
      totalMarketValue > 0
        ? round2((h.marketValue / totalMarketValue) * 100)
        : undefined,
  }))
  const raw: RawSnapshotFile = {
    importType: 'holdings_snapshot',
    asOfDate: env.asOfDate,
    asOfTimeLocal: env.asOfTimeLocal,
    timezone: env.timezone,
    source: {
      type: 'chrome_extension_dom_capture',
      description: `Finance OS Sync 扩展从 ${data.institution} 页面自动抓取`,
    },
    accountMapping: {
      institution: data.institution,
      accountLabel: data.accountLabel,
      needsUserConfirmation: false,
    },
    holdings: weighted,
    derivedSummary: {
      positionCount: weighted.length,
      stockCount: weighted.filter((h) => h.assetType === 'stock').length,
      etfCount: weighted.filter((h) => h.assetType === 'etf').length,
      holdingsMarketValue: totalMarketValue,
    },
    reconciliation: {
      accountTotalProvidedInThisScreenshotSet: data.totalValue != null,
    },
  }
  const parsed = parseHoldingsSnapshotObject(raw, accounts)
  // 稳定 id：同源同日覆盖，避免高频同步堆积快照。
  parsed.snapshot.id = `hs_ext_${env.source}_${env.asOfDate}`
  return { snapshot: parsed.snapshot, warnings: parsed.warnings }
}

// ===================== 账户余额更新 =====================

const BALANCE_EPSILON = 0.5

export interface BalancePlan {
  updates: Account[]
  notes: string[]
}

/** Robinhood 持仓 capture 附带的账户总值 → 更新对应 brokerage 账户余额。 */
export function planHoldingsBalanceUpdate(
  env: CaptureEnvelope,
  accounts: Account[],
): BalancePlan {
  const data = env.data as HoldingsCaptureData
  const notes: string[] = []
  if (data.totalValue == null) return { updates: [], notes }
  // Fidelity 的 Portfolio 页在「All accounts」视图下 totalValue 是 401k+HSA+券商 的聚合值，
  // 写给任何单个账户都是错的；Fidelity 的余额由 accounts capture（逐账户全精度）负责。
  if (env.source === 'fidelity') return { updates: [], notes }
  const pattern = new RegExp(escapeRegExp(data.institution), 'i')
  const matches = accounts.filter(
    (a) => a.type === 'brokerage' && pattern.test(a.name),
  )
  if (matches.length !== 1) {
    notes.push(
      `未能唯一匹配 ${data.institution} 的券商账户（找到 ${matches.length} 个），跳过余额更新。`,
    )
    return { updates: [], notes }
  }
  return planOneBalance(
    matches[0],
    data.totalValue,
    notes,
    false,
    env.capturedAt,
  )
}

/** RocketMoney dashboard 的分组余额（Checking/Savings/Card Balance）→ 唯一匹配时更新。 */
export function planAccountsBalanceUpdate(
  env: CaptureEnvelope,
  accounts: Account[],
): BalancePlan {
  const data = env.data as AccountsCaptureData
  const updates: Account[] = []
  const notes: string[] = []
  const seen = new Set<string>()
  for (const row of data.accounts) {
    const target = matchAccountRow(row, accounts, notes)
    if (!target) continue
    // 同一个 capture 里两行映射到同一账户（如两行都叫 "Ultimate Rewards®"）：
    // 匹配歧义，先到先得并提示，避免后一行悄悄覆盖前一行。
    if (seen.has(target.id)) {
      notes.push(
        `「${row.name}」与前面某行匹配到同一账户「${target.name}」，跳过。`,
      )
      continue
    }
    seen.add(target.id)
    const plan = planOneBalance(
      target,
      row.balance,
      notes,
      row.approximate,
      env.capturedAt,
    )
    updates.push(...plan.updates)
  }
  return { updates, notes }
}

function matchAccountRow(
  row: CapturedAccountRow,
  accounts: Account[],
  notes: string[],
): Account | null {
  // 1) 名称直接匹配（Fidelity 账户列表 / RocketMoney Net Worth 的单个账户）。
  const byName = accounts.filter((a) => nameMatches(a.name, row.name))
  if (byName.length === 1) return byName[0]
  // 1b) 多个命中且带机构信息：用机构名收窄（如两张 Chase 卡同名不同机构不适用，
  //     但 "Savings"（Robinhood）vs "CHASE SAVINGS" 这类能区分开）。
  if (byName.length > 1 && row.institution) {
    const byInst = byName.filter((a) =>
      normalizeForMatch(a.name).includes(normalizeForMatch(row.institution!)),
    )
    if (byInst.length === 1) return byInst[0]
  }
  const inferredTypes = inferAccountTypes(row)
  const type = row.kindHint ? KIND_TO_TYPE[row.kindHint] : inferredTypes[0]
  if (byName.length === 0 && row.institution && type) {
    const byInstType = accounts.filter(
      (a) =>
        a.type === type &&
        normalizeForMatch(a.name).includes(normalizeForMatch(row.institution!)),
    )
    if (byInstType.length === 1) return byInstType[0]
  }
  // 1d) 关键词重叠（Prime Visa / Ultimate Rewards / 401k 长名等）。
  if (byName.length === 0) {
    const typePool =
      inferredTypes.length > 0
        ? accounts.filter((a) => inferredTypes.includes(a.type))
        : accounts
    const byTokens = matchByTokenOverlap(row, typePool)
    if (byTokens) return byTokens
  }
  // 2) 类型提示匹配（RocketMoney Dashboard 分组行：Checking / Savings / Card Balance）。
  if (type) {
    const byType = accounts.filter((a) => a.type === type)
    if (byType.length === 1) return byType[0]
    const byTokens = matchByTokenOverlap(row, byType)
    if (byTokens) return byTokens
    notes.push(
      `「${row.name}」按类型 ${type} 匹配到 ${byType.length} 个账户，无法唯一确定，跳过。`,
    )
    return null
  }
  if (byName.length === 0) {
    const byTokens = matchByTokenOverlap(row, accounts)
    if (byTokens) return byTokens
  }
  if (byName.length > 1) {
    notes.push(`「${row.name}」名称匹配到 ${byName.length} 个账户，跳过。`)
  } else {
    notes.push(`「${row.name}」未找到对应账户，跳过。`)
  }
  return null
}

function planOneBalance(
  account: Account,
  captured: number,
  notes: string[],
  approximate?: boolean,
  capturedAt?: string,
): BalancePlan {
  if (account.balanceManual) {
    notes.push(`「${account.name}」已锁定手动余额（balanceManual），跳过。`)
    return { updates: [], notes }
  }
  // 时序保护：capture 可能在扩展队列里滞留数天。如果账户在抓取之后被更新过
  // （app 手动改过 / 更新的 capture 已先写入），旧 capture 不允许倒灌覆盖。
  if (
    capturedAt &&
    account.updatedAt &&
    new Date(account.updatedAt).getTime() > new Date(capturedAt).getTime()
  ) {
    notes.push(
      `「${account.name}」在本次抓取（${capturedAt.slice(0, 10)}）之后已更新过，跳过旧数据。`,
    )
    return { updates: [], notes }
  }
  // 负债类账户存正的欠款金额；RocketMoney 的 Card Balance 本身就是正数欠款，直接可用。
  const next = Math.abs(captured)
  // 近似值（"$57.7k" 只有 3 位有效数字）：现值落在四舍五入误差内就不动，
  // 避免把精确余额改成粗糙值、又被下次同步改回来的抖动。
  const epsilon = approximate
    ? Math.max(BALANCE_EPSILON, next * 0.006)
    : BALANCE_EPSILON
  if (Math.abs(account.balance - next) < epsilon) {
    return { updates: [], notes }
  }
  // 近似值要在报告里说清楚：126000.00 看着精确到分，实际来自 "$126K"，
  // 真值在 ±500 内。不标注的话用户会拿它当精确余额核对。
  notes.push(
    approximate
      ? `「${account.name}」余额 ${account.balance.toFixed(2)} → ≈${next.toFixed(2)}（平台缩写值，精确余额待该机构下次直连同步校准）`
      : `「${account.name}」余额 ${account.balance.toFixed(2)} → ${next.toFixed(2)}`,
  )
  // updatedAt 记「数据抓取时刻」而非写入时刻：同一批爬取里 Dashboard 先落库后，
  // 几分钟后抓的 Net Worth capture 仍然比它新，不会被上面的时序保护误拦。
  return {
    updates: [
      {
        ...account,
        balance: next,
        updatedAt: capturedAt ?? new Date().toISOString(),
      },
    ],
    notes,
  }
}

// ===================== 交易流水 =====================

/** capture 行 → 交易 flow 类型（先看类别，再看方向）。 */
/**
 * 工资/直存的名称信号。银行原始描述通常带 PAYROLL / DIRECT DEP / SALARY，
 * 即使聚合器把类别猜错也还在（实测 "INGRAM MICRO PAYROLL PPD ID: 1621644402"）。
 */
const PAYROLL_NAME_RE =
  /\b(payroll|direct\s*dep(osit)?|salary|wages|paycheck)\b|工资|薪资|薪酬/i

/** 判断一行 capture 的资金流向时可用的历史上下文。 */
export interface CaptureFlowContext {
  /** 该商户在历史账本里是否为纯收入来源（发钱给你的地方，而不是你消费的地方）。 */
  isIncomeMerchant?: (merchant: string) => boolean
}

/**
 * capture 行 → flow。
 *
 * 兜底那条 `credit → refund_or_reversal` 有个致命前提：聚合器把收入行的类别标成
 * Income。实测并非如此——Rocket Money 把 Ingram Micro（IT 分销商）的工资标成
 * "Software & Tech"，于是每两周一笔的工资被当成退款：既冲掉 Software & Tech 的
 * 花销（算成 -$6,476），又让「收入合计」常年显示 $0。
 *
 * 两条补救，都不依赖聚合器的类别：
 * 1. 名称含 payroll/direct deposit/salary → 收入。银行的原始描述通常留着这些词。
 * 2. 该商户在历史账本里是纯收入来源 → 收入。退款的前提是你先在那儿花过钱；
 *    从没有过一笔支出的商户给你打钱，那是收入，不是退款。
 */
export function flowForCaptureRow(
  row: CapturedTxnRow,
  ctx?: CaptureFlowContext,
): Txn['flow'] {
  const cat = normalize(row.category)
  if (cat === 'income') return 'income'
  if (cat === 'internal transfers' || cat === 'savings transfer')
    return 'internal_transfer'
  if (cat === 'credit card payment') return 'credit_card_payment'
  if (cat === 'ignore') return 'ignored'
  if (row.credit) {
    const name = `${row.merchant ?? ''} ${row.statement ?? ''}`
    if (PAYROLL_NAME_RE.test(name)) return 'income'
    const merchant = resolveCaptureMerchant(row)
    if (ctx?.isIncomeMerchant?.(merchant)) return 'income'
    return 'refund_or_reversal'
  }
  return 'expense'
}

/**
 * 从历史账本建「纯收入来源」索引：只有既收过钱、又从没花过钱的商户才算。
 *
 * 只花一次钱就退款的商户（Amazon 之流）因此不会被误判成收入；反过来，
 * 工资商户名在不同数据源写法不一（"Ingram Micro" vs
 * "Ingram Micro PAYROLL PPD ID: 1621644402"），所以用 nameMatches 做词边界模糊匹配。
 */
export function buildIncomeMerchantIndex(
  existing: Txn[],
): (merchant: string) => boolean {
  const incomeNames = new Set<string>()
  const spendNames = new Set<string>()
  for (const t of existing) {
    if (t.flow === 'income') incomeNames.add(t.merchant)
    else if (t.flow === 'expense') spendNames.add(t.merchant)
  }
  const pure = [...incomeNames].filter(
    (n) => ![...spendNames].some((s) => nameMatches(n, s)),
  )
  return (merchant: string) => {
    if (!merchant) return false
    return pure.some((n) => nameMatches(n, merchant))
  }
}

function txnKey(date: string, merchant: string, amount: number): string {
  return txnDedupKey(date, merchant, amount)
}

/**
 * capture 行 → 待插入的 NewTxn 列表。
 * - 跳过 pending（金额和商户名都可能变，等 settle 后下次同步再入账）
 * - 与已有流水按「日期 + 商户 + 签名金额」**计数**去重（multiset）：
 *   同日同商户同金额的两笔真实交易（平台侧 platformId 不同）能都入账；
 *   重复同步时已有 2 笔、capture 里也是 2 笔 → 全部跳过，不会多插。
 * - 符号约定与 txnPayload.ts 保持一致（支出正 / 收入负 / budgetImpact 反号）
 */
export function planNewTransactions(
  env: CaptureEnvelope,
  existing: Txn[],
): { txns: NewTxn[]; skippedPending: number; skippedDuplicate: number } {
  const data = env.data as TransactionsCaptureData
  // 历史里的纯收入商户：聚合器把工资类别标错时，用它把「进账」认回收入而非退款。
  const flowCtx: CaptureFlowContext = {
    isIncomeMerchant: buildIncomeMerchantIndex(existing),
  }
  // key → 已有该组合的剩余「配额」；capture 行先消耗配额（视为重复），配额耗尽才是新交易。
  const existingCount = new Map<string, number>()
  for (const t of existing) {
    const key = txnKey(t.date, t.merchant, t.amount)
    existingCount.set(key, (existingCount.get(key) ?? 0) + 1)
  }
  const seenPlatformIds = new Set<string>()
  const seenKeylessKeys = new Set<string>()
  const out: NewTxn[] = []
  let skippedPending = 0
  let skippedDuplicate = 0
  for (const row of data.rows) {
    if (row.pending) {
      skippedPending += 1
      continue
    }
    if (row.platformId) {
      if (seenPlatformIds.has(row.platformId)) continue
      seenPlatformIds.add(row.platformId)
    }
    const txn = captureRowToTxn(row, env.source, flowCtx)
    const key = txnKey(txn.date, txn.merchant, txn.amount)
    // 无 platformId 的行分不清「两笔一样的真交易」还是「同一行抓了两次」：
    // 同一 capture 内相同 key 只收第一条，保守防重。
    if (!row.platformId) {
      if (seenKeylessKeys.has(key)) {
        skippedDuplicate += 1
        continue
      }
      seenKeylessKeys.add(key)
    }
    const remaining = existingCount.get(key) ?? 0
    if (remaining > 0) {
      existingCount.set(key, remaining - 1)
      skippedDuplicate += 1
      continue
    }
    out.push(txn)
  }
  return { txns: out, skippedPending, skippedDuplicate }
}

function captureRowToTxn(
  row: CapturedTxnRow,
  _source: CaptureSource,
  ctx?: CaptureFlowContext,
): NewTxn {
  const abs = Math.abs(row.amount)
  const flow = flowForCaptureRow(row, ctx)
  const base = {
    date: row.date,
    merchant: resolveCaptureMerchant(row),
    category: row.category || 'Uncategorized',
    account: resolveCaptureAccount(row),
    source: 'import' as const,
    platformId: row.platformId,
  }
  switch (flow) {
    case 'income':
      return {
        ...base,
        flow,
        amount: -abs,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: true,
      }
    case 'refund_or_reversal':
      return {
        ...base,
        flow,
        amount: -abs,
        budgetImpact: abs,
        inSpending: true,
        inCashFlow: true,
      }
    case 'expense':
      return {
        ...base,
        flow,
        amount: abs,
        budgetImpact: -abs,
        inSpending: true,
        inCashFlow: true,
      }
    case 'ignored':
      return {
        ...base,
        flow,
        amount: row.credit ? -abs : abs,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: false,
        excludeReason: 'extension-import-ignored',
      }
    default:
      // internal_transfer / credit_card_payment：保留方向，不进花销分析。
      return {
        ...base,
        flow,
        amount: row.credit ? -abs : abs,
        budgetImpact: 0,
        inSpending: false,
        inCashFlow: true,
      }
  }
}

// ===================== 订阅 / 周期账单对账 =====================

export interface RecurringPlan {
  /** 名称匹配且金额有变的既有 CashFlowItem（已更新 amount）。 */
  updates: CashFlowItem[]
  /** 平台上有、app 里没有的订阅（只提示不自动建，避免与手动合并项撞车）。 */
  missing: CapturedRecurringRow[]
  notes: string[]
}

/** 页面频率文本 → app Frequency；月付以外的不自动改金额（年缴/不定期语义不同）。 */
function captureFrequency(text: string): 'monthly' | 'annual' | null {
  const t = normalize(text)
  if (t === 'monthly') return 'monthly'
  if (t === 'yearly' || t === 'annually' || t === 'annual') return 'annual'
  return null
}

/**
 * Recurring capture 与既有 cashFlows 对账：
 * - 名称互相包含 + 频率一致 + 金额差 ≥ $0.5 → 更新金额（RocketMoney 为准）
 * - 未匹配到的行 → 记入 missing，toast 里提示用户手动决定是否补录
 * - income 类 cashFlow 不参与（页面只列支出型订阅）
 */
export function planRecurringUpdates(
  env: CaptureEnvelope,
  cashFlows: CashFlowItem[],
): RecurringPlan {
  const data = env.data as RecurringCaptureData
  const expenses = cashFlows.filter((c) => c.type === 'expense')
  const updates: CashFlowItem[] = []
  const missing: CapturedRecurringRow[] = []
  const notes: string[] = []
  for (const row of data.rows) {
    const matched = expenses.filter((c) => nameMatches(c.name, row.name))
    if (matched.length === 0) {
      missing.push(row)
      continue
    }
    if (matched.length > 1) {
      notes.push(
        `订阅「${row.name}」匹配到 ${matched.length} 个支出项，跳过金额核对。`,
      )
      continue
    }
    const target = matched[0]
    const freq = captureFrequency(row.frequency)
    if (!freq) continue // Irregular 等不定期：不核对金额
    if (freq !== target.frequency) {
      notes.push(
        `订阅「${row.name}」频率不一致（页面 ${row.frequency} vs app ${target.frequency}），跳过。`,
      )
      continue
    }
    if (Math.abs(target.amount - row.amount) >= 0.5) {
      notes.push(
        `「${target.name}」金额 ${target.amount.toFixed(2)} → ${row.amount.toFixed(2)}`,
      )
      updates.push({ ...target, amount: row.amount })
    }
  }
  if (missing.length > 0) {
    notes.push(
      `平台上有 ${missing.length} 项订阅未在 app 中找到：${missing
        .map((m) => `${m.name}（$${m.amount}/${m.frequency}）`)
        .join('、')}`,
    )
  }
  return { updates, missing, notes }
}

// ===================== 幂等处理 =====================

const PROCESSED_KEY = 'fos_ext_processed_captures'
const PROCESSED_MAX = 2000

/** 用于服务端 payload_hash 的稳定 JSON（字段顺序固定）。 */
export function canonicalEnvelopeJson(env: CaptureEnvelope): string {
  return JSON.stringify({
    v: env.v,
    id: env.id,
    source: env.source,
    kind: env.kind,
    asOfDate: env.asOfDate,
    data: env.data,
  })
}

/** FNV-1a 回退哈希（单测 / 无 crypto.subtle 环境）。 */
export function computeEnvelopePayloadHashSync(env: CaptureEnvelope): string {
  const canonical = canonicalEnvelopeJson(env)
  let h = 2166136261
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export async function computeEnvelopePayloadHash(
  env: CaptureEnvelope,
): Promise<string> {
  const canonical = canonicalEnvelopeJson(env)
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical),
    )
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return computeEnvelopePayloadHashSync(env)
}

/** Drop empty strings before RPC so Postgres never sees `""` for typed JSON fields. */
export function sanitizeExtensionSyncTxnPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    out[key] = value
  }
  return out
}

export function newTxnToExtensionSyncPayload(
  t: NewTxn,
): Record<string, unknown> {
  return sanitizeExtensionSyncTxnPayload({
    date: t.date,
    merchant: t.merchant,
    category: t.category,
    account: t.account,
    flow_type: t.flow,
    amount: t.amount,
    budget_impact: t.budgetImpact,
    include_in_spending_analytics: t.inSpending,
    include_in_cash_flow_history: t.inCashFlow,
    source: t.source ?? 'import',
    ...(t.excludeReason ? { exclude_reason: t.excludeReason } : {}),
    ...(t.platformId ? { platform_id: t.platformId } : {}),
  })
}

export function loadProcessedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PROCESSED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function markProcessed(ids: Set<string>, id: string): void {
  ids.add(id)
  try {
    const list = [...ids].slice(-PROCESSED_MAX)
    localStorage.setItem(PROCESSED_KEY, JSON.stringify(list))
  } catch {
    /* 存储失败不影响同步本身 */
  }
}

// ===================== 工具 =====================

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 去标点、统一 401(k)→401k，便于 Rocket Money 长名与 Finance OS 短名对齐。 */
function normalizeForMatch(s: string): string {
  return normalize(s)
    .replace(/[®™©]/g, '')
    .replace(/401\s*\(\s*k\s*\)/gi, '401k')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MATCH_STOP_TOKENS = new Set([
  'card',
  'visa',
  'mastercard',
  'rewards',
  'credit',
  'the',
  'and',
  'savings',
  'plan',
  'account',
  'investment',
  'individual',
  'checking',
])

function significantTokens(name: string): string[] {
  return [
    ...new Set(
      normalizeForMatch(name)
        .split(' ')
        .filter((t) => t.length >= 3 && !MATCH_STOP_TOKENS.has(t)),
    ),
  ]
}

function matchByTokenOverlap(
  row: CapturedAccountRow,
  pool: Account[],
): Account | null {
  const tokens = significantTokens(row.name)
  if (tokens.length === 0) return null
  let candidates = pool
  if (row.institution) {
    const inst = normalizeForMatch(row.institution)
    const narrowed = candidates.filter((a) =>
      normalizeForMatch(a.name).includes(inst),
    )
    if (narrowed.length > 0) candidates = narrowed
  }
  const scored = candidates
    .map((account) => {
      const an = normalizeForMatch(account.name)
      const hits = tokens.filter((t) => an.includes(t)).length
      return { account, hits }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
  if (scored.length === 0) return null
  if (scored.length === 1) return scored[0].account
  if (scored[0].hits > scored[1].hits) return scored[0].account
  return null
}

const KIND_TO_TYPE: Record<string, Account['type']> = {
  checking: 'checking',
  savings: 'savings',
  credit: 'credit-card',
  retirement: 'retirement',
  hsa: 'hsa',
  brokerage: 'brokerage',
  'auto-loan': 'auto-loan',
  mortgage: 'mortgage',
}

function inferAccountTypes(row: CapturedAccountRow): Account['type'][] {
  const types: Account['type'][] = []
  if (row.kindHint) {
    const mapped = KIND_TO_TYPE[row.kindHint]
    if (mapped) types.push(mapped)
    if (row.kindHint === 'investment') types.push('retirement', 'brokerage')
  }
  const n = normalizeForMatch(row.name)
  if (/401k|retirement|\bira\b|roth/.test(n)) types.push('retirement')
  if (/health\s*savings|\bhsa\b/.test(n)) types.push('hsa')
  if (/visa|mastercard|rewards|\bcard\b/.test(n)) types.push('credit-card')
  return [...new Set(types)]
}

/**
 * 名称匹配：一方以「整词」形式包含另一方（词边界对齐）。
 * 纯 substring 会把 "rent" 误配进 "parent lending" 这类名字；
 * 这里要求短名在长名中的出现位置前后都是非字母数字（或串首尾）。
 */
export function nameMatches(a: string, b: string): boolean {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (na === nb) return true
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (short.length < 2) return false
  const idx = long.indexOf(short)
  if (idx < 0) return false
  const before = idx === 0 ? '' : long[idx - 1]
  const after =
    idx + short.length >= long.length ? '' : long[idx + short.length]
  const isWordChar = (c: string) => /[a-z0-9]/.test(c)
  return (!before || !isWordChar(before)) && (!after || !isWordChar(after))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 类型守卫：运行时校验扩展投递的 envelope 是否可信。 */
export function isCaptureEnvelope(v: unknown): v is CaptureEnvelope {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Partial<CaptureEnvelope>
  return (
    e.v === 1 &&
    typeof e.id === 'string' &&
    (e.source === 'robinhood' ||
      e.source === 'rocketmoney' ||
      e.source === 'fidelity') &&
    (e.kind === 'holdings' ||
      e.kind === 'accounts' ||
      e.kind === 'transactions' ||
      e.kind === 'recurring') &&
    typeof e.asOfDate === 'string' &&
    typeof e.data === 'object' &&
    e.data !== null
  )
}
