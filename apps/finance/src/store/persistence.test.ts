import { describe, expect, it } from "vitest";
import { normalizeData, parseImportedJSON } from "./persistence";
import { DATA_VERSION } from "./defaults";

describe("normalizeData 容错", () => {
  it("非对象输入返回空白数据", () => {
    const d = normalizeData(null);
    expect(d.version).toBe(DATA_VERSION);
    expect(d.accounts).toEqual([]);
    expect(d.goals.length).toBeGreaterThan(0);
  });

  it("缺字段时用默认补全，不抛错", () => {
    const d = normalizeData({ accounts: [{ id: "x", name: "a", type: "checking", balance: 100 }] });
    expect(d.accounts.length).toBe(1);
    expect(d.assumptions.baselineReturn).toBeGreaterThan(0);
    expect(typeof d.assumptions.inflation).toBe("number");
    expect(Array.isArray(d.cashFlows)).toBe(true);
  });

  it("部分假设覆盖默认，其余保留", () => {
    const d = normalizeData({ assumptions: { baselineReturn: 0.09 } });
    expect(d.assumptions.baselineReturn).toBe(0.09);
    expect(d.assumptions.inflation).toBeGreaterThan(0); // 默认仍在
  });

  it("错误类型字段被纠正为安全默认", () => {
    const d = normalizeData({ accounts: "oops", cashFlows: 123, privacy: "yes" });
    expect(d.accounts).toEqual([]);
    expect(d.cashFlows).toEqual([]);
    expect(d.privacy).toBe(true);
  });

  it("parseImportedJSON 解析合法 JSON", () => {
    const d = parseImportedJSON(JSON.stringify({ privacy: true, assumptions: { horizonYears: 10 } }));
    expect(d.privacy).toBe(true);
    expect(d.assumptions.horizonYears).toBe(10);
  });

  it("parseImportedJSON 对非法 JSON 抛错", () => {
    expect(() => parseImportedJSON("{not json")).toThrow();
  });
});
