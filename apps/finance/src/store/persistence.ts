import type { CashFlowItem, FinanceData } from "../types";
import { LEGACY_FINANCE_STORAGE_KEY } from "../lib/localDataKeys";
import {
  BASELINE_SCENARIO_ID,
  createDefaultData,
  createEmptyData,
  DATA_VERSION,
  defaultAssumptions,
} from "./defaults";

/** 旧版本里 CashFlowItem 可能带 frequency:"one-time" 与 date 字段；迁移时按此宽松类型读取。 */
type LegacyCashFlow = Omit<CashFlowItem, "frequency"> & {
  frequency: "monthly" | "annual" | "one-time";
  date?: string;
};

function migrateData(data: FinanceData): FinanceData {
  const d: FinanceData = {
    ...data,
    accounts: [...data.accounts],
    holdingsSnapshots: [...(data.holdingsSnapshots ?? [])],
    cashFlows: [...data.cashFlows],
    goals: [...data.goals],
    events: [...data.events],
    assumptions: { ...data.assumptions },
  };

  // v3: 自动把关键默认参数同步到现有本地数据（不覆盖用户情景 events）
  // - 你不需要再每次去“数据与隐私”手动应用预设
  // - 保留用户已有 events / goals / 手动录入的账户
  if ((data.version ?? 1) < 3) {
    // 1) 假设值：降低应急底线默认
    d.assumptions.emergencyReserveTarget = 12000;

    // 2) Robinhood 拆分出 $5,000 现金（仅在尚未拆分时执行）
    const rhCashExists = d.accounts.some((a) => a.id === "acct-robinhood-cash");
    const rhInvIdx = d.accounts.findIndex((a) => a.id === "acct-robinhood-6853");
    if (!rhCashExists && rhInvIdx >= 0) {
      const inv = d.accounts[rhInvIdx];
      const move = Math.min(5000, Math.max(0, Number(inv.balance) || 0));
      if (move > 0) {
        d.accounts[rhInvIdx] = {
          ...inv,
          balance: (Number(inv.balance) || 0) - move,
          note: "应税券商账户（已剔除其中 $5,000 现金）",
        };
        d.accounts.push({
          id: "acct-robinhood-cash",
          name: "Robinhood 现金（应急储备）",
          type: "savings",
          balance: move,
          annualReturn: defaultAssumptions.cashYield,
          liquid: true,
          note: "Robinhood 内至少 $5,000 为现金，不在股市中；按应急金处理",
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 3) 收支口径同步（仅更新预设同 ID 项；不动你自己新增的条目）
    const cfPatch: Record<string, Partial<FinanceData["cashFlows"][number]>> = {
      "cf-rent": { amount: 2200, dueDay: 1 },
      "cf-utilities": { amount: 300 },
      "cf-transport": { amount: 200 },
      "cf-dining": { amount: 800 },
      "cf-subscriptions": { amount: 100, category: "subscriptions" },
      "cf-shopping": {
        name: "偶尔购物 / 杂项 (shopping & misc)",
        type: "expense",
        frequency: "monthly",
        amount: 500,
        essential: false,
        category: "shopping",
      },
    };
    const cfById = new Map(d.cashFlows.map((c) => [c.id, c]));
    for (const [id, patch] of Object.entries(cfPatch)) {
      const cur = cfById.get(id);
      if (cur) cfById.set(id, { ...cur, ...patch });
      else
        cfById.set(id, {
          id,
          name: "",
          type: "expense",
          frequency: "monthly",
          amount: 0,
          ...patch,
        } as FinanceData["cashFlows"][number]);
    }
    // 把旧 cf-misc 规范成 cf-subscriptions（避免重复）
    const misc = cfById.get("cf-misc");
    if (misc && !cfById.has("cf-subscriptions")) {
      cfById.set("cf-subscriptions", {
        ...misc,
        id: "cf-subscriptions",
        name: "订阅 (subscriptions)",
        amount: 100,
        category: "subscriptions",
      });
    }
    cfById.delete("cf-misc");
    d.cashFlows = Array.from(cfById.values());

    // 4) 聚合信用卡补齐账单/还款字段
    const cardIdx = d.accounts.findIndex((a) => a.id === "acct-card-aggregate");
    if (cardIdx >= 0) {
      const c = d.accounts[cardIdx];
      d.accounts[cardIdx] = {
        ...c,
        statementBalance: c.statementBalance ?? c.balance,
        dueDay: c.dueDay ?? 12,
        autoPayMode: c.autoPayMode ?? "statement",
      };
    }

    // 5) 应急目标同步到 12k（仅目标 id 命中）
    d.goals = d.goals.map((g) =>
      g.id === "goal-emergency" ? { ...g, target: 12000 } : g
    );
  }

  // v4: 把一次性收支统一迁移到 events，改由「未来收支 Timeline」单独管理。
  // 自此 CashFlowItem 只承载周期性收支，一次性全部用 ScenarioEvent 表达（单一模型）。
  if ((data.version ?? 1) < 4) {
    const migrated: FinanceData["events"] = [...d.events];
    const exists = new Set(migrated.map((e) => e.id));
    const remain: CashFlowItem[] = [];
    for (const c of d.cashFlows as unknown as LegacyCashFlow[]) {
      if (c.frequency !== "one-time") {
        remain.push(c as unknown as CashFlowItem);
        continue;
      }
      const id = `evt_cf_${c.id}`;
      if (exists.has(id)) continue;
      migrated.push({
        id,
        name: c.name || (c.type === "income" ? "一次性收入" : "一次性支出"),
        eventType: c.type === "income" ? "windfall" : "one-time-purchase",
        enabled: true,
        monthOffset: c.startMonth ?? 0,
        date: c.date,
        amount: c.amount,
        fundingSource: c.type === "expense" ? "checking" : undefined,
      });
      exists.add(id);
    }
    d.events = migrated;
    d.cashFlows = remain;
  }

  // v5: Robinhood 现金视为真正的应急储备 —— 不计入「可动用现金」和「可安心花」，
  // 只在现金短缺时才动用。把该账户标记为非流动。
  if ((data.version ?? 1) < 5) {
    d.accounts = d.accounts.map((a) => {
      const key = `${a.id} ${a.name ?? ""} ${a.note ?? ""}`.toLowerCase();
      const isRobinhoodEmergencyCash =
        key.includes("robinhood") &&
        key.includes("cash") &&
        (key.includes("emergency") || key.includes("应急"));
      if (a.id === "acct-robinhood-cash" || isRobinhoodEmergencyCash) {
        return { ...a, liquid: false };
      }
      return a;
    });
  }

  // v6: reservePolicy 显式化，兼容旧 reserve 布尔语义。
  if ((data.version ?? 1) < 6) {
    d.goals = d.goals.map((g) => {
      const reservePolicy = g.reserve
        ? "earmarked_operating_cash"
        : "milestone_only";
      return {
        ...g,
        reservePolicy,
      };
    });
  }

  d.version = DATA_VERSION;
  if (!Array.isArray(d.scenarios) || d.scenarios.length === 0) {
    d.scenarios = [
      {
        id: BASELINE_SCENARIO_ID,
        name: "基准",
        scenarioType: "custom",
        status: "saved",
      },
    ];
  }
  const hasActive = d.scenarios.some((s) => s.id === d.activeScenarioId);
  d.activeScenarioId = hasActive ? d.activeScenarioId : d.scenarios[0].id;
  d.events = d.events.map((e) => ({
    ...e,
    scenarioId: e.scenarioId ?? d.activeScenarioId,
  }));
  return d;
}

/** 宽松校验并补全缺失字段，避免旧数据/导入数据缺字段导致崩溃。 */
export function normalizeData(raw: unknown): FinanceData {
  const empty = createEmptyData();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Partial<FinanceData>;
  const normalized: FinanceData = {
    version: DATA_VERSION,
    accounts: Array.isArray(r.accounts) ? r.accounts : empty.accounts,
    holdingsSnapshots: Array.isArray(r.holdingsSnapshots) ? r.holdingsSnapshots : empty.holdingsSnapshots,
    cashFlows: Array.isArray(r.cashFlows) ? r.cashFlows : empty.cashFlows,
    events: Array.isArray(r.events) ? r.events : empty.events,
    goals: Array.isArray(r.goals) ? r.goals : empty.goals,
    assumptions: { ...defaultAssumptions, ...(r.assumptions || {}) },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : empty.updatedAt,
    privacy: Boolean(r.privacy),
  };
  return migrateData(normalized);
}

export function loadData(): FinanceData {
  try {
    const raw = localStorage.getItem(LEGACY_FINANCE_STORAGE_KEY);
    if (!raw) return createDefaultData();
    const parsed = JSON.parse(raw);
    const normalized = normalizeData(parsed);
    // 若发生迁移，立刻回写，避免每次启动重复迁移。
    if (parsed?.version !== normalized.version) saveData(normalized);
    return normalized;
  } catch {
    return createDefaultData();
  }
}

export function saveData(data: FinanceData): void {
  try {
    localStorage.setItem(LEGACY_FINANCE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略写入失败 (隐私模式/容量限制)
  }
}

export function exportJSON(data: FinanceData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-os-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedJSON(text: string): FinanceData {
  return normalizeData(JSON.parse(text));
}
