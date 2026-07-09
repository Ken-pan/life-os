import { describe, expect, it } from "vitest";
import { snapshotCompareFilename, snapshotCompareToCsv } from "./holdingsExport";
import type { SnapshotCompareResult } from "./holdingsPortfolio";

const diff: SnapshotCompareResult = {
  olderLabel: "2026-05-01",
  newerLabel: "2026-06-01",
  olderTotal: 900,
  newerTotal: 1100,
  totalDelta: 200,
  rows: [
    {
      ticker: "AAA",
      securityName: "A Corp",
      olderValue: 400,
      newerValue: 600,
      valueDelta: 200,
      status: "both",
    },
  ],
};

describe("holdingsExport", () => {
  it("exports compare csv with header and rows", () => {
    const csv = snapshotCompareToCsv(diff, false);
    expect(csv).toContain("ticker,security_name");
    expect(csv).toContain("AAA,A Corp,400.00,600.00,200.00,both");
    expect(csv).toContain("total_delta");
  });

  it("redacts csv when privacy is on", () => {
    const csv = snapshotCompareToCsv(diff, true);
    expect(csv).toContain("隐私模式");
    expect(csv).not.toContain("AAA");
  });

  it("builds filename from labels", () => {
    expect(snapshotCompareFilename(diff)).toMatch(/holdings-compare-.*\.csv/);
  });
});
