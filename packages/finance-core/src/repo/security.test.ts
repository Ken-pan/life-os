import { describe, expect, it } from "vitest";
import { neutralizeSpreadsheetCell } from "./createRepo.js";

describe("CSV injection defense", () => {
  it("neutralizes spreadsheet formula strings", () => {
    expect(neutralizeSpreadsheetCell("=2+2")).toBe("'=2+2");
    expect(neutralizeSpreadsheetCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(neutralizeSpreadsheetCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
    expect(neutralizeSpreadsheetCell("@evil")).toBe("'@evil");
  });

  it("keeps normal merchant description unchanged", () => {
    expect(neutralizeSpreadsheetCell("Whole Foods Market")).toBe("Whole Foods Market");
  });
});
