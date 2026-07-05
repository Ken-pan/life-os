import { beforeEach, describe, expect, it, vi } from "vitest";

type MockTxn = {
  id: string;
  txn_date: string;
  merchant: string;
  category: string;
  account: string;
  flow: string;
  amount: number;
  budget_impact: number;
  in_spending: boolean;
  in_cash_flow: boolean;
  exclude_reason: string | null;
  source: string;
};

interface UserState {
  accounts: Array<Record<string, unknown>>;
  cash_flows: Array<Record<string, unknown>>;
  scenario_events: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  user_settings: Record<string, unknown> | null;
  transactions: MockTxn[];
}

const authContext = { userId: "user-a", anonymous: false };
let dbState: Record<string, UserState>;

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seedState(): Record<string, UserState> {
  return {
    "user-a": {
      accounts: [{ id: "a1", name: "Checking", type: "checking", balance: 1000 }],
      cash_flows: [{ id: "c1", name: "Salary", type: "income", frequency: "monthly", amount: 5000 }],
      scenario_events: [],
      goals: [{ id: "g1", name: "Trip", metric: "liquid", target: 3000 }],
      user_settings: {
        data_version: 6,
        privacy: false,
        assumptions: {
          conservativeReturn: 0.04,
          baselineReturn: 0.06,
          aggressiveReturn: 0.08,
          inflation: 0.025,
          cashYield: 0.04,
          salaryGrowth: 0,
          emergencyReserveTarget: 12000,
          horizonYears: 20,
          displayMode: "today",
          checkingBuffer: 3000,
          investRatio: 0.8,
        },
      },
      transactions: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          txn_date: "2026-05-01",
          merchant: "Test Merchant",
          category: "Food",
          account: "Checking",
          flow: "expense",
          amount: 20,
          budget_impact: 20,
          in_spending: true,
          in_cash_flow: true,
          exclude_reason: null,
          source: "import",
        },
      ],
    },
    "user-b": {
      accounts: [{ id: "b1", name: "B Checking", type: "checking", balance: 2000 }],
      cash_flows: [],
      scenario_events: [],
      goals: [],
      user_settings: {
        data_version: 6,
        privacy: false,
        assumptions: {},
      },
      transactions: [],
    },
  };
}

import { SB } from "./supabaseTables";

