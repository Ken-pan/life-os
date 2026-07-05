import type { FinanceData } from "../types";
import { useLocale } from "../i18n/context";
import type { GoTab } from "./AppShell";
import { HorizontalTabs, TabPanel } from "./HorizontalTabs";
import { HistoryView } from "./HistoryView";
import { CashFlowsView } from "./CashFlowsView";
import { FutureCashflowView } from "./FutureCashflowView";

export type RecordsSection = "insights" | "fixed" | "oneoff";

// 「记录」：真实交易洞察 + 固定收支 + 大额收支登记。
export function RecordsView({
  data,
  active,
  onChange,
  onGoTab,
  ledgerSearch,
  onLedgerSearchConsumed,
  focusEventId,
  onFocusEventConsumed,
  onQuickAdd,
}: {
  data: FinanceData;
  active: RecordsSection;
  onChange: (section: RecordsSection) => void;
  onGoTab?: GoTab;
  ledgerSearch?: string;
  onLedgerSearchConsumed?: () => void;
  focusEventId?: string;
  onFocusEventConsumed?: () => void;
  onQuickAdd?: () => void;
}) {
  const { t } = useLocale();
  const sections: { id: RecordsSection; label: string }[] = [
    { id: "insights", label: t("records.sectionInsights") },
    { id: "fixed", label: t("records.sectionFixed") },
    { id: "oneoff", label: t("records.sectionOneoff") },
  ];

  return (
    <div className="grid gap-6">
      <HorizontalTabs
        items={sections}
        activeId={active}
        onChange={onChange}
        ariaLabel={t("records.sectionAria")}
      >
        <TabPanel tabId="insights" active={active === "insights"}>
          <HistoryView
            data={data}
            initialLedgerSearch={ledgerSearch}
            onLedgerSearchConsumed={onLedgerSearchConsumed}
            onQuickAdd={onQuickAdd}
          />
        </TabPanel>
        <TabPanel tabId="fixed" active={active === "fixed"}>
          <CashFlowsView />
        </TabPanel>
        <TabPanel tabId="oneoff" active={active === "oneoff"}>
          <FutureCashflowView
            onGoTab={onGoTab}
            focusEventId={focusEventId}
            onFocusConsumed={onFocusEventConsumed}
          />
        </TabPanel>
      </HorizontalTabs>
    </div>
  );
}
