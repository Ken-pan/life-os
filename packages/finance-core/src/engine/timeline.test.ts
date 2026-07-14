import { describe, expect, it } from "vitest";
import type { FinanceData } from "../types.js";
import type { Txn } from "./transactions";
import {
  actionableConfirmations,
  advanceOccurrenceStates,
  matchOccurrences,
  materializeOccurrenceDrafts,
  mergeOccurrences,
  cardBillPaysFromReserve,
  classifyEventClosure,
  occurrenceNavHint,
  occurrenceAffectsBalance,
  occurrenceAffectsLiquidCash,
  confirmOccurredLabel,
  pendingConfirmations,
  rollTimeline,
} from "./timeline";

const baseData: FinanceData = {
  version: 1,
  accounts: [
    { id: "chk", name: "Checking", type: "checking", balance: 5000 },
    { id: "cc", name: "Visa", type: "credit-card", balance: 400, statementBalance: 400, dueDay: 15 },
  ],
  holdingsSnapshots: [],
  cashFlows: [
    {
      id: "rent",
      name: "Rent",
      type: "expense",
      frequency: "monthly",
      amount: 2000,
      dueDay: 1,
    },
  ],
  events: [],
  goals: [],
  assumptions: {
    conservativeReturn: 0.04,
    baselineReturn: 0.06,
    aggressiveReturn: 0.08,
    inflation: 0.03,
    cashYield: 0.04,
    salaryGrowth: 0.03,
    emergencyReserveTarget: 10000,
    horizonYears: 10,
    displayMode: "today",
    checkingBuffer: 1000,
    investRatio: 0.5,
  },
  updatedAt: "2026-05-01",
  privacy: false,
};

const today = new Date(2026, 4, 10); // 2026-05-10

describe("materializeOccurrenceDrafts", () => {
  it("creates monthly rent occurrences in window", () => {
    const drafts = materializeOccurrenceDrafts(baseData, today, 60);
    const rent = drafts.filter((d) => d.sourceId === "rent");
    expect(rent.length).toBeGreaterThanOrEqual(2);
    expect(rent[0].expectedAmount).toBe(-2000);
  });

  it("creates card bill occurrences in window", () => {
    const drafts = materializeOccurrenceDrafts(baseData, today, 60);
    const card = drafts.filter((d) => d.sourceId === "cc");
    expect(card.length).toBeGreaterThanOrEqual(1);
    expect(card[0].expectedAmount).toBe(-400);
  });

  it("uses paymentDay (early payment) for card bill date, falling back to dueDay", () => {
    const early: FinanceData = {
      ...baseData,
      accounts: [
        { id: "chk", name: "Checking", type: "checking", balance: 5000 },
        {
          id: "cc",
          name: "Visa",
          type: "credit-card",
          balance: 400,
          statementBalance: 400,
          dueDay: 19,
          paymentDay: 5,
        },
      ],
    };
    const earlyCard = materializeOccurrenceDrafts(early, today, 90).filter(
      (d) => d.sourceId === "cc",
    );
    expect(earlyCard.length).toBeGreaterThanOrEqual(1);
    // 提前还款：账单落在 paymentDay(5)，而非 dueDay(19)
    for (const c of earlyCard) expect(c.date.slice(8, 10)).toBe("05");

    // 未设 paymentDay 时回退 dueDay(15)
    const fallbackCard = materializeOccurrenceDrafts(baseData, today, 90).filter(
      (d) => d.sourceId === "cc",
    );
    for (const c of fallbackCard) expect(c.date.slice(8, 10)).toBe("15");
  });

  it("creates reserve-funded card bills with payment account id", () => {
    const data: FinanceData = {
      ...baseData,
      accounts: [
        { id: "chk", name: "Checking", type: "checking", balance: 5000 },
        { id: "reserve", name: "Robinhood Cash", type: "savings", balance: 5000, liquid: false },
        {
          id: "cc",
          name: "Robinhood Card",
          type: "credit-card",
          balance: 4500,
          statementBalance: 4500,
          dueDay: 19,
          paymentAccountId: "reserve",
        },
      ],
    };
    const drafts = materializeOccurrenceDrafts(data, today, 60);
    const card = drafts.filter((d) => d.sourceId === "cc");
    expect(card.length).toBeGreaterThanOrEqual(1);
    expect(card[0].accountId).toBe("reserve");
  });

  it("is idempotent via merge key", () => {
    const drafts = materializeOccurrenceDrafts(baseData, today, 60);
    const merged1 = mergeOccurrences(drafts, []);
    const merged2 = mergeOccurrences(drafts, merged1);
    expect(merged2.length).toBe(merged1.length);
    expect(merged2.find((r) => r.sourceId === "rent" && r.date.startsWith("2026-05"))?.id).toBe(
      merged1.find((r) => r.sourceId === "rent" && r.date.startsWith("2026-05"))?.id
    );
  });
});

