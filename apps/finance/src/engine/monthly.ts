// 月度资产推演引擎 —— 严格按设计文档第 4 节「每月计算顺序」实现：
// 读余额 → 加税后收入 → 扣支出 → 扣债务还款 → 应用事件 → 检查应急金下限 →
// 分配剩余现金 → 各账户应用收益 → 保存快照 → 下个月。

import type {
  Account,
  AssumptionSet,
  CashFlowItem,
  Goal,
  ScenarioEvent,
} from "../types";
import {
  estimateCapitalGainsTax,
  monthlyRate,
  num,
  paysFromReserve,
  pickSpendingCard,
  stepLoanMonth,
} from "./finance";
import {
  monthOffsetToYM,
  payCountInMonth,
  perPaycheckFromMonthly,
  signedMonthOffset,
} from "./calendar";
import {
  goalMonthlyAllocationDay,
  isProtectedReserveGoal,
  monthlyGoalAllocations,
} from "./goals";

/** 401(k)/HSA 等税前 payroll 供款：不计入 checking 支出，直接增加 investedLocked。 */
export const LOCKBOX_CONTRIBUTION_CATEGORY = "lockbox-contribution";
import {
  accountsForProjection,
  applyOperatingLiquidOverride,
  type ProjectionAccountOptions,
} from "./projectionAccounts";

const EPS = 1e-6;
/** 余额低于此阈值的券商账户缺成本时不阻断整体估税（如遗留 $0.15 空户）。 */
const IMMATERIAL_BROKERAGE_BALANCE = 1;

interface SimDebt {
  id: string;
  balance: number;
  apr: number;
  payment: number;
  revolving: boolean;
  /** 还款是否从应急储备(非流动账户)扣除，而非活期。 */
  fromReserve: boolean;
}

interface SimState {
  checking: number;
  savings: number;
  /** 应税投资（券商/Robinhood）。卖出按资本利得税计税，属于「能动的钱」。 */
  investedTaxable: number;
  /** 应税投资成本基础，用于估算未实现收益与资本利得税。 */
  investedTaxableBasis: number;
  /** 至少一个 brokerage 账户缺少成本基础，无法估税。 */
  investedTaxableBasisKnown: boolean;
  /** 锁定投资（退休金/401k + HSA）：计入净资产但难以动用，属于「不能动的钱」。 */
  investedLocked: number;
  property: number;
  /** 应急储备：标记为非流动 (liquid===false) 的现金账户。计入净资产但不算可动用现金，仅在现金短缺时才动用。 */
  reserve: number;
  debts: SimDebt[];
}

export interface MonthSnapshot {
  monthOffset: number;
  checking: number;
  savings: number;
  /** 全部投资（应税 + 锁定），= investedTaxable + investedLocked。 */
  invested: number;
  /** 应税投资（券商/Robinhood）市值。 */
  investedTaxable: number;
  /** 锁定投资（退休金/401k + HSA）市值。 */
  investedLocked: number;
  /** 应税投资成本基础（卖出计税用）。 */
  investedTaxableBasis: number;
  /** 未实现盈利估算 = max(0, 市值 − 成本)。 */
  unrealizedGainEstimate: number;
  /** 若全部卖出，估算资本利得税。 */
  capitalGainsTaxEstimate: number;
  /** 应税投资税后市值（能动口径用）。 */
  investedTaxableAfterTax: number;
  /** false = 缺少成本，capitalGainsTaxEstimate 为 0。 */
  taxBasisKnown: boolean;
  property: number;
  /** 应急储备余额 (不计入 liquidCash)。 */
  reserve: number;
  liabilities: number;
  liquidCash: number;
  /**
   * 能动的钱（可动用）：流动现金 + 应急储备 + 房产 + 应税投资税后实际值 − 负债。
   * 即「除 401k/HSA 之外、扣掉资本利得税与负债后真正能调动的钱」。
   */
  accessible: number;
  /** 不能动的钱（锁定）：退休金/401k + HSA。 */
  locked: number;
  netWorth: number;
  income: number;
  expenses: number;
  essentialExpenses: number;
  debtPayments: number;
  /** 经常性月结余 = 收入(含发薪次数) − 支出 − 还款。 */
  surplus: number;
  /** 当月一次性收入 (windfall / 一次性收入现金流)。 */
  oneTimeIncome: number;
  /** 当月一次性支出 (一次性消费 / 一次性支出现金流)。 */
  oneTimeExpense: number;
  /** 当月净现金流 = surplus + 一次性收入 − 一次性支出。 */
  netCashFlow: number;
  negativeCash: boolean;
}