vi.mock("./supabase", () => {
  const tableToStateKey: Record<string, keyof UserState> = {
    [SB.finance.accounts]: "accounts",
    [SB.finance.cashFlows]: "cash_flows",
    [SB.finance.scenarioEvents]: "scenario_events",
    [SB.finance.goals]: "goals",
    [SB.finance.userSettings]: "user_settings",
    [SB.finance.transactions]: "transactions",
  };

  function userRows(table: string, userId: string): unknown {
    const key = tableToStateKey[table] ?? (table as keyof UserState);
    return dbState[userId]?.[key];
  }

  function query(table: string) {
    return {
      select: () => ({
        eq: (_col: string, userId: string) => {
          if (table === SB.finance.userSettings) {
            return {
              maybeSingle: async () => ({ data: userRows(table, userId), error: null }),
            };
          }
          if (table === SB.finance.transactions) {
            return {
              order: () => ({
                range: async () => ({
                  data: cloneState((userRows(table, userId) as unknown[]) ?? []),
                  error: null,
                }),
              }),
            };
          }
          return Promise.resolve({
            data: cloneState((userRows(table, userId) as unknown[]) ?? []),
            error: null,
          });
        },
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      update: async () => ({ error: null }),
    };
  }

  return {
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: authContext.anonymous ? null : { id: authContext.userId } },
        }),
      },
      from: (table: string) => query(table),
      rpc: async (name: string, args?: { payload?: Record<string, unknown> }) => {
        if (authContext.anonymous) {
          return { data: null, error: new Error("not authenticated") };
        }
        const uid = authContext.userId;
        const current = cloneState(dbState[uid]);

        if (name === "delete_all_financial_data_v1") {
          const deleted = {
            transactions: current.transactions.length,
            scenario_events: current.scenario_events.length,
            cash_flows: current.cash_flows.length,
            goals: current.goals.length,
            accounts: current.accounts.length,
            user_settings: current.user_settings ? 1 : 0,
          };
          dbState[uid] = {
            accounts: [],
            cash_flows: [],
            scenario_events: [],
            goals: [],
            user_settings: null,
            transactions: [],
          };
          return { data: { deleted, deletedAt: new Date().toISOString() }, error: null };
        }

        if (name === "restore_finance_backup_v1") {
          const payload = args?.payload ?? {};
          const schemaVersion = Number(payload.schemaVersion ?? -1);
          if (schemaVersion !== 1) {
            return { data: null, error: new Error("unsupported schemaVersion") };
          }
          const txState = cloneState(current);
          try {
            const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
            if (accounts.some((a) => (a as { id?: string }).id === "__FAIL__")) {
              throw new Error("malformed account row");
            }
            txState.accounts = cloneState(accounts as Array<Record<string, unknown>>);
            txState.cash_flows = cloneState(
              (Array.isArray(payload.cashFlows) ? payload.cashFlows : []) as Array<Record<string, unknown>>
            );
            txState.scenario_events = cloneState(
              (Array.isArray(payload.events) ? payload.events : []) as Array<Record<string, unknown>>
            );
            txState.goals = cloneState(
              (Array.isArray(payload.goals) ? payload.goals : []) as Array<Record<string, unknown>>
            );
            txState.transactions = cloneState(
              (Array.isArray(payload.transactions) ? payload.transactions : []).map((t) => ({
                id: String((t as { id?: string }).id ?? crypto.randomUUID()),
                txn_date: String((t as { date?: string }).date ?? "2026-01-01"),
                merchant: String((t as { merchant?: string }).merchant ?? ""),
                category: String((t as { category?: string }).category ?? "Uncategorized"),
                account: String((t as { account?: string }).account ?? "Unknown"),
                flow: String((t as { flow?: string }).flow ?? "expense"),
                amount: Number((t as { amount?: number }).amount ?? 0),
                budget_impact: Number((t as { budgetImpact?: number }).budgetImpact ?? 0),
                in_spending: Boolean((t as { inSpending?: boolean }).inSpending ?? false),
                in_cash_flow: Boolean((t as { inCashFlow?: boolean }).inCashFlow ?? false),
                exclude_reason: (t as { excludeReason?: string | null }).excludeReason ?? null,
                source: String((t as { source?: string }).source ?? "import"),
              }))
            );
            txState.user_settings = {
              data_version: Number(payload.dataVersion ?? 6),
              privacy: Boolean(payload.privacy),
              assumptions: payload.assumptions ?? {},
            };
          } catch (error) {
            return { data: null, error: error as Error };
          }
          dbState[uid] = txState;
          return {
            data: {
              schemaVersion: 1,
              restored: {
                accounts: txState.accounts.length,
                cash_flows: txState.cash_flows.length,
                scenario_events: txState.scenario_events.length,
                goals: txState.goals.length,
                transactions: txState.transactions.length,
              },
              restoredAt: new Date().toISOString(),
            },
            error: null,
          };
        }

        return { data: null, error: new Error(`unknown rpc ${name}`) };
      },
    },
  };
});

import {
  BACKUP_SCHEMA_VERSION,
  deleteAllFinancialData,
  exportFinancialBackup,
  restoreFinancialBackup,
} from "./repo";

