import type { AssumptionSet, FinanceData } from "./types.js";

export const DATA_VERSION = 6;
export const BASELINE_SCENARIO_ID = "scenario_baseline";

// 默认假设 —— 对应设计文档第 7 节推荐默认值
export const defaultAssumptions: AssumptionSet = {
  conservativeReturn: 0.04,
  baselineReturn: 0.06,
  aggressiveReturn: 0.08,
  inflation: 0.025,
  cashYield: 0.04,
  capitalGainsTaxRate: 0.15,
  salaryGrowth: 0.0,
  emergencyReserveTarget: 12000,
  horizonYears: 20,
  displayMode: "today",
  checkingBuffer: 3000,
  investRatio: 0.8,
};

// 空白起步：不预填任何余额或收支，仅给出一个应急储备目标。
// 真实数据现在以 Supabase 为准（账户/收支/目标逐条记录），不再在代码里硬编码快照。
export function createEmptyData(): FinanceData {
  return {
    version: DATA_VERSION,
    accounts: [],
    holdingsSnapshots: [],
    cashFlows: [],
    events: [],
    scenarios: [
      {
        id: BASELINE_SCENARIO_ID,
        name: "基准",
        scenarioType: "custom",
        status: "saved",
      },
    ],
    activeScenarioId: BASELINE_SCENARIO_ID,
    goals: [
      {
        id: "goal-emergency",
        name: "应急储备 Emergency",
        metric: "liquid",
        target: 12000,
        current: 0,
        priority: "critical",
        reservePolicy: "earmarked_operating_cash",
        reserve: true,
      },
    ],
    assumptions: { ...defaultAssumptions },
    updatedAt: new Date().toISOString(),
    privacy: false,
    locale: "zh-CN",
  };
}

/**
 * 新用户首次初始化使用的种子数据。
 * 现统一为空白起步：登录后从「账户与收支」逐条录入，数据保存在 Supabase。
 */
export function createDefaultData(): FinanceData {
  return createEmptyData();
}
