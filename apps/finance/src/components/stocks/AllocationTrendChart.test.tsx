import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AllocationTrendChart } from "./AllocationTrendChart";
import type { AllocationTrendPoint } from "../../engine/holdingsPortfolio";

const twoPoints: AllocationTrendPoint[] = [
  {
    snapshotId: "hs_old",
    ts: Date.parse("2026-05-01"),
    dateLabel: "5/1",
    stockPct: 88,
    etfPct: 12,
    top1Pct: 40,
    top3Pct: 80,
  },
  {
    snapshotId: "hs_new",
    ts: Date.parse("2026-06-01"),
    dateLabel: "6/1",
    stockPct: 84,
    etfPct: 16,
    top1Pct: 33.5,
    top3Pct: 73.5,
  },
];

describe("AllocationTrendChart", () => {
  it("renders empty-state note with fewer than 2 snapshots", () => {
    const { container, getByText } = render(<AllocationTrendChart points={[twoPoints[0]]} />);
    expect(getByText(/再积累一份持仓快照/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders two trend lines, dots and delta legend for 2+ snapshots", () => {
    const { container, getByText } = render(<AllocationTrendChart points={twoPoints} />);
    expect(container.querySelectorAll(".allocation-trend-line")).toHaveLength(2);
    // 每个快照 2 个点（个股、前三）
    expect(container.querySelectorAll(".allocation-trend-dot")).toHaveLength(4);
    expect(getByText("5/1")).toBeTruthy();
    expect(getByText("6/1")).toBeTruthy();
    // 图例显示最新值与相对首份快照的变化
    expect(getByText(/个股占比 84%（-4\.0%）/)).toBeTruthy();
    expect(getByText(/前三集中度 74%（-6\.5%）/)).toBeTruthy();
  });

  it("overlays target band and limit lines when target is set", () => {
    const { container, getByText } = render(
      <AllocationTrendChart
        points={twoPoints}
        target={{ stockPct: 35, top3MaxPct: 45, driftThresholdPct: 5 }}
      />
    );
    expect(container.querySelector(".allocation-trend-target-band")).toBeTruthy();
    expect(container.querySelectorAll(".allocation-trend-target-line")).toHaveLength(2);
    expect(getByText("目标 35% ± 5%")).toBeTruthy();
    expect(getByText("前三上限 45%")).toBeTruthy();
  });

  it("keeps y coordinates within the viewBox for extreme values", () => {
    const extreme = twoPoints.map((p, i) => ({
      ...p,
      stockPct: i === 0 ? 0 : 100,
      top3Pct: i === 0 ? 120 : -5,
    }));
    const { container } = render(<AllocationTrendChart points={extreme} />);
    for (const dot of container.querySelectorAll("circle")) {
      const cy = Number(dot.getAttribute("cy"));
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(150);
    }
  });
});