describe("advanceOccurrenceStates", () => {
  it("marks past due as pending", () => {
    const rows = mergeOccurrences(
      [{ sourceType: "cashflow", sourceId: "rent", label: "Rent", date: "2026-05-01", expectedAmount: -2000 }],
      []
    );
    const advanced = advanceOccurrenceStates(rows, today);
    expect(advanced[0].state).toBe("pending");
  });

  it("marks within 7 days as upcoming", () => {
    const rows = mergeOccurrences(
      [{ sourceType: "card_bill", sourceId: "cc", label: "Visa", date: "2026-05-15", expectedAmount: -400 }],
      []
    );
    const advanced = advanceOccurrenceStates(rows, today);
    expect(advanced[0].state).toBe("upcoming");
  });
});

describe("mergeOccurrences 回归", () => {
  it("matched 条目不被新草稿覆写 expectedAmount，且 variance 按 actual-expected 重算", () => {
    const stored = [
      {
        id: "occ1",
        sourceType: "card_bill" as const,
        sourceId: "cc",
        label: "Visa 账单",
        date: "2026-05-15",
        expectedAmount: -779.2,
        state: "matched" as const,
        actualAmount: -779.2,
        actualDate: "2026-05-15",
        varianceAmount: 0,
        varianceDays: 0,
      },
    ];
    // 卡余额更新后草稿金额变成 -95，但历史 matched 事实不应改变。
    const merged = mergeOccurrences(
      [{ sourceType: "card_bill", sourceId: "cc", label: "Visa 账单", date: "2026-05-15", expectedAmount: -95 }],
      stored
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].expectedAmount).toBe(-779.2);
    expect(merged[0].varianceAmount).toBe(0);
  });

  it("matched 条目若 expected 与 actual 已不一致，variance 会被修正而非保持 0", () => {
    const stored = [
      {
        id: "occ1",
        sourceType: "card_bill" as const,
        sourceId: "cc",
        label: "Visa 账单",
        date: "2026-05-15",
        expectedAmount: -95,
        state: "matched" as const,
        actualAmount: -779.2,
        varianceAmount: 0,
      },
    ];
    const merged = mergeOccurrences(
      [{ sourceType: "card_bill", sourceId: "cc", label: "Visa 账单", date: "2026-05-15", expectedAmount: -95 }],
      stored
    );
    expect(merged[0].varianceAmount).toBeCloseTo(-684.2, 2);
  });

  it("逾期未确认的 planned/pending 条目不会因移出草稿窗口而静默丢失", () => {
    const stored = [
      {
        id: "occ_old",
        sourceType: "card_bill" as const,
        sourceId: "cc",
        label: "Visa 账单",
        date: "2026-04-19",
        expectedAmount: -400,
        state: "planned" as const,
      },
    ];
    // 草稿窗口已滚动到 5 月，不再包含 4/19 —— 传入 today 后仍应保留逾期条目。
    const withToday = mergeOccurrences(
      [{ sourceType: "card_bill", sourceId: "cc", label: "Visa 账单", date: "2026-05-19", expectedAmount: -400 }],
      stored,
      today
    );
    expect(withToday.some((r) => r.id === "occ_old")).toBe(true);

    // rollTimeline 全链路：逾期条目会被推进为 pending 并出现在待确认列表。
    const rows = rollTimeline({ data: baseData, txns: [], stored, today });
    const old = rows.find((r) => r.id === "occ_old");
    expect(old?.state).toBe("pending");
  });
});

describe("matchOccurrences", () => {
  it("matches rent payment to pending occurrence", () => {
    let rows = mergeOccurrences(
      [{ sourceType: "cashflow", sourceId: "rent", label: "Rent", date: "2026-05-01", expectedAmount: -2000 }],
      []
    );
    rows = advanceOccurrenceStates(rows, today);
    const txns: Txn[] = [
      {
        id: "t1",
        date: "2026-05-02",
        month: "2026-05",
        merchant: "Rent Payment",
        category: "Housing > Rent",
        account: "Checking",
        flow: "expense",
        amount: -2000,
        budgetImpact: -2000,
        inSpending: true,
        inCashFlow: true,
      },
    ];
    rows = matchOccurrences(rows, txns);
    expect(rows[0].state).toBe("matched");
    expect(rows[0].matchedTxnId).toBe("t1");
  });
});

