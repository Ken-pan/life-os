import { describe, expect, it } from "vitest";
import {
  isDailyHistoryUsable,
  mergeDailyCandles,
  needsDailyRefresh,
  parseYahooChart,
  pickYahooRange,
} from "./priceHistory";

describe("mergeDailyCandles", () => {
  it("按日期合并并去重，后者覆盖前者", () => {
    const merged = mergeDailyCandles(
      [
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-02", close: 101 },
      ],
      [{ date: "2026-01-02", close: 102 }, { date: "2026-01-03", close: 103 }]
    );
    expect(merged).toEqual([
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 102 },
      { date: "2026-01-03", close: 103 },
    ]);
  });
});

describe("needsDailyRefresh", () => {
  it("无水位线时需要刷新", () => {
    expect(needsDailyRefresh(null)).toBe(true);
    expect(needsDailyRefresh(undefined)).toBe(true);
  });

  it("最新日期早于今天时需要刷新", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    expect(needsDailyRefresh(yesterday)).toBe(true);
  });

  it("已有今天数据时不需要刷新", () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    expect(needsDailyRefresh(today)).toBe(false);
  });
});

describe("pickYahooRange", () => {
  it("无水位线时拉一年", () => {
    expect(pickYahooRange(null)).toBe("1y");
    expect(pickYahooRange(undefined)).toBe("1y");
  });

  it("短缺口用 1mo，长缺口扩大窗口", () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const recent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    expect(pickYahooRange(recent)).toBe("1mo");

    d.setDate(d.getDate() - 60);
    const medium = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    expect(pickYahooRange(medium)).toBe("3mo");
  });
});

describe("isDailyHistoryUsable", () => {
  it("条数不足时不可用", () => {
    expect(isDailyHistoryUsable([{ date: "2026-07-04", close: 1 }])).toBe(false);
  });

  it("条数足够且新鲜时可用", () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      close: 100 + i,
    }));
    candles[candles.length - 1] = { date: todayISO(), close: 200 };
    expect(isDailyHistoryUsable(candles)).toBe(true);
  });
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

describe("parseYahooChart", () => {
  it("解析 timestamp 与 close 序列", () => {
    const ts = Date.UTC(2026, 0, 15) / 1000;
    const candles = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [ts],
            indicators: { quote: [{ close: [150.25] }] },
          },
        ],
      },
    });
    expect(candles).toEqual([{ date: "2026-01-15", close: 150.25 }]);
  });

  it("跳过无效 close", () => {
    const ts = Date.UTC(2026, 0, 15) / 1000;
    const candles = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [ts, ts + 86400],
            indicators: { quote: [{ close: [null, 0] }] },
          },
        ],
      },
    });
    expect(candles).toEqual([]);
  });
});
