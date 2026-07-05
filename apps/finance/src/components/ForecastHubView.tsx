import type { FinanceData } from "../types";
import { useLocale } from "../i18n/context";
import type { Projection } from "../hooks/useProjection";
import type { LiquidCashAnchors } from "../engine/reconciliation";
import type { GoTab } from "./AppShell";
import { HorizontalTabs, TabPanel } from "./HorizontalTabs";
import { ForecastView } from "./ForecastView";
import { ScenariosView } from "./ScenariosView";

export type ForecastSection = "forecast" | "scenarios";

// 「预测」：未来曲线 + 驱动它的长期场景与目标。
export function ForecastHubView({
  data,
  projection,
  displayLiquidCash,
  cashAnchors,
  onGoTab,
  active,
  onChange,
}: {
  data: FinanceData;
  projection: Projection;
  displayLiquidCash?: number;
  cashAnchors?: LiquidCashAnchors;
  onGoTab: GoTab;
  active: ForecastSection;
  onChange: (section: ForecastSection) => void;
}) {
  const { t } = useLocale();
  const sections: { id: ForecastSection; label: string }[] = [
    { id: "forecast", label: t("forecastHub.sectionForecast") },
    { id: "scenarios", label: t("forecastHub.sectionScenarios") },
  ];

  return (
    <div className="grid gap-6">
      <HorizontalTabs
        items={sections}
        activeId={active}
        onChange={onChange}
        ariaLabel={t("forecastHub.sectionAria")}
      >
        <TabPanel tabId="forecast" active={active === "forecast"}>
          <ForecastView
            data={data}
            projection={projection}
            displayLiquidCash={displayLiquidCash}
            cashAnchors={cashAnchors}
            onGoTab={onGoTab}
          />
        </TabPanel>
        <TabPanel tabId="scenarios" active={active === "scenarios"}>
          <ScenariosView />
        </TabPanel>
      </HorizontalTabs>
    </div>
  );
}
