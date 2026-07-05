import { describe, expect, it } from "vitest";
import { getHorizontalOverflowReport } from "./overflowGuard";

function setRootMetrics(clientWidth: number, scrollWidth: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(document.documentElement, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
}

describe("getHorizontalOverflowReport", () => {
  it("returns null when there is no overflow", () => {
    setRootMetrics(390, 390);
    document.body.innerHTML = "<div></div>";
    const report = getHorizontalOverflowReport(document);
    expect(report).toBeNull();
  });

  it("reports offenders when page overflows horizontally", () => {
    setRootMetrics(390, 460);
    document.body.innerHTML = '<div id="offender" class="wide"></div>';
    const offender = document.getElementById("offender") as HTMLElement;
    offender.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 460,
        width: 460,
        height: 20,
      }) as DOMRect;

    const report = getHorizontalOverflowReport(document);
    expect(report).not.toBeNull();
    expect(report?.overflowPx).toBe(70);
    expect(report?.offenders[0]?.id).toBe("offender");
  });
});
