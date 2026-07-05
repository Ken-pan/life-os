import { describe, it, expect } from "vitest";
import { daysThroughWeekEnd, getCalendarWeekBounds } from "./calendar";

describe("getCalendarWeekBounds", () => {
  it("以周一为起点、周日为结尾（endExclusive 为下周一）", () => {
    const sat = new Date(2026, 4, 30);
    const { start, endExclusive } = getCalendarWeekBounds(sat);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(25);
    expect(start.getDay()).toBe(1);
    expect(endExclusive.getDate()).toBe(1);
    expect(endExclusive.getMonth()).toBe(5);
    expect(daysThroughWeekEnd(sat)).toBe(2);
  });

  it("周一当天整周剩余 7 天", () => {
    const mon = new Date(2026, 4, 25);
    expect(daysThroughWeekEnd(mon)).toBe(7);
  });
});