describe("financial backup controls", () => {
  beforeEach(() => {
    authContext.userId = "user-a";
    authContext.anonymous = false;
    dbState = seedState();
  });

  it("export 包含必需财务数据且不含 auth/session", async () => {
    const backup = await exportFinancialBackup();
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.accounts.length).toBe(1);
    expect(backup.cashFlows.length).toBe(1);
    expect(backup.goals.length).toBe(1);
    expect(backup.transactions.length).toBe(1);
    const bag = backup as unknown as Record<string, unknown>;
    expect("auth" in bag).toBe(false);
    expect("session" in bag).toBe(false);
  });

  it("restore 对无效 schema 直接拒绝", async () => {
    await expect(
      restoreFinancialBackup({
        schemaVersion: 999,
        exportedAt: new Date().toISOString(),
        dataVersion: 6,
        assumptions: {} as never,
        privacy: false,
        accounts: [],
        cashFlows: [],
        events: [],
        goals: [],
        transactions: [],
      })
    ).rejects.toThrow(/schemaVersion/);
  });

  it("delete-all 仅删除当前用户数据", async () => {
    const beforeOther = cloneState(dbState["user-b"]);
    const result = await deleteAllFinancialData();
    expect(result.success).toBe(true);
    expect(result.deleted.accounts).toBeGreaterThanOrEqual(1);
    expect(dbState["user-a"].accounts.length).toBe(0);
    expect(dbState["user-b"]).toEqual(beforeOther);
  });

  it("restore 成功时替换当前用户数据，不影响其他用户", async () => {
    const beforeOther = cloneState(dbState["user-b"]);
    const restore = await restoreFinancialBackup({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      dataVersion: 6,
      assumptions: {
        conservativeReturn: 0.04,
        baselineReturn: 0.06,
        aggressiveReturn: 0.08,
        inflation: 0.025,
        cashYield: 0.04,
        salaryGrowth: 0,
        emergencyReserveTarget: 12000,
        horizonYears: 20,
        displayMode: "today",
        checkingBuffer: 3000,
        investRatio: 0.8,
      },
      privacy: false,
      accounts: [{ id: "new-a", name: "New", type: "checking", balance: 999 }],
      cashFlows: [],
      events: [],
      goals: [],
      transactions: [],
    });
    expect(restore.success).toBe(true);
    expect(dbState["user-a"].accounts[0].id).toBe("new-a");
    expect(dbState["user-b"]).toEqual(beforeOther);
  });

  it("restore 遇到 malformed row 会整体回滚", async () => {
    const before = cloneState(dbState["user-a"]);
    await expect(
      restoreFinancialBackup({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        dataVersion: 6,
        assumptions: {
          conservativeReturn: 0.04,
          baselineReturn: 0.06,
          aggressiveReturn: 0.08,
          inflation: 0.025,
          cashYield: 0.04,
          salaryGrowth: 0,
          emergencyReserveTarget: 12000,
          horizonYears: 20,
          displayMode: "today",
          checkingBuffer: 3000,
          investRatio: 0.8,
        },
        privacy: false,
        accounts: [{ id: "__FAIL__", name: "Bad", type: "checking", balance: 1 }],
        cashFlows: [],
        events: [],
        goals: [],
        transactions: [],
      })
    ).rejects.toThrow(/malformed/);
    expect(dbState["user-a"]).toEqual(before);
  });

  it("匿名调用 restore 被拒绝", async () => {
    authContext.anonymous = true;
    await expect(
      restoreFinancialBackup({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        dataVersion: 6,
        assumptions: {
          conservativeReturn: 0.04,
          baselineReturn: 0.06,
          aggressiveReturn: 0.08,
          inflation: 0.025,
          cashYield: 0.04,
          salaryGrowth: 0,
          emergencyReserveTarget: 12000,
          horizonYears: 20,
          displayMode: "today",
          checkingBuffer: 3000,
          investRatio: 0.8,
        },
        privacy: false,
        accounts: [],
        cashFlows: [],
        events: [],
        goals: [],
        transactions: [],
      })
    ).rejects.toThrow(/未登录|not authenticated/);
  });
});
