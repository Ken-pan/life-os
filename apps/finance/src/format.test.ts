import { describe, expect, it, beforeAll } from "vitest";
import { setActiveLocale } from "./i18n/translate";
import {
  adjustForDisplay,
  delayToHuman,
  money,
  moneyCompact,
  monthsToHuman,
  pct,
  redactMoneyText,
  signedMoney,
} from "./format";

describe("金额格式化", () => {
  it("常规与负数", () => {
    expect(money(1234)).toBe("$1,234");
    expect(money(-1234)).toBe("-$1,234");
  });
  it("隐私模式遮罩", () => {
    expect(money(1234, true)).toBe("••••");
    expect(signedMoney(1234, true)).toBe("••••");
  });
  it("带符号金额", () => {
    expect(signedMoney(500)).toBe("+$500");
    expect(signedMoney(-500)).toBe("-$500");
    expect(signedMoney(0)).toBe("$0");
  });
  it("紧凑金额", () => {
    expect(moneyCompact(1_500_000)).toBe("$1.50M");
    expect(moneyCompact(640_000)).toBe("$640k");
    expect(moneyCompact(800)).toBe("$800");
  });
  it("脱敏说明文案里的金额但保留百分比和日期", () => {
    expect(
      redactMoneyText("余额 1200.00 → 1350.50；约需减持 13,000 美元；2026-07-30 占比 38.5%", true)
    ).toBe("余额 •••• → ••••；约需减持 •••• 美元；2026-07-30 占比 38.5%");
    expect(redactMoneyText("市值 $48,000，固定支出 300 美元/月", true)).toBe(
      "市值 ••••，固定支出 •••• 美元/月"
    );
  });
  it("百分比", () => {
    expect(pct(0.06)).toBe("6%");
    expect(pct(0.025, 1)).toBe("2.5%");
  });
});

describe("时间格式化", () => {
  beforeAll(() => {
    setActiveLocale("zh-CN");
  });

  it("月数转人类可读", () => {
    expect(monthsToHuman(null)).toBe("—");
    expect(monthsToHuman(0)).toBe("已达成");
    expect(monthsToHuman(5)).toBe("5 个月");
    expect(monthsToHuman(12)).toBe("1 年");
    expect(monthsToHuman(14)).toBe("1 年 2 个月");
    expect(monthsToHuman(Infinity)).toBe("无法达成");
  });
  it("延迟文案", () => {
    expect(delayToHuman(0)).toBe("不受影响");
    expect(delayToHuman(2)).toBe("延迟 2 个月");
    expect(delayToHuman(Infinity)).toBe("可能无法达成");
  });
});

describe("显示口径折算", () => {
  it("future 模式保持名义", () => {
    expect(adjustForDisplay(1000, 120, "future", 0.025)).toBe(1000);
  });
  it("today 模式按通胀折现", () => {
    const v = adjustForDisplay(1000, 120, "today", 0.025); // 10 年
    expect(v).toBeLessThan(1000);
    expect(v).toBeCloseTo(1000 / Math.pow(1.025, 10), 6);
  });
  it("零通胀不变", () => {
    expect(adjustForDisplay(1000, 120, "today", 0)).toBeCloseTo(1000, 6);
  });
});