describe("rollTimeline", () => {
  it("runs full pipeline", () => {
    const rows = rollTimeline({ data: baseData, txns: [], stored: [], today });
    expect(rows.some((r) => r.sourceId === "rent")).toBe(true);
  });
});

describe("confirmOccurredLabel", () => {
  it("uses different copy for inflow vs outflow", () => {
    expect(confirmOccurredLabel({ expectedAmount: 3000 })).toBe("确认已到账");
    expect(confirmOccurredLabel({ expectedAmount: -2200 })).toBe("确认已扣");
  });
});

describe("actionableConfirmations", () => {
  it("includes upcoming due today", () => {
    const rows = mergeOccurrences(
      [{ sourceType: "cashflow", sourceId: "rent", label: "Rent", date: "2026-05-10", expectedAmount: -2000 }],
      []
    );
    const advanced = advanceOccurrenceStates(rows, today);
    const actionable = actionableConfirmations(advanced, today);
    expect(actionable).toHaveLength(1);
    expect(actionable[0].state).toBe("upcoming");
  });
});

describe("pendingConfirmations", () => {
  it("returns pending items for current month", () => {
    let rows = mergeOccurrences(
      [{ sourceType: "cashflow", sourceId: "rent", label: "Rent", date: "2026-05-01", expectedAmount: -2000 }],
      []
    );
    rows = advanceOccurrenceStates(rows, today);
    const pending = pendingConfirmations(rows, today);
    expect(pending).toHaveLength(1);
  });
});

describe("classifyEventClosure", () => {
  const today = new Date("2026-06-01T12:00:00");

  it("treats future dated events as planned", () => {
    expect(
      classifyEventClosure({ date: "2026-08-01", monthOffset: 2 }, undefined, today)
    ).toBe("planned");
  });

  it("treats past pending occurrences as pending", () => {
    const occ = {
      id: "1",
      sourceType: "event" as const,
      sourceId: "evt1",
      label: "Trip",
      date: "2026-05-01",
      expectedAmount: -3000,
      state: "pending" as const,
    };
    expect(classifyEventClosure({ date: "2026-05-01", monthOffset: -1 }, occ, today)).toBe(
      "pending"
    );
  });

  it("treats matched past occurrences as closed", () => {
    const occ = {
      id: "1",
      sourceType: "event" as const,
      sourceId: "evt1",
      label: "Bonus",
      date: "2026-03-01",
      expectedAmount: 2000,
      state: "matched" as const,
    };
    expect(classifyEventClosure({ date: "2026-03-01", monthOffset: -3 }, occ, today)).toBe(
      "closed"
    );
  });
});

describe("occurrenceNavHint", () => {
  it("routes one-off events to the oneoff records section", () => {
    expect(
      occurrenceNavHint({ sourceType: "event", sourceId: "evt_trip" })
    ).toEqual({ kind: "oneoff", eventId: "evt_trip" });
  });

  it("routes cashflow items to fixed section", () => {
    expect(occurrenceNavHint({ sourceType: "cashflow", sourceId: "cf_rent" })).toEqual({
      kind: "fixed",
    });
  });

  it("routes card bills to review", () => {
    expect(occurrenceNavHint({ sourceType: "card_bill", sourceId: "acc_cc" })).toEqual({
      kind: "review",
    });
  });
});

describe("occurrenceAffectsBalance", () => {
  it("only open states affect balance projection", () => {
    expect(occurrenceAffectsBalance("planned")).toBe(true);
    expect(occurrenceAffectsBalance("upcoming")).toBe(true);
    expect(occurrenceAffectsBalance("pending")).toBe(true);
    expect(occurrenceAffectsBalance("matched")).toBe(false);
    expect(occurrenceAffectsBalance("reconciled")).toBe(false);
    expect(occurrenceAffectsBalance("skipped")).toBe(false);
  });
});

describe("occurrenceAffectsLiquidCash", () => {
  it("skips reserve-funded card bills for liquid projection", () => {
    const accounts = [
      { id: "reserve", name: "Robinhood Cash", type: "savings" as const, balance: 5000, liquid: false },
      {
        id: "cc",
        name: "Robinhood Card",
        type: "credit-card" as const,
        balance: 4500,
        paymentAccountId: "reserve",
      },
    ];
    const occ = {
      id: "1",
      sourceType: "card_bill" as const,
      sourceId: "cc",
      label: "Robinhood Card 账单",
      date: "2026-06-19",
      expectedAmount: -4500,
      state: "upcoming" as const,
    };
    expect(cardBillPaysFromReserve(occ, accounts)).toBe(true);
    expect(occurrenceAffectsLiquidCash(occ, accounts)).toBe(false);
  });
});
