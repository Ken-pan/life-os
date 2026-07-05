import { describe, expect, it } from "vitest";
import type { CashFlowItem } from "../types";
import type { ExpectedOccurrence } from "./timeline";
import type { Txn } from "./transactions";
import {
  baselineCategoryAverages,
  buildCalibrationRows,
  buildItemCalibrationRows,
  buildTransactionFingerprint,
  computeBaselineWindows,
  detectRecurringCandidates,
  normalizeAndReviewRows,
  parseCsv,
  suggestColumnMapping,
  validateImportFile,
} from "./realityLoop";
import { buildScale5258Csv } from "../test-fixtures/p1a/scale-5258.fixture";

const VALID_CSV = `Date,Amount,Description,Category,Account
2026-05-01,-120.40,WHOLE FOODS,Groceries,Checking
2026-05-02,2500.00,PAYROLL,Income,Checking
2026-05-03,-45.00,CARD PAYMENT,Transfers > Credit card payment,Checking
2026-05-04,-30.00,Transfer to Savings,Transfers > Savings,Checking
2026-05-05,22.00,Refund from Merchant,Shopping,Checking
`;

describe("P1A CSV 导入解析", () => {
  it("valid csv imports", () => {
    const validation = validateImportFile("valid.csv", 1024, VALID_CSV);
    expect(validation.errors).toEqual([]);
    const parsed = parseCsv(VALID_CSV, validation.delimiter);
    expect(parsed.rows.length).toBe(5);
  });

  it("invalid extension rejected", () => {
    const validation = validateImportFile("valid.txt", 1024, VALID_CSV);
    expect(validation.errors.join(" ")).toContain(".csv");
  });

  it("oversized file rejected", () => {
    const validation = validateImportFile("huge.csv", 11 * 1024 * 1024, VALID_CSV);
    expect(validation.errors.join(" ")).toContain("10MB");
  });

  it("empty file rejected", () => {
    const validation = validateImportFile("empty.csv", 0, "");
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("required mapping missing blocks preview", () => {
    const parsed = parseCsv(VALID_CSV, ",");
    const suggested = suggestColumnMapping(parsed.headers);
    expect(suggested.date).toBeTruthy();
    expect(suggested.amount).toBeTruthy();
    expect(suggested.description).toBeTruthy();
  });

  it("supports 5,258-row synthetic scale fixture", () => {
    const csv = buildScale5258Csv();
    const validation = validateImportFile("scale.csv", csv.length, csv);
    expect(validation.errors).toEqual([]);
    const parsed = parseCsv(csv, ",");
    expect(parsed.rows.length).toBe(5258);
  });
});

describe("P1A 规范化与审查", () => {
  it("expense/income/refund/transfer/card-payment 分流正确", () => {
    const parsed = parseCsv(VALID_CSV, ",");
    const result = normalizeAndReviewRows(parsed, {
      date: "Date",
      amount: "Amount",
      description: "Description",
      category: "Category",
      accountName: "Account",
      amountSign: "negative_is_outflow",
    });
    const byDesc = new Map(result.drafts.map((d) => [d.description, d]));
    expect(byDesc.get("WHOLE FOODS")?.flowType).toBe("expense");
    expect(byDesc.get("PAYROLL")?.flowType).toBe("income");
    expect(byDesc.get("CARD PAYMENT")?.flowType).toBe("credit_card_payment");
    expect(byDesc.get("Transfer to Savings")?.flowType).toBe("internal_transfer");
    expect(byDesc.get("Refund from Merchant")?.flowType).toBe("refund_or_reversal");
    expect(byDesc.get("CARD PAYMENT")?.includeInSpendingAnalytics).toBe(false);
    expect(byDesc.get("Transfer to Savings")?.includeInSpendingAnalytics).toBe(false);
  });

  it("same-account duplicate flagged not silently dropped", () => {
    const csv = `Date,Amount,Description\n2026-04-01,-10,COFFEE\n2026-04-01,-10,COFFEE\n`;
    const parsed = parseCsv(csv, ",");
    const result = normalizeAndReviewRows(parsed, {
      date: "Date",
      amount: "Amount",
      description: "Description",
      amountSign: "negative_is_outflow",
    });
    expect(result.drafts.length).toBe(2);
    expect(
      result.drafts[1].reviewFlags.some((f) => f.type === "same_account_duplicate_candidate")
    ).toBe(true);
  });

  it("transaction fingerprint deterministic", () => {
    const a = buildTransactionFingerprint({
      occurredOn: "2026-04-01",
      amount: 10,
      description: "Coffee Shop",
      sourceAccountLabel: "Checking",
    });
    const b = buildTransactionFingerprint({
      occurredOn: "2026-04-01",
      amount: 10,
      description: "Coffee Shop",
      sourceAccountLabel: "Checking",
    });
    expect(a).toBe(b);
  });

  it("recurring candidate detection conservative", () => {
    const csv = `Date,Amount,Description\n2026-01-01,-29.9,NETFLIX\n2026-02-01,-30.2,NETFLIX\n2026-03-01,-30.0,NETFLIX\n`;
    const parsed = parseCsv(csv, ",");
    const result = normalizeAndReviewRows(parsed, {
      date: "Date",
      amount: "Amount",
      description: "Description",
      amountSign: "negative_is_outflow",
    });
    const recurring = detectRecurringCandidates(result.drafts);
    expect(recurring.some((r) => r.merchantLabel.toLowerCase().includes("netflix"))).toBe(true);
  });
});

describe("P1A 基线与校准", () => {
  const sampleTxns: Txn[] = [
    {
      date: "2026-01-05",
      month: "2026-01",
      merchant: "Groceries",
      category: "Groceries",
      account: "Checking",
      flow: "expense",
      amount: 300,
      budgetImpact: -300,
      inSpending: true,
      inCashFlow: true,
    },
    {
      date: "2026-01-15",
      month: "2026-01",
      merchant: "Payroll",
      category: "Income",
      account: "Checking",
      flow: "income",
      amount: -3000,
      budgetImpact: 0,
      inSpending: false,
      inCashFlow: true,
    },
    {
      date: "2026-02-05",
      month: "2026-02",
      merchant: "Groceries",
      category: "Groceries",
      account: "Checking",
      flow: "expense",
      amount: 320,
      budgetImpact: -320,
      inSpending: true,
      inCashFlow: true,
    },
    {
      date: "2026-03-05",
      month: "2026-03",
      merchant: "Refund",
      category: "Groceries",
      account: "Checking",
      flow: "refund_or_reversal",
      amount: -20,
      budgetImpact: 20,
      inSpending: true,
      inCashFlow: true,
    },
  ];

  it("3/6/12 baseline outputs exist and refund reduces spending", () => {
    const windows = computeBaselineWindows(sampleTxns, 0);
    expect(windows).toHaveLength(3);
    expect(windows[0].windowMonths).toBe(3);
    expect(windows[0].averageMonthlySpending).toBeGreaterThan(0);
    expect(windows[0].averageMonthlySpending).toBeLessThan(320);
    expect(windows[0].monthlyIncome).toBeGreaterThan(0);
  });

  it("unresolved high-impact review lowers confidence", () => {
    const windows = computeBaselineWindows(sampleTxns, 3);
    expect(windows[0].confidence).not.toBe("Ready to use");
  });

  it("baseline category averages computed", () => {
    const byCat = baselineCategoryAverages(sampleTxns, 3);
    expect(byCat.Groceries).toBeGreaterThan(0);
  });

  it("baseline 取最近 N 个月，与传入排序无关（回归：倒序数组曾取到最旧数据）", () => {
    const mk = (date: string, amount: number): Txn => ({
      date,
      month: date.slice(0, 7),
      merchant: "Groceries",
      category: "Groceries",
      account: "Checking",
      flow: "expense",
      amount,
      budgetImpact: -amount,
      inSpending: true,
      inCashFlow: true,
    });
    // 旧数据（2022 年，金额巨大）+ 近 3 个月数据（每月 $300）
    const txns = [
      mk("2026-06-05", 300),
      mk("2026-05-05", 300),
      mk("2026-04-05", 300),
      ...Array.from({ length: 400 }, (_, i) =>
        mk(`2022-0${(i % 9) + 1}-10`, 5000)
      ),
    ];
    // store 中按日期倒序（新→旧），复现真实调用方式
    const desc = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    const byCat = baselineCategoryAverages(desc, 3);
    expect(byCat.Groceries).toBeCloseTo(300, 0);
    // 正序传入结果一致
    const asc = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    expect(baselineCategoryAverages(asc, 3).Groceries).toBeCloseTo(300, 0);
  });
});

describe("P3 item calibration", () => {
  const rent: CashFlowItem = {
    id: "cf-rent",
    name: "Rent",
    type: "expense",
    frequency: "monthly",
    amount: 2000,
    category: "Housing",
    dueDay: 1,
  };

  const netflix: CashFlowItem = {
    id: "cf-netflix",
    name: "Netflix",
    type: "expense",
    frequency: "monthly",
    amount: 15,
    category: "Subscriptions",
    dueDay: 5,
  };

  function occ(partial: Partial<ExpectedOccurrence> & Pick<ExpectedOccurrence, "date" | "expectedAmount">): ExpectedOccurrence {
    return {
      id: partial.id ?? `occ-${partial.date}`,
      sourceType: "cashflow",
      sourceId: partial.sourceId ?? "cf-rent",
      label: partial.label ?? "Rent",
      state: partial.state ?? "matched",
      ...partial,
    };
  }

  it("buildItemCalibrationRows uses median of matched hits", () => {
    const rows = buildItemCalibrationRows(
      [rent, netflix],
      [
        occ({ date: "2026-03-01", expectedAmount: -2000, actualAmount: -2000 }),
        occ({ date: "2026-04-01", expectedAmount: -2000, actualAmount: -2050 }),
        occ({ date: "2026-05-01", expectedAmount: -2000, actualAmount: -2010 }),
      ],
      { today: new Date("2026-06-01") }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Rent");
    expect(rows[0].hitCount).toBe(3);
    expect(rows[0].actualMonthlyBaseline).toBe(2010);
    expect(rows[0].difference).toBe(10);
    expect(rows[0].proposedAction).toBe("increase");
  });

  it("ignores pending and out-of-window occurrences", () => {
    const rows = buildItemCalibrationRows(
      [rent],
      [
        occ({ date: "2026-05-01", expectedAmount: -2000, state: "pending" }),
        occ({ date: "2025-01-01", expectedAmount: -2000 }),
      ],
      { lookbackMonths: 6, today: new Date("2026-06-01") }
    );
    expect(rows).toHaveLength(0);
  });

  it("buildCalibrationRows includes row keys", () => {
    const rows = buildCalibrationRows([rent], { Housing: 2100 });
    expect(rows[0].key).toBe("Housing");
    expect(rows[0].difference).toBe(100);
  });
});
