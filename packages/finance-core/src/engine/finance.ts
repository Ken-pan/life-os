// 基础金融数学原语 —— 移植并扩展自 legacy/assets/engine.js

import type { Account } from "../types.js";

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * 判断某账户（通常是信用卡）的还款是否从「非流动账户」扣除。
 * 若 paymentAccountId 指向一个 liquid===false 的账户（如 Robinhood Cash），
 * 则该卡的还款不应占用活期/储蓄流动现金，而是从应急储备池支出。
 */
export function paysFromReserve(account: Account, accounts: Account[]): boolean {
  if (!account.paymentAccountId) return false;
  const payer = accounts.find((a) => a.id === account.paymentAccountId);
  return !!payer && payer.liquid === false;
}

/**
 * 选「主要消费卡」：从活期还款（非应急储备）的信用卡里、还款日最早的一张。
 * 日常/一次性刷卡归属；没有这类卡时返回 null。
 */
export function pickSpendingCard(accounts: Account[]): Account | null {
  const eligible = accounts.filter(
    (a) => a.type === "credit-card" && !paysFromReserve(a, accounts)
  );
  if (eligible.length === 0) return null;
  return eligible
    .slice()
    .sort((x, y) => (x.dueDay ?? 15) - (y.dueDay ?? 15))[0];
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 等额本息月供。 */
export function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  const p = Math.max(0, num(principal));
  const r = Math.max(0, num(annualRate)) / 12;
  const n = Math.max(0, Math.round(num(termMonths)));
  if (n <= 0) return 0;
  if (r === 0) return p / n;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** 一个月内对一笔贷款计息并还款，返回 { balance, interest, principalPaid }。 */
export function stepLoanMonth(
  balance: number,
  annualRate: number,
  payment: number
): { balance: number; interest: number; principalPaid: number } {
  const b = Math.max(0, num(balance));
  if (b <= 0) return { balance: 0, interest: 0, principalPaid: 0 };
  const r = Math.max(0, num(annualRate)) / 12;
  const interest = b * r;
  const pay = Math.min(b + interest, Math.max(0, num(payment)));
  const principalPaid = Math.max(0, pay - interest);
  const next = Math.max(0, b + interest - pay);
  return { balance: next, interest, principalPaid };
}

/** 名义回报 + 通胀 → 实际回报。 */
export function realReturn(nominal: number, inflation: number): number {
  return (1 + num(nominal)) / (1 + num(inflation)) - 1;
}

/** 将名义金额按通胀折算为「今天购买力」。monthOffset 为距今月数。 */
export function toTodayDollars(
  nominal: number,
  inflation: number,
  monthOffset: number
): number {
  const monthlyInfl = Math.pow(1 + num(inflation), 1 / 12) - 1;
  return num(nominal) / Math.pow(1 + monthlyInfl, Math.max(0, monthOffset));
}

/** 年化转月化复利率 (有效月利率)。 */
export function monthlyRate(annual: number): number {
  return Math.pow(1 + num(annual), 1 / 12) - 1;
}

/**
 * 一次性消费的「未来机会成本」：今天少投入 amount，T 年后少多少。
 * 采用有效月利率按月复利，等价于 amount * (1+annual)^years。
 */
export function futureCostOneTime(
  amount: number,
  annual: number,
  years: number
): number {
  return num(amount) * Math.pow(1 + num(annual), num(years));
}

/**
 * 每月持续多花的「未来机会成本」：期末年金未来值。
 * amount * ((1+annual)^years - 1) / ((1+annual)^(1/12) - 1)
 */
export function futureCostMonthly(
  amount: number,
  annual: number,
  years: number
): number {
  const i = monthlyRate(annual);
  if (i <= 0) return num(amount) * num(years) * 12;
  return (num(amount) * (Math.pow(1 + num(annual), num(years)) - 1)) / i;
}

/** 卖出应税券商时，对未实现收益估算资本利得税（亏损不退税）。 */
export interface CapitalGainsTaxEstimate {
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  tax: number;
  afterTax: number;
  /** false = 缺少成本，无法估税（afterTax 保持市值）。 */
  basisKnown: boolean;
}

export function estimateCapitalGainsTax(params: {
  marketValue: number;
  costBasis: number | null | undefined;
  rate: number;
}): CapitalGainsTaxEstimate {
  const marketValue = Math.max(0, num(params.marketValue));
  const rate = clamp(num(params.rate), 0, 1);
  const basisKnown =
    params.costBasis != null && Number.isFinite(Number(params.costBasis));
  const costBasis = basisKnown ? Math.max(0, num(params.costBasis)) : marketValue;
  const unrealizedGain = basisKnown ? Math.max(0, marketValue - costBasis) : 0;
  const tax = basisKnown ? unrealizedGain * rate : 0;
  return {
    marketValue,
    costBasis,
    unrealizedGain,
    tax,
    afterTax: marketValue - tax,
    basisKnown,
  };
}