export interface EngineInput {
  accounts: Account[];
  cashFlows: CashFlowItem[];
  events: ScenarioEvent[];
  goals?: Goal[];
  assumptions: AssumptionSet;
  /** 投资回报率覆盖 (用于三档区间带)，缺省取 baselineReturn。 */
  returnOverride?: number;
  /** 仅在显式应急兜底模拟中启用：允许动用 protected reserve 覆盖短缺。 */
  allowProtectedReserveFallback?: boolean;
  /** 模拟起点 (月 0 所在日历月)，缺省取今天。用于日期↔月偏移换算与发薪日历。 */
  startDate?: Date;
  /** 账户口径选项：对账锚定流动现金、持仓快照覆盖券商。 */
  projectionAccounts?: ProjectionAccountOptions;
}

function minCreditPayment(balance: number): number {
  return Math.min(balance, Math.max(25, balance * 0.02));
}

function buildSimState(accounts: Account[]): SimState {
  const state: SimState = {
    checking: 0,
    savings: 0,
    investedTaxable: 0,
    investedTaxableBasis: 0,
    investedTaxableBasisKnown: true,
    investedLocked: 0,
    property: 0,
    reserve: 0,
    debts: [],
  };
  for (const a of accounts) {
    const bal = num(a.balance);
    // 现金类账户若被标记为非流动 (liquid===false)，进入应急储备池，不算可动用现金。
    const isReserveCash = a.liquid === false;
    switch (a.type) {
      case "checking":
        if (isReserveCash) state.reserve += bal;
        else state.checking += bal;
        break;
      case "savings":
        if (isReserveCash) state.reserve += bal;
        else state.savings += bal;
        break;
      case "brokerage":
        // 应税券商账户（含 Robinhood）：属于「能动的钱」，卖出计资本利得税。
        state.investedTaxable += bal;
        if (a.basis != null && Number.isFinite(Number(a.basis))) {
          state.investedTaxableBasis += Number(a.basis);
        } else if (bal <= IMMATERIAL_BROKERAGE_BALANCE) {
          // 可忽略余额：按成本=市值计，不阻断其它账户的估税。
          state.investedTaxableBasis += bal;
        } else {
          // 模拟仍按「成本=市值」跟踪比例，但标记为不可估税。
          state.investedTaxableBasis += bal;
          state.investedTaxableBasisKnown = false;
        }
        break;
      case "hsa":
      case "retirement":
        // 退休金/401k 与 HSA：属于「不能动的钱」，难以提前动用。
        state.investedLocked += bal;
        break;
      case "property":
        state.property += bal;
        break;
      case "credit-card": {
        if (bal <= 0) break;
        const revolving = a.creditMode !== "paid-in-full";
        state.debts.push({
          id: a.id,
          balance: bal,
          apr: revolving ? num(a.apr) : 0,
          // 全额还清卡：下月一次性付清；滚动卡：最低还款。
          payment: revolving ? minCreditPayment(bal) : bal,
          revolving,
          fromReserve: paysFromReserve(a, accounts),
        });
        break;
      }
      case "auto-loan":
      case "mortgage": {
        if (bal <= 0) break;
        state.debts.push({
          id: a.id,
          balance: bal,
          apr: num(a.apr),
          payment: num(a.monthlyPayment),
          revolving: false,
          fromReserve: false,
        });
        break;
      }
      default:
        // other: 若为正按现金、负忽略；非流动则入应急储备
        if (bal > 0) {
          if (isReserveCash) state.reserve += bal;
          else state.checking += bal;
        }
        break;
    }
  }
  return state;
}

