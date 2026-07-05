import { describe, expect, it } from "vitest";
import { buildAppHash, parseAppHash } from "./appRoute";

describe("appRoute", () => {
  it("parses tab-only hash", () => {
    expect(parseAppHash("#/overview")).toEqual({ tab: "overview" });
    expect(parseAppHash("#overview")).toEqual({ tab: "overview" });
  });

  it("parses tab with section", () => {
    expect(parseAppHash("#/history/insights")).toEqual({
      tab: "history",
      section: "insights",
    });
    expect(parseAppHash("#/forecast/scenarios")).toEqual({
      tab: "forecast",
      section: "scenarios",
    });
  });

  it("rejects invalid tab or section", () => {
    expect(parseAppHash("#/nope")).toBeNull();
    expect(parseAppHash("#/history/nope")).toBeNull();
  });

  it("builds hash round-trip", () => {
    const route = { tab: "review" as const, section: "baseline" };
    expect(parseAppHash(buildAppHash(route))).toEqual(route);
  });

  it("empty hash defaults to today", () => {
    expect(parseAppHash("")).toEqual({ tab: "today" });
  });
});
