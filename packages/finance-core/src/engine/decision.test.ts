import { describe, expect, it } from "vitest";
import { createEmptyData } from "../defaults.js";
import type { ScenarioEvent } from "../types.js";
import { selectDecisionComparison } from "./decision";

function fixture() {
  const d = createEmptyData();
  d.accounts = [
    { id: "chk", name: "Checking", type: "checking", balance: 10000, liquid: true },
    { id: "sav", name: "Savings", type: "savings", balance: 5000, liquid: true },
    { id: "broker", name: "Broker", type: "brokerage", balance: 80000 },
  ];
  d.cashFlows = [
    {
      id: "inc",
      name: "Income",
      type: "income",
      frequency: "monthly",
      amount: 7000,
    },
    {
      id: "rent",
      name: "Rent",
      type: "expense",
      frequency: "monthly",
      amount: 2500,
      essential: true,
      dueDay: 1,
    },
  ];
  d.goals = [
    {
      id: "g1",
      name: "Emergency",
      metric: "liquid",
      target: 12000,
      reservePolicy: "earmarked_operating_cash",
      current: 1000,
    },
  ];
  return d;
}

describe("selectDecisionComparison", () => {
  it("$0 scenario equals baseline", () => {
    const data = fixture();
    const c = selectDecisionComparison({
      data,
      baselineEvents: [],
      scenarioEvents: [],
      today: new Date("2026-05-30"),
    });
    expect(c.delta.safeToSpendToday).toBeCloseTo(0, 6);
    expect(c.delta.monthlySurplus).toBeCloseTo(0, 6);
    expect(c.delta.netWorth10y).toBeCloseTo(0, 6);
  });

  it("scenario comparison does not mutate plan data", () => {
    const data = fixture();
    const before = JSON.stringify(data);
    const events: ScenarioEvent[] = [
      {
        id: "e1",
        name: "Purchase",
        eventType: "one-time-purchase",
        enabled: true,
        monthOffset: 1,
        amount: 3000,
        fundingSource: "checking",
      },
    ];
    selectDecisionComparison({
      data,
      baselineEvents: [],
      scenarioEvents: events,
      today: new Date("2026-05-30"),
    });
    expect(JSON.stringify(data)).toBe(before);
  });

  it("same saved scenario yields stable reopened result", () => {
    const data = fixture();
    const events: ScenarioEvent[] = [
      {
        id: "e2",
        name: "Recurring upgrade",
        eventType: "expense-change",
        enabled: true,
        monthOffset: 1,
        amount: 400,
      },
    ];
    const a = selectDecisionComparison({
      data,
      baselineEvents: [],
      scenarioEvents: events,
      today: new Date("2026-05-30"),
    });
    const b = selectDecisionComparison({
      data,
      baselineEvents: [],
      scenarioEvents: events,
      today: new Date("2026-05-30"),
    });
    expect(a.delta.netWorth5y).toBeCloseTo(b.delta.netWorth5y, 8);
    expect(a.delta.safeToSpendToday).toBeCloseTo(b.delta.safeToSpendToday, 8);
  });
});