function perMonth(item: CashFlowItem): number {
  if (item.frequency === "annual") return num(item.amount) / 12;
  return num(item.amount); // monthly
}

function isActive(item: CashFlowItem, m: number): boolean {
  const start = num(item.startMonth, 0);
  if (m < start) return false;
  if (item.endMonth != null && m > num(item.endMonth)) return false;
  return true;
}

/** 按发薪日历统计第 m 月的金额（amount 为月度等额）。 */
function monthlyScheduledAmount(item: CashFlowItem, start: Date, m: number): number {
  const amt = perMonth(item);
  const freq = item.payFrequency ?? "monthly";
  if (freq === "monthly" || freq === "semimonthly") return amt;
  const ym = monthOffsetToYM(start, m);
  const count = payCountInMonth(freq, item.anchorDate, ym);
  return perPaycheckFromMonthly(amt, freq) * count;
}

/** 该收入项在第 m 月 (对应日历月) 的金额：按发薪频率/锚点统计发薪次数。 */
function monthlyIncomeFor(item: CashFlowItem, start: Date, m: number): number {
  return monthlyScheduledAmount(item, start, m);
}

function lockboxContributionsForMonth(
  cashFlows: CashFlowItem[],
  start: Date,
  m: number
): number {
  let total = 0;
  for (const item of cashFlows) {
    if (item.category !== LOCKBOX_CONTRIBUTION_CATEGORY) continue;
    if (!isActive(item, m)) continue;
    total += monthlyScheduledAmount(item, start, m);
  }
  return total;
}

/** 预计算每月的收入、必要支出、非必要支出 (含 salary/expense/partner 事件影响)。 */
function precomputeFlows(
  cashFlows: CashFlowItem[],
  events: ScenarioEvent[],
  assumptions: AssumptionSet,
  months: number,
  start: Date
) {
  const income: number[] = new Array(months + 1).fill(0);
  const essential: number[] = new Array(months + 1).fill(0);
  const nonessential: number[] = new Array(months + 1).fill(0);

  const enabled = events.filter((e) => e.enabled);
  const salaryEvents = enabled.filter((e) => e.eventType === "salary-change");
  const expenseEvents = enabled.filter((e) => e.eventType === "expense-change");
  const partnerEvents = enabled.filter(
    (e) => e.eventType === "partner-contribution"
  );

  for (let m = 0; m <= months; m++) {
    const growth = Math.pow(1 + num(assumptions.salaryGrowth), Math.floor(m / 12));

    let inc = 0;
    let ess = 0;
    let non = 0;
    for (const item of cashFlows) {
      if (!isActive(item, m)) continue;
      if (item.type === "income") inc += monthlyIncomeFor(item, start, m) * growth;
      else if (item.category === LOCKBOX_CONTRIBUTION_CATEGORY) continue;
      else if (item.essential) ess += perMonth(item);
      else non += perMonth(item);
    }

    // salary-change：M 月起的月收入增减
    for (const ev of salaryEvents) {
      if (m < ev.monthOffset) continue;
      if (ev.percent != null) inc += inc * num(ev.percent);
      else inc += num(ev.amount);
    }

    // expense-change：M 月起的非必要支出增减
    for (const ev of expenseEvents) {
      if (m < ev.monthOffset) continue;
      non += num(ev.amount);
    }

    // partner-contribution：按类别减免支出 (空类别 = 全部支出)
    for (const ev of partnerEvents) {
      if (m < ev.monthOffset) continue;
      const pct = num(ev.contributionPercent);
      if (pct <= 0) continue;
      if (ev.expenseCategory) {
        // 仅减免匹配类别的支出
        let catEss = 0;
        let catNon = 0;
        for (const item of cashFlows) {
          if (item.type !== "expense") continue;
          if (!isActive(item, m)) continue;
          if ((item.category || "") !== ev.expenseCategory) continue;
          if (item.essential) catEss += perMonth(item);
          else catNon += perMonth(item);
        }
        ess -= catEss * pct;
        non -= catNon * pct;
      } else {
        ess -= ess * pct;
        non -= non * pct;
      }
    }

    income[m] = Math.max(0, inc);
    essential[m] = Math.max(0, ess);
    nonessential[m] = Math.max(0, non);
  }

  return { income, essential, nonessential };
}

