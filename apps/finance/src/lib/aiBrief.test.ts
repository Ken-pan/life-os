import { describe, it, expect } from "vitest";
import {
  buildAdvisorBriefPrompt,
  buildTodayBriefPrompt,
  fingerprintOf,
  type AdvisorBriefFacts,
  type TodayBriefFacts,
} from "./aiBrief";

const TODAY_FACTS: TodayBriefFacts = {
  date: "2026-07-02",
  safeToSpend: 1234.56,
  savingCapacity: 800,
  savingBestDay: "2026-07-15",
  budget: { budget: 3000, spent: 1500.4, todaySpend: 42, dailyAllowance: 51.7, daysLeft: 29, pace: "over" },
  upcomingBills: [{ date: "2026-07-05", label: "房租", amount: -1800 }],
  pendingCount: 2,
  topCategories: [{ category: "餐饮", amount: 600 }],
};

describe("fingerprintOf", () => {
  it("对相同数据稳定", () => {
    expect(fingerprintOf(TODAY_FACTS)).toBe(fingerprintOf({ ...TODAY_FACTS }));
  });

  it("金额取整后几分钱波动不改变指纹", () => {
    const a = fingerprintOf({ n: 100.001 });
    const b = fingerprintOf({ n: 100.004 });
    expect(a).toBe(b);
  });

  it("数据实质变化时指纹变化", () => {
    expect(fingerprintOf({ n: 100 })).not.toBe(fingerprintOf({ n: 200 }));
  });
});

describe("buildTodayBriefPrompt", () => {
  it("包含关键数字与账单", () => {
    const p = buildTodayBriefPrompt(TODAY_FACTS);
    expect(p.user).toContain("2026-07-02");
    expect(p.user).toContain("1235"); // safeToSpend 取整
    expect(p.user).toContain("房租");
    expect(p.user).toContain("超速");
    expect(p.user).toContain("2 笔计划收支待确认");
    expect(p.system).toContain("今日财务简报");
  });

  it("日期变化会改变指纹（每天至少刷新一次）", () => {
    const a = buildTodayBriefPrompt(TODAY_FACTS);
    const b = buildTodayBriefPrompt({ ...TODAY_FACTS, date: "2026-07-03" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("locale 变化会改变指纹", () => {
    const zh = buildTodayBriefPrompt(TODAY_FACTS, "zh-CN");
    const en = buildTodayBriefPrompt(TODAY_FACTS, "en-US");
    expect(zh.system).toContain("今日财务简报");
    expect(en.system).toContain("daily brief");
    expect(zh.fingerprint).not.toBe(en.fingerprint);
  });
});

describe("buildAdvisorBriefPrompt", () => {
  const FACTS: AdvisorBriefFacts = {
    date: "2026-07-02",
    planAmount: 500,
    planCorePct: 70,
    bestDay: "2026-07-15",
    holdings: [
      { ticker: "NVDA", weightPct: 32.1, zone: "trim", trend: "up", rsi: 74 },
      { ticker: "VOO", weightPct: 25, zone: "neutral", trend: "up", rsi: 55 },
    ],
    advices: [{ action: "减仓", title: "NVDA 集中度偏高" }],
    newsTitles: [{ symbol: "NVDA", title: "Nvidia hits record high" }],
  };

  it("包含持仓信号与新闻", () => {
    const p = buildAdvisorBriefPrompt(FACTS);
    expect(p.user).toContain("NVDA 32.1%");
    expect(p.user).toContain("过热区");
    expect(p.user).toContain("Nvidia hits record high");
    expect(p.user).toContain("[减仓] NVDA 集中度偏高");
  });

  it("新闻标题变化不影响指纹（避免频繁重生成）", () => {
    const a = buildAdvisorBriefPrompt(FACTS);
    const b = buildAdvisorBriefPrompt({
      ...FACTS,
      newsTitles: [{ symbol: "NVDA", title: "另一条新闻" }],
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("信号区间变化会改变指纹", () => {
    const a = buildAdvisorBriefPrompt(FACTS);
    const b = buildAdvisorBriefPrompt({
      ...FACTS,
      holdings: [{ ...FACTS.holdings[0], zone: "buy" }, FACTS.holdings[1]],
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