function snapshot(state: SimState, m: number, capGainsRate: number, flow: {
  income: number;
  expenses: number;
  essentialExpenses: number;
  debtPayments: number;
  surplus: number;
  oneTimeIncome: number;
  oneTimeExpense: number;
  negativeCash: boolean;
}): MonthSnapshot {
  const liabilities = state.debts.reduce((s, d) => s + d.balance, 0);
  const liquidCash = state.checking + state.savings;
  const invested = state.investedTaxable + state.investedLocked;
  const locked = state.investedLocked;
  const taxEst = estimateCapitalGainsTax({
    marketValue: state.investedTaxable,
    costBasis: state.investedTaxableBasisKnown ? state.investedTaxableBasis : null,
    rate: capGainsRate,
  });
  const investedTaxableAfterTax = taxEst.afterTax;
  const netWorth =
    state.checking + state.savings + invested + state.property + state.reserve - liabilities;
  // 能动的钱：除 401k/HSA 外、扣资本利得税与负债后真正可调动的钱。
  const accessible =
    state.checking +
    state.savings +
    state.reserve +
    state.property +
    investedTaxableAfterTax -
    liabilities;
  return {
    monthOffset: m,
    checking: state.checking,
    savings: state.savings,
    invested,
    investedTaxable: state.investedTaxable,
    investedLocked: state.investedLocked,
    investedTaxableBasis: taxEst.costBasis,
    unrealizedGainEstimate: taxEst.unrealizedGain,
    capitalGainsTaxEstimate: taxEst.tax,
    investedTaxableAfterTax,
    taxBasisKnown: taxEst.basisKnown,
    property: state.property,
    reserve: state.reserve,
    liabilities,
    liquidCash,
    accessible,
    locked,
    netWorth,
    income: flow.income,
    expenses: flow.expenses,
    essentialExpenses: flow.essentialExpenses,
    debtPayments: flow.debtPayments,
    surplus: flow.surplus,
    oneTimeIncome: flow.oneTimeIncome,
    oneTimeExpense: flow.oneTimeExpense,
    netCashFlow: flow.surplus + flow.oneTimeIncome - flow.oneTimeExpense,
    negativeCash: flow.negativeCash,
  };
}

/**
 * 一次性事件 → 投影月序号 (1…months)。
 * 过去月 (signed < 0) 返回负值，循环内不会匹配；本月 (signed = 0) 映射到第 1 月。
 */
export function resolveOneTimeEventMonth(start: Date, e: ScenarioEvent): number {
  if (e.date) {
    const signed = signedMonthOffset(start, e.date);
    if (signed < 0) return signed;
    if (signed === 0) return 1;
    return signed;
  }
  return Math.round(num(e.monthOffset));
}

export function projectMonthly(input: EngineInput): MonthSnapshot[] {
  const { accounts, cashFlows, events, assumptions } = input;
  const goals = input.goals ?? [];
  const start = input.startDate ?? new Date();
  const months = Math.max(1, Math.round(num(assumptions.horizonYears, 20) * 12));
  const ret = input.returnOverride ?? assumptions.baselineReturn;
  const mReturn = monthlyRate(ret);
  const mCash = monthlyRate(assumptions.cashYield);
  const capGainsRate = Math.min(1, Math.max(0, num(assumptions.capitalGainsTaxRate, 0.15)));

  const projectionAccounts = input.projectionAccounts;
  const resolvedAccounts = accountsForProjection(accounts, projectionAccounts ?? {});
  const state = buildSimState(resolvedAccounts);
  applyOperatingLiquidOverride(state, projectionAccounts?.operatingLiquidOverride);
  const flows = precomputeFlows(cashFlows, events, assumptions, months, start);
  const buffer = Math.max(0, num(assumptions.checkingBuffer));
  const emergencyTarget = Math.max(0, num(assumptions.emergencyReserveTarget));
  const investRatio = Math.min(1, Math.max(0, num(assumptions.investRatio, 0.8)));
  const allowProtectedReserveFallback = input.allowProtectedReserveFallback === true;

  const oneTimeEvents = events.filter(
    (e) => e.enabled && (e.eventType === "one-time-purchase" || e.eventType === "windfall")
  );
  const goalAllocations = monthlyGoalAllocations(goals);

  // 把一次性收支解析到具体月偏移 (date 优先于 monthOffset)。
  // 过去月 (signed < 0) 不进入循环；本月 (signed = 0) 在投影第 1 月执行。
  const evMonth = (e: ScenarioEvent) => resolveOneTimeEventMonth(start, e);

  const out: MonthSnapshot[] = [];
  out.push(
    snapshot(state, 0, capGainsRate, {
      income: flows.income[0],
      expenses: flows.essential[0] + flows.nonessential[0],
      essentialExpenses: flows.essential[0],
      debtPayments: 0,
      surplus: 0,
      oneTimeIncome: 0,
      oneTimeExpense: 0,
      negativeCash: false,
    })
  );

  for (let m = 1; m <= months; m++) {
    const income = flows.income[m];
    const essExp = flows.essential[m];
    const nonExp = flows.nonessential[m];
    const totalExp = essExp + nonExp;

    // 1) 债务计息 + 计划还款 (现金流出)
    let debtPayments = 0;
    let debtFromReserve = 0; // 从应急储备(如 Robinhood Cash)扣的还款，不占用活期
    for (const d of state.debts) {
      const step = stepLoanMonth(d.balance, d.apr, d.payment);
      const paid = d.balance + step.interest - step.balance;
      d.balance = step.balance;
      debtPayments += paid;
      if (d.fromReserve) debtFromReserve += paid;
    }
    // 从储备还的部分直接扣储备池，避免占用活期/可动用现金。
    if (debtFromReserve > 0) state.reserve = Math.max(0, state.reserve - debtFromReserve);

    // 2) 月度自由现金流落入 checking
    // surplus 仍按完整口径(含所有还款)报告；但储备还款不从 checking 扣，故 checking 只扣非储备还款。
    const surplus = income - totalExp - debtPayments;
    state.checking += surplus + debtFromReserve;

    // 3) 离散事件：一次性收支 (同时累计当月一次性收/支，用于净现金流展示)
    let oneTimeIncome = 0;
    let oneTimeExpense = 0;
    for (const ev of oneTimeEvents) {
      if (evMonth(ev) !== m) continue;
      const amt = num(ev.amount);
      if (ev.eventType === "windfall") {
        state.checking += amt;
        oneTimeIncome += amt;
      } else {
        oneTimeExpense += amt;
        const src = ev.fundingSource || "checking";
        if (src === "invested") {
          // 先卖应税券商（能动的钱），不足再动用锁定账户，最后兜底活期。
          let remaining = amt;
          const sellTaxable = Math.min(state.investedTaxable, remaining);
          if (state.investedTaxable > 0) {
            const ratio = sellTaxable / state.investedTaxable;
            state.investedTaxableBasis -= state.investedTaxableBasis * ratio;
          }
          state.investedTaxable -= sellTaxable;
          remaining -= sellTaxable;
          const sellLocked = Math.min(state.investedLocked, remaining);
          state.investedLocked -= sellLocked;
          remaining -= sellLocked;
          if (remaining > EPS) state.checking -= remaining;
        } else if (src === "savings") {
          state.savings -= amt;
        } else if (src === "credit-card") {
          const card = pickSpendingCard(resolvedAccounts);
          const debt = card ? state.debts.find((d) => d.id === card.id) : undefined;
          if (debt) debt.balance += amt;
          else state.checking -= amt;
        } else {
          state.checking -= amt;
        }
      }
    }

    // 3.5) monthlyAllocation 作为计划内现金流：从运营现金挪出，不再进入当月可投资结余。
    if (goalAllocations.length > 0) {
      let allocToOperatingReserve = 0;
      let allocToProtectedReserve = 0;
      const monthInfo = monthOffsetToYM(start, m);
      for (const goal of goalAllocations) {
        const due = goalMonthlyAllocationDay(goal);
        // 当模拟起始月已经过了本月扣款日，则本月不执行该条分配。
        if (
          m === 1 &&
          monthInfo.year === start.getFullYear() &&
          monthInfo.month === start.getMonth() &&
          due < start.getDate()
        ) {
          continue;
        }
        const amount = Math.max(0, num(goal.monthlyAllocation));
        if (amount <= 0) continue;
        if (isProtectedReserveGoal(goal)) allocToProtectedReserve += amount;
        else allocToOperatingReserve += amount;
      }
      const totalGoalAllocation = allocToOperatingReserve + allocToProtectedReserve;
      if (totalGoalAllocation > 0) {
        state.checking -= totalGoalAllocation;
        state.savings += allocToOperatingReserve;
        state.reserve += allocToProtectedReserve;
      }
    }

    // 4) 分配剩余现金 (向上：维持 buffer → 补应急金 → 还滚动债 → 投资)
    if (state.checking > buffer + EPS) {
      let extra = state.checking - buffer;
      const needSav = Math.max(0, emergencyTarget - state.savings);
      const moveSav = Math.min(extra, needSav);
      state.savings += moveSav;
      state.checking -= moveSav;
      extra -= moveSav;

      for (const d of state.debts) {
        if (!d.revolving || extra <= EPS) continue;
        const pay = Math.min(extra, d.balance);
        d.balance -= pay;
        state.checking -= pay;
        extra -= pay;
      }

      if (extra > EPS) {
        // 月度自由现金按比例投入应税券商（能动的钱），其余留在储蓄。
        const invest = extra * investRatio;
        state.investedTaxable += invest;
        state.investedTaxableBasis += invest;
        state.savings += extra - invest;
        state.checking -= extra;
      }
    }

    // 5) 检查现金下限：不足则从储蓄 → 应急储备 → 投资补足
    //    应急储备只在这里 (出现现金短缺时) 才动用，平时不参与日常分配。
    let negativeCash = false;
    if (state.checking < buffer - EPS) {
      let need = buffer - state.checking;
      const fromSav = Math.min(state.savings, need);
      state.savings -= fromSav;
      state.checking += fromSav;
      need -= fromSav;
      if (allowProtectedReserveFallback && need > EPS && state.reserve > 0) {
        const fromReserve = Math.min(state.reserve, need);
        state.reserve -= fromReserve;
        state.checking += fromReserve;
        need -= fromReserve;
      }
      // 补现金优先卖应税券商（能动的钱），不足再动用锁定账户（退休金/HSA）。
      if (need > EPS && state.investedTaxable > 0) {
        const sell = Math.min(state.investedTaxable, need);
        const ratio = sell / state.investedTaxable;
        state.investedTaxableBasis -= state.investedTaxableBasis * ratio;
        state.investedTaxable -= sell;
        state.checking += sell;
        need -= sell;
      }
      if (need > EPS && state.investedLocked > 0) {
        const sell = Math.min(state.investedLocked, need);
        state.investedLocked -= sell;
        state.checking += sell;
      }
      if (state.checking < -EPS) negativeCash = true;
    }

    // 5.5) Payroll 锁定账户供款（税前，不从 checking 扣；与税后工资 cf-salary 不重复）
    state.investedLocked += lockboxContributionsForMonth(cashFlows, start, m);

    // 6) 各账户应用月度收益 (应急储备按现金收益增长)
    state.savings *= 1 + mCash;
    state.reserve *= 1 + mCash;
    state.investedTaxable *= 1 + mReturn;
    state.investedLocked *= 1 + mReturn;

    out.push(
      snapshot(state, m, capGainsRate, {
        income,
        expenses: totalExp,
        essentialExpenses: essExp,
        debtPayments,
        surplus,
        oneTimeIncome,
        oneTimeExpense,
        negativeCash,
      })
    );
  }

  return out;
}
